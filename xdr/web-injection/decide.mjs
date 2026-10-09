const PATTERNS = Object.freeze([
  {
    id: "repeated-sql-syntax",
    name: "요청 인자의 반복된 SQL 구문",
    mitre: ["T1190"],
    minimumOccurrences: 2,
    urlPattern:
      /\b(?:union\s+(?:all\s+)?select|select\b[\s\S]{1,80}\bfrom\b|(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?|insert\s+into|update\s+\w+\s+set|delete\s+from)\b|(?:--|#|\/\*)/i,
    descriptionPattern: /SQL\s+(?:구문|표기|표식)|데이터베이스 조회를 이어 붙이는 표기/i,
    evidence:
      "MITRE ATT&CK T1190은 외부 공개 앱 악용 기법이며, 요청 인자의 반복된 SQL 구문은 앱 입력 처리 악용 시도와 일치하는 신호다.",
    reference: "https://attack.mitre.org/techniques/T1190/",
  },
  {
    id: "repeated-script-tag",
    name: "요청 인자의 반복된 스크립트 태그 표식",
    mitre: ["T1190"],
    minimumOccurrences: 2,
    urlPattern: /<\s*script\b[^>]*>|javascript\s*:/i,
    descriptionPattern: /스크립트\s+(?:삽입\s+표기|표식)/i,
    evidence:
      "MITRE ATT&CK T1190은 외부 공개 앱 악용 기법이며, 요청 인자에 반복되는 스크립트 태그 표식은 앱 입력 처리 악용 시도와 일치하는 신호다.",
    reference: "https://attack.mitre.org/techniques/T1190/",
  },
  {
    id: "repeated-path-traversal",
    name: "요청 인자의 반복된 상위 경로 이동",
    mitre: ["T1190"],
    minimumOccurrences: 2,
    urlPattern: /(?:\.\.|%2e%2e)(?:\/|\\|%2f|%5c)/i,
    descriptionPattern: /경로를 여러 단계 거슬러 올라가는 표기|경로 이탈 표기/i,
    evidence:
      "MITRE ATT&CK T1190은 외부 공개 앱 악용 기법이며, 요청 인자의 반복된 ../ 표기는 앱을 통한 경로 접근 악용 시도와 일치하는 신호다.",
    reference: "https://attack.mitre.org/techniques/T1190/",
  },
  {
    id: "repeated-command-separator",
    name: "요청 인자의 반복된 명령 구분자",
    minimumOccurrences: 2,
    urlPattern: /(?:;|&&|\|\||\|)/,
    descriptionPattern: /명령\s*구분자/i,
  },
]);

const AMBIGUOUS_PATTERN = Object.freeze({
  name: "단발 또는 모호한 웹 입력 신호",
  descriptionPattern:
    /따옴표|select\b|스크립트|script\b|경로에\s+up\b|주소가\s+평소보다\s+깁니다|sql\b.*수업|이상한\s+검색|주입처럼\s+보이는|구분\s+문자/i,
});
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

function getRequestArguments(value) {
  if (typeof value !== "string") return [];
  const queryStart = value.indexOf("?");
  if (queryStart < 0) return [];
  const query = value.slice(queryStart + 1).split("#", 1)[0];
  return query.split("&").map((parameter) => {
    const separator = parameter.indexOf("=");
    if (separator < 0) return "";
    const argument = parameter.slice(separator + 1).replace(/\+/g, " ");
    try {
      return decodeURIComponent(argument).toLowerCase();
    } catch {
      return argument.toLowerCase();
    }
  });
}

function getOccurrenceCount(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return 1;
}

function result(confidence, reason) {
  const action = confidence >= BLOCK_AT ? "block" : confidence >= ALERT_AT ? "alert" : "record";
  return { action, confidence, reason };
}

export function decide(alert) {
  if (!alert || typeof alert !== "object" || Array.isArray(alert)) {
    return result(0, "유효한 경보가 없어 기록만 합니다.");
  }

  const data = alert.data && typeof alert.data === "object" ? alert.data : {};
  const rule = alert.rule && typeof alert.rule === "object" ? alert.rule : {};
  const requestArguments = getRequestArguments(data.url);
  const description = typeof rule.description === "string" ? rule.description : "";
  const count = getOccurrenceCount(data.count);

  let best = null;
  for (const pattern of PATTERNS) {
    const matchesRequest = requestArguments.some((argument) => pattern.urlPattern.test(argument));
    const matchesDescription = pattern.descriptionPattern.test(description);
    if (!matchesRequest && !matchesDescription) continue;

    const confidence = count >= pattern.minimumOccurrences
      ? Math.round(Math.min(1, 0.85 + (count - pattern.minimumOccurrences) * 0.01) * 100) / 100
      : 0.65;
    if (best === null || confidence > best.confidence) {
      best = { pattern, confidence };
    }
  }

  if (best !== null) {
    return result(best.confidence, best.pattern.name);
  }

  if (AMBIGUOUS_PATTERN.descriptionPattern.test(description)) {
    return result(0.6, AMBIGUOUS_PATTERN.name);
  }

  return result(0, "일치하는 패턴 없음");
}
