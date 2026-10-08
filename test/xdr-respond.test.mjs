import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createResponder } from '../xdr/brute-force/respond.mjs';

test('무차별 로그인 경보는 차단 후보만 규칙화하고 정상 주소는 통과시킵니다', async () => {
  const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/brute-force.json', import.meta.url), 'utf8'));
  const dir = await mkdtemp(join(tmpdir(), 'xdr-respond-'));
  const logPath = join(dir, 'alerts.log');
  const rules = [];
  const nowMs = Date.parse('2026-10-08T10:00:00.000Z');
  const responder = createResponder({
    ztna: { addDenyRule: async (rule) => rules.push(rule) },
    logPath,
    ttlSeconds: 600,
    now: () => nowMs,
  });

  try {
    const outcomes = [];
    for (const alert of fixture.alerts) outcomes.push(await responder.respond(alert));

    const blockAlerts = fixture.alerts.filter((_, i) => outcomes[i].decision.action === 'block');
    const blockIds = new Set(blockAlerts.map((alert) => alert.id));
    const blockIps = new Set(blockAlerts.map((alert) => alert.data.srcip));

    assert.ok(outcomes.some(({ decision }) => decision.action === 'alert'));
    assert.ok(outcomes.some(({ decision }) => decision.action === 'record'));
    assert.equal(rules.length, blockIps.size);
    for (const rule of rules) {
      assert.equal(rule.effect, 'deny');
      assert.deepEqual(Object.keys(rule.scope), ['srcIp']);
      assert.ok(blockIds.has(rule.evidence.alertId));
      assert.ok(blockIps.has(rule.scope.srcIp));
      assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.createdAt), 600_000);
    }

    const isDenied = (srcIp, atMs = nowMs) => rules.some(
      (rule) => rule.scope.srcIp === srcIp && Date.parse(rule.expiresAt) > atMs,
    );
    for (const [i, alert] of fixture.alerts.entries()) {
      const { decision } = outcomes[i];
      if (decision.action === 'block') assert.equal(isDenied(alert.data.srcip), true, alert.id);
      if (decision.action === 'record') assert.equal(isDenied(alert.data.srcip), false, alert.id);
    }
    for (const [i, alert] of fixture.alerts.entries()) {
      if (outcomes[i].decision.action === 'block') {
        assert.equal(isDenied(alert.data.srcip, nowMs + 600_001), false, alert.id);
      }
    }

    const lines = (await readFile(logPath, 'utf8')).trimEnd().split('\n');
    const expectedNotifications = outcomes.filter(
      ({ decision, outcome }) => decision.action === 'alert' || ['denied', 'held', 'failed'].includes(outcome),
    ).length;
    assert.equal(lines.length, expectedNotifications);
    assert.ok(lines.every((line) => !/[\r\n]/.test(line)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('안전한 경보 번호가 없으면 차단 규칙에 넣지 않고 번호 원문도 기록하지 않습니다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-respond-id-'));
  const logPath = join(dir, 'alerts.log');
  const rules = [];
  const responder = createResponder({
    ztna: { addDenyRule: async (rule) => rules.push(rule) },
    logPath,
    now: () => Date.parse('2026-10-08T10:00:00.000Z'),
  });

  try {
    const outcome = await responder.respond({
      id: 'secret-token-value',
      timestamp: '2026-10-08T10:00:00.000Z',
      data: { srcip: '198.51.100.253', srcuser: 'user01', count: '99' },
      rule: { level: 12, description: '가상 실패 경보' },
    });
    const log = await readFile(logPath, 'utf8');

    assert.equal(outcome.decision.action, 'block');
    assert.equal(outcome.outcome, 'held');
    assert.equal(rules.length, 0);
    assert.equal(log.includes('secret-token-value'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
