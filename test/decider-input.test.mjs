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

test('sends the composite unusual-access fixture to step-up with a reason', async () => {
  const { suspicious } = fixtureRequests();

  assert.deepEqual(await decide(suspicious), {
    schema: 'aleph.decision.v1',
    requestId: suspicious.requestId,
    decision: 'step_up',
    reasonCode: 'step_up_required',
    ruleIds: ['device_registered', 'step_up_required'],
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
