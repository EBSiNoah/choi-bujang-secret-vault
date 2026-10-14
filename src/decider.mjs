// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 등록 기기·복합 이상 접속 규칙을 보존하고, v2 엔진 권한 증거로 자료 구역을 판정합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'device_registered', 'step_up_required', 'known_resource_path',
  'memo_owner_match', 'instructor_announcement_edit',
]);

const REQUEST_FIELDS = Object.freeze([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'resourceId', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
  'verifiedAuthorization',
]);
const SIGNAL_FIELDS = Object.freeze(['source', 'region', 'network', 'hour']);
const EVENT_FIELDS = Object.freeze(['kind', 'ageSeconds', 'count']);
const STEP_UP_FIELDS = Object.freeze(['verified', 'authAgeSeconds']);
const AUTHORIZATION_FIELDS = Object.freeze([
  'requestId', 'subjectId', 'resourceId', 'service', 'method', 'path',
  'memoOwnerMatchesSubject', 'canEditAnnouncements',
]);
const EMPTY_QUERY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function hasExactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}

function hasExactRequestFields(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return false;
  const keys = Object.keys(request);
  return keys.every(field => REQUEST_FIELDS.includes(field))
    && REQUEST_FIELDS.every(field => field === 'deviceRegistered' || Object.hasOwn(request, field))
    && (request.deviceRegistered === undefined || request.deviceRegistered === null
      || typeof request.deviceRegistered === 'boolean');
}

function isHour(value) {
  return value === 'unknown' || Number.isInteger(value) && value >= 0 && value <= 23;
}

function hasValidSignals(signals) {
  if (!hasExactFields(signals, SIGNAL_FIELDS) || !isHour(signals.hour)) return false;
  if (signals.source === 'none') {
    return signals.region === 'unknown' && signals.network === 'unknown';
  }
  return signals.source === 'judge_fixture'
    && typeof signals.region === 'string' && signals.region.length > 0
    && typeof signals.network === 'string' && signals.network.length > 0;
}

function hasValidRecentEvents(events) {
  return Array.isArray(events) && events.length <= 12 && events.every(event =>
    hasExactFields(event, EVENT_FIELDS)
    && typeof event.kind === 'string' && event.kind.length > 0
    && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
    && Number.isSafeInteger(event.count) && event.count > 0);
}

function hasValidStepUp(stepUp) {
  if (!hasExactFields(stepUp, STEP_UP_FIELDS) || typeof stepUp.verified !== 'boolean') return false;
  if (!stepUp.verified) return stepUp.authAgeSeconds === null;
  return Number.isFinite(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

function hasBoundAuthorization(authorization, request) {
  return hasExactFields(authorization, AUTHORIZATION_FIELDS)
    && authorization.requestId === request.requestId
    && authorization.subjectId === request.subjectId
    && authorization.resourceId === request.resourceId
    && authorization.service === request.service
    && authorization.method === request.method
    && authorization.path === request.path
    && (authorization.memoOwnerMatchesSubject === null
      || typeof authorization.memoOwnerMatchesSubject === 'boolean')
    && typeof authorization.canEditAnnouncements === 'boolean';
}

function hasKnownResourcePath(request) {
  // 자료나 동작은 쿼리로 선택하지 않습니다. 현재 허용 경로는 쿼리를 받지 않습니다.
  if (request.queryLength !== 0 || request.querySha256 !== EMPTY_QUERY_SHA256) return null;

  if (request.resourceId === 'teacher-announcements' && request.service === 'notes') {
    if (request.method === 'GET' && request.path === '/notes'
        && request.route === 'GET /notes') {
      return { kind: 'announcement_read' };
    }
    const itemPath = /^\/notes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;
    const match = itemPath.exec(request.path);
    if (match && UUID.test(match[1])) {
      if (request.method === 'GET' && request.route === 'GET /notes/:id') {
        return { kind: 'announcement_read' };
      }
      if (request.method === 'PUT' && request.route === 'PUT /notes/:id') {
        return { kind: 'announcement_edit' };
      }
    }
  }

  if (request.resourceId === 'personal-memos' && request.service === 'memos') {
    if (request.method === 'GET' && request.path === '/memos'
        && request.route === 'GET /memos'
        && request.verifiedAuthorization.memoOwnerMatchesSubject === null) {
      return { kind: 'memo_list_read' };
    }
    const itemPath = /^\/memos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;
    const match = itemPath.exec(request.path);
    if (match && UUID.test(match[1])) {
      if (request.method === 'GET' && request.route === 'GET /memos/:id') {
        return { kind: 'memo_item' };
      }
      if (request.method === 'PUT' && request.route === 'PUT /memos/:id') {
        return { kind: 'memo_item' };
      }
    }
  }
  return null;
}

function hasValidRequest(request) {
  if (!hasExactRequestFields(request) || request.schema !== 'aleph.decision.v2') return false;
  const textFields = [
    'requestId', 'classId', 'projectId', 'subjectId', 'service', 'method', 'path', 'route', 'resourceId',
  ];
  return textFields.every(field => typeof request[field] === 'string' && request[field].length > 0)
    && /^[0-9a-f]{16}$/u.test(request.deviceId)
    && Number.isSafeInteger(request.queryLength) && request.queryLength >= 0
    && /^[0-9a-f]{64}$/u.test(request.querySha256)
    && typeof request.at === 'string'
    && Number.isFinite(Date.parse(request.at))
    && new Date(Date.parse(request.at)).toISOString() === request.at
    && (typeof request.policyRevision === 'string' && request.policyRevision.length > 0
      || Number.isSafeInteger(request.policyRevision) && request.policyRevision >= 0)
    && hasValidStepUp(request.stepUp)
    && hasValidRecentEvents(request.recentEvents)
    && hasValidSignals(request.signals)
    && hasBoundAuthorization(request.verifiedAuthorization, request);
}

export async function decide(request) {
  if (!hasValidRequest(request)) throw new TypeError('Invalid engine decision request');
  const target = hasKnownResourcePath(request);
  if (!target) {
    return {
      schema: 'aleph.decision.v2',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'unknown_path',
      ruleIds: ['known_resource_path'],
    };
  }

  const registered = request.deviceRegistered === true;
  if (!registered) {
    return {
      schema: 'aleph.decision.v2',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }

  if (target.kind === 'memo_item'
      && request.verifiedAuthorization.memoOwnerMatchesSubject !== true) {
    return {
      schema: 'aleph.decision.v2',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'resource_forbidden',
      ruleIds: ['memo_owner_match'],
    };
  }
  if (target.kind === 'announcement_edit'
      && request.verifiedAuthorization.canEditAnnouncements !== true) {
    return {
      schema: 'aleph.decision.v2',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'resource_forbidden',
      ruleIds: ['instructor_announcement_edit'],
    };
  }

  const unusualAccess = request.signals.source === 'judge_fixture'
    && request.signals.network === 'unusual'
    && (request.signals.hour < 6 || request.signals.hour >= 22)
    && request.recentEvents.some(event => event.kind === 'burst_read' && event.count > 120);
  const needsStepUp = unusualAccess && !request.stepUp.verified;

  return {
    schema: 'aleph.decision.v2',
    requestId: request.requestId,
    decision: needsStepUp ? 'step_up' : 'allow',
    reasonCode: needsStepUp ? 'step_up_required' : 'approved',
    ruleIds: unusualAccess
      ? ['device_registered', 'step_up_required']
      : ['device_registered'],
  };
}
