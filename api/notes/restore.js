// Legacy static path `/api/notes/restore` is intentionally disabled.
// Use the scoped dynamic endpoint `/api/notes/:id/restore` instead.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(404).json({ error: 'NOT_FOUND' });
}
