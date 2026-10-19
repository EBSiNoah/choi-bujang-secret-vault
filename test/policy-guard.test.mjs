import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/policy-guard.mjs', import.meta.url));
const safeRule = "// SAFE RULE\nexport const RULE = 'safe';\n";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'policy-guard-test-'));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'supabase/migrations'), { recursive: true });
  writeFileSync(path.join(root, 'src/decider.mjs'), safeRule);
  writeFileSync(path.join(root, 'aleph.config.json'), '{"allowedRoutes":[{"method":"GET","path":"/safe"}]}\n');
  // Migration is intentionally extensionless: database policy snapshots must include it too.
  writeFileSync(path.join(root, 'supabase/migrations/20261017000000_policy'), '-- test DB policy\n');
  writeFileSync(path.join(root, 'supabase/migrations/20261018000000_policy.sql'), '-- another test DB policy\n');
  return root;
}

function run(root, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function confirmation(output, label) {
  const match = output.match(new RegExp(`${label}: ([a-f0-9]{64})`));
  assert.ok(match, `confirmation value missing from:\n${output}`);
  return match[1];
}

function makeSnapshot(root) {
  const preview = run(root, 'snapshot');
  assert.equal(preview.status, 0, preview.output);
  const version = confirmation(preview.output, '사본 버전 / 확인값');
  assert.match(preview.output, /20261017000000_policy/u);
  assert.match(preview.output, /20261018000000_policy\.sql/u);
  assert.match(preview.output, /src\/decider\.mjs/u);
  assert.match(preview.output, /aleph\.config\.json/u);
  assert.match(preview.output, /미리보기만 했습니다/u);
  assert.equal(run(root, 'snapshot', '--confirm', version).status, 0);
  return version;
}

test('previews policy version and full scope, then stores and verifies all policy files', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const preview = run(root, 'snapshot');
  assert.equal(preview.status, 0, preview.output);
  const version = confirmation(preview.output, '사본 버전 / 확인값');
  assert.match(preview.output, /변경 범위: 정책 파일 4개/u);
  assert.equal(run(root, 'verify').status, 1, 'verification must stop before a snapshot exists');
  assert.equal(run(root, 'snapshot', '--confirm', '0'.repeat(64)).status, 1);

  const saved = run(root, 'snapshot', '--confirm', version);
  assert.equal(saved.status, 0, saved.output);
  const verified = run(root, 'verify');
  assert.equal(verified.status, 0, verified.output);
  assert.match(verified.output, new RegExp(version));
  assert.match(verified.output, /안전 사본 검증 통과/u);
  assert.equal(run(root, 'snapshot', '--confirm', version).status, 1, 'existing snapshot must not be overwritten');
});

test('requires a verified snapshot and stops when a saved file hash is tampered with', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const missing = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', "export const RULE = 'intruded';");
  assert.equal(missing.status, 1);
  assert.match(missing.output, /\.policy-guard 폴더가 없습니다/u);

  makeSnapshot(root);
  const copy = path.join(root, '.policy-guard/safe/files/src/decider.mjs');
  writeFileSync(copy, '// tampered\n');
  const blocked = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', "export const RULE = 'intruded';");
  assert.equal(blocked.status, 1);
  assert.match(blocked.output, /해시가 맞지 않습니다: src\/decider\.mjs/u);
});

test('shows exact one-line scope before confirmation and diffs only the isolated test copy', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const version = makeSnapshot(root);
  const originalLive = readFileSync(path.join(root, 'src/decider.mjs'), 'utf8');
  const replacement = "export const RULE = 'intruded';";

  const preview = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', replacement);
  assert.equal(preview.status, 0, preview.output);
  assert.match(preview.output, new RegExp(version));
  assert.match(preview.output, /파일 1개 \/ 규칙 줄 1개/u);
  assert.ok(preview.output.includes('- export const RULE = \'safe\';'));
  assert.ok(preview.output.includes(`+ ${replacement}`));
  assert.match(preview.output, /미리보기만 했습니다/u);
  assert.equal(run(root, 'diff').status, 1, 'a preview alone must not create a test copy');
  assert.equal(readFileSync(path.join(root, 'src/decider.mjs'), 'utf8'), originalLive);

  const changeConfirmation = confirmation(preview.output, '변경 확인값');
  const saved = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', replacement, '--confirm', changeConfirmation);
  assert.equal(saved.status, 0, saved.output);
  const diff = run(root, 'diff');
  assert.equal(diff.status, 0, diff.output);
  assert.match(diff.output, /변경 범위: 파일 1개 \/ 줄 1개/u);
  assert.match(diff.output, /- 2: export const RULE = 'safe';/u);
  assert.match(diff.output, /\+ 2: export const RULE = 'intruded';/u);
  assert.equal(readFileSync(path.join(root, 'src/decider.mjs'), 'utf8'), originalLive, 'live policy stays unchanged');
});

test('rejects multi-line replacements and refuses to overwrite a test copy', (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  makeSnapshot(root);

  const multiLine = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', 'first\nsecond');
  assert.equal(multiLine.status, 1);
  assert.match(multiLine.output, /줄바꿈 없는 한 줄/u);

  const preview = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', "export const RULE = 'intruded';");
  const token = confirmation(preview.output, '변경 확인값');
  assert.equal(run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', "export const RULE = 'intruded';", '--confirm', token).status, 0);
  const second = run(root, 'simulate', '--file', 'src/decider.mjs', '--line', '2', '--to', "export const RULE = 'different';");
  assert.equal(second.status, 1);
  assert.match(second.output, /기존 시험용 사본은 덮어쓰지 않습니다/u);
});
