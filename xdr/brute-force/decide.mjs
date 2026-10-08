// MITRE ATT&CK T1110 패턴: 외부 의존성이나 파일 접근 없이 경보 하나를 판정합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: '동일 출발 주소의 연속 로그인 실패',
    condition: '짧은 시간 안에 같은 출발 주소에서 로그인 실패가 연속으로 관측될 때.',
    evidence: 'MITRE ATT&CK T1110(Brute Force)은 반복적인 인증 시도로 유효한 자격 증명을 추측하는 공격을 다룬다.',
  }),
  Object.freeze({
    name: '여러 계정에 대한 동일 비밀번호 대입',
    condition: '짧은 시간 안에 여러 계정에 동일한 비밀번호가 시도된 것이 안전한 인증 신호로 확인될 때.',
    evidence: 'MITRE ATT&CK T1110.003(Password Spraying)은 하나의 비밀번호를 여러 계정에 대입하는 기법이다.',
  }),
]);

const NO_MATCH = '일치하는 공격 패턴 없음';
const SHORT_WINDOW_SECONDS = 300;
const REPEATED_FAILURE_THRESHOLD = 5;
const MULTI_ACCOUNT_THRESHOLD = 3;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstObject(...values) {
  return values.find(isObject) ?? {};
}

function positiveNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

function explicitTrue(...values) {
  return values.some((value) => value === true || value === 1 ||
    (typeof value === 'string' && /^(true|yes|1)$/i.test(value.trim())));
}

function textOf(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function decide(alert) {
  if (!isObject(alert)) {
    return { action: 'record', confidence: 0, reason: NO_MATCH };
  }

  const rule = firstObject(alert.rule);
  const data = firstObject(alert.data);
  const authData = firstObject(data.authentication, data.auth);
  const groups = Array.isArray(rule.groups) ? rule.groups.filter((item) => typeof item === 'string') : [];
  // 규칙 설명과 분류 필드만 살펴봅니다. 원문 로그·비밀번호 등은 읽거나 반환하지 않습니다.
  const ruleText = [
    rule.description,
    rule.name,
    ...groups,
    rule.mitre?.id,
  ].map(textOf).join(' ');
  const eventText = [
    alert.event,
    alert.event_type,
    alert.action,
    alert.status,
    data.event,
    data.event_type,
    data.action,
    data.status,
    authData.event,
    authData.action,
    authData.status,
  ].map(textOf).join(' ');
  const allSignalText = `${ruleText} ${eventText}`;

  const hasFailure = /\b(fail(?:ed|ure)?|invalid|denied|unsuccessful|bad credentials?)\b|authentication failure|login failure|로그인 실패|인증 실패/.test(allSignalText);
  const explicitBruteForce = /brute[\s_-]*force|password[\s_-]*spray(?:ing)?|무차별 대입|비밀번호 스프레이/.test(ruleText);
  const explicitSpray = /password[\s_-]*spray(?:ing)?|same[\s_-]+password|동일한 비밀번호|같은 비밀번호|비밀번호 스프레이/.test(ruleText);

  const sourceAddress = [data.srcip, data.source_ip, data.sourceAddress, alert.srcip, alert.source_ip]
    .some((value) => typeof value === 'string' && value.trim() !== '');
  const failureCount = positiveNumber(
    rule.frequency,
    data.failure_count, data.failed_attempts, data.attempt_count, data.count,
    alert.failure_count, alert.failed_attempts, alert.attempt_count, alert.count,
  );
  const timeframe = positiveNumber(rule.timeframe, data.timeframe, alert.timeframe);
  const accountCount = positiveNumber(
    data.distinct_accounts, data.unique_accounts, data.account_count, data.accounts_count,
    alert.distinct_accounts, alert.unique_accounts, alert.account_count, alert.accounts_count,
    Array.isArray(data.accounts) ? data.accounts.length : null,
    Array.isArray(alert.accounts) ? alert.accounts.length : null,
  );
  // 비밀번호 값 자체는 절대 비교하거나 결과에 넣지 않고, 명시적인 안전 신호만 확인합니다.
  const samePasswordSignal = explicitTrue(
    data.same_password, data.samePassword, data.password_reused,
    authData.same_password, authData.samePassword, authData.password_reused,
    alert.same_password, alert.samePassword, alert.password_reused,
  );
  const shortWindow = timeframe !== null && timeframe <= SHORT_WINDOW_SECONDS;
  const enoughAccounts = accountCount !== null && accountCount >= MULTI_ACCOUNT_THRESHOLD;

  if (hasFailure && shortWindow && enoughAccounts && (explicitSpray || samePasswordSignal)) {
    return {
      action: 'block',
      confidence: 0.97,
      reason: PATTERNS[1].name,
    };
  }

  if (hasFailure && sourceAddress && failureCount !== null &&
      failureCount >= REPEATED_FAILURE_THRESHOLD && shortWindow) {
    return {
      action: 'block',
      confidence: 0.94,
      reason: PATTERNS[0].name,
    };
  }

  if (hasFailure && enoughAccounts && (explicitSpray || samePasswordSignal)) {
    return {
      action: 'alert',
      confidence: 0.72,
      reason: PATTERNS[1].name,
    };
  }

  if (hasFailure && sourceAddress && failureCount !== null && failureCount >= 3) {
    return {
      action: 'alert',
      confidence: 0.68,
      reason: PATTERNS[0].name,
    };
  }

  if (explicitSpray || explicitBruteForce) {
    return {
      action: 'alert',
      confidence: 0.62,
      reason: explicitSpray ? PATTERNS[1].name : PATTERNS[0].name,
    };
  }

  return {
    action: 'record',
    confidence: hasFailure ? 0.2 : 0,
    reason: NO_MATCH,
  };
}

export { decide };