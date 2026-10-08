// XDR 판정과 ZTNA 규칙 등록·알림 기록을 잇는 어댑터입니다.
// 실제 ZTNA 런타임은 registerDenyRule(rule) 콜백으로 규칙을 등록해야 합니다.
import { appendFile, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../fixtures/brute-force/decide.mjs';

const ALERT_LOG_PATH = fileURLToPath(new URL('../alerts.log', import.meta.url));
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_BLOCK_CONFIDENCE = 0.9;
const ALERT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceAddressOf(alert) {
  const data = isObject(alert.data) ? alert.data : {};
  const candidates = [data.srcip, data.source_ip, data.sourceAddress, alert.srcip, alert.source_ip];
  return candidates.find((value) => typeof value === 'string' && isIP(value.trim()) !== 0)?.trim() ?? null;
}

function hasSuccessfulLoginSignal(alert) {
  const rule = isObject(alert.rule) ? alert.rule : {};
  const data = isObject(alert.data) ? alert.data : {};
  const auth = isObject(data.authentication) ? data.authentication
    : isObject(data.auth) ? data.auth : {};
  const text = [
    rule.description, rule.name,
    alert.event, alert.event_type, alert.action, alert.status,
    data.event, data.event_type, data.action, data.status,
    auth.event, auth.action, auth.status,
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();

  // "성공은 없습니다" 같은 부정 문구는 성공 신호로 보지 않습니다.
  const saysNoSuccess = /성공\s*(?:은|이|한\s*적이)\s*없|no\s+successful\s+(?:login|authentication)|success(?:ful)?\s+(?:was\s+)?not\s+(?:observed|seen|recorded)/u.test(text);
  if (saysNoSuccess) return false;

  return /로그인\s*성공|인증\s*성공|로그인했습니다|인증되었습니다|성공했습니다|성공하였습니다|login\s+(?:success|succeeded|successful)|authentication\s+(?:success|succeeded|successful)|signed\s+in|authenticated\s+successfully|\b(?:login_success|authentication_success|authenticated)\b/u.test(text);
}

function alertIdOf(alert) {
  return typeof alert?.id === 'string' && ALERT_ID_PATTERN.test(alert.id) ? alert.id : null;
}

function makeRule(alertId, sourceAddress, decision, expiresAt) {
  return Object.freeze({
    schema: 'aleph.ztna.deny-rule.v1',
    ruleId: `xdr.brute-force.${alertId}`,
    effect: 'deny',
    match: Object.freeze({ sourceAddress }),
    expiresAt,
    evidenceAlertId: alertId,
    reason: decision.reason,
  });
}

async function appendAlert(entry, logPath) {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * 경보를 판정하고 block 후보만 ZTNA 등록기에 전달합니다.
 *
 * registerDenyRule은 ZTNA 런타임의 규칙 등록 함수여야 합니다. 규칙은 정확한 출발 IP만
 * 대상으로 하며, 정상 로그인 신호·불충분한 확신도·유효하지 않은 경보 ID/IP가 있으면
 * 등록하지 않습니다. 처리한 각 경보의 결과를 xdr/alerts.log에 JSON 한 줄로 추가합니다.
 */
export async function respond(alerts, {
  registerDenyRule,
  ttlMs = DEFAULT_TTL_MS,
  now = () => new Date(),
  logPath = ALERT_LOG_PATH,
} = {}) {
  if (!Array.isArray(alerts)) throw new TypeError('alerts 배열이 필요합니다.');
  if (typeof registerDenyRule !== 'function') {
    throw new TypeError('ZTNA registerDenyRule(rule) 콜백이 필요합니다.');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new RangeError('ttlMs는 1밀리초부터 24시간 사이여야 합니다.');
  }
  if (typeof now !== 'function') throw new TypeError('now는 시각을 반환하는 함수여야 합니다.');

  const results = [];
  for (const alert of alerts) {
    const alertId = alertIdOf(alert);
    let decision;
    try {
      decision = await decide(alert);
    } catch {
      const result = { alertId, action: 'record', registered: false, reason: 'decision_error' };
      results.push(result);
      await appendAlert({ timestamp: new Date().toISOString(), type: 'xdr_decision', ...result }, logPath);
      continue;
    }

    if (decision?.action !== 'block' ||
        typeof decision.confidence !== 'number' ||
        decision.confidence < MIN_BLOCK_CONFIDENCE) {
      const result = { alertId, action: decision?.action ?? 'record', registered: false };
      results.push(result);
      await appendAlert({
        timestamp: new Date().toISOString(),
        type: 'xdr_decision',
        ...result,
      }, logPath);
      continue;
    }

    const sourceAddress = isObject(alert) ? sourceAddressOf(alert) : null;
    if (!alertId || !sourceAddress || hasSuccessfulLoginSignal(alert)) {
      const result = {
        alertId,
        action: decision.action,
        registered: false,
        reason: !alertId ? 'invalid_alert_id'
          : !sourceAddress ? 'missing_or_invalid_source_address'
            : 'successful_login_signal',
      };
      results.push(result);
      await appendAlert({ timestamp: new Date().toISOString(), type: 'xdr_decision', ...result }, logPath);
      continue;
    }

    const currentTime = now();
    const timestamp = currentTime instanceof Date ? currentTime.getTime() : Date.parse(currentTime);
    if (!Number.isFinite(timestamp)) throw new TypeError('now()가 유효한 날짜를 반환해야 합니다.');
    const expiresAt = new Date(timestamp + ttlMs).toISOString();
    const rule = makeRule(alertId, sourceAddress, decision, expiresAt);

    let registered;
    try {
      registered = await registerDenyRule(rule);
    } catch {
      const result = { alertId, action: decision.action, registered: false, reason: 'registration_error' };
      results.push(result);
      await appendAlert({ timestamp: new Date(timestamp).toISOString(), type: 'xdr_decision', ...result }, logPath);
      continue;
    }
    if (registered === false) {
      const result = { alertId, action: decision.action, registered: false, reason: 'registration_rejected' };
      results.push(result);
      await appendAlert({ timestamp: new Date(timestamp).toISOString(), type: 'xdr_decision', ...result }, logPath);
      continue;
    }

    const notification = {
      timestamp: new Date(timestamp).toISOString(),
      type: 'ztna_deny_rule_registered',
      ruleId: rule.ruleId,
      evidenceAlertId: alertId,
      expiresAt,
      reason: decision.reason,
    };
    await appendAlert(notification, logPath);

    results.push({ alertId, action: decision.action, registered: true, ruleId: rule.ruleId, expiresAt });
  }

  return results;
}

export { ALERT_LOG_PATH, DEFAULT_TTL_MS };