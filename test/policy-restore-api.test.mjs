import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { test } from 'node:test';
import handler from '../api/policies/restore.js';
import config from '../aleph.config.json' with { type: 'json' };
import { RESOURCE_IDS } from '../src/resource-id.mjs';

const ownerId = '33333333-3333-4333-8333-333333333333';
const hmacKey = 'test-only-policy-snapshot-hmac-key-32bytes';
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};

function signSnapshot(snapshot) {
  return createHmac('sha256', hmacKey)
    .update(`policy-snapshot-v1:${canonical({
      version: snapshot.version,
      createdAt: snapshot.createdAt,
      intrusionAt: snapshot.intrusionAt,
      policy: snapshot.policy,
    })}`)
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
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('policy restore previews first, then verifies and updates only the test policy on confirmation', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'policy-restore-test-key';
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
    version: 'safe-policy-v4',
    createdAt: '2026-10-14T12:00:00.000Z',
    intrusionAt: '2026-10-15T12:00:00.000Z',
    policy: {
      resourceAccess: { memos: { ownerOnly: true } },
      services: { notices: { enabled: true } },
      auditHistory: [{ id: 'audit-1', event: 'preserve' }],
    },
  };
  const snapshotRow = {
    version: snapshot.version,
    created_at: snapshot.createdAt,
    intrusion_at: snapshot.intrusionAt,
    policy: structuredClone(snapshot.policy),
    signature: signSnapshot(snapshot),
  };
  const testState = {
    id: 'singleton',
    policy: {
      resourceAccess: { memos: { ownerOnly: false } },
      services: { notices: { enabled: false } },
      auditHistory: [{ id: 'audit-1', event: 'preserve' }, { id: 'audit-2', event: 'keep' }],
    },
    revision: 8,
  };
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousHmacKey = process.env.POLICY_SNAPSHOT_HMAC_KEY;
  const previousOperatorId = process.env.POLICY_RESTORE_OPERATOR_ID;
  let stateReads = 0;
  let stateWrites = 0;
  process.env.SUPABASE_URL = 'https://policy-restore-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  process.env.POLICY_SNAPSHOT_HMAC_KEY = hmacKey;
  process.env.POLICY_RESTORE_OPERATOR_ID = ownerId;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    if (url.pathname === '/rest/v1/test_policy_snapshots') {
      return new Response(JSON.stringify([snapshotRow]), { status: 200 });
    }
    assert.equal(url.pathname, '/rest/v1/test_policy_state');
    if (init.method === 'PATCH') {
      stateWrites += 1;
      assert.equal(url.searchParams.get('revision'), 'eq.8');
      const patch = JSON.parse(init.body);
      testState.policy = patch.policy;
      testState.revision = patch.revision;
      return new Response(JSON.stringify([structuredClone(testState)]), { status: 200 });
    }
    stateReads += 1;
    return new Response(JSON.stringify([structuredClone(testState)]), { status: 200 });
  };

  const makeRequest = (body) => ({
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-resource-id': RESOURCE_IDS.testPolicyRestore,
    },
    body,
  });

  try {
    const previewResponse = mockResponse();
    await handler(makeRequest({
      action: 'preview',
      version: snapshot.version,
      restorePaths: ['/resourceAccess/memos'],
    }), previewResponse);

    assert.equal(previewResponse.statusCode, 200);
    assert.equal(previewResponse.body.applied, false);
    assert.equal(previewResponse.body.preview.version, snapshot.version);
    assert.deepEqual(previewResponse.body.preview.scope, ['/resourceAccess/memos/ownerOnly']);
    assert.equal(typeof previewResponse.body.confirmationToken, 'string');
    assert.equal(stateWrites, 0);
    assert.equal(testState.policy.resourceAccess.memos.ownerOnly, false);

    const confirmResponse = mockResponse();
    await handler(makeRequest({
      action: 'confirm',
      confirmationToken: previewResponse.body.confirmationToken,
    }), confirmResponse);

    assert.equal(confirmResponse.statusCode, 200);
    assert.equal(confirmResponse.body.applied, true);
    assert.equal(testState.policy.resourceAccess.memos.ownerOnly, true);
    assert.deepEqual(testState.policy.services, { notices: { enabled: false } });
    assert.deepEqual(testState.policy.auditHistory, [
      { id: 'audit-1', event: 'preserve' },
      { id: 'audit-2', event: 'keep' },
    ]);
    assert.equal(testState.revision, 9);
    assert.equal(stateWrites, 1);

    const badSignaturePreview = mockResponse();
    const readsBeforeInvalidSnapshot = stateReads;
    snapshotRow.signature = '0'.repeat(64);
    await handler(makeRequest({
      action: 'preview',
      version: snapshot.version,
      restorePaths: ['/resourceAccess/memos'],
    }), badSignaturePreview);
    assert.equal(badSignaturePreview.statusCode, 409);
    assert.equal(badSignaturePreview.body.error, 'POLICY_SNAPSHOT_UNVERIFIED');
    assert.equal(stateReads, readsBeforeInvalidSnapshot);
    assert.equal(stateWrites, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecret;
    if (previousHmacKey === undefined) delete process.env.POLICY_SNAPSHOT_HMAC_KEY;
    else process.env.POLICY_SNAPSHOT_HMAC_KEY = previousHmacKey;
    if (previousOperatorId === undefined) delete process.env.POLICY_RESTORE_OPERATOR_ID;
    else process.env.POLICY_RESTORE_OPERATOR_ID = previousOperatorId;
  }
});

test('route config points to the policy restore path, not the preserved memo restore path', () => {
  assert.deepEqual(config.restoreRoute, [{ method: 'POST', path: '/api/policies/restore' }]);
});
