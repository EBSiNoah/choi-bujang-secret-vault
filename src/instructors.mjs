export async function isInstructor(rest, userId) {
  const response = await rest(
    `instructors?select=user_id&user_id=eq.${encodeURIComponent(userId)}`,
  );
  if (!response.ok) throw new Error('INSTRUCTOR_SERVICE_UNAVAILABLE');

  const rows = await response.json();
  if (!Array.isArray(rows) ||
      rows.some((row) => !row || typeof row.user_id !== 'string')) {
    throw new Error('INSTRUCTOR_SERVICE_UNAVAILABLE');
  }

  return rows.some((row) => row.user_id === userId);
}
