import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isInstructor } from '../src/instructors.mjs';
import { selectOwnedMemos } from '../src/memos.mjs';

const userId = '00000000-0000-4000-8000-000000000001';

test('instructor authorization matches the verified user against stored membership', async () => {
  let requested;
  const result = await isInstructor(async (path) => {
    requested = path;
    return new Response(JSON.stringify([{ user_id: userId }]), { status: 200 });
  }, userId);

  assert.equal(requested, `instructors?select=user_id&user_id=eq.${userId}`);
  assert.equal(result, true);
});

test('a missing or different stored instructor is not authorized', async () => {
  assert.equal(await isInstructor(async () =>
    new Response(JSON.stringify([]), { status: 200 }), userId), false);
  assert.equal(await isInstructor(async () =>
    new Response(JSON.stringify([{ user_id: 'another-user' }]), { status: 200 }), userId), false);
});

test('instructor lookup failures are surfaced', async () => {
  await assert.rejects(
    isInstructor(async () => new Response('', { status: 500 }), userId),
    { message: 'INSTRUCTOR_SERVICE_UNAVAILABLE' },
  );
  await assert.rejects(
    isInstructor(async () => new Response('invalid', { status: 200 }), userId),
  );
});

test('memo lists are checked against stored owner IDs before returning rows', () => {
  const otherUserId = '00000000-0000-4000-8000-000000000002';
  const rows = [
    { id: 'memo-1', owner_id: userId, title: 'Mine', body: 'mine' },
    { id: 'memo-2', owner_id: otherUserId, title: 'Other', body: 'private' },
  ];

  assert.deepEqual(selectOwnedMemos(rows, userId), [
    { id: 'memo-1', title: 'Mine', body: 'mine' },
  ]);
  assert.equal(selectOwnedMemos({}, userId), null);
  assert.equal(selectOwnedMemos([
    { id: 'memo-1', owner_id: userId, title: 1, body: 'invalid' },
  ], userId), null);
});
