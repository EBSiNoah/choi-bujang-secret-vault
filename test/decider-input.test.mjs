import assert from 'node:assert/strict';
import test from 'node:test';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('accepts signals only when their source and values match the contract', async () => {
  const { normal } = fixtureRequests();

  assert.equal((await decide(normal)).decision, 'allow');
  assert.equal((await decide({
    ...normal,
    signals: { source: 'none', region: 'unknown', network: 'unknown', hour: 'unknown' },
  })).decision, 'allow');
});

test('rejects absent, unclear, or client-supplied access signals instead of filling defaults', async () => {
  const { normal } = fixtureRequests();
  const invalidSignals = [
    undefined,
    { source: 'unknown', region: 'unknown', network: 'unknown', hour: 'unknown' },
    { source: 'none', region: 'local', network: 'usual', hour: 14 },
    { source: 'client_header', region: 'local', network: 'usual', hour: 14 },
    { source: 'none', region: 'unknown', network: 'unknown' },
  ];

  for (const signals of invalidSignals) {
    await assert.rejects(
      decide({ ...normal, signals }),
      { name: 'TypeError', message: 'Invalid engine decision request' },
    );
  }
});

test('rejects unsupported role, identity, and device request fields', async () => {
  const { normal } = fixtureRequests();

  for (const field of ['role', 'identity', 'device']) {
    await assert.rejects(
      decide({ ...normal, [field]: {} }),
      { name: 'TypeError', message: 'Invalid engine decision request' },
    );
  }
});

test('sends the composite unusual-access fixture to step-up with a reason', async () => {
  const { suspicious } = fixtureRequests();

  assert.deepEqual(await decide(suspicious), {
    schema: 'aleph.decision.v1',
    requestId: suspicious.requestId,
    decision: 'step_up',
    reasonCode: 'step_up_required',
    ruleIds: ['resource_route_policy', 'device_registered', 'step_up_required'],
  });
});

test('does not block by region alone and keeps the device-registration rule', async () => {
  const { normal, suspicious } = fixtureRequests();
  const regionOnly = {
    ...normal,
    signals: { ...normal.signals, region: 'foreign' },
  };
  const unregisteredSuspicious = { ...suspicious, deviceRegistered: false };

  assert.equal((await decide(regionOnly)).decision, 'allow');
  assert.deepEqual(await decide(unregisteredSuspicious).then(({ decision, reasonCode }) =>
    ({ decision, reasonCode })), {
    decision: 'deny',
    reasonCode: 'device_not_registered',
  });
});

test('allows the suspicious fixture after a verified step-up', async () => {
  const { suspicious } = fixtureRequests();
  const verified = {
    ...suspicious,
    stepUp: { verified: true, authAgeSeconds: 60 },
  };

  assert.equal((await decide(verified)).decision, 'allow');
});

test('allows a memo selected by exactly one resource ID without restricting its format', async () => {
  const { normal } = fixtureRequests();
  const request = { ...normal, path: '/api/memos/not-a-uuid' };

  assert.equal((await decide(request)).decision, 'allow');
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await decide({
      ...request,
      method,
      route: `${method} /api/memos/:id`,
    })).decision, 'allow');
  }
});

test('allows the existing notes service to read one memo by its exact API route', async () => {
  const { normal } = fixtureRequests();
  const response = await decide({
    ...normal,
    service: 'notes',
    path: '/api/memos/own-memo-id',
  });

  assert.equal(response.decision, 'allow');
});

test('denies collection, nested feature, mismatched route, and query-selected memo requests', async () => {
  const { normal } = fixtureRequests();
  const invalidRoutes = [
    { path: '/api/memos', route: 'GET /api/memos' },
    { path: '/api/memos/demo/export', route: 'GET /api/memos/:id/export' },
    { path: '/api/memos/demo', route: 'GET /api/memos/export' },
    { path: '/api/memos/export', route: 'GET /api/memos/export' },
    { path: '/api/memos/demo', queryLength: 1 },
  ];

  for (const change of invalidRoutes) {
    const response = await decide({ ...normal, ...change });
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
});

test('allows only GET for a single class announcement and denies its write methods', async () => {
  const { normal } = fixtureRequests();
  const announcement = {
    ...normal,
    service: 'notes',
    method: 'GET',
    path: '/api/notes/announcement-id',
    route: 'GET /api/notes/:id',
  };

  assert.equal((await decide(announcement)).decision, 'allow');

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await decide({
      ...announcement,
      method,
      route: `${method} /api/notes/:id`,
    });
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
});

test('denies teacher materials and unknown service routes', async () => {
  const { normal } = fixtureRequests();
  const teacherMaterial = {
    ...normal,
    service: 'teacher-materials',
    method: 'GET',
    path: '/api/teacher-materials/resource-id',
    route: 'GET /api/teacher-materials/:id',
  };
  const unknownService = { ...normal, service: 'unknown-service' };

  for (const request of [teacherMaterial, unknownService]) {
    const response = await decide(request);
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
});
