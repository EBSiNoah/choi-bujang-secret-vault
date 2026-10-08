/**
 * respond.mjs — decide 결과 가운데 차단 후보(block)만 ZTNA 판정기의 거부 규칙으로 넣고,
 *               알림을 xdr/alerts.log 에 한 줄씩 쌓는다.
 *
 * 역할 나누기
 *   - decide.mjs : 판단 결과만 돌려준다. 파일 쓰기·판정기 연결은 하지 않는다. (이 파일이 불러다 쓸 뿐, 고치지 않는다)
 *   - respond.mjs: 판단 결과를 행동으로 옮긴다. 판정기에 규칙을 더하고, xdr/alerts.log 에 쓴다.
 *
 * 판정기(ztna)에 요구하는 것은 하나뿐이다.
 *     ztna.addDenyRule(rule)   // 새 거부 규칙을 더한다. 동기/비동기 모두 가능. 실패하면 throw.
 *   이 파일은 기존 규칙을 조회·수정·삭제하지 않는다. 오직 새 거부 규칙을 '더하기만' 한다.
 *   rule 모양:
 *     { id, effect: 'deny', scope: { srcIp }, createdAt, expiresAt,      // 시각은 ISO 8601(UTC)
 *       evidence: { alertId }, confidence, reason, source: 'respond.mjs' }
 *   만료(expiresAt)를 실제로 적용하는 것은 판정기의 몫이다.
 *
 * 정상 사용자를 막지 않기 위한 장치 (하나라도 걸리면 규칙을 넣지 않고 '보류'로 알린다)
 *   1) decide 가 block 으로 판단한 경보만 대상이다. alert 는 알림만, record 는 아무것도 하지 않는다.
 *   2) 규칙 범위는 출발 주소 하나뿐이다. 계정(사용자)은 절대 막지 않는다. 피해자 계정까지 잠기기 때문이다.
 *   3) 근거 경보 번호(id)가 없으면 넣지 않는다.
 *   4) 유효한 IP 가 아니거나 루프백·링크 로컬·멀티캐스트·미지정 주소면 넣지 않는다.
 *   5) 사설·공유 주소(10/8, 172.16/12, 192.168/16, 100.64/10, fc00::/7)는 여러 사용자가 한 주소를 쓰는
 *      경우가 많아 기본으로 넣지 않는다. allowPrivateTargets: true 로 풀 수 있다.
 *   6) allowlist(IP 또는 IPv4 CIDR)와 isTrusted(ip) 콜백에 걸리면 넣지 않는다.
 *      조직 자체의 공용 출구 주소, 관리자 주소, 판정기의 기존 허용 규칙에 있는 주소는 여기에 넣어야 한다.
 *   7) 같은 주소의 규칙이 아직 유효하면 다시 넣지 않는다(재전송에도 한 번만).
 */

import { appendFileSync } from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { decide } from "./decide.mjs";

// ============================================================ 상수

const DEFAULT_LOG_PATH = fileURLToPath(new URL("../alerts.log", import.meta.url));
const DEFAULT_TTL_SECONDS = 3600; // 규칙 유효 시간
const MAX_REMEMBERED = 10000; // 기억하는 주소·알림 수 상한
const SAFE_ALERT_ID = /^(?:\d{1,20}|[A-Za-z]{1,8}-\d{1,12})$/;

/** [기준 주소, 접두 길이, 이름] — 규칙으로 막지 않는 주소 */
const ALWAYS_PROTECTED_V4 = [
  ["0.0.0.0", 8, "미지정 주소"],
  ["127.0.0.0", 8, "루프백"],
  ["169.254.0.0", 16, "링크 로컬"],
  ["224.0.0.0", 4, "멀티캐스트"],
  ["240.0.0.0", 4, "예약·브로드캐스트"],
];
/** 기본으로 막지 않는 사설·공유 주소(allowPrivateTargets 로 해제) */
const PRIVATE_V4 = [
  ["10.0.0.0", 8, "사설 주소"],
  ["172.16.0.0", 12, "사설 주소"],
  ["192.168.0.0", 16, "사설 주소"],
  ["100.64.0.0", 10, "통신사 공유 주소"],
];

// ============================================================ 주소 도우미

function v4ToInt(s) {
  const p = s.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
}

