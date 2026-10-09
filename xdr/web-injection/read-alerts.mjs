/**
 * Wazuh 경보 읽기 모듈.
 *
 * 경보 JSON에서 시각 · 출발 주소 · 계정 · 규칙 수준 · 설명만 뽑아 출력한다.
 * 비밀처럼 보이는 값은 출력 전에 가린다. 판정기와 독립적으로 동작한다.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function get(obj, ...path) {
  let current = obj;
  for (const key of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return null;
    current = current[key];
  }
  return current ?? null;
}

function toStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function safeText(value) {
  const text = toStringOrNull(value);
  if (text === null) return null;
  return text
    .replace(/[\r\n\t]/g, " ")
    .replace(
      /\b(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|api[_-]?key|private[_-]?key|authorization)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      (_match, key, separator) => `${key}${separator}[REDACTED]`,
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_+/=-]{24,}\b/g, "[REDACTED]");
}

function toIntegerOrNull(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const text = String(value).trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

function getAccounts(raw) {
  const accounts = get(raw, "data", "accounts");
  const accountList = Array.isArray(accounts)
    ? accounts.map(toStringOrNull).filter(Boolean)
    : (toStringOrNull(accounts)?.split(",").map((account) => account.trim()).filter(Boolean) ?? []);
  const user = toStringOrNull(get(raw, "data", "srcuser"));
  return [...new Set([...accountList, ...(user === null ? [] : [user])])]
    .map(safeText)
    .filter(Boolean)
    .join(", ") || null;
}

export function parseAlert(raw) {
  const timestamp = safeText(get(raw, "timestamp"));
  return {
    timestamp: timestamp !== null && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null,
    srcIp: safeText(get(raw, "data", "srcip")),
    account: getAccounts(raw),
    level: toIntegerOrNull(get(raw, "rule", "level")),
    description: safeText(get(raw, "rule", "description")),
  };
}

export function parseText(text) {
  const payload = JSON.parse(text);
  const alerts = Array.isArray(payload) ? payload : payload?.alerts;
  if (!Array.isArray(alerts)) {
    throw new TypeError("Expected a JSON alert array or an object with an alerts array.");
  }
  return alerts.map(parseAlert);
}

export async function loadAlerts(path) {
  return parseText(await readFile(path, "utf8"));
}

export function formatAlert(alert) {
  return [
    alert.timestamp ?? "-",
    alert.srcIp ?? "-",
    alert.account ?? "-",
    alert.level ?? "-",
    alert.description ?? "-",
  ].join("\t");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/web-injection.json");
  const alerts = await loadAlerts(process.argv[2] ?? fixturePath);
  for (const alert of alerts) console.log(formatAlert(alert));
}
