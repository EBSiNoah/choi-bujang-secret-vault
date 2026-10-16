import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import handler from '../api/notes/restore.js';
import config from '../aleph.config.json' with { type: 'json' };
import { RESOURCE_IDS } from '../src/resource-id.mjs';

const userId = '22222222-2222-4222-8222-222222222222';
const noteId = '00000000-0000-4000-8000-000000000001';
const otherNoteId = '00000000-0000-4000-8000-000000000002';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = await exportJWK(publicKey);
jwk.kid = 'notes-restore-test-key';
jwk.alg = 'ES256';
jwk.use = 'sig';

function hashContent(title, content) {
  return createHash('sha256')
    .update(JSON.stringify({ title, content }), 'utf8')
    .digest('hex');
}

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: undefined,
    body: undefined,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('restores one virtual notice for an instructor and preserves every other notice', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: 'a',
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);

  const snapshot = {
    id: noteId,
    owner_id: null,
    title: 'Virtual restored notice',
    content: 'Virtual restored content',
    contentSha256: hashContent('Virtual restored notice', 'Virtual restored content'),
  };
  const rows = new Map([
    [noteId, { id: noteId, owner_id: null, title: 'Changed notice', content: 'Changed content' }],
    [otherNoteId, { id: otherNoteId, owner_id: null, title: 'Keep notice', content: 'Keep content' }],
  ]);
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const writes = [];
  process.env.SUPABASE_URL = 'https://notes-restore-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/rest/v1/instructors') {
      assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
      return new Response(JSON.stringify([{ user_id: userId }]), { status: 200 });
    }
    assert.equal(url.pathname, '/rest/v1/training_notes');
    assert.equal(url.searchParams.get('id'), `eq.${noteId}`);
    assert.equal(url.searchParams.get('owner_id'), 'is.null');
    const note = rows.get(noteId);
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      writes.push(patch);
      assert.deepEqual(Object.keys(patch).sort(), ['content', 'title']);
      Object.assign(note, patch);
    }
    return new Response(JSON.stringify([note]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const request = (body) => ({
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-resource-id': RESOURCE_IDS.instructorAnnouncements,
    },
    body,
  });

  try {
    const response = mockResponse();
    await handler(request({ snapshot }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      id: snapshot.id,
      owner_id: null,
      contentSha256: snapshot.contentSha256,
    });
    assert.equal(rows.get(noteId).id, snapshot.id);
    assert.equal(rows.get(noteId).owner_id, null);
    assert.equal(hashContent(rows.get(noteId).title, rows.get(noteId).content), snapshot.contentSha256);
    assert.deepEqual(rows.get(otherNoteId), {
      id: otherNoteId,
      owner_id: null,
      title: 'Keep notice',
      content: 'Keep content',
    });
    assert.equal(writes.length, 1);

    for (const invalidSnapshot of [
      { ...snapshot, id: '00000000-0000-4000-8000-000000000005' },
      { ...snapshot, owner_id: userId },
      { ...snapshot, contentSha256: '0'.repeat(64) },
    ]) {
      const invalidResponse = mockResponse();
      await handler(request({ snapshot: invalidSnapshot }), invalidResponse);
      assert.equal(invalidResponse.statusCode, 400);
    }
    assert.equal(writes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecret;
  }
});

test('refuses to restore a virtual notice when the authenticated user is not an instructor', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: 'b',
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);
  const snapshot = {
    id: noteId,
    owner_id: null,
    title: 'Virtual restored notice',
    content: 'Virtual restored content',
    contentSha256: hashContent('Virtual restored notice', 'Virtual restored content'),
  };
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  let notesRequested = false;
  process.env.SUPABASE_URL = 'https://notes-restore-denied-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    if (url.pathname === '/rest/v1/instructors') {
      return new Response('[]', { status: 200 });
    }
    notesRequested = true;
    throw new Error('Notes must not be accessed for a non-instructor');
  };

  try {
    const response = mockResponse();
    await handler({
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-resource-id': RESOURCE_IDS.instructorAnnouncements,
      },
      body: { snapshot },
    }, response);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: 'INSTRUCTOR_REQUIRED' });
    assert.equal(notesRequested, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecret;
  }
});
