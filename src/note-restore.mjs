// Restore exactly one public training notice from a private, verified backup.
// The caller must authenticate the user and verify instructor membership first.
import { createHash } from 'node:crypto';

export const NOTE_BACKUP_TABLE = 'training_note_backups';
export const NOTE_RESTORE_ROUTE = 'POST /api/notes/:id/restore';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const OWNER_FIELDS = ['owner_id', 'ownerId', 'user_id', 'userId'];
const ALLOWED_KEYS = ['dryRun', 'confirmContentSha256'];
const isUuid = (value) => typeof value === 'string' && UUID.test(value);
const enc = encodeURIComponent;

// Must match public.training_note_content_sha256(title, content) in the migration.
export function noteContentHash(title, content) {
  return createHash('sha256')
    .update(`${Buffer.byteLength(title, 'utf8')}:${title}${content}`, 'utf8')
    .digest('hex');
}

export async function restoreNote({ rest, id, body, target, audit = () => {} }) {
  const noteId = typeof id === 'string' ? id.toLowerCase() : id;
  const log = (outcome, extra = {}) =>
    audit({ at: new Date().toISOString(), outcome, noteId, ...extra });
  const out = (status, json, outcome, extra) => {
    log(outcome, { status, ...extra });
    return { status, json };
  };

  if (!isUuid(target?.noteId)) {
    return out(503, { error: 'NOTE_RESTORE_NOT_CONFIGURED' }, 'not_configured');
  }
  if (noteId !== target.noteId.toLowerCase()) {
    return out(404, { error: 'NOT_FOUND' }, 'not_target');
  }

  const req = body ?? {};
  if (typeof req !== 'object' || Array.isArray(req)) {
    return out(400, { error: 'INVALID_RESTORE_REQUEST' }, 'bad_body');
  }
  if (OWNER_FIELDS.some((key) => Object.hasOwn(req, key))) {
    return out(403, { error: 'OWNER_CHANGE_FORBIDDEN' }, 'owner_field');
  }
  if (Object.keys(req).some((key) => !ALLOWED_KEYS.includes(key))
      || (Object.hasOwn(req, 'dryRun') && typeof req.dryRun !== 'boolean')) {
    return out(400, { error: 'INVALID_RESTORE_REQUEST' }, 'bad_body');
  }
  const dryRun = req.dryRun === true;
  if (!dryRun && typeof req.confirmContentSha256 !== 'string') {
    return out(400, {
      error: 'CONFIRMATION_REQUIRED',
      hint: 'dryRun:true 로 복원할 버전과 범위를 먼저 확인한 뒤, 그 contentSha256 을 confirmContentSha256 로 보내세요.',
    }, 'confirmation_required');
  }

  // Always re-read the private backup and recompute its content hash before proceeding.
  const backupResponse = await rest(
    `${NOTE_BACKUP_TABLE}?select=note_id,title,content,content_sha256&note_id=eq.${enc(noteId)}`,
  );
  if (!backupResponse.ok) {
    return out(502, { error: 'NOTES_SERVICE_UNAVAILABLE' }, 'backup_read_failed');
  }
  const backupRows = await backupResponse.json();
  const backup = Array.isArray(backupRows)
    ? backupRows.find((row) => row?.note_id === noteId) : undefined;
  if (!backup) return out(404, { error: 'BACKUP_NOT_FOUND' }, 'backup_not_found');
  if (typeof backup.title !== 'string' || typeof backup.content !== 'string'
      || typeof backup.content_sha256 !== 'string') {
    return out(502, { error: 'BACKUP_INVALID' }, 'backup_invalid');
  }
  const backupHash = noteContentHash(backup.title, backup.content);
  if (backupHash !== backup.content_sha256) {
    return out(409, { error: 'BACKUP_HASH_MISMATCH' }, 'backup_hash_mismatch', { backupHash });
  }

  // Read only the configured note. If its owner is no longer null, fail closed.
  const liveResponse = await rest(
    `training_notes?select=id,owner_id,title,content&id=eq.${enc(noteId)}`,
  );
  if (!liveResponse.ok) {
    return out(502, { error: 'NOTES_SERVICE_UNAVAILABLE' }, 'live_read_failed', { backupHash });
  }
  const liveRows = await liveResponse.json();
  const live = Array.isArray(liveRows)
    ? liveRows.find((row) => row?.id === noteId) : undefined;
  if (live && live.owner_id !== null) {
    return out(404, { error: 'NOT_FOUND' }, 'owner_conflict', { backupHash });
  }
  if (live && (typeof live.title !== 'string' || typeof live.content !== 'string')) {
    return out(502, { error: 'INVALID_NOTES_RESPONSE' }, 'live_invalid', { backupHash });
  }

  const beforeHash = live ? noteContentHash(live.title, live.content) : null;
  const plan = {
    restoreVersion: { id: noteId, contentSha256: backupHash },
    scope: {
      service: 'training_notes',
      route: NOTE_RESTORE_ROUTE,
      notesAffected: 1,
      action: live ? 'update' : 'insert',
      otherNotesTouched: 0,
      auditLog: 'append_only',
    },
    current: { exists: Boolean(live), contentSha256: beforeHash },
  };

  if (dryRun) return out(200, { dryRun: true, ...plan }, 'dry_run', { backupHash, beforeHash });
  if (req.confirmContentSha256 !== backupHash) {
    return out(409, { error: 'CONFIRMATION_MISMATCH' }, 'confirmation_mismatch', { backupHash, beforeHash });
  }
  if (beforeHash === backupHash) {
    return out(200, { restored: false, reason: 'already_matches', ...plan }, 'already_matches', { backupHash, beforeHash });
  }

  const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const writeResponse = live
    ? await rest(
      `training_notes?select=id,owner_id,title,content&id=eq.${enc(noteId)}&owner_id=is.null`,
      { method: 'PATCH', headers, body: JSON.stringify({ title: backup.title, content: backup.content }) },
    )
    : await rest('training_notes?select=id,owner_id,title,content', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: noteId, owner_id: null, title: backup.title, content: backup.content }),
    });
  if (!writeResponse.ok) {
    return out(502, { error: 'NOTES_SERVICE_UNAVAILABLE' }, 'write_failed', { backupHash, beforeHash });
  }

  const writtenRows = await writeResponse.json();
  const written = Array.isArray(writtenRows)
    ? writtenRows.find((row) => row?.id === noteId) : undefined;
  const afterHash = written && written.owner_id === null
    && typeof written.title === 'string' && typeof written.content === 'string'
    ? noteContentHash(written.title, written.content) : null;
  if (!written || afterHash !== backupHash) {
    return out(502, { error: 'RESTORE_VERIFY_FAILED' }, 'verify_failed', { backupHash, beforeHash, afterHash });
  }
  return out(200, {
    restored: true,
    matchesBackup: true,
    ...plan,
    current: { exists: true, contentSha256: afterHash },
  }, 'restored', { backupHash, beforeHash, afterHash });
}