function inCidr(ipInt, baseInt, bits) {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

/** IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4 로 바꿔 본다. */
function normalizeIp(ip) {
  const s = String(ip ?? "").trim().toLowerCase();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : s;
}

/** allowlist 항목(정확한 IP 또는 IPv4 CIDR)을 미리 해석한다. 잘못된 항목은 조용히 넘기지 않고 오류로 알린다. */
function parseAllowlist(entries) {
  return (entries ?? []).map((raw) => {
    const entry = normalizeIp(raw);
    if (entry.includes("/")) {
      const [base, bitsText] = entry.split("/");
      const baseInt = v4ToInt(base);
      const bits = Number(bitsText);
      if (baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
        throw new RangeError(`allowlist 항목을 읽을 수 없습니다: ${raw}`);
      }
      return { cidr: [baseInt, bits] };
    }
    if (isIP(entry) === 0) throw new RangeError(`allowlist 항목을 읽을 수 없습니다: ${raw}`);
    return { exact: entry };
  });
}

/** 막으면 안 되는 주소면 이유를, 아니면 null. */
function protectedReason(ip, { allowlist, allowPrivateTargets }) {
  const version = isIP(ip);
  if (version === 0) return "유효한 IP 주소가 아님";

  const ipInt = version === 4 ? v4ToInt(ip) : null;

  for (const rule of allowlist) {
    if (rule.exact !== undefined && rule.exact === ip) return "allowlist 에 있는 주소";
    if (rule.cidr && ipInt !== null && inCidr(ipInt, rule.cidr[0], rule.cidr[1])) return "allowlist 에 있는 주소";
  }

  if (version === 4) {
    for (const [base, bits, name] of ALWAYS_PROTECTED_V4) if (inCidr(ipInt, v4ToInt(base), bits)) return name;
    if (!allowPrivateTargets) {
      for (const [base, bits, name] of PRIVATE_V4) if (inCidr(ipInt, v4ToInt(base), bits)) return `${name}(여러 사용자가 쓸 수 있음)`;
    }
    return null;
  }

  if (ip === "::" || ip === "::1") return ip === "::" ? "미지정 주소" : "루프백";
  if (/^fe[89ab]/.test(ip)) return "링크 로컬";
  if (ip.startsWith("ff")) return "멀티캐스트";
  if (!allowPrivateTargets && /^f[cd]/.test(ip)) return "사설 주소(여러 사용자가 쓸 수 있음)";
  return null;
}

// ============================================================ 시각 · 로그 도우미

const pad = (n) => String(n).padStart(2, "0");

/** 사람이 읽는 로그용: 이 시스템의 시간대 오프셋을 붙인 ISO 8601. */
function localIso(ms) {
  const offset = -new Date(ms).getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const local = new Date(ms + offset * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 로그는 반드시 한 줄이어야 하므로 줄바꿈을 지운다. */
const oneLine = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();

/** 경보에서 출발 주소와 경보 번호를 읽는다(decide 와 같은 방식으로 raw 도 받는다). */
function identify(alert) {
  if (!alert || typeof alert !== "object") return { ip: "", alertId: "" };
  const src = alert.raw && typeof alert.raw === "object" ? alert.raw : alert;
  const data = src.data && typeof src.data === "object" ? src.data : {};
  const rawAlertId = String(src.id ?? "").trim();
  return {
    ip: normalizeIp(data.srcip),
    alertId: SAFE_ALERT_ID.test(rawAlertId) ? rawAlertId : "",
  };
}

/** 같은 키를 상한까지만 기억하는 집합 */
function boundedSet() {
  const set = new Set();
  return {
    has: (k) => set.has(k),
    add(k) {
      if (set.size >= MAX_REMEMBERED) set.delete(set.values().next().value);
      set.add(k);
    },
  };
}

// ============================================================ 내보내기

/**
 * 대응 연결을 만든다.
 * @param {object} options
 * @param {{ addDenyRule: (rule: object) => void | Promise<void> }} options.ztna  ZTNA 판정기(규칙 추가 함수 필요)
 * @param {string}   [options.logPath='xdr/alerts.log']  알림을 쌓을 파일
 * @param {number}   [options.ttlSeconds=3600]       규칙 유효 시간(초)
 * @param {string[]} [options.allowlist=[]]          막지 않을 IP 또는 IPv4 CIDR
 * @param {(ip: string) => boolean | Promise<boolean>} [options.isTrusted]  true 면 막지 않는다
 * @param {boolean}  [options.allowPrivateTargets=false]  사설·공유 주소도 막도록 허용
 * @param {() => number} [options.now]               현재 시각(ms). 시험용으로 바꿀 수 있다
 * @returns {{ respond: (alert: object) => Promise<object> }}
 */
export function createResponder(options = {}) {
  const {
    ztna,
    logPath = DEFAULT_LOG_PATH,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    allowlist: allowlistEntries = [],
    isTrusted,
    allowPrivateTargets = false,
    now = () => Date.now(),
  } = options;

  if (!ztna || typeof ztna.addDenyRule !== "function") {
    throw new TypeError("ztna.addDenyRule(rule) 함수가 필요합니다.");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError("ttlSeconds 는 0보다 큰 숫자여야 합니다.");
  }

  const allowlist = parseAllowlist(allowlistEntries);
  const activeUntil = new Map(); // 주소 → 우리가 넣은 규칙의 만료 시각(ms)
  const notified = boundedSet(); // 같은 알림을 다시 쓰지 않기 위한 기억

  /** 알림 로그에 한 줄 쌓는다. 같은 (구분, 주소, 경보 번호)는 한 번만. 쓰기 실패는 오류 문구로 돌려준다. */
  function notify(kind, ip, alertId, fields, nowMs) {
    const dedupeKey = `${kind}|${ip}|${alertId}`;
    if (notified.has(dedupeKey)) return null;
    const line = [localIso(nowMs), kind, ip || "-", `경보 ${alertId || "-"}`, ...fields].map(oneLine).join(" | ");
    try {
      appendFileSync(logPath, line + "\n", "utf8");
      notified.add(dedupeKey);
      return null;
    } catch (error) {
      return `알림 로그 쓰기 실패: ${error.message}`;
    }
  }

  async function respond(alert) {
    const decision = decide(alert);
    const nowMs = now();
    const { ip, alertId } = identify(alert);
    const tag = `확신도 ${decision.confidence.toFixed(2)}`;

    if (decision.action === "record") return { decision, outcome: "recorded" };

    if (decision.action === "alert") {
      const logError = notify("주의", ip, alertId, [tag, decision.reason], nowMs);
      return { decision, outcome: "notified", ...(logError && { logError }) };
    }

    // ---- 여기부터 차단 후보(block) ----
    const hold = async (why) => {
      const logError = notify("보류", ip, alertId, [tag, `규칙을 넣지 않음: ${why}`, decision.reason], nowMs);
      return { decision, outcome: "held", why, ...(logError && { logError }) };
    };

    if (!alertId) return hold("근거 경보 번호 없음");
    const blocked = protectedReason(ip, { allowlist, allowPrivateTargets });
    if (blocked) return hold(blocked);
    if (typeof isTrusted === "function" && (await isTrusted(ip))) return hold("신뢰 대상(isTrusted)");

    const until = activeUntil.get(ip);
    if (until !== undefined && until > nowMs) return { decision, outcome: "duplicate", expiresAt: new Date(until).toISOString() };

    const expiresMs = nowMs + ttlSeconds * 1000;
    const rule = {
      id: `deny-${ip}-${Math.floor(nowMs / 1000)}`,
      effect: "deny",
      scope: { srcIp: ip },
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
      evidence: { alertId },
      confidence: decision.confidence,
      reason: oneLine(decision.reason),
      source: "respond.mjs",
    };

    try {
      await ztna.addDenyRule(rule);
    } catch (error) {
      const logError = notify("실패", ip, alertId, [tag, `거부 규칙 추가 실패: ${error?.message ?? error}`, decision.reason], nowMs);
      return { decision, outcome: "failed", error: String(error?.message ?? error), ...(logError && { logError }) };
    }

    if (activeUntil.size >= MAX_REMEMBERED) activeUntil.delete(activeUntil.keys().next().value);
    activeUntil.set(ip, expiresMs);
    const logError = notify("차단", ip, alertId, [tag, `만료 ${localIso(expiresMs)}`, decision.reason], nowMs);
    return { decision, outcome: "denied", rule, ...(logError && { logError }) };
  }

  return { respond };
}
