import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import restoreHandler from '../api/memos/restore.js';
import config from '../aleph.config.json' with { type: 'json' };
import { RESOURCE_IDS } from '../src/resource-id.mjs';

const ownerId = '33333333-3333-4333-8333-333333333333';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const testMemoId = '00000000-0000-4000-8000-00000000b001';
const otherMemoId = '44444444-4444-4444-8444-444444444444';

function hashContent(title, body) {
  return createHash('sha256').update(JSON.stringify({ title, body }), 'utf8').digest('hex');
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

test('restores only test account B memo after verifying snapshot id, owner, and content hash', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'memo-restore-test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: 'b',
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(ownerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);

  const snapshot = {
    id: testMemoId,
    owner_id: ownerId,
    title: 'Virtual backup title',
    body: 'virtual-backup-body',
    contentSha256: hashContent('Virtual backup title', 'virtual-backup-body'),
  };
  const memos = new Map([
    [testMemoId, { id: testMemoId, owner_id: ownerId, title: 'Changed title', body: 'changed-body' }],
    [otherMemoId, { id: otherMemoId, owner_id: otherOwnerId, title: 'Unrelated memo', body: 'keep-unchanged' }],
  ]);
  const auditHistory = [{ id: 'audit-virtual-1', action: 'prior-test-event' }];
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
  const writes = [];
  process.env.SUPABASE_URL = 'https://memo-restore-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.equal(url.pathname, '/rest/v1/memos');
    assert.equal(url.searchParams.get('id'), `eq.${testMemoId}`);
    assert.equal(url.searchParams.get('owner_id'), `eq.${ownerId}`);
    const memo = memos.get(testMemoId);
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      writes.push({ url: url.toString(), patch });
      assert.deepEqual(Object.keys(patch).sort(), ['body', 'title']);
      Object.assign(memo, patch);
    }
    return new Response(JSON.stringify([memo]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const request = (body) => ({
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-resource-id': RESOURCE_IDS.personalMemos,
    },
    body,
  });

  try {
    const response = mockResponse();
    await restoreHandler(request({ snapshot }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
      id: snapshot.id,
      owner_id: snapshot.owner_id,
      contentSha256: snapshot.contentSha256,
    });
    assert.equal(memos.get(testMemoId).id, snapshot.id);
    assert.equal(memos.get(testMemoId).owner_id, snapshot.owner_id);
    assert.equal(hashContent(memos.get(testMemoId).title, memos.get(testMemoId).body), snapshot.contentSha256);
    assert.deepEqual(memos.get(otherMemoId), {
      id: otherMemoId,
      owner_id: otherOwnerId,
      title: 'Unrelated memo',
      body: 'keep-unchanged',
    });
    assert.deepEqual(auditHistory, [{ id: 'audit-virtual-1', action: 'prior-test-event' }]);
    assert.equal(writes.length, 1);

    for (const invalidSnapshot of [
      { ...snapshot, id: otherMemoId },
      { ...snapshot, owner_id: otherOwnerId },
      { ...snapshot, contentSha256: '0'.repeat(64) },
    ]) {
      const invalidResponse = mockResponse();
      await restoreHandler(request({ snapshot: invalidSnapshot }), invalidResponse);
      assert.equal(invalidResponse.statusCode, 400);
    }
    assert.equal(writes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecretKey;
  }
});
