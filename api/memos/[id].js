import { memosContext, parseMemo, isUuid } from '../../src/memos.mjs';

// 4단계: 한 건 읽기·수정·삭제는 "검증된 사용자 ID == DB 행의 owner_id" 일 때만 허용합니다.
// 1) 질의 조건에 owner_id 를 넣어, 본인 행만 일치하게 합니다 (기존 행의 소유자 확인).
// 2) 돌려받은 행의 owner_id 도 다시 비교합니다 (수정 뒤의 새 행 소유자 확인).
// 남의 메모는 없는 메모와 똑같이 404 로 답해서 id 가 존재하는지도 드러내지 않습니다.
// URL·본문의 owner_id 류 값은 믿지 않고, 수정 본문에 들어 있으면 거부합니다.
const OWNER_FIELDS = ['owner_id', 'ownerId', 'user_id', 'userId'];

export default async function handler(request, response) {
  const ctx = await memosContext(request, response, ['GET', 'PUT', 'DELETE']);
  if (!ctx) return;

  const id = request.query?.id;
  if (!isUuid(id)) return response.status(404).json({ error: 'NOT_FOUND' });

  const where = `id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ctx.userId)}`;
  const notFound = () => response.status(404).json({ error: 'NOT_FOUND' });
  const unavailable = () => response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
  const mine = (rows) =>
    Array.isArray(rows) ? rows.find((row) => row?.owner_id === ctx.userId) : undefined;
  const view = ({ id: memoId, title, body }) => ({ id: memoId, title, body });

  try {
    if (request.method === 'GET') {
      const upstream = await ctx.rest(`memos?select=id,owner_id,title,body&${where}`);
      if (!upstream.ok) return unavailable();
      const row = mine(await upstream.json());
      if (!row) return notFound();
      return response.status(200).json(view(row));
    }

    if (request.method === 'PUT') {
      const payload = request.body;
      if (payload && typeof payload === 'object' &&
          OWNER_FIELDS.some((key) => Object.hasOwn(payload, key))) {
        return response.status(403).json({ error: 'OWNER_CHANGE_FORBIDDEN' });
      }
      const memo = parseMemo(payload);
      if (!memo) return response.status(400).json({ error: 'INVALID_MEMO' });

      // 보내는 값은 title, body 뿐입니다. owner_id 는 절대 보내지 않습니다.
      const upstream = await ctx.rest(`memos?select=id,owner_id,title,body&${where}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ title: memo.title, body: memo.body }),
      });
      if (!upstream.ok) return unavailable();
      const row = mine(await upstream.json());
      if (!row) return notFound();
      return response.status(200).json(view(row));
    }

    // DELETE: 본인 행만 지웁니다.
    const upstream = await ctx.rest(`memos?select=id,owner_id&${where}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!upstream.ok) return unavailable();
    if (!mine(await upstream.json())) return notFound();
    return response.status(204).end();
  } catch {
    return unavailable();
  }
}
