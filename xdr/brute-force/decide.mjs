/**
 * decide.mjs — Wazuh 경보를 무차별 대입 패턴과 맞춰 block / alert / record 로 판단한다.
 *
 * 근거는 두 가지로 제한한다.
 *   1) 짧은 시간 같은 주소의 로그인 실패 연속   (same-source-burst, T1110.001)
 *   2) 여러 계정에 같은 비밀번호 대입(스프레이) (password-spraying, T1110.003)
 *
 * 이 파일만으로 동작한다. 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않으며,
 * 바깥에 묻지 않는다. 패턴은 아래 상수(patterns.json 에서 옮긴 것)에 들어 있다.
 *
 * 사용: decide(alert) → { action: 'block' | 'alert' | 'record', confidence: 0~1, reason }
 *   - alert: Wazuh 경보 한 건. 판단에는 timestamp, data.srcip, data.srcuser/data.accounts, data.count 만 쓴다.
 *   - 패턴은 "같은 주소가 창 안에서 보낸 시도 전체"를 본다. 그래서 decide 는 이 모듈 안(메모리)에
 *     최근 경보를 주소별로 기억해 두고, 호출할 때마다 현재 경보를 더해 계산한다.
 *     (프로세스가 끝나면 사라지는 메모리일 뿐, 어디에도 기록하지 않는다.)
 *   - 같은 경보를 다시 넣어도 두 번 세지 않는다(id, 없으면 시각·계정·건수로 구분).
 *
 * 확신도: 조건마다 0~1 점수를 매기고, 모든 조건이 맞아야 하므로 가장 낮은 점수를 쓴다.
 *   - 기준선에 정확히 걸치면 0.7(애매). 기준을 넉넉히 넘어설수록 1 에 가까워진다.
 *   - 기준에 못 미치면 못 미친 비율만큼 0.7 에서 깎인다.
 *   - 0.85 이상 block, 0.5 이상 alert, 그 아래 record.
 */

// ============================================================ 상수

/** patterns.json 에서 옮긴 패턴과 입력 계약. */
const PATTERNS_FILE = Object.freeze({
  schema: "aleph.xdr.patterns.v2",
  moduleKey: "brute-force",
  basis: {
    framework: "MITRE ATT&CK",
    technique: "T1110",
    name: "Brute Force (무차별 대입)",
    url: "https://attack.mitre.org/techniques/T1110/",
    subTechniques: {
      "T1110.001": "Password Guessing (비밀번호 추측)",
      "T1110.003": "Password Spraying (비밀번호 스프레이)",
    },
  },
  inputs: {
    timestamp: { path: "timestamp", format: "ISO 8601 (오프셋 포함)" },
    srcip: { path: "data.srcip" },
    accounts: { paths: ["data.accounts", "data.srcuser"], type: "set" },
    count: { path: "data.count", type: "integer", missing: 1 },
  },
  metrics: {
    totalCount: "묶음 안 모든 경보의 count 합",
    distinctAccounts: "묶음 안 accounts의 서로 다른 계정 수",
    attemptsPerAccount: "totalCount / distinctAccounts",
  },
  grouping: { by: ["srcip"] },
  patterns: [
    {
      id: "same-source-burst",
      name: "같은 주소의 짧은 시간 로그인 실패 연속",
      mitre: ["T1110.001"],
      windowSeconds: 300,
      conditions: [{ metric: "totalCount", op: ">=", value: 20, param: "minCount" }],
      evidence: {
        rationale:
          "MITRE ATT&CK T1110은 인증 성공 전까지 자격 증명을 반복 시도하는 무차별 대입을 다루므로, 같은 출발 주소에서 짧은 창에 실패가 몰리는 현상은 반복 시도의 근거가 된다.",
        references: [
          "https://attack.mitre.org/techniques/T1110/",
          "https://attack.mitre.org/techniques/T1110/001/",
        ],
      },
    },
    {
      id: "password-spraying",
      name: "한 출발 주소가 여러 계정에 비밀번호를 적은 횟수로 대입",
      mitre: ["T1110.003"],
      windowSeconds: 3600,
      conditions: [
        { metric: "distinctAccounts", op: ">=", value: 5, param: "manyAccountsMin" },
        { metric: "attemptsPerAccount", op: "<=", value: 3, param: "lowPerAccountMax" },
      ],
      evidence: {
        rationale:
          "MITRE ATT&CK T1110.003은 하나 또는 소수의 비밀번호를 여러 계정에 시도하는 방식이며, 이 경보는 비밀번호 자체를 제공하지 않으므로 여러 계정에 적은 횟수로 퍼진 형태만 간접 신호로 본다.",
        references: ["https://attack.mitre.org/techniques/T1110/003/"],
      },
    },
  ],
});

/** 확신도 → 행동 기준 */
const BLOCK_AT = 0.85; // 이상이면 block
const ALERT_AT = 0.5; // 이상이면 alert, 그 아래는 record

/** 점수 계산 보조 값 */
const BORDERLINE = 0.7; // 기준선에 정확히 걸칠 때의 점수
const MATCH_FLOOR = 0.25; // 이보다 낮으면 reason 에서 패턴과 일치한다고 말하지 않는다

/** 기억(메모리) 상한 */
const MAX_EVENTS_PER_IP = 5000;
const MAX_TRACKED_IPS = 10000;

const PATTERNS = PATTERNS_FILE.patterns;
const MAX_WINDOW_SECONDS = Math.max(...PATTERNS.map((p) => p.windowSeconds));

/** 주소별 최근 경보. 이 모듈 안에서만 쓰는 메모리. */
const history = new Map();

// ============================================================ 경보 읽기

