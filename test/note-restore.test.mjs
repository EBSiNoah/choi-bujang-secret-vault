import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import handler from '../api/notes/[id]/restore.js';
import config from '../aleph.config.json' with { type: 'json' };
import { noteContentHash } from '../src/note-restore.mjs';
import { NOTE_RESTORE_TARGET } from '../src/note-restore-target.mjs';
import { RESOURCE_IDS } from '../src/resource-id.mjs';

const instructorId = '22222222-2222-4222-8222-222222222222';
const nonInstructorId = '33333333-3333-4333-8333-333333333333';
const noteId = NOTE_RESTORE_TARGET.noteId;
const otherNoteId = '00000000-0000-4000-8000-000000000002';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'note-restore-test-key';
jwk.alg = 'ES256';
jwk.use = 'sig';

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: undefined,
    body: undefined,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function tokenFor(userId, identity = 'a') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: identity,
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);
}

function installMockSupabase({ instructor = true, backupExists = true, corruptBackup = false } = {}) {
  const backup = {
    note_id: noteId,
    title: 'Verified backup title',
    content: 'Verified backup content',
    content_sha256: noteContentHash('Verified backup title', 'Verified backup content'),
  };
  if (corruptBackup) backup.content_sha256 = '0'.repeat(64);
  const notes = new Map([
    [noteId, { id: noteId, owner_id: null, title: 'Current title', content: 'Current content' }],
    [otherNoteId, { id: otherNoteId, owner_id: null, title: 'Keep this', content: 'Unrelated note' }],
  ]);
  const writes = [];
  let backupReads = 0;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://note-restore-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    if (url.pathname === '/rest/v1/instructors') {
      const allowed = instructor && url.searchParams.get('user_id') === `eq.${instructorId}`;
      return new Response(JSON.stringify(allowed ? [{ user_id: instructorId }] : []), { status: 200 });
    }
    if (url.pathname === '/rest/v1/training_note_backups') {
      backupReads += 1;
      assert.equal(url.searchParams.get('note_id'), `eq.${noteId}`);
      return new Response(JSON.stringify(backupExists ? [backup] : []), { status: 200 });
    }
    if (url.pathname === '/rest/v1/training_notes') {
      assert.equal(url.searchParams.get('id'), `eq.${noteId}`);
      const note = notes.get(noteId);
      if (init.method === 'PATCH') {
        assert.equal(url.searchParams.get('owner_id'), 'is.null');
        const patch = JSON.parse(init.body);
        writes.push(patch);
        Object.assign(note, patch);
      }
      return new Response(JSON.stringify(note ? [note] : []), { status: 200 });
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
  return {
    backup,
    notes,
    writes,
    get backupReads() { return backupReads; },
    restore() {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = originalKey;
    },
  };
}

function request(token, body, id = noteId) {
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-resource-id': RESOURCE_IDS.instructorAnnouncements,
    },
    query: { id },
    body,
  };
}

test('instructor dryRun verifies one backup and confirmation restores only that notice', async () => {
  const mock = installMockSupabase();
  const token = await tokenFor(instructorId);
  try {
    const preview = mockResponse();
    await handler(request(token, { dryRun: true }), preview);
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.body.dryRun, true);
    assert.equal(preview.body.restoreVersion.id, noteId);
    assert.equal(preview.body.restoreVersion.contentSha256, mock.backup.content_sha256);
    assert.equal(preview.body.scope.notesAffected, 1);
    assert.equal(preview.body.scope.otherNotesTouched, 0);
    assert.equal(mock.writes.length, 0);

    const confirmation = mockResponse();
    await handler(request(token, { confirmContentSha256: mock.backup.content_sha256 }), confirmation);
    assert.equal(confirmation.statusCode, 200);
    assert.equal(confirmation.body.restored, true);
    assert.equal(confirmation.body.matchesBackup, true);
    assert.deepEqual(mock.writes, [{ title: mock.backup.title, content: mock.backup.content }]);
    assert.deepEqual(mock.notes.get(otherNoteId), {
      id: otherNoteId,
      owner_id: null,
      title: 'Keep this',
      content: 'Unrelated note',
    });
  } finally {
    mock.restore();
  }
});

test('rejects non-instructors before reading any backup or notice', async () => {
  const mock = installMockSupabase({ instructor: false });
  const token = await tokenFor(nonInstructorId, 'b');
  try {
    const denied = mockResponse();
    await handler(request(token, { dryRun: true }), denied);
    assert.equal(denied.statusCode, 403);
    assert.deepEqual(denied.body, { error: 'INSTRUCTOR_REQUIRED' });
    assert.equal(mock.backupReads, 0);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});

test('rejects an unconfigured note ID before reading or writing data', async () => {
  const mock = installMockSupabase();
  const token = await tokenFor(instructorId);
  try {
    const response = mockResponse();
    await handler(request(token, { dryRun: true }, otherNoteId), response);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: 'NOT_FOUND' });
    assert.equal(mock.backupReads, 0);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});

test('stops when the backup is missing or its content hash is invalid', async (t) => {
  for (const scenario of [
    { name: 'missing backup', options: { backupExists: false }, status: 404, error: 'BACKUP_NOT_FOUND' },
    { name: 'mismatched backup hash', options: { corruptBackup: true }, status: 409, error: 'BACKUP_HASH_MISMATCH' },
  ]) {
    await t.test(scenario.name, async () => {
      const mock = installMockSupabase(scenario.options);
      const token = await tokenFor(instructorId);
      try {
        const response = mockResponse();
        await handler(request(token, { dryRun: true }), response);
        assert.equal(response.statusCode, scenario.status);
        assert.deepEqual(response.body, { error: scenario.error });
        assert.equal(mock.writes.length, 0);
      } finally {
        mock.restore();
      }
    });
  }
});

test('rejects a confirmation hash that differs from the newly verified backup', async () => {
  const mock = installMockSupabase();
  const token = await tokenFor(instructorId);
  try {
    const response = mockResponse();
    await handler(request(token, { confirmContentSha256: '0'.repeat(64) }), response);
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.body, { error: 'CONFIRMATION_MISMATCH' });
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});

test('rejects wrong resource ID and non-POST methods before accessing Supabase', async () => {
  const mock = installMockSupabase();
  const token = await tokenFor(instructorId);
  try {
    const wrongResource = request(token, { dryRun: true });
    wrongResource.headers['x-resource-id'] = RESOURCE_IDS.personalMemos;
    const resourceResponse = mockResponse();
    await handler(wrongResource, resourceResponse);
    assert.equal(resourceResponse.statusCode, 400);
    assert.equal(resourceResponse.body.error, 'RESOURCE_ID_MISMATCH');

    const wrongMethod = request(token, { dryRun: true });
    wrongMethod.method = 'GET';
    const methodResponse = mockResponse();
    await handler(wrongMethod, methodResponse);
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.body.error, 'METHOD_NOT_ALLOWED');
    assert.equal(mock.backupReads, 0);
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});

 test('requires a preview before applying and rejects owner changes', async () => {
  const mock = installMockSupabase();
  const token = await tokenFor(instructorId);
  try {
    const missingConfirmation = mockResponse();
    await handler(request(token, {}), missingConfirmation);
    assert.equal(missingConfirmation.statusCode, 400);
    assert.equal(missingConfirmation.body.error, 'CONFIRMATION_REQUIRED');

    const ownerChange = mockResponse();
    await handler(request(token, { dryRun: true, owner_id: instructorId }), ownerChange);
    assert.equal(ownerChange.statusCode, 403);
    assert.equal(ownerChange.body.error, 'OWNER_CHANGE_FORBIDDEN');
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
});
