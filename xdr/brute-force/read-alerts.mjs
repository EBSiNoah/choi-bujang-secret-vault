/**
 * Wazuh 경보 읽기 모듈.
 *
 * 경보 JSON에서 시각 · 출발 주소 · 계정 · 규칙 수준 · 설명을 뽑아 평범한 객체로 돌려준다.
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
 * @property {string|null} id
 * @property {Date|null} timestamp        시각 (Date, 절대 시각)
 * @property {string|null} timestampRaw   원본 시각 문자열 (예: 2026-09-27T09:12:01+09:00)
 * @property {string|null} srcIp          출발 주소 (data.srcip)
 * @property {string|null} user           계정 (data.srcuser)
 * @property {number|null} level          규칙 수준 (rule.level)
 * @property {string|null} description    설명 (rule.description)
 * @property {string|null} agent
 * @property {string[]} mitre
 * @property {number|null} count          data.count (실패 횟수 등)
 * @property {string[]} accounts          data.accounts (쉼표로 적힌 여러 계정)
 * @property {object} raw                 원본 경보
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

function toInt(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const text = String(value).trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/** ISO 8601 문자열을 Date 로. Wazuh 원본의 '+0900' 오프셋도 처리. */
function toDate(value) {
  let text = toStr(value);
  if (text === null) return null;
  // '+0900' -> '+09:00'
  text = text.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitList(value) {
  const text = toStr(value);
  if (text === null) return [];
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

/** rule.mitre 는 ["T1110"] 이거나 { id: ["T1110"], ... } 두 형태가 있다. */
function mitreIds(rule) {
  let mitre = get(rule, "mitre");
  if (mitre && typeof mitre === "object" && !Array.isArray(mitre)) mitre = mitre.id;
  if (typeof mitre === "string") return [mitre];
  if (Array.isArray(mitre)) return mitre.map(String);
  return [];
}

// ---------------------------------------------------------------- 핵심 함수

/**
 * 경보 객체 한 건을 읽는다. 빠진 필드는 null(또는 빈 배열)로 둔다.
 * @param {object} raw
 * @returns {Alert}
 */
export function parseAlert(raw) {
  return {
    id: toStr(raw?.id),
    timestamp: toDate(raw?.timestamp),
    timestampRaw: toStr(raw?.timestamp),
    srcIp: toStr(get(raw, "data", "srcip")),
    user: toStr(get(raw, "data", "srcuser")),
    level: toInt(get(raw, "rule", "level")),
    description: toStr(get(raw, "rule", "description")),
    agent: toStr(get(raw, "agent", "name")),
    mitre: mitreIds(raw?.rule),
    count: toInt(get(raw, "data", "count")),
    accounts: splitList(get(raw, "data", "accounts")),
    raw,
  };
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
  const t = (a) => (a.timestamp ? a.timestamp.getTime() : Number.POSITIVE_INFINITY);
  return [...alerts].sort((a, b) => t(a) - t(b));
}

// ---------------------------------------------------------------- 실행 예
// node wazuh-alert-reader.mjs brute-force.json

import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const target = process.argv[2] ?? "brute-force.json";
  for (const a of sortByTime(await loadAlerts(target))) {
    // 원본 오프셋 그대로 시:분:초 표시 (예: 09:12:01)
    const when = a.timestampRaw?.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ?? "-";
    console.log(
      `${when}  L${String(a.level ?? "-").padEnd(2)}  ` +
        `${(a.srcIp ?? "-").padEnd(15)} ${(a.user ?? "-").padEnd(7)} ${a.description ?? ""}`,
    );
  }
}
