import config from '../aleph.config.json' with { type: 'json' };

// ALEPH SDP 엔진이 확인한 요청에 경로·기기·추가 확인 규칙을 적용합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'resource_route_policy',
  'device_registered',
  'step_up_required',
]);

const REQUEST_KEYS = [
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
];
const SIGNAL_KEYS = ['source', 'region', 'network', 'hour'];
const EVENT_KEYS = ['kind', 'ageSeconds', 'count'];

function hasExactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function isValidSignals(signals) {
  if (!hasExactKeys(signals, SIGNAL_KEYS)) return false;
  if (signals.source === 'none') {
    return signals.region === 'unknown'
      && signals.network === 'unknown'
      && signals.hour === 'unknown';
  }
  return signals.source === 'judge_fixture'
    && typeof signals.region === 'string' && signals.region.length > 0
    && signals.region !== 'unknown'
    && typeof signals.network === 'string' && signals.network.length > 0
    && signals.network !== 'unknown'
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
}

function isValidRecentEvents(events) {
  return Array.isArray(events) && events.length <= 12
    && events.every((event) => hasExactKeys(event, EVENT_KEYS)
      && typeof event.kind === 'string' && event.kind.length > 0
      && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count > 0);
}

function isSingleResourcePath(path, collectionPath) {
  const normalizedPath = path.startsWith('/api/') ? path.slice('/api'.length) : path;
  const normalizedCollectionPath = collectionPath.startsWith('/api/')
    ? collectionPath.slice('/api'.length) : collectionPath;
  const prefix = `${normalizedCollectionPath}/`;
  if (!normalizedPath.startsWith(prefix) || normalizedPath.includes('?') || normalizedPath.includes('#')) return false;
  const resourceId = normalizedPath.slice(prefix.length);
  return resourceId.length > 0 && !resourceId.includes('/');
}

function isAllowedResourceRoute(request) {
  if (request.queryLength !== 0) return false;

  return config.allowedRoutes.some(({ method, path }) => {
    if (path === '/api/class/notices') {
      return method === 'GET'
        && request.service === 'notes'
        && request.method === method
        && request.path === path
        && request.route === `${method} /class/notices`;
    }

    const match = /^\/api\/(memos|class\/notices)\/:id$/u.exec(path);
    const service = match?.[1] === 'memos' ? 'memos' : 'notes';
    if (!match || request.service !== service || request.method !== method) return false;

    const routePath = path.slice('/api'.length);
    return request.route === `${method} ${routePath}`
      && isSingleResourcePath(request.path, `/api/${match[1]}`);
  });
}

function isValidRequest(request) {
  if (!hasExactKeys(request, REQUEST_KEYS)) return false;
  return request.schema === 'aleph.decision.v1'
    && typeof request.requestId === 'string'
    && typeof request.classId === 'string'
    && typeof request.projectId === 'string'
    && typeof request.subjectId === 'string'
    && typeof request.deviceId === 'string'
    && typeof request.service === 'string'
    && typeof request.method === 'string'
    && typeof request.path === 'string'
    && typeof request.route === 'string'
    && Number.isInteger(request.queryLength) && request.queryLength >= 0
    && typeof request.querySha256 === 'string'
    && typeof request.at === 'string'
    && (typeof request.policyRevision === 'string' || Number.isInteger(request.policyRevision))
    && typeof request.deviceRegistered === 'boolean'
    && hasExactKeys(request.stepUp, ['verified', 'authAgeSeconds'])
    && typeof request.stepUp.verified === 'boolean'
    && (request.stepUp.verified
      ? Number.isInteger(request.stepUp.authAgeSeconds)
        && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900
      : request.stepUp.authAgeSeconds === null)
    && isValidRecentEvents(request.recentEvents)
    && isValidSignals(request.signals);
}

export async function decide(request) {
  if (!isValidRequest(request)) {
    throw new TypeError('Invalid engine decision request');
  }

  if (!isAllowedResourceRoute(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'resource_route_not_allowed',
      ruleIds: [RULE_IDS[0]],
    };
  }

  const registered = request.deviceRegistered === true;
  const unusualAccess = request.signals.source === 'judge_fixture'
    && (request.signals.hour < 6 || request.signals.hour >= 22)
    && request.signals.network === 'unusual'
    && request.recentEvents.some((event) => event.kind === 'risk_signal'
      && event.ageSeconds <= 300 && event.count >= 10);
  const stepUpRequired = registered && unusualAccess && !request.stepUp.verified;
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: !registered ? 'deny' : stepUpRequired ? 'step_up' : 'allow',
    reasonCode: !registered ? 'device_not_registered'
      : stepUpRequired ? 'step_up_required' : 'approved',
    ruleIds: !registered ? [RULE_IDS[0], RULE_IDS[1]]
      : stepUpRequired ? [RULE_IDS[0], RULE_IDS[1], RULE_IDS[2]]
        : [RULE_IDS[0], RULE_IDS[1]],
  };
}
