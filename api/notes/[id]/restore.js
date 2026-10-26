import { isInstructor } from '../../../src/instructors.mjs';
import { memosContext } from '../../../src/memos.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../../src/resource-id.mjs';
import { restoreNote } from '../../../src/note-restore.mjs';
import { NOTE_RESTORE_TARGET } from '../../../src/note-restore-target.mjs';

// POST /api/notes/:id/restore: restore one private copy of a public virtual notice.
// Requires an authenticated instructor; only the configured unowned notice is eligible.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireResourceId(request, response, RESOURCE_IDS.instructorAnnouncements)) return;
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const context = await memosContext(request, response, ['POST']);
  if (!context) return;

  try {
    const instructor = await isInstructor(context.rest, context.userId);
    if (!instructor) return response.status(403).json({ error: 'INSTRUCTOR_REQUIRED' });
  } catch {
    return response.status(502).json({ error: 'INSTRUCTOR_SERVICE_UNAVAILABLE' });
  }

  const audit = (event) => console.log(JSON.stringify({ type: 'note_restore_audit', ...event }));
  try {
    const result = await restoreNote({
      rest: context.rest,
      id: request.query?.id,
      body: request.body,
      target: NOTE_RESTORE_TARGET,
      audit,
    });
    return response.status(result.status).json(result.json);
  } catch {
    audit({ at: new Date().toISOString(), outcome: 'error', actorId: context.userId });
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
