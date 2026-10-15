import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import notesHandler from '../api/notes.js';
import memosHandler from '../api/memos/index.js';
import memoHandler from '../api/memos/[id].js';
import { RESOURCE_IDS } from '../src/resource-id.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const testUserId = '22222222-2222-4222-8222-222222222222';
const testMemoId = '33333333-3333-4333-8333-333333333333';

function mockResponse() {
  const headers = new Map();
  const response = {
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
    end() {
      return this;
    },
  };
  return response;
}

const protectedHandlers = [
  {
    name: 'instructor announcements',
    handler: notesHandler,
    expectedResourceId: RESOURCE_IDS.instructorAnnouncements,
  },
  {
    name: 'memo collection',
    handler: memosHandler,
    expectedResourceId: RESOURCE_IDS.personalMemos,
  },
  {
    name: 'individual memo',
    handler: memoHandler,
    expectedResourceId: RESOURCE_IDS.personalMemos,
  },
];

for (const { name, handler, expectedResourceId } of protectedHandlers) {
  test(`${name} requires its own resource ID`, async () => {
    for (const [headers, expectedError] of [
      [{}, 'RESOURCE_ID_REQUIRED'],
      [{ 'x-resource-id': 'other-resource-v1' }, 'RESOURCE_ID_MISMATCH'],
    ]) {
      const response = mockResponse();
      await handler({ method: 'GET', headers, query: { id: 'memo-id' } }, response);

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.body, { error: expectedError });
      assert.equal(response.headers.get('x-resource-id'), expectedResourceId);
    }
  });
}

test('memo and instructor announcement resource IDs are distinct', () => {
  assert.notEqual(
    RESOURCE_IDS.instructorAnnouncements,
    RESOURCE_IDS.personalMemos,
  );
});

test('handlers return 200 when the correct resource ID is provided', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'resource-id-test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: 'a',
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(testUserId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);

  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;

  process.env.SUPABASE_URL = 'https://resource-id-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    let body;

    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      body = { keys: [jwk] };
    } else if (url.pathname === '/rest/v1/training_notes') {
      body = [];
    } else if (url.pathname === '/rest/v1/memos' && url.searchParams.get('select') === 'id,title,body') {
      body = [];
    } else if (url.pathname === '/rest/v1/memos') {
      body = [{ id: testMemoId, owner_id: testUserId, title: 'Test memo', body: 'Test body' }];
    } else {
      throw new Error(`Unexpected test fetch URL: ${url}`);
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    for (const { name, handler, expectedResourceId } of protectedHandlers) {
      const response = mockResponse();
      await handler({
        method: 'GET',
        headers: {
          'x-resource-id': expectedResourceId,
          authorization: `Bearer ${token}`,
        },
        query: { id: testMemoId },
      }, response);

      assert.equal(response.statusCode, 200, `${name} should accept its resource ID`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecretKey;
  }
});
