import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local practice requests use the expanded engine contract. The judge sends and times its own events.
export function fixtureRequest(overrides = {}) {
  const base = {
    schema: 'aleph.decision.v2', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
    service: 'notes', method: 'GET',
    path: '/notes/00000000-0000-4000-8000-000000000001', route: 'GET /notes/:id',
    resourceId: 'teacher-announcements', queryLength: 0,
    querySha256: createHash('sha256').update('').digest('hex'),
    at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
  };
  const request = { ...base, ...overrides };
  const suppliedAuthorization = overrides.verifiedAuthorization ?? {};
  request.verifiedAuthorization = {
    requestId: request.requestId,
    subjectId: request.subjectId,
    resourceId: request.resourceId,
    service: request.service,
    method: request.method,
    path: request.path,
    memoOwnerMatchesSubject: null,
    canEditAnnouncements: false,
    ...suppliedAuthorization,
  };
  return request;
}

export function fixtureRequests() {
  return {
    normal: fixtureRequest(),
    suspicious: fixtureRequest({
      signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
      recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }],
    }),
  };
}
const check = (input, output) => output && typeof output === 'object'
  && Object.keys(output).sort().join(',') === 'decision,reasonCode,requestId,ruleIds,schema'
  && output.schema === input.schema && output.requestId === input.requestId
  && ['allow', 'deny', 'step_up'].includes(output.decision)
  && typeof output.reasonCode === 'string' && Array.isArray(output.ruleIds);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { normal, suspicious } = fixtureRequests();
    const { decide } = await import('../src/decider.mjs');
    if (typeof decide !== 'function') throw new Error('src/decider.mjs에서 decide 함수를 내보내야 합니다.');
    const ordinary = await decide(normal);
    const unusual = await decide(suspicious);
    if (!check(normal, ordinary) || !check(suspicious, unusual)) throw new Error('판정기 응답 형식이 맞지 않습니다.');
    process.stdout.write(`정상 사건: ${ordinary.decision}\n복합 이상 사건: ${unusual.decision}\n`);
    if (ordinary.decision !== 'allow' || unusual.decision !== 'step_up') {
      throw new Error('정상 사건은 allow, 복합 이상 사건은 step_up이어야 합니다.');
    }
  } catch (error) {
    process.stderr.write(`가상 사건 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
