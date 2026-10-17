// 10단계: 비공개 가상 메모 사본에서 "한 건만" 복원합니다.
// rest 는 서버 전용 키로 Supabase REST 를 부르는 함수(ctx.rest)를 그대로 주입받습니다.
import { createHash } from 'node:crypto';

export const BACKUP_TABLE = 'memo_backups';
export const RESTORE_ROUTE = 'POST /api/memos/:id/restore';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const OWNER_FIELDS = ['owner_id', 'ownerId', 'user_id', 'userId'];
const ALLOWED_KEYS = ['dryRun', 'confirmContentSha256'];
const isUuid = (v) => typeof v === 'string' && UUID.test(v);
const enc = encodeURIComponent;

// SQL 의 public.memo_content_sha256(title, body) 와 같은 값이어야 합니다.
export function contentHash(title, body) {
  return createHash('sha256')
    .update(`${Buffer.byteLength(title, 'utf8')}:${title}${body}`, 'utf8')
    .digest('hex');
}

export async function restoreMemo({ rest, userId, id, body, target, audit = () => {} }) {
  const memoId = typeof id === 'string' ? id.toLowerCase() : id;
  const user = typeof userId === 'string' ? userId.toLowerCase() : userId;
  const log = (outcome, extra = {}) =>
    audit({ at: new Date().toISOString(), outcome, memoId, ownerId: user, ...extra });
  const out = (status, json, outcome, extra) => { log(outcome, { status, ...extra }); return { status, json }; };

  if (!isUuid(target?.memoId) || !isUuid(target?.ownerId)) {
    return out(503, { error: 'RESTORE_NOT_CONFIGURED' }, 'not_configured');
  }
  // 복원 대상 한 건, 시험 계정 B 만. 그 밖은 없는 것과 똑같이 404.
  if (memoId !== target.memoId.toLowerCase() || user !== target.ownerId.toLowerCase()) {
    return out(404, { error: 'NOT_FOUND' }, 'not_target');
  }

  const req = body ?? {};
  if (typeof req !== 'object' || Array.isArray(req)) {
    return out(400, { error: 'INVALID_RESTORE_REQUEST' }, 'bad_body');
  }
  if (OWNER_FIELDS.some((k) => Object.hasOwn(req, k))) {
    return out(403, { error: 'OWNER_CHANGE_FORBIDDEN' }, 'owner_field');
  }
  if (Object.keys(req).some((k) => !ALLOWED_KEYS.includes(k))
      || (Object.hasOwn(req, 'dryRun') && typeof req.dryRun !== 'boolean')) {
    return out(400, { error: 'INVALID_RESTORE_REQUEST' }, 'bad_body');
  }
  const dryRun = req.dryRun === true;
  if (!dryRun && typeof req.confirmContentSha256 !== 'string') {
    return out(400, { error: 'CONFIRMATION_REQUIRED',
      hint: 'dryRun:true 로 복원할 버전과 변경 범위를 먼저 확인한 뒤, 그 contentSha256 을 confirmContentSha256 로 보내세요.' },
    'confirmation_required');
  }

  // 1) 사본에서 이 메모 한 건만 읽습니다 (ID + 소유자 조건).
  const b = await rest(`${BACKUP_TABLE}?select=memo_id,owner_id,title,body,content_sha256&memo_id=eq.${enc(memoId)}&owner_id=eq.${enc(user)}`);
  if (!b.ok) return out(502, { error: 'MEMOS_SERVICE_UNAVAILABLE' }, 'backup_read_failed');
  const brows = await b.json();
  const backup = Array.isArray(brows)
    ? brows.find((r) => r?.memo_id === memoId && r?.owner_id === user) : undefined;
  if (!backup) return out(404, { error: 'BACKUP_NOT_FOUND' }, 'backup_not_found');
  if (typeof backup.title !== 'string' || typeof backup.body !== 'string'
      || typeof backup.content_sha256 !== 'string') {
    return out(502, { error: 'BACKUP_INVALID' }, 'backup_invalid');
  }
  // 2) 사본의 내용 해시가 기록된 해시와 같아야 합니다.
  const backupHash = contentHash(backup.title, backup.body);
  if (backupHash !== backup.content_sha256) {
    return out(409, { error: 'BACKUP_HASH_MISMATCH' }, 'backup_hash_mismatch', { backupHash });
  }

  // 3) 지금 메모 상태. ID 로만 찾고 다른 사람 소유면 건드리지 않습니다.
  const l = await rest(`memos?select=id,owner_id,title,body&id=eq.${enc(memoId)}`);
  if (!l.ok) return out(502, { error: 'MEMOS_SERVICE_UNAVAILABLE' }, 'live_read_failed');
  const lrows = await l.json();
  const live = Array.isArray(lrows) ? lrows.find((r) => r?.id === memoId) : undefined;
  if (live && live.owner_id !== user) {
    return out(404, { error: 'NOT_FOUND' }, 'owner_conflict', { backupHash });
  }
  const beforeHash = live && typeof live.title === 'string' && typeof live.body === 'string'
    ? contentHash(live.title, live.body) : null;
  const action = live ? 'update' : 'insert';
  const plan = {
    restoreVersion: { id: memoId, ownerId: user, contentSha256: backupHash },
    scope: { service: 'memos', route: RESTORE_ROUTE, memosAffected: 1, action,
      otherMemosTouched: 0, auditLog: 'append_only' },
    current: { exists: Boolean(live), contentSha256: beforeHash },
  };

  if (dryRun) return out(200, { dryRun: true, ...plan }, 'dry_run', { backupHash, beforeHash });

  // 4) 실행 전 확인: 보여 준 버전의 해시를 그대로 되돌려 보내야 합니다.
  if (req.confirmContentSha256 !== backupHash) {
    return out(409, { error: 'CONFIRMATION_MISMATCH' }, 'confirmation_mismatch', { backupHash, beforeHash });
  }
  if (beforeHash === backupHash) {
    return out(200, { restored: false, reason: 'already_matches', ...plan }, 'already_matches', { backupHash, beforeHash });
  }

  // 5) 이 한 건만 씁니다. 삭제·전체 덮어쓰기·감사 기록 수정은 없습니다.
  const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const w = live
    ? await rest(`memos?select=id,owner_id,title,body&id=eq.${enc(memoId)}&owner_id=eq.${enc(user)}`,
      { method: 'PATCH', headers, body: JSON.stringify({ title: backup.title, body: backup.body }) })
    : await rest('memos?select=id,owner_id,title,body',
      { method: 'POST', headers, body: JSON.stringify({ id: memoId, owner_id: user, title: backup.title, body: backup.body }) });
  if (!w.ok) return out(502, { error: 'MEMOS_SERVICE_UNAVAILABLE' }, 'write_failed', { backupHash, beforeHash });

  // 6) 쓴 뒤 다시 대조: ID·소유자·내용 해시가 사본과 같아야 성공입니다.
  const wrows = await w.json();
  const after = Array.isArray(wrows) ? wrows.find((r) => r?.id === memoId) : undefined;
  const afterHash = after && typeof after.title === 'string' && typeof after.body === 'string'
    ? contentHash(after.title, after.body) : null;
  if (!after || after.owner_id !== user || afterHash !== backupHash) {
    return out(502, { error: 'RESTORE_VERIFY_FAILED' }, 'verify_failed', { backupHash, beforeHash, afterHash });
  }
  return out(200, { restored: true, matchesBackup: true, ...plan, current: { exists: true, contentSha256: afterHash } },
    'restored', { backupHash, beforeHash, afterHash });
}
