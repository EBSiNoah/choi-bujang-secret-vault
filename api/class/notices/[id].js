import { isUuid, memosContext } from '../../../src/memos.mjs';
import { isInstructor } from '../../../src/instructors.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../../src/resource-id.mjs';

function parseNote(body) {
  if (!body || typeof body !== 'object') return null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200
      || typeof body.content !== 'string' || body.content.length > 5000) {
    return null;
  }
  return { title, content: body.content };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireResourceId(request, response, RESOURCE_IDS.instructorAnnouncements)) return;

  if (!['GET', 'PUT'].includes(request.method)) {
    response.setHeader('Allow', 'GET, PUT');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await memosContext(request, response, ['GET', 'PUT']);
  if (!ctx) return;

  const id = request.query?.id;
  if (!isUuid(id)) return response.status(404).json({ error: 'NOT_FOUND' });

  const where = `id=eq.${encodeURIComponent(id)}&owner_id=is.null`;
  const unavailable = () => response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });

  try {
    if (request.method === 'GET') {
      const upstream = await ctx.rest(
        `training_notes?select=id,owner_id,title,content&${where}`,
      );
      if (!upstream.ok) return unavailable();
      const rows = await upstream.json();
      const note = Array.isArray(rows)
        ? rows.find((row) => row?.id === id && row?.owner_id === null) : null;
      if (!note) return response.status(404).json({ error: 'NOT_FOUND' });
      if (typeof note.title !== 'string' || typeof note.content !== 'string') {
        return unavailable();
      }
      return response.status(200).json({
        id: note.id,
        title: note.title,
        content: note.content,
      });
    }

    const note = parseNote(request.body);
    if (!note) return response.status(400).json({ error: 'INVALID_NOTE' });

    let instructor;
    try {
      instructor = await isInstructor(ctx.rest, ctx.userId);
    } catch {
      return response.status(502).json({ error: 'INSTRUCTOR_SERVICE_UNAVAILABLE' });
    }
    if (!instructor) {
      return response.status(403).json({ error: 'INSTRUCTOR_REQUIRED' });
    }

    const upstream = await ctx.rest(
      `training_notes?select=id,owner_id,title,content&${where}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(note),
      },
    );
    if (!upstream.ok) return unavailable();
    const rows = await upstream.json();
    const updated = Array.isArray(rows)
      ? rows.find((row) => row?.id === id && row?.owner_id === null) : null;
    if (!updated) return response.status(404).json({ error: 'NOT_FOUND' });
    if (typeof updated.title !== 'string' || typeof updated.content !== 'string') {
      return unavailable();
    }
    return response.status(200).json({
      id: updated.id,
      title: updated.title,
      content: updated.content,
    });
  } catch {
    return unavailable();
  }
}