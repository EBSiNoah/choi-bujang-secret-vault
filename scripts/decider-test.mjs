import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequest, fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v2'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

const memoRequest = (overrides = {}) => fixtureRequest({
  service: 'memos', method: 'GET',
  path: '/memos/00000000-0000-4000-8000-000000000001',
  route: 'GET /memos/:id', resourceId: 'personal-memos',
  verifiedAuthorization: { memoOwnerMatchesSubject: true },
  ...overrides,
});

const announcementEditRequest = (canEditAnnouncements) => fixtureRequest({
  method: 'PUT', path: '/notes/00000000-0000-4000-8000-000000000001',
  route: 'PUT /notes/:id',
  verifiedAuthorization: { canEditAnnouncements },
});

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  const requiredRules = [
    'device_registered', 'memo_owner_match', 'instructor_announcement_edit', 'known_resource_path',
  ];
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || requiredRules.some(id => !ruleIds.includes(id))) {
    throw new Error('등록 기기 및 자료 구역 규칙을 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const recheckId = randomUUID();
  const suspiciousRechecked = {
    ...suspicious,
    requestId: recheckId,
    stepUp: { verified: true, authAgeSeconds: 60 },
    verifiedAuthorization: { ...suspicious.verifiedAuthorization, requestId: recheckId },
  };
  const checks = [
    { name: '등록 기기의 정상 공지 읽기', request: normal, decision: 'allow' },
    { name: '미등록 기기의 가상 요청', request: fixtureRequest({ deviceRegistered: false }),
      decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '자료 ID 자리에 온 기능 경로', request: fixtureRequest({ path: '/notes/export' }),
      decision: 'deny', reasonCode: 'unknown_path' },
    { name: '자료 아래 중첩된 기능 경로', request: fixtureRequest({
      path: `${normal.path}/export`, route: 'GET /notes/:id/export',
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: '자료와 일치하지 않는 서비스 경로', request: fixtureRequest({
      service: 'memos', path: normal.path,
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: '자기 메모 목록 읽기', request: fixtureRequest({
      service: 'memos', method: 'GET', path: '/memos', route: 'GET /memos',
      resourceId: 'personal-memos',
    }), decision: 'allow' },
    { name: '자기 메모 읽기', request: memoRequest(), decision: 'allow' },
    { name: '자기 메모 수정', request: memoRequest({
      method: 'PUT', route: 'PUT /memos/:id',
    }), decision: 'allow' },
    { name: 'B가 A의 메모 읽기 시도', request: memoRequest({
      subjectId: 'learner_b_fixture',
      verifiedAuthorization: { memoOwnerMatchesSubject: false },
    }), decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: '소유권 증거가 없는 메모 접근', request: memoRequest({
      verifiedAuthorization: { memoOwnerMatchesSubject: null },
    }), decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: '일반 학생의 공지 수정', request: announcementEditRequest(false),
      decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: '엔진이 공지 수정 권한을 확인한 강사', request: announcementEditRequest(true),
      decision: 'allow' },
    { name: '다른 자료 ID를 고른 요청', request: fixtureRequest({ resourceId: 'personal-memos' }),
      decision: 'deny', reasonCode: 'unknown_path' },
    { name: '등록되지 않은 구역', request: fixtureRequest({
      service: 'archive', resourceId: 'unknown-resource', path: '/archive', route: 'GET /archive',
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: '쿼리로 기능을 선택하려는 요청', request: fixtureRequest({
      queryLength: 6, querySha256: 'a'.repeat(64),
    }), decision: 'deny', reasonCode: 'unknown_path' },
  ];
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '다시 확인한 복합 이상 접속', request: suspiciousRechecked,
        decision: 'allow' },
    );
  }
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed: valid,
      decision: response?.decision, reasonCode: response?.reasonCode });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) {
      const outcome = [item.decision, item.reasonCode].filter(Boolean).join(' · ');
      process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}: ${outcome}\n`);
    }
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
