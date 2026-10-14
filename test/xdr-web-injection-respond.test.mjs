import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createResponder } from "../xdr/web-injection/respond.mjs";

test("웹 주입 fixture는 명확한 공격만 차단하고 정상 주소는 통과시킵니다", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../xdr/fixtures/web-injection.json", import.meta.url), "utf8"),
  );
  const dir = await mkdtemp(join(tmpdir(), "xdr-web-injection-respond-"));
  const logPath = join(dir, "alerts.log");
  const rules = [];
  const nowMs = Date.parse("2026-10-08T10:00:00.000Z");
  const responder = createResponder({
    ztna: { addDenyRule: async (rule) => rules.push(rule) },
    logPath,
    ttlSeconds: 600,
    now: () => nowMs,
  });

  try {
    const outcomes = [];
    for (const alert of fixture.alerts) outcomes.push(await responder.respond(alert));

    assert.deepEqual(
      outcomes.reduce((counts, { decision }) => {
        counts[decision.action] += 1;
        return counts;
      }, { block: 0, alert: 0, record: 0 }),
      { block: 7, alert: 2, record: 17 },
    );
    assert.equal(rules.length, new Set(
      fixture.alerts
        .filter((_, index) => outcomes[index].decision.action === "block")
        .map((alert) => alert.data.srcip),
    ).size);
    for (const rule of rules) {
      assert.equal(rule.effect, "deny");
      assert.deepEqual(Object.keys(rule.scope), ["srcIp"]);
      assert.match(rule.evidence.alertId, /^wi-\d{2}$/);
      assert.equal(Date.parse(rule.expiresAt) - Date.parse(rule.createdAt), 600_000);
    }

    const blockedIps = new Set(rules.map((rule) => rule.scope.srcIp));
    for (const [index, alert] of fixture.alerts.entries()) {
      if (outcomes[index].decision.action === "record") {
        assert.equal(blockedIps.has(alert.data.srcip), false, alert.id);
      }
    }

    const lines = (await readFile(logPath, "utf8")).trimEnd().split("\n");
    assert.equal(lines.length, 8);
    assert.ok(lines.every((line) => !/[\r\n]/.test(line)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("차단 후보라도 사설 주소나 허용 목록 주소는 규칙으로 추가하지 않습니다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xdr-web-injection-protected-"));
  const logPath = join(dir, "alerts.log");
  const rules = [];
  const responder = createResponder({
    ztna: { addDenyRule: (rule) => rules.push(rule) },
    allowlist: ["203.0.113.10"],
    logPath,
    now: () => Date.parse("2026-10-08T10:00:00.000Z"),
  });

  try {
    const makeAlert = (id, srcip) => ({
      id,
      data: { srcip, url: "/notes?q=union%20select%20x%20from%20notes", count: "12" },
      rule: { level: 12, description: "SQL 구문이 반복됐습니다." },
    });
    const trusted = await responder.respond(makeAlert("wi-91", "203.0.113.10"));
    const privateAddress = await responder.respond(makeAlert("wi-92", "192.168.1.10"));

    assert.equal(trusted.outcome, "held");
    assert.equal(privateAddress.outcome, "held");
    assert.equal(rules.length, 0);
    const log = await readFile(logPath, "utf8");
    assert.equal(log.split("\n").filter(Boolean).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
