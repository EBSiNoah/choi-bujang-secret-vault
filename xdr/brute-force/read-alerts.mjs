/**
 * Wazuh 경보 읽기 모듈.
 *
 * 경보 JSON에서 시각 · 출발 주소 · 계정 · 규칙 수준 · 설명만 뽑아 돌려준다.
 * 출력 문자열에 비밀처럼 보이는 값이 있으면 가린다.
 *
 * 받아들이는 입력 형태:
 *   - { "alerts": [...] } 로 감싼 파일 (fixture 형식)
 *   - 경보 배열 [...]
 *   - 경보 한 건 {...}
 *   - 한 줄에 경보 한 건씩 적힌 JSONL (Wazuh alerts.json 원본 형식)
 *
 * Node 18+ 표준 라이브러리만 사용한다.
 *
 * @typedef {Object} Alert
 * @property {string|null} timestamp      ISO 8601 시각
 * @property {string|null} srcIp          출발 주소 (data.srcip)
 * @property {string|null} account        계정 (data.accounts, data.srcuser)
 * @property {number|null} level          규칙 수준 (rule.level)
 * @property {string|null} description    설명 (rule.description)
 */

import { readFile } from "node:fs/promises";

// ---------------------------------------------------------------- 값 변환 도우미

/** 중첩 객체에서 안전하게 값을 꺼낸다. 중간에 끊기면 null. */
function get(obj, ...path) {
  let cur = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return null;
    cur = cur[key];
  }
  return cur ?? null;
}

function toStr(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function safeText(value) {
  const text = toStr(value);
  if (text === null) return null;
  return text.replace(/[\r\n\t]/g, " ")
    .replace(
      /\b(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|secret|client[_-]?secret|api[_-]?key|private[_-]?key|authorization)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      (_match, key, separator) => `${key}${separator}[REDACTED]`,
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_+/=-]{24,}\b/g, "[REDACTED]");
}

function toInt(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const text = String(value).trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

function splitList(value) {
  const text = toStr(value);
  if (text === null) return [];
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- 핵심 함수

/**
 * 경보 객체 한 건을 읽는다. 빠진 필드는 null(또는 빈 배열)로 둔다.
 * @param {object} raw
 * @returns {Alert}
 */
export function parseAlert(raw) {
  const accounts = splitList(get(raw, "data", "accounts"));
  const user = toStr(get(raw, "data", "srcuser"));
  return {
    timestamp: getTimestamp(raw?.timestamp),
    srcIp: safeText(get(raw, "data", "srcip")),
    account: [...new Set([...accounts, ...(user === null ? [] : [user])])]
      .map(safeText)
      .filter(Boolean)
      .join(", ") || null,
    level: toInt(get(raw, "rule", "level")),
    description: safeText(get(raw, "rule", "description")),
  };
}

function getTimestamp(value) {
  const timestamp = safeText(value);
  return timestamp !== null && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null;
}

function* iterRaw(payload) {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === "object" && !Array.isArray(item)) yield item;
    }
  } else if (payload && typeof payload === "object") {
    if (Array.isArray(payload.alerts)) yield* iterRaw(payload.alerts);
    else yield payload;
  }
}

/**
 * JSON 문자열(단일 JSON 또는 JSONL)을 읽는다.
 * @param {string} text
 * @returns {Alert[]}
 */
export function parseText(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    // JSONL: 줄마다 따로 해석. 깨진 줄은 건너뛴다.
    payload = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        payload.push(JSON.parse(trimmed));
      } catch {
        /* 깨진 줄 무시 */
      }
    }
  }
  return [...iterRaw(payload)].map(parseAlert);
}

/**
 * 파일에서 경보를 읽는다.
 * @param {string | URL} path
 * @returns {Promise<Alert[]>}
 */
export async function loadAlerts(path) {
  return parseText(await readFile(path, "utf-8"));
}

/**
 * 시각 순으로 정렬한 새 배열. 시각이 없는 경보는 맨 뒤.
 * @param {Alert[]} alerts
 * @returns {Alert[]}
 */
export function sortByTime(alerts) {
  const t = (a) => (a.timestamp ? Date.parse(a.timestamp) : Number.POSITIVE_INFINITY);
  return [...alerts].sort((a, b) => t(a) - t(b));
}

// ---------------------------------------------------------------- 실행 예
// node xdr/brute-force/read-alerts.mjs

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const target = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/brute-force.json");
  for (const a of sortByTime(await loadAlerts(target))) {
    console.log(
      `${a.timestamp ?? "-"}\t${a.srcIp ?? "-"}\t${a.account ?? "-"}\t` +
        `${a.level ?? "-"}\t${a.description ?? "-"}`,
    );
  }
}
