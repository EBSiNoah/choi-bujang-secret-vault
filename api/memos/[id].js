import { memosContext, parseMemo, isUuid } from '../../src/memos.mjs';

// TODO(4단계): 아래 GET·PUT·DELETE 는 로그인만 확인하고 owner_id 는 검사하지 않습니다.
// 그래서 B 가 A 의 메모 id 를 알면 읽고 고치고 지울 수 있습니다. 4단계에서
// 모든 조회·수정·삭제 질의에 owner_id=eq.<ctx.userId> 조건을 추가하세요.
export default async function handler(request, response) {
  const ctx = await memosContext(request, response, ['GET', 'PUT', 'DELETE']);
  if (!ctx) return;

  const id = request.query?.id;
  if (!isUuid(id)) return response.status(404).json({ error: 'NOT_FOUND' });
  const byId = `id=eq.${encodeURIComponent(id)}`;
  const unavailable = () => response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });

  try {
    if (request.method === 'GET') {
      const upstream = await ctx.rest(`memos?select=id,title,body&${byId}`);
      if (!upstream.ok) return unavailable();
      const rows = await upstream.json();
      if (!rows.length) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(rows[0]);
    }

    if (request.method === 'PUT') {
      const memo = parseMemo(request.body);
      if (!memo) return response.status(400).json({ error: 'INVALID_MEMO' });
      const upstream = await ctx.rest(`memos?select=id,title,body&${byId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ title: memo.title, body: memo.body }),
      });
      if (!upstream.ok) return unavailable();
      const rows = await upstream.json();
      if (!rows.length) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(rows[0]);
    }

    // DELETE
    const upstream = await ctx.rest(`memos?select=id&${byId}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!upstream.ok) return unavailable();
    const rows = await upstream.json();
    if (!rows.length) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(204).end();
  } catch {
    return unavailable();
  }
}
