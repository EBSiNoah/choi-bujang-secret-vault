import assert from 'node:assert/strict';
import { test } from 'node:test';
import notesHandler from '../api/notes.js';
import memosHandler from '../api/memos/index.js';
import memoHandler from '../api/memos/[id].js';
import { RESOURCE_IDS } from '../src/resource-id.mjs';

function mockResponse() {
  const headers = new Map();
  const response = {
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
  return response;
}

const protectedHandlers = [
  {
    name: 'instructor announcements',
    handler: notesHandler,
    expectedResourceId: RESOURCE_IDS.instructorAnnouncements,
    otherResourceId: RESOURCE_IDS.personalMemos,
  },
  {
    name: 'memo collection',
    handler: memosHandler,
    expectedResourceId: RESOURCE_IDS.personalMemos,
    otherResourceId: RESOURCE_IDS.instructorAnnouncements,
  },
  {
    name: 'individual memo',
    handler: memoHandler,
    expectedResourceId: RESOURCE_IDS.personalMemos,
    otherResourceId: RESOURCE_IDS.instructorAnnouncements,
  },
];

for (const { name, handler, expectedResourceId, otherResourceId } of protectedHandlers) {
  test(`${name} requires its own resource ID`, async () => {
    for (const [headers, expectedError] of [
      [{}, 'RESOURCE_ID_REQUIRED'],
      [{ 'x-resource-id': 'other-resource-v1' }, 'RESOURCE_ID_MISMATCH'],
      [{ 'x-resource-id': otherResourceId }, 'RESOURCE_ID_MISMATCH'],
    ]) {
      const response = mockResponse();
      await handler({ method: 'GET', headers, query: { id: 'memo-id' } }, response);

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.body, { error: expectedError });
      assert.equal(response.headers.get('x-resource-id'), expectedResourceId);
    }
  });

  test(`${name} accepts its matching resource ID`, async () => {
    const response = mockResponse();
    await handler({
      method: 'PATCH',
      headers: { 'x-resource-id': expectedResourceId },
      query: { id: 'memo-id' },
    }, response);

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.get('x-resource-id'), expectedResourceId);
  });
}

test('memo and instructor announcement resource IDs are distinct', () => {
  assert.notEqual(
    RESOURCE_IDS.instructorAnnouncements,
    RESOURCE_IDS.personalMemos,
  );
});
