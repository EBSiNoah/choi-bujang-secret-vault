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
    { name: 'fixture가 등록으로 표시한 공지 읽기 요청', request: normal, decision: 'allow' },
    { name: 'fixture에서 미등록으로 표시한 요청', request: fixtureRequest({ deviceRegistered: false }),
      decision: 'deny', reasonCode: 'device_not_registered' },
    { name: 'fixture 요청에 등록 상태 값이 없는 경우', request: (() => {
      const request = fixtureRequest();
      delete request.deviceRegistered;
      return request;
    })(), decision: 'deny', reasonCode: 'device_not_registered' },
    { name: 'fixture에서 자료 ID 자리에 온 기능 경로', request: fixtureRequest({ path: '/notes/export' }),
      decision: 'deny', reasonCode: 'unknown_path' },
    { name: 'fixture에서 자료 아래 중첩된 기능 경로', request: fixtureRequest({
      path: `${normal.path}/export`, route: 'GET /notes/:id/export',
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: 'fixture에서 자료와 일치하지 않는 서비스 경로', request: fixtureRequest({
      service: 'memos', path: normal.path,
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: 'fixture가 본인 소유로 표시한 메모 목록 읽기', request: fixtureRequest({
      service: 'memos', method: 'GET', path: '/memos', route: 'GET /memos',
      resourceId: 'personal-memos',
    }), decision: 'allow' },
    { name: 'fixture가 본인 소유로 표시한 메모 읽기', request: memoRequest(), decision: 'allow' },
    { name: 'fixture가 본인 소유로 표시한 메모 수정', request: memoRequest({
      method: 'PUT', route: 'PUT /memos/:id',
    }), decision: 'allow' },
    { name: 'fixture에서 다른 사용자의 메모 읽기 시도', request: memoRequest({
      subjectId: 'learner_b_fixture',
      verifiedAuthorization: { memoOwnerMatchesSubject: false },
    }), decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: 'fixture에 소유권 증거가 없는 메모 접근', request: memoRequest({
      verifiedAuthorization: { memoOwnerMatchesSubject: null },
    }), decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: 'fixture가 수정 권한 없다고 표시한 공지 수정', request: announcementEditRequest(false),
      decision: 'deny', reasonCode: 'resource_forbidden' },
    { name: 'fixture가 수정 권한 있다고 표시한 공지 수정', request: announcementEditRequest(true),
      decision: 'allow' },
    { name: 'fixture에서 다른 자료 ID를 고른 요청', request: fixtureRequest({ resourceId: 'personal-memos' }),
      decision: 'deny', reasonCode: 'unknown_path' },
    { name: 'fixture에서 등록되지 않은 구역 요청', request: fixtureRequest({
      service: 'archive', resourceId: 'unknown-resource', path: '/archive', route: 'GET /archive',
    }), decision: 'deny', reasonCode: 'unknown_path' },
    { name: 'fixture에서 쿼리로 기능을 선택하려는 요청', request: fixtureRequest({
      queryLength: 6, querySha256: 'a'.repeat(64),
    }), decision: 'deny', reasonCode: 'unknown_path' },
  ];
  if (ruleIds.includes('step_up_required')) {
    const massRead = [{ kind: 'burst_read', ageSeconds: 60, count: 121 }];
    const nighttime = { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 };
    checks.push(
      { name: 'fixture의 복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: 'fixture에서 다시 확인한 복합 이상 접속', request: suspiciousRechecked,
        decision: 'allow' },
      { name: 'fixture의 야간·이상 네트워크 없이 다량 읽기', request: fixtureRequest({
        recentEvents: massRead,
      }), decision: 'allow' },
      { name: 'fixture의 주간·다량 읽기·이상 네트워크', request: fixtureRequest({
        signals: { ...nighttime, hour: 14 },
        recentEvents: massRead,
      }), decision: 'allow' },
      { name: 'fixture의 야간·정상 네트워크·다량 읽기', request: fixtureRequest({
        signals: { ...nighttime, network: 'usual' },
        recentEvents: massRead,
      }), decision: 'allow' },
      { name: 'fixture의 복합 이상이나 기준에 못 미치는 읽기', request: fixtureRequest({
        signals: nighttime,
        recentEvents: [{ kind: 'burst_read', ageSeconds: 60, count: 120 }],
      }), decision: 'allow' },
      { name: 'fixture의 복합 이상이나 다른 종류의 사건', request: fixtureRequest({
        signals: nighttime,
        recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 121 }],
      }), decision: 'allow' },
      { name: 'fixture에서 미등록 기기의 복합 이상 접속', request: fixtureRequest({
        deviceRegistered: false,
        signals: nighttime,
        recentEvents: massRead,
      }), decision: 'deny', reasonCode: 'device_not_registered' },
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
      process.stdout.write(`${item.passed ? '가상 판정 일치' : '가상 판정 불일치'} · ${item.name}: ${outcome}\n`);
    }
    process.stdout.write('이 결과는 fixture 입력에 대한 decide() 판정만 확인합니다. 실제 로그인·기기 등록·자료 API 접근은 검증하지 않습니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
