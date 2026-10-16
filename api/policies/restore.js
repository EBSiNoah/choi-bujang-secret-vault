import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isUuid, memosContext } from '../../src/memos.mjs';
import {
  applyTestPolicyRestore,
  prepareTestPolicyRestore,
} from '../../src/policy-restore.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../src/resource-id.mjs';

const config = JSON.parse(readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'));
const ROUTE = { method: 'POST', path: '/api/policies/restore' };
const PREVIEW_TTL_SECONDS = 300;

class PolicyStoreError extends Error {}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function configuredRoute() {
  return Array.isArray(config.restoreRoute)
    && config.restoreRoute.some((route) => route?.method === ROUTE.method && route?.path === ROUTE.path);
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function safeEqualHex(actual, expected) {
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/u.test(actual)) return false;
  const actualBytes = Buffer.from(actual, 'hex');
  return actualBytes.length === expected.length && timingSafeEqual(actualBytes, expected);
}

function snapshotSignature(snapshot, key) {
  const signed = {
    version: snapshot.version,
    createdAt: snapshot.createdAt,
    intrusionAt: snapshot.intrusionAt,
    policy: snapshot.policy,
  };
  return hmac(key, `policy-snapshot-v1:${canonicalJson(signed)}`);
}

function policyDigest(policy) {
  return createHash('sha256').update(canonicalJson(policy), 'utf8').digest('hex');
}

function normalizeTimestamp(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function previewDigest(preview) {
  return createHash('sha256').update(canonicalJson(preview), 'utf8').digest('hex');
}

function createConfirmationToken(payload, key) {
  const encoded = Buffer.from(canonicalJson(payload), 'utf8').toString('base64url');
  const signature = hmac(key, `policy-restore-confirm-v1:${encoded}`).toString('hex');
  return `${encoded}.${signature}`;
}

function readConfirmationToken(token, key, userId) {
  if (typeof token !== 'string') return null;
  const [encoded, signature, ...extra] = token.split('.');
  if (!encoded || !signature || extra.length || !safeEqualHex(signature, hmac(key, `policy-restore-confirm-v1:${encoded}`))) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!exactKeys(payload, [
    'userId', 'version', 'restorePaths', 'currentPolicyDigest', 'previewDigest', 'expiresAt',
  ]) || payload.userId !== userId
    || !Number.isInteger(payload.expiresAt)
    || payload.expiresAt <= Math.floor(Date.now() / 1000)
    || !/^[a-f0-9]{64}$/u.test(payload.currentPolicyDigest)
    || !/^[a-f0-9]{64}$/u.test(payload.previewDigest)
    || typeof payload.version !== 'string'
    || !Array.isArray(payload.restorePaths)) return null;
  return payload;
}

function snapshotFromRow(row) {
  if (!isRecord(row) || typeof row.version !== 'string' || typeof row.created_at !== 'string'
    || typeof row.intrusion_at !== 'string' || !isRecord(row.policy)
    || typeof row.signature !== 'string') return null;
  const createdAt = normalizeTimestamp(row.created_at);
  const intrusionAt = normalizeTimestamp(row.intrusion_at);
  if (!createdAt || !intrusionAt) return null;
  return {
    version: row.version,
    createdAt,
    intrusionAt,
    policy: row.policy,
    signature: row.signature,
  };
}

function responseError(response, status, error) {
  return response.status(status).json({ error });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!configuredRoute()) return responseError(response, 500, 'RESTORE_ROUTE_NOT_CONFIGURED');
  if (!requireResourceId(request, response, RESOURCE_IDS.testPolicyRestore)) return;

  const ctx = await memosContext(request, response, ['POST']);
  if (!ctx) return;
  const operatorId = process.env.POLICY_RESTORE_OPERATOR_ID;
  if (!isUuid(operatorId)) return responseError(response, 500, 'POLICY_RESTORE_CONFIGURATION_ERROR');
  if (ctx.userId !== operatorId) return responseError(response, 403, 'POLICY_RESTORE_FORBIDDEN');

  const body = request.body;
  const previewAction = exactKeys(body, ['action', 'version', 'restorePaths'])
    && body.action === 'preview'
    && typeof body.version === 'string'
    && Array.isArray(body.restorePaths);
  const confirmAction = exactKeys(body, ['action', 'confirmationToken'])
    && body.action === 'confirm'
    && typeof body.confirmationToken === 'string';
  if (!previewAction && !confirmAction) return responseError(response, 400, 'INVALID_RESTORE_REQUEST');

  const key = process.env.POLICY_SNAPSHOT_HMAC_KEY;
  if (typeof key !== 'string' || Buffer.byteLength(key, 'utf8') < 32) {
    return responseError(response, 500, 'POLICY_RESTORE_CONFIGURATION_ERROR');
  }

  let confirmation;
  let version;
  let restorePaths;
  if (previewAction) {
    version = body.version;
    restorePaths = body.restorePaths;
  } else {
    confirmation = readConfirmationToken(body.confirmationToken, key, ctx.userId);
    if (!confirmation) return responseError(response, 409, 'RESTORE_PREVIEW_EXPIRED_OR_INVALID');
    version = confirmation.version;
    restorePaths = confirmation.restorePaths;
  }

  const rest = async (path, init) => {
    const result = await ctx.rest(path, init);
    if (!result.ok) throw new PolicyStoreError('Policy test store request failed.');
    return result;
  };

  try {
    const snapshotResponse = await rest(
      `test_policy_snapshots?select=version,created_at,intrusion_at,policy,signature&version=eq.${encodeURIComponent(version)}&limit=1`,
    );
    const snapshotRows = await snapshotResponse.json();
    if (!Array.isArray(snapshotRows) || snapshotRows.length === 0) {
      return responseError(response, 404, 'POLICY_SNAPSHOT_NOT_FOUND');
    }
    if (snapshotRows.length !== 1) return responseError(response, 502, 'INVALID_POLICY_SNAPSHOT_RESPONSE');

    const snapshot = snapshotFromRow(snapshotRows[0]);
    if (!snapshot || snapshot.version !== version
      || !safeEqualHex(snapshot.signature, snapshotSignature(snapshot, key))) {
      return responseError(response, 409, 'POLICY_SNAPSHOT_UNVERIFIED');
    }
    if (Date.parse(snapshot.createdAt) >= Date.parse(snapshot.intrusionAt)) {
      return responseError(response, 409, 'POLICY_SNAPSHOT_INVALID');
    }

    let stateRevision;
    const testPolicy = {
      environment: 'test',
      async read() {
        const stateResponse = await rest(
          'test_policy_state?select=id,policy,revision&id=eq.singleton&limit=1',
        );
        const rows = await stateResponse.json();
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== 'singleton'
          || !isRecord(rows[0]?.policy) || !Number.isSafeInteger(rows[0]?.revision)
          || rows[0].revision < 1) {
          throw new PolicyStoreError('The test policy state is unavailable or invalid.');
        }
        stateRevision = rows[0].revision;
        return rows[0].policy;
      },
      async replace(policy) {
        if (!Number.isSafeInteger(stateRevision)) {
          throw new PolicyStoreError('The test policy revision is unavailable.');
        }
        const updateResponse = await rest(
          `test_policy_state?id=eq.singleton&revision=eq.${stateRevision}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify({
              policy,
              revision: stateRevision + 1,
              updated_at: new Date().toISOString(),
            }),
          },
        );
        const rows = await updateResponse.json();
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== 'singleton'
          || !isRecord(rows[0]?.policy) || rows[0].revision !== stateRevision + 1
          || !isDeepEqual(rows[0].policy, policy)) {
          throw new PolicyStoreError('The test policy changed before it could be restored.');
        }
      },
    };
    const verifySnapshot = (copy) => safeEqualHex(copy.signature, snapshotSignature(copy, key));
    const plan = await prepareTestPolicyRestore({
      snapshot,
      intrusionAt: snapshot.intrusionAt,
      verifySnapshot,
      testPolicy,
      restorePaths,
    });

    if (previewAction) {
      if (plan.preview.changes.length === 0) {
        return response.status(200).json({ applied: false, preview: plan.preview, confirmationToken: null });
      }
      const token = createConfirmationToken({
        userId: ctx.userId,
        version,
        restorePaths,
        currentPolicyDigest: policyDigest(plan.originalPolicy),
        previewDigest: previewDigest(plan.preview),
        expiresAt: Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS,
      }, key);
      return response.status(200).json({
        applied: false,
        preview: plan.preview,
        confirmationToken: token,
      });
    }

    if (confirmation.currentPolicyDigest !== policyDigest(plan.originalPolicy)
      || confirmation.previewDigest !== previewDigest(plan.preview)) {
      return responseError(response, 409, 'POLICY_CHANGED_AFTER_PREVIEW');
    }
    await applyTestPolicyRestore({ plan, verifySnapshot, testPolicy });
    return response.status(200).json({ applied: true, preview: plan.preview });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return responseError(response, 400, 'INVALID_POLICY_RESTORE_SCOPE');
    }
    if (error instanceof PolicyStoreError) {
      return responseError(response, 502, 'POLICY_TEST_STORE_UNAVAILABLE');
    }
    if (error instanceof Error && error.message.includes('could not be verified')) {
      return responseError(response, 409, 'POLICY_SNAPSHOT_UNVERIFIED');
    }
    if (error instanceof Error && error.message.includes('changed after preview')) {
      return responseError(response, 409, 'POLICY_CHANGED_AFTER_PREVIEW');
    }
    throw error;
  }
}

function isDeepEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}
