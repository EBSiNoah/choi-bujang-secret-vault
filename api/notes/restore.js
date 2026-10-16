import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { memosContext } from '../../src/memos.mjs';
import { isInstructor } from '../../src/instructors.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../src/resource-id.mjs';

const config = JSON.parse(
  readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'),
);
const ROUTE = { method: 'POST', path: '/api/notes/restore' };
const RESTORABLE_NOTE_IDS = new Set([
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
]);
const SNAPSHOT_KEYS = ['id', 'owner_id', 'title', 'content', 'contentSha256'];

function routeIsConfigured() {
  return Array.isArray(config.restoreRoute)
    && config.restoreRoute.some(({ method, path }) => method === ROUTE.method && path === ROUTE.path);
}

function contentHash(title, content) {
  return createHash('sha256')
    .update(JSON.stringify({ title, content }), 'utf8')
    .digest('hex');
}

function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
    || Object.keys(snapshot).length !== SNAPSHOT_KEYS.length
    || SNAPSHOT_KEYS.some((key) => !Object.hasOwn(snapshot, key))) return false;
  if (
    !RESTORABLE_NOTE_IDS.has(snapshot.id)
    || snapshot.owner_id !== null
    || typeof snapshot.title !== 'string'
    || !snapshot.title.trim()
    || snapshot.title.length > 200
    || typeof snapshot.content !== 'string'
    || snapshot.content.length > 5000
    || typeof snapshot.contentSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(snapshot.contentSha256)
  ) return false;
  return contentHash(snapshot.title, snapshot.content) === snapshot.contentSha256;
}

function responseError(response, status, error) {
  return response.status(status).json({ error });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!routeIsConfigured()) return responseError(response, 500, 'RESTORE_ROUTE_NOT_CONFIGURED');
  if (!requireResourceId(request, response, RESOURCE_IDS.instructorAnnouncements)) return;

  const ctx = await memosContext(request, response, ['POST']);
  if (!ctx) return;

  const snapshot = request.body?.snapshot;
  if (!validSnapshot(snapshot)) return responseError(response, 400, 'INVALID_NOTE_SNAPSHOT');

  let instructor;
  try {
    instructor = await isInstructor(ctx.rest, ctx.userId);
  } catch {
    return responseError(response, 502, 'INSTRUCTOR_SERVICE_UNAVAILABLE');
  }
  if (!instructor) return responseError(response, 403, 'INSTRUCTOR_REQUIRED');

  const where = `id=eq.${encodeURIComponent(snapshot.id)}&owner_id=is.null`;
  const query = `training_notes?select=id,owner_id,title,content&${where}`;

  try {
    const current = await ctx.rest(query);
    if (!current.ok) return responseError(response, 502, 'NOTES_SERVICE_UNAVAILABLE');
    const currentRows = await current.json();
    const existing = Array.isArray(currentRows)
      ? currentRows.find((row) => row?.id === snapshot.id && row?.owner_id === null)
      : undefined;
    if (!existing) return responseError(response, 404, 'NOT_FOUND');

    const restored = await ctx.rest(query, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ title: snapshot.title, content: snapshot.content }),
    });
    if (!restored.ok) return responseError(response, 502, 'NOTES_SERVICE_UNAVAILABLE');
    const rows = await restored.json();
    const note = Array.isArray(rows)
      ? rows.find((row) => row?.id === snapshot.id && row?.owner_id === null)
      : undefined;
    if (!note || note.title !== snapshot.title || note.content !== snapshot.content
      || contentHash(note.title, note.content) !== snapshot.contentSha256) {
      return responseError(response, 502, 'NOTE_RESTORE_VERIFICATION_FAILED');
    }

    return response.status(200).json({
      id: note.id,
      owner_id: note.owner_id,
      contentSha256: snapshot.contentSha256,
    });
  } catch {
    return responseError(response, 502, 'NOTES_SERVICE_UNAVAILABLE');
  }
}