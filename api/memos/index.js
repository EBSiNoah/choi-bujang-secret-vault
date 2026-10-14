import { memosContext, parseMemo, isUuid, newId } from '../../src/memos.mjs';

export default async function handler(request, response) {
  const ctx = await memosContext(request, response, ['GET', 'POST']);
  if (!ctx) return;

  try {
    if (request.method === 'GET') {
      // 목록: 로그인한 사용자 본인의 메모만 돌려줍니다.
      const upstream = await ctx.rest(
        `memos?select=id,title,body&owner_id=eq.${encodeURIComponent(ctx.userId)}&order=created_at.asc`);
      if (!upstream.ok) return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
      return response.status(200).json(await upstream.json());
    }

    // POST: { id?, title, body } -> 201 { id }
    const memo = parseMemo(request.body);
    if (!memo) return response.status(400).json({ error: 'INVALID_MEMO' });
    const given = request.body.id;
    if (given !== undefined && !isUuid(given)) {
      return response.status(400).json({ error: 'INVALID_ID' });
    }
    const id = given ?? newId();

    const upstream = await ctx.rest('memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      // owner_id 는 서버가 확인한 사용자 ID 로만 저장합니다.
      body: JSON.stringify({ id, owner_id: ctx.userId, title: memo.title, body: memo.body }),
    });
    if (upstream.status === 409) return response.status(409).json({ error: 'ID_CONFLICT' });
    if (!upstream.ok) return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
    return response.status(201).json({ id });
  } catch {
    return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
  }
}
