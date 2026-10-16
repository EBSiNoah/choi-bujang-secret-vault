import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import notesHandler from '../api/class/notices.js';
import noteHandler from '../api/class/notices/[id].js';
import memosHandler from '../api/memos/index.js';
import memoHandler from '../api/memos/[id].js';
import config from '../aleph.config.json' with { type: 'json' };
import { RESOURCE_IDS } from '../src/resource-id.mjs';

const userId = '22222222-2222-4222-8222-222222222222';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const memoId = '44444444-4444-4444-8444-444444444444';
const noteId = '55555555-5555-4555-8555-555555555555';

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: undefined,
    body: undefined,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test('resource APIs enforce stored memo ownership and instructor membership', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'resource-authorization-test-key';
  jwk.alg = 'ES256';
  jwk.use = 'sig';

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    aleph_run: '11111111-1111-4111-8111-111111111111',
    aleph_role: 'judge',
    aleph_identity: 'a',
  })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
    .setIssuer(config.judgeIssuer)
    .setAudience(new URL(config.publicAppUrl).hostname)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);

  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSecretKey = process.env.SUPABASE_SECRET_KEY;
  let includePrivateAnnouncement = false;
  let instructorLookup;
  let createdMemo;
  let noteWriteAttempted = false;
  process.env.SUPABASE_URL = 'https://resource-authorization-test.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder-secret';
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    let body;

    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      body = { keys: [jwk] };
    } else if (url.pathname === '/rest/v1/memos'
        && url.searchParams.get('select') === 'id,owner_id,title,body'
        && url.searchParams.has('order')) {
      body = [
        { id: memoId, owner_id: userId, title: 'My memo', body: 'Mine' },
        { id: '66666666-6666-4666-8666-666666666666', owner_id: otherUserId,
          title: 'Other memo', body: 'Must not be returned' },
      ];
    } else if (url.pathname === '/rest/v1/memos'
        && url.searchParams.has('id')
        && url.searchParams.get('select') === 'id,owner_id,title,body') {
      body = [{ id: memoId, owner_id: otherUserId, title: 'Other memo', body: 'Private' }];
    } else if (url.pathname === '/rest/v1/memos' && init.method === 'POST') {
      createdMemo = JSON.parse(init.body);
      return new Response(null, { status: 201 });
    } else if (url.pathname === '/rest/v1/training_notes'
        && url.searchParams.has('id')) {
      body = url.searchParams.get('id') === `eq.${noteId}`
        ? [{ id: noteId, owner_id: null, title: 'Class notice', content: 'Single notice' }]
        : [{
          id: memoId,
          owner_id: userId,
          title: 'Private memo',
          content: 'Must not be returned as a class notice',
        }];
    } else if (url.pathname === '/rest/v1/training_notes'
        && init.method === 'PATCH') {
      noteWriteAttempted = true;
      body = [];
    } else if (url.pathname === '/rest/v1/training_notes') {
      body = [{ id: noteId, owner_id: null, title: 'Class notice', content: 'Public notice' }];
      if (includePrivateAnnouncement) {
        body.push({
          id: memoId,
          owner_id: userId,
          title: 'Private memo',
          content: 'Must not be returned',
        });
      }
    } else if (url.pathname === '/rest/v1/instructors') {
      instructorLookup = url.searchParams.get('user_id');
      body = [];
    } else {
      throw new Error(`Unexpected test fetch URL: ${url}`);
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const headers = (resourceId) => ({
    authorization: `Bearer ${token}`,
    'x-resource-id': resourceId,
  });

  try {
    const memoListResponse = mockResponse();
    await memosHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.personalMemos),
      query: {},
      body: { role: 'instructor', userId: otherUserId },
    }, memoListResponse);
    assert.equal(memoListResponse.statusCode, 200);
    assert.deepEqual(memoListResponse.body, [
      { id: memoId, title: 'My memo', body: 'Mine' },
    ]);

    const createMemoResponse = mockResponse();
    await memosHandler({
      method: 'POST',
      headers: headers(RESOURCE_IDS.personalMemos),
      body: {
        title: 'New memo',
        body: 'Saved only for the verified user',
        owner_id: otherUserId,
        role: 'instructor',
        userId: otherUserId,
      },
    }, createMemoResponse);
    assert.equal(createMemoResponse.statusCode, 201);
    assert.equal(createdMemo.owner_id, userId);
    assert.equal(Object.hasOwn(createdMemo, 'role'), false);

    const otherMemoResponse = mockResponse();
    await memoHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.personalMemos),
      query: { id: memoId },
      body: { role: 'instructor', userId: otherUserId },
    }, otherMemoResponse);
    assert.equal(otherMemoResponse.statusCode, 404);
    assert.deepEqual(otherMemoResponse.body, { error: 'NOT_FOUND' });

    const notesResponse = mockResponse();
    await notesHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.instructorAnnouncements),
    }, notesResponse);
    assert.equal(notesResponse.statusCode, 200);
    assert.deepEqual(notesResponse.body, {
      notes: [{ title: 'Class notice', content: 'Public notice' }],
    });

    const singleNoteResponse = mockResponse();
    await noteHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.instructorAnnouncements),
      query: { id: noteId },
    }, singleNoteResponse);
    assert.equal(singleNoteResponse.statusCode, 200);
    assert.deepEqual(singleNoteResponse.body, {
      id: noteId,
      title: 'Class notice',
      content: 'Single notice',
    });

    const privateNoteResponse = mockResponse();
    await noteHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.instructorAnnouncements),
      query: { id: memoId },
    }, privateNoteResponse);
    assert.equal(privateNoteResponse.statusCode, 404);
    assert.deepEqual(privateNoteResponse.body, { error: 'NOT_FOUND' });

    includePrivateAnnouncement = true;
    const mixedNotesResponse = mockResponse();
    await notesHandler({
      method: 'GET',
      headers: headers(RESOURCE_IDS.instructorAnnouncements),
    }, mixedNotesResponse);
    assert.equal(mixedNotesResponse.statusCode, 502);
    assert.deepEqual(mixedNotesResponse.body, { error: 'INVALID_NOTES_RESPONSE' });

    const unauthorizedWriteResponse = mockResponse();
    await noteHandler({
      method: 'PUT',
      headers: headers(RESOURCE_IDS.instructorAnnouncements),
      query: { id: noteId },
      body: { title: 'Forged role', content: 'No write', role: 'instructor' },
    }, unauthorizedWriteResponse);
    assert.equal(instructorLookup, `eq.${userId}`);
    assert.equal(unauthorizedWriteResponse.statusCode, 403);
    assert.deepEqual(unauthorizedWriteResponse.body, { error: 'INSTRUCTOR_REQUIRED' });
    assert.equal(noteWriteAttempted, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalSecretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecretKey;
  }
});
