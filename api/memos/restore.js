import { createHash } from 'node:crypto';
import { memosContext, isUuid } from '../../src/memos.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../src/resource-id.mjs';

const TEST_B_MEMO_ID = '00000000-0000-4000-8000-00000000b001';
const SNAPSHOT_KEYS = ['id', 'owner_id', 'title', 'body', 'contentSha256'];

function contentHash(title, body) {
  return createHash('sha256')
    .update(JSON.stringify({ title, body }), 'utf8')
    .digest('hex');
}

function validSnapshot(snapshot, userId) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    || Object.keys(snapshot).length !== SNAPSHOT_KEYS.length
    || SNAPSHOT_KEYS.some((key) => !Object.hasOwn(snapshot, key))) return false;
  if (
    snapshot.id !== TEST_B_MEMO_ID
    || !isUuid(snapshot.owner_id)
    || snapshot.owner_id !== userId
    || typeof snapshot.title !== 'string'
    || !snapshot.title.trim()
    || snapshot.title.length > 200
    || typeof snapshot.body !== 'string'
    || snapshot.body.length > 5000
    || typeof snapshot.contentSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(snapshot.contentSha256)
  ) return false;
  return contentHash(snapshot.title, snapshot.body) === snapshot.contentSha256;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireResourceId(request, response, RESOURCE_IDS.personalMemos)) return;

  const ctx = await memosContext(request, response, ['POST']);
  if (!ctx) return;
  if (!validSnapshot(request.body?.snapshot, ctx.userId)) {
    return response.status(400).json({ error: 'INVALID_MEMO_SNAPSHOT' });
  }

  const { id, owner_id: ownerId, title, body } = request.body.snapshot;
  const where = `id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(ownerId)}`;
  const filter = `?select=id,owner_id,title,body&${where}`;

  try {
    const current = await ctx.rest(`memos${filter}`);
    if (!current.ok) return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
    const currentRows = await current.json();
    if (!Array.isArray(currentRows)
      || !currentRows.some((row) => row?.id === id && row?.owner_id === ownerId)) {
      return response.status(404).json({ error: 'NOT_FOUND' });
    }

    const restored = await ctx.rest(`memos${filter}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ title, body }),
    });
    if (!restored.ok) return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
    const rows = await restored.json();
    const row = Array.isArray(rows)
      ? rows.find((candidate) => candidate?.id === id && candidate?.owner_id === ownerId)
      : undefined;
    if (!row || row.title !== title || row.body !== body
      || contentHash(row.title, row.body) !== request.body.snapshot.contentSha256) {
      return response.status(502).json({ error: 'MEMO_RESTORE_VERIFICATION_FAILED' });
    }

    return response.status(200).json({
      id: row.id,
      owner_id: row.owner_id,
      contentSha256: request.body.snapshot.contentSha256,
    });
  } catch {
    return response.status(502).json({ error: 'MEMOS_SERVICE_UNAVAILABLE' });
  }
}
