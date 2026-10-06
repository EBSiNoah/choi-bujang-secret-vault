import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 1,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 1,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('attack check reads the public notes API without credentials', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let options;

  try {
    globalThis.fetch = async (url, init) => {
      requestUrl = String(url);
      options = init;

      return new Response(
        JSON.stringify({
          notes: [
            { title: '가상', content: '테스트용 본문' },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    };

    const [result] = await runAttackChecks(config);

    assert.equal(
      requestUrl,
      'https://student-defense.vercel.app/api/notes'
    );
    assert.equal(options.redirect, 'error');
    assert.equal('headers' in options, false);
    assert.match(result.observed, /메모 1건을 반환/u);

    globalThis.fetch = async () =>
      new Response('not JSON', { status: 200 });

    const [failed] = await runAttackChecks(config);
    assert.match(failed.observed, /메모를 확인하지 못함/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
