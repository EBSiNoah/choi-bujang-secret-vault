import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreTestPolicy } from "../src/policy-restore.mjs";
import { selectOwnedMemos } from "../src/memos.mjs";

const intrusionAt = "2026-10-15T12:00:00.000Z";
const snapshot = {
  version: "policy-2026-10-14",
  createdAt: "2026-10-14T12:00:00.000Z",
  policy: { auth: { mfa: true, timeout: 30 }, routes: ["/api/notes"] },
  signature: "verified-by-store",
};

function setup(overrides = {}) {
  let policy = { auth: { mfa: false, timeout: 30 }, routes: ["/api/notes", "/api/admin"] };
  const writes = [];
  const previews = [];
  let reads = 0;
  const options = {
    snapshot,
    intrusionAt,
    restorePaths: ["/auth", "/routes"],
    verifySnapshot: async () => true,
    testPolicy: {
      environment: "test",
      read: async () => {
        reads += 1;
        return structuredClone(policy);
      },
      replace: async (nextPolicy) => {
        writes.push(structuredClone(nextPolicy));
        policy = structuredClone(nextPolicy);
      },
    },
    presentPreview: async (preview) => previews.push(preview),
    confirmRestore: async () => true,
    ...overrides,
  };
  return { options, writes, previews, current: () => policy, readCount: () => reads };
}

test("shows only the verified copy's differences before restoring the test policy", async () => {
  const state = setup();
  const result = await restoreTestPolicy(state.options);

  assert.equal(state.previews.length, 1);
  assert.equal(state.previews[0].version, "policy-2026-10-14");
  assert.deepEqual(state.previews[0].scope, ["/auth/mfa", "/routes"]);
  assert.deepEqual(state.previews[0].changes, [
    { path: "/auth/mfa", operation: "replace", before: false, after: true },
    {
      path: "/routes",
      operation: "replace",
      before: ["/api/notes", "/api/admin"],
      after: ["/api/notes"],
    },
  ]);
  assert.equal(Object.hasOwn(state.previews[0], "policy"), false);
  assert.equal(result.applied, true);
  assert.deepEqual(state.writes, [snapshot.policy]);
  assert.deepEqual(state.current(), snapshot.policy);
});

test("restores only selected memo ownership policy and preserves service rules and audit history", async () => {
  const safePolicy = {
    resourceAccess: { memos: { ownerOnly: true } },
    services: { notices: { enabled: true, rule: "notices-v3" } },
    serviceRules: { search: ["allow-public-search"] },
    auditHistory: [{ id: "audit-1", action: "policy-change" }],
  };
  const currentPolicy = {
    resourceAccess: { memos: { ownerOnly: false } },
    services: { notices: { enabled: false, rule: "notices-v2" } },
    serviceRules: { search: ["allow-public-search", "allow-private-search"] },
    auditHistory: [{ id: "audit-1", action: "policy-change" }, { id: "audit-2", action: "test-change" }],
  };
  const before = structuredClone(currentPolicy);
  const state = setup({
    snapshot: { ...snapshot, policy: safePolicy },
    restorePaths: ["/resourceAccess/memos"],
  });
  state.options.testPolicy.read = async () => structuredClone(currentPolicy);
  state.options.testPolicy.replace = async (nextPolicy) => {
    state.writes.push(structuredClone(nextPolicy));
    Object.assign(currentPolicy, structuredClone(nextPolicy));
  };
  const result = await restoreTestPolicy(state.options);

  assert.equal(result.applied, true);
  assert.deepEqual(result.preview.scope, ["/resourceAccess/memos/ownerOnly"]);
  assert.deepEqual(result.preview.changes, [{
    path: "/resourceAccess/memos/ownerOnly",
    operation: "replace",
    before: false,
    after: true,
  }]);
  assert.deepEqual(currentPolicy.resourceAccess, safePolicy.resourceAccess);
  assert.deepEqual(currentPolicy.services, before.services);
  assert.deepEqual(currentPolicy.serviceRules, before.serviceRules);
  assert.deepEqual(currentPolicy.auditHistory, before.auditHistory);

  const rows = [
    { id: "memo-a", owner_id: "user-a", title: "A memo", body: "A data" },
    { id: "memo-b", owner_id: "user-b", title: "B memo", body: "B data" },
  ];
  assert.equal(currentPolicy.resourceAccess.memos.ownerOnly, true);
  assert.deepEqual(selectOwnedMemos([rows[0]], "user-b"), []);
  assert.deepEqual(selectOwnedMemos([rows[0]], "user-a"), [
    { id: "memo-a", title: "A memo", body: "A data" },
  ]);
});

test("stops before reading or writing when the snapshot is missing or invalid", async () => {
  for (const overrides of [
    { snapshot: undefined },
    { verifySnapshot: async () => false },
    { snapshot: { ...snapshot, createdAt: intrusionAt } },
  ]) {
    const state = setup(overrides);
    await assert.rejects(restoreTestPolicy(state.options));
    assert.equal(state.readCount(), 0);
    assert.equal(state.writes.length, 0);
    assert.equal(state.previews.length, 0);
  }
});

test("requires explicit non-overlapping restore paths and protects service and audit paths", async () => {
  for (const restorePaths of [
    undefined,
    ["/"],
    ["/services/notices"],
    ["/resourceAccess/audit_history"],
    ["/auditHistory"],
    ["/resourceAccess", "/resourceAccess/memos"],
  ]) {
    const state = setup({ restorePaths });
    await assert.rejects(restoreTestPolicy(state.options));
    assert.equal(state.readCount(), 0);
    assert.equal(state.writes.length, 0);
  }
});

test("does not restore without explicit confirmation", async () => {
  const state = setup({ confirmRestore: async () => false });
  const result = await restoreTestPolicy(state.options);

  assert.equal(state.previews.length, 1);
  assert.equal(result.applied, false);
  assert.equal(state.writes.length, 0);
});

test("requires a test-only store", async () => {
  const state = setup({
    testPolicy: {
      environment: "production",
      read: async () => ({}),
      replace: async () => {},
    },
  });
  await assert.rejects(restoreTestPolicy(state.options), /test-only/);
  assert.equal(state.writes.length, 0);
});

test("stops if the test policy changes after its preview", async () => {
  const state = setup({
    confirmRestore: async () => {
      state.options.testPolicy.read = async () => ({ auth: { mfa: "changed" } });
      return true;
    },
  });
  await assert.rejects(restoreTestPolicy(state.options), /changed after preview/);
  assert.equal(state.writes.length, 0);
});

test("stops if the snapshot fails re-verification after approval", async () => {
  let checks = 0;
  const state = setup({
    verifySnapshot: async () => ++checks === 1,
  });

  await assert.rejects(restoreTestPolicy(state.options), /re-verification/);
  assert.equal(state.writes.length, 0);
});

test("does not write when the verified snapshot already matches", async () => {
  const state = setup({
    snapshot: { ...snapshot, policy: { auth: { mfa: false, timeout: 30 }, routes: ["/api/notes", "/api/admin"] } },
  });
  const result = await restoreTestPolicy(state.options);
  assert.deepEqual(result.preview.changes, []);
  assert.equal(result.applied, false);
  assert.equal(state.writes.length, 0);
});
