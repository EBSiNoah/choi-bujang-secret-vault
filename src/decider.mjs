// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 계약에 없는 값을 만들거나 클라이언트 입력으로 접속 신호를 채우지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

const REQUEST_FIELDS = Object.freeze([
  'schema', 'requestId', 'classId', 'projectId', 'subjectId', 'deviceId',
  'service', 'method', 'path', 'route', 'queryLength', 'querySha256', 'at',
  'policyRevision', 'deviceRegistered', 'stepUp', 'recentEvents', 'signals',
]);
const SIGNAL_FIELDS = Object.freeze(['source', 'region', 'network', 'hour']);
const EVENT_FIELDS = Object.freeze(['kind', 'ageSeconds', 'count']);
const STEP_UP_FIELDS = Object.freeze(['verified', 'authAgeSeconds']);

function hasExactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}

function hasValidSignals(signals) {
  if (!hasExactFields(signals, SIGNAL_FIELDS)) return false;
  if (signals.source === 'none') {
    return signals.region === 'unknown'
      && signals.network === 'unknown'
      && signals.hour === 'unknown';
  }
  return signals.source === 'judge_fixture'
    && typeof signals.region === 'string' && signals.region.length > 0
    && typeof signals.network === 'string' && signals.network.length > 0
    && (signals.hour === 'unknown'
      || Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23);
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

function hasValidRequest(request) {
  if (!hasExactFields(request, REQUEST_FIELDS) || request.schema !== 'aleph.decision.v1') return false;
  const textFields = [
    'classId', 'projectId', 'subjectId', 'service', 'method', 'path', 'route',
  ];
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(request.requestId)
    && textFields.every(field => typeof request[field] === 'string' && request[field].length > 0)
    && /^[0-9a-f]{16}$/u.test(request.deviceId)
    && Number.isSafeInteger(request.queryLength) && request.queryLength >= 0
    && /^[0-9a-f]{64}$/u.test(request.querySha256)
    && typeof request.at === 'string'
    && Number.isFinite(Date.parse(request.at))
    && new Date(Date.parse(request.at)).toISOString() === request.at
    && (typeof request.policyRevision === 'string' && request.policyRevision.length > 0
      || Number.isSafeInteger(request.policyRevision) && request.policyRevision >= 0)
    && typeof request.deviceRegistered === 'boolean'
    && hasValidStepUp(request.stepUp)
    && hasValidRecentEvents(request.recentEvents)
    && hasValidSignals(request.signals);
}

export async function decide(request) {
  if (!hasValidRequest(request)) throw new TypeError('Invalid engine decision request');
  const registered = request.deviceRegistered === true;
  const unusualAccess = request.signals.source === 'judge_fixture'
    && request.signals.network === 'unusual'
    && (request.signals.hour < 6 || request.signals.hour >= 22)
    && request.recentEvents.some(event => event.kind === 'risk_signal' && event.count >= 10);
  const needsStepUp = registered && unusualAccess && !request.stepUp.verified;
  const ruleIds = unusualAccess ? RULE_IDS : [RULE_IDS[0]];

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: !registered ? 'deny' : needsStepUp ? 'step_up' : 'allow',
    reasonCode: !registered ? 'device_not_registered'
      : needsStepUp ? 'step_up_required' : 'approved',
    ruleIds,
  };
}
