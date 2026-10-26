import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import config from '../aleph.config.json' with { type: 'json' };

test('allowedRoutes lists the exact resource routes accepted by the resource policy', () => {
  assert.deepEqual(config.allowedRoutes, [
    { method: 'GET', path: '/api/notes' },
    { method: 'GET', path: '/api' },
    { method: 'GET', path: '/api/notes/:id' },
    { method: 'POST', path: '/api/notes/:id/restore' },
    { method: 'GET', path: '/api/memos/:id' },
    { method: 'PUT', path: '/api/memos/:id' },
    { method: 'DELETE', path: '/api/memos/:id' },
    { method: 'POST', path: '/api/policies/restore' },
    { method: 'POST', path: '/api/memos/:id/restore' },
  ]);
  assert.deepEqual(config.restoreRoute, [
    { method: 'POST', path: '/api/policies/restore' },
  ]);
});

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
    await assert.rejects(decide({ ...normal, signals }), {
      name: 'TypeError', message: 'Invalid engine decision request',
    });
  }
});

test('rejects unsupported role, identity, and device request fields', async () => {
  const { normal } = fixtureRequests();
  for (const field of ['role', 'identity', 'device']) {
    await assert.rejects(decide({ ...normal, [field]: {} }), {
      name: 'TypeError', message: 'Invalid engine decision request',
    });
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
  assert.equal((await decide({ ...normal,
    signals: { ...normal.signals, region: 'foreign' } })).decision, 'allow');
  const denied = await decide({ ...suspicious, deviceRegistered: false });
  assert.deepEqual({ decision: denied.decision, reasonCode: denied.reasonCode }, {
    decision: 'deny', reasonCode: 'device_not_registered',
  });
});

test('allows the suspicious fixture after a verified step-up', async () => {
  const { suspicious } = fixtureRequests();
  assert.equal((await decide({ ...suspicious,
    stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
});

test('allows one memo ID and keeps existing memo methods', async () => {
  const { normal } = fixtureRequests();
  const request = { ...normal, service: 'memos', path: '/api/memos/not-a-uuid',
    route: 'GET /api/memos/:id' };
  assert.equal((await decide(request)).decision, 'allow');
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await decide({ ...request, method,
      route: `${method} /api/memos/:id` })).decision, 'allow');
  }
  assert.equal((await decide({ ...request, service: 'notes' })).decision, 'deny');
});

test('allows a class announcement only through the notes service and exact single-ID route', async () => {
  const { normal } = fixtureRequests();
  const announcement = { ...normal, service: 'notes', method: 'GET',
    path: '/api/notes/announcement-id', route: 'GET /api/notes/:id' };
  assert.equal((await decide(announcement)).decision, 'allow');
  assert.equal((await decide({ ...announcement, path: '/api/notes',
    route: 'GET /api/notes' })).decision, 'allow');
  const invalid = [
    { service: 'memos', path: '/api/notes/announcement-id', route: 'GET /api/notes/:id' },
    { service: 'notes', path: '/api/memos/own-memo-id', route: 'GET /api/memos/:id' },
    { service: 'memos', path: '/api/notes', route: 'GET /api/notes' },
    { service: 'notes', path: '/api/notes/announcement-id/export', route: 'GET /api/notes/:id/export' },
  ];
  for (const route of invalid) {
    assert.equal((await decide({ ...announcement, ...route })).decision, 'deny');
  }
});

test('allows the scoped note restore POST only, not other write routes', async () => {
  const { normal } = fixtureRequests();
  const restore = { ...normal, service: 'notes', method: 'POST',
    path: '/api/notes/00000000-0000-4000-8000-000000000001/restore',
    route: 'POST /api/notes/:id/restore' };
  assert.equal((await decide(restore)).decision, 'allow');
  for (const change of [
    { path: '/api/notes/00000000-0000-4000-8000-000000000002/restore' },
    { path: '/api/notes/00000000-0000-4000-8000-000000000001/restore/other' },
    { path: '/api/notes/00000000-0000-4000-8000-000000000001', route: 'POST /api/notes/:id' },
    { method: 'PUT', route: 'PUT /api/notes/:id/restore' },
    { queryLength: 1 },
  ]) {
    const result = await decide({ ...restore, ...change });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'resource_route_not_allowed');
  }
});

test('denies collections, nested feature routes, query-selected resources, and unsupported methods', async () => {
  const { normal } = fixtureRequests();
  const invalidRoutes = [
    { path: '/api/memos', route: 'GET /api/memos' },
    { service: 'memos', path: '/api/notes', route: 'GET /api/notes' },
    { path: '/api/memos/demo/export', route: 'GET /api/memos/:id/export' },
    { path: '/api/memos/demo', queryLength: 1 },
    { method: 'POST', path: '/api/memos/demo', route: 'POST /api/memos/:id' },
    { method: 'PATCH', path: '/api/memos/demo', route: 'PATCH /api/memos/:id' },
  ];
  for (const change of invalidRoutes) {
    const response = await decide({ ...normal, ...change });
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
});

test('allows only GET for regular class announcements and denies write methods', async () => {
  const { normal } = fixtureRequests();
  const announcement = { ...normal, service: 'notes', method: 'GET',
    path: '/api/notes/announcement-id', route: 'GET /api/notes/:id' };
  assert.equal((await decide(announcement)).decision, 'allow');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await decide({ ...announcement, method,
      route: `${method} /api/notes/:id` });
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
});

test('denies teacher materials and unknown service routes', async () => {
  const { normal } = fixtureRequests();
  const teacherMaterial = { ...normal, service: 'teacher-materials',
    method: 'GET', path: '/api/teacher-materials/resource-id',
    route: 'GET /api/teacher-materials/:id' };
  const unknownService = { ...normal, service: 'unknown-service' };
  for (const request of [teacherMaterial, unknownService]) {
    const response = await decide(request);
    assert.equal(response.decision, 'deny');
    assert.equal(response.reasonCode, 'resource_route_not_allowed');
  }
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await decide({ ...teacherMaterial, method,
      route: `${method} /api/teacher-materials/:id` });
    assert.equal(response.decision, 'deny');
    assert.deepEqual(response.ruleIds, [RULE_IDS[0]]);
  }
});
