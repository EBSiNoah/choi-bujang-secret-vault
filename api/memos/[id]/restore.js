import { memosContext } from '../../../src/memos.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../../src/resource-id.mjs';
import { restoreMemo } from '../../../src/memo-restore.mjs';
import { RESTORE_TARGET } from '../../../src/restore-target.mjs';

// 10단계: POST /api/memos/:id/restore — 비공개 가상 메모 사본에서 한 건만 복원합니다.
// 감사 기록은 수정하지 않고 한 줄 JSON 을 로그에 덧붙이기만 합니다(메모 내용은 남기지 않음).
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireResourceId(request, response, RESOURCE_IDS.personalMemos)) return;

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const ctx = await memosContext(request, response, ['POST']);
  if (!ctx) return;

  const audit = (event) => console.log(JSON.stringify({ type: 'memo_restore_audit', ...event }));
  try {
    const result = await restoreMemo({
      rest: ctx.rest, userId: ctx.userId, id: request.query?.id,
      body: request.body, target: RESTORE_TARGET, audit,
    });
    return response.status(result.status).json(result.json);
  } catch {
    audit({ at: new Date().toISOString(), outcome: 'error', ownerId: ctx.userId });
    return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
  }
}
