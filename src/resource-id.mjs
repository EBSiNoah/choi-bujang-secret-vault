export const RESOURCE_IDS = Object.freeze({
  instructorAnnouncements: 'instructor-announcements-v1',
  personalMemos: 'personal-memos-v1',
});

export function requireResourceId(request, response, expectedResourceId) {
  response.setHeader('X-Resource-ID', expectedResourceId);

  const receivedResourceId = request.headers?.['x-resource-id'];
  if (receivedResourceId === expectedResourceId) return true;

  response.status(400).json({
    error: receivedResourceId === undefined
      ? 'RESOURCE_ID_REQUIRED'
      : 'RESOURCE_ID_MISMATCH',
  });
  return false;
}
