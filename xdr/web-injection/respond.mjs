/**
 * decide 결과를 ZTNA 거부 규칙이나 한 줄 알림으로 연결한다.
 * ZTNA 어댑터에는 새 규칙만 추가하며 기존 규칙을 읽거나 변경하지 않는다.
 */

import { appendFile } from "node:fs/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import { decide } from "./decide.mjs";

const DEFAULT_LOG_PATH = fileURLToPath(new URL("../alerts.log", import.meta.url));
const DEFAULT_TTL_SECONDS = 3600;
const SAFE_ALERT_ID = /^(?:\d{1,20}|[A-Za-z]{1,8}-\d{1,12})$/;

function identify(alert) {
  if (!alert || typeof alert !== "object" || Array.isArray(alert)) {
    return { srcIp: "", alertId: "" };
  }
  const data = alert.data && typeof alert.data === "object" ? alert.data : {};
  const srcIp = typeof data.srcip === "string" ? data.srcip.trim().toLowerCase() : "";
  const rawId = typeof alert.id === "string" ? alert.id.trim() : "";
  return {
    srcIp,
    alertId: SAFE_ALERT_ID.test(rawId) ? rawId : "",
  };
}

function protectedAddressReason(srcIp, allowlist, allowPrivateTargets) {
  const version = isIP(srcIp);
  if (version === 0) return "유효한 출발 IP 주소가 아님";
  if (allowlist.has(srcIp)) return "허용 목록에 있는 주소";

  if (version === 4) {
    const octets = srcIp.split(".").map(Number);
    if (octets[0] === 0) return "미지정 주소";
    if (octets[0] === 127) return "루프백 주소";
    if (octets[0] === 169 && octets[1] === 254) return "링크 로컬 주소";
    if (octets[0] >= 224) return "멀티캐스트·예약 주소";
    if (
      !allowPrivateTargets
      && (
        octets[0] === 10
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168)
        || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      )
    ) {
      return "사설·공유 주소(여러 사용자가 쓸 수 있음)";
    }
    return null;
  }

  if (srcIp === "::" || srcIp === "::1") return "미지정·루프백 주소";
  if (/^fe[89ab]/.test(srcIp)) return "링크 로컬 주소";
  if (srcIp.startsWith("ff")) return "멀티캐스트 주소";
  if (!allowPrivateTargets && /^f[cd]/.test(srcIp)) return "사설 주소(여러 사용자가 쓸 수 있음)";
  return null;
}

function oneLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

async function writeLog(logPath, fields) {
  const line = fields.map(oneLine).join(" | ");
  await appendFile(logPath, `${line}\n`, "utf8");
}

export function createResponder(options = {}) {
  const {
    ztna,
    logPath = DEFAULT_LOG_PATH,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    allowlist: allowlistEntries = [],
    allowPrivateTargets = false,
    isTrusted,
    now = () => Date.now(),
  } = options;

  if (!ztna || typeof ztna.addDenyRule !== "function") {
    throw new TypeError("ztna.addDenyRule(rule) 함수가 필요합니다.");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError("ttlSeconds는 0보다 큰 숫자여야 합니다.");
  }
  if (!Array.isArray(allowlistEntries) || allowlistEntries.some((ip) => isIP(ip) === 0)) {
    throw new TypeError("allowlist에는 유효한 IP 주소 배열을 넣어야 합니다.");
  }

  const allowlist = new Set(allowlistEntries.map((ip) => ip.trim().toLowerCase()));
  const activeUntil = new Map();

  async function respond(alert) {
    const decision = decide(alert);
    if (decision.action === "record") return { decision, outcome: "recorded" };

    const { srcIp, alertId } = identify(alert);
    const at = now();

    if (decision.action === "alert") {
      await writeLog(logPath, [
        new Date(at).toISOString(),
        "주의",
        srcIp || "-",
        `경보 ${alertId || "-"}`,
        `확신도 ${decision.confidence.toFixed(2)}`,
        decision.reason,
      ]);
      return { decision, outcome: "notified" };
    }

    const hold = async (reason) => {
      await writeLog(logPath, [
        new Date(at).toISOString(),
        "보류",
        srcIp || "-",
        `경보 ${alertId || "-"}`,
        `거부 규칙을 넣지 않음: ${reason}`,
        decision.reason,
      ]);
      return { decision, outcome: "held", reason };
    };

    if (!alertId) return hold("근거 경보 번호 없음");
    const protectedReason = protectedAddressReason(srcIp, allowlist, allowPrivateTargets);
    if (protectedReason) return hold(protectedReason);
    if (typeof isTrusted === "function" && await isTrusted(srcIp)) {
      return hold("신뢰된 주소");
    }

    const previousExpiry = activeUntil.get(srcIp);
    if (previousExpiry !== undefined && previousExpiry > at) {
      return { decision, outcome: "duplicate", expiresAt: new Date(previousExpiry).toISOString() };
    }

    const expiresAt = new Date(at + ttlSeconds * 1000).toISOString();
    const rule = {
      id: `web-injection-deny-${srcIp}-${Math.floor(at / 1000)}`,
      effect: "deny",
      scope: { srcIp },
      createdAt: new Date(at).toISOString(),
      expiresAt,
      evidence: { alertId },
      confidence: decision.confidence,
      reason: oneLine(decision.reason),
      source: "web-injection/respond.mjs",
    };

    try {
      await ztna.addDenyRule(rule);
    } catch (error) {
      await writeLog(logPath, [
        new Date(at).toISOString(),
        "실패",
        srcIp,
        `경보 ${alertId}`,
        `거부 규칙 추가 실패: ${error instanceof Error ? error.message : String(error)}`,
        decision.reason,
      ]);
      return {
        decision,
        outcome: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    activeUntil.set(srcIp, at + ttlSeconds * 1000);
    await writeLog(logPath, [
      new Date(at).toISOString(),
      "차단",
      srcIp,
      `경보 ${alertId}`,
      `만료 ${expiresAt}`,
      decision.reason,
    ]);
    return { decision, outcome: "denied", rule };
  }

  return { respond };
}