const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** ISO 8601 → 초 단위 시각. Wazuh 원본의 '+0900' 오프셋도 받는다. 읽을 수 없으면 null. */
function toSeconds(v) {
  const s = text(v).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms / 1000;
}

function toCount(v) {
  const s = text(v);
  return /^\d+$/.test(s) ? Number(s) : PATTERNS_FILE.inputs.count.missing;
}

/** 경보 한 건에서 timestamp, srcip, accounts, count 를 뽑는다. 읽을 수 없으면 null. */
function readEvent(alert) {
  if (!alert || typeof alert !== "object") return null;
  const src = alert.raw && typeof alert.raw === "object" ? alert.raw : alert;
  const data = src.data && typeof src.data === "object" ? src.data : {};

  const listed = Array.isArray(data.accounts) ? data.accounts : text(data.accounts).split(",");
  const accounts = [...new Set([...listed, data.srcuser].map(text).filter(Boolean))];
  const count = toCount(data.count);
  const t = toSeconds(src.timestamp);
  const ip = text(data.srcip);

  const id = text(src.id);
  const key = id ? `id:${id}` : `${text(src.timestamp)}|${accounts.join(",")}|${count}`;
  return { ip, t, count, accounts, key };
}

// ============================================================ 주소별 기억

/** 현재 경보를 기억에 더하고(중복이면 건너뜀), 오래된 것은 버린다. */
function remember(ev) {
  if (ev.t === null) return; // 시각이 없으면 묶을 수 없으므로 기억하지 않는다
  let list = history.get(ev.ip);
  if (!list) {
    if (history.size >= MAX_TRACKED_IPS) history.delete(history.keys().next().value);
    list = [];
    history.set(ev.ip, list);
  }
  if (!list.some((e) => e.key === ev.key)) list.push(ev);

  const cutoff = ev.t - MAX_WINDOW_SECONDS;
  let kept = list.filter((e) => e.t >= cutoff);
  if (kept.length > MAX_EVENTS_PER_IP) kept = kept.slice(-MAX_EVENTS_PER_IP);
  history.set(ev.ip, kept);
}

/** 현재 경보 시각을 끝으로 하는 창 안의 이 주소 경보들. */
function windowEvents(ev, windowSeconds) {
  if (ev.t === null) return [ev];
  const list = history.get(ev.ip) ?? [ev];
  return list.filter((e) => e.t <= ev.t && e.t >= ev.t - windowSeconds);
}

// ============================================================ 지표 · 점수

function computeMetrics(events) {
  const accounts = new Set();
  let sum = 0;
  for (const e of events) {
    sum += e.count;
    for (const a of e.accounts) accounts.add(a);
  }
  const distinctAccounts = accounts.size;
  // 계정이 목록에 올랐다는 것은 최소 한 번은 시도했다는 뜻이므로 시도 합은 계정 수보다 작을 수 없다.
  const totalCount = Math.max(sum, distinctAccounts);
  const attemptsPerAccount = distinctAccounts > 0 ? totalCount / distinctAccounts : null;
  return { totalCount, distinctAccounts, attemptsPerAccount };
}

/**
 * 조건 하나의 점수(0~1).
 *   '>=' : 기준 이상이면 0.7 에서 시작해 기준의 2배에서 1. 못 미치면 비율만큼 0.7 에서 깎는다.
 *   '<=' : 기준 이하이면 0.7 에서 시작해 계정당 1회에서 1. 넘으면 기준/값 비율만큼 깎는다.
 */
function conditionScore(value, op, limit) {
  if (value === null || !Number.isFinite(value)) return 0;
  if (op === ">=") {
    if (value >= limit) return BORDERLINE + (1 - BORDERLINE) * Math.min((value - limit) / limit, 1);
    return BORDERLINE * (Math.max(value, 0) / limit);
  }
  if (op === "<=") {
    if (value > limit) return BORDERLINE * (limit / value);
    if (limit <= 1) return 1;
    return BORDERLINE + (1 - BORDERLINE) * ((limit - Math.max(value, 1)) / (limit - 1));
  }
  return 0;
}

/** 패턴 하나를 계산한다. 모든 조건이 맞아야 하므로 가장 낮은 점수가 확신도. */
function scorePattern(pattern, ev) {
  const metrics = computeMetrics(windowEvents(ev, pattern.windowSeconds));
  const scores = pattern.conditions.map((c) => conditionScore(metrics[c.metric], c.op, c.value));
  return { pattern, metrics, confidence: Math.min(...scores) };
}

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

// ============================================================ 내보내기

/**
 * 경보 한 건을 판단한다.
 * @param {object} alert Wazuh 경보
 * @returns {{ action: 'block' | 'alert' | 'record', confidence: number, reason: string }}
 */
export function decide(alert) {
  const ev = readEvent(alert);
  if (!ev) {
    return { action: "record", confidence: 0, reason: "경보를 읽을 수 없어 기록만 합니다." };
  }
  if (!ev.ip) {
    return { action: "record", confidence: 0, reason: "출발 주소(srcip)가 없어 같은 주소 기준으로 묶을 수 없습니다." };
  }
  if (ev.t === null) {
    return { action: "record", confidence: 0, reason: "시각(timestamp)이 없어 패턴 시간 창을 확인할 수 없습니다." };
  }

  remember(ev);

  let best = null;
  for (const pattern of PATTERNS) {
    const scored = scorePattern(pattern, ev);
    if (best === null || round(scored.confidence, 4) > round(best.confidence, 4)) best = scored; // 동점이면 앞 패턴
  }

  const confidence = round(best.confidence, 2);
  const action = confidence >= BLOCK_AT ? "block" : confidence >= ALERT_AT ? "alert" : "record";
  const reason = confidence >= MATCH_FLOOR ? best.pattern.name : "일치하는 패턴 없음";
  return { action, confidence, reason };
}
