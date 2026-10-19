#!/usr/bin/env node
// 로컬 안전 정책 사본과 격리된 1줄 시험 변경을 관리합니다.
// 저장소 루트에서 실행:
//   node scripts/policy-guard.mjs snapshot
//   node scripts/policy-guard.mjs snapshot --confirm <미리보기의 확인값>
//   node scripts/policy-guard.mjs verify
//   node scripts/policy-guard.mjs simulate --file src/decider.mjs --line 5 --to "새 규칙 줄"
//   node scripts/policy-guard.mjs simulate --file src/decider.mjs --line 5 --to "새 규칙 줄" --confirm <미리보기의 확인값>
//   node scripts/policy-guard.mjs diff
//
// 모든 쓰기는 .policy-guard/ 안에서만 합니다. 실제 정책 파일은 읽기 전용입니다.
// 사본/시험본은 덮어쓰지 않으며, 기록된 해시가 맞지 않으면 중단합니다.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_NAME = '.policy-guard';
const GUARD = path.join(ROOT, GUARD_NAME);
const SAFE = path.join(GUARD, 'safe');
const SIM = path.join(GUARD, 'sim');
const SOURCES = ['src/decider.mjs', 'aleph.config.json'];
const DB_DIR = 'supabase/migrations';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
const die = (msg) => { console.error(`\n중단: ${msg}`); process.exit(1); };
const exists = (p) => { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--confirm') {
      if (argv[i + 1] === undefined) die('--confirm 뒤에 미리보기의 확인값이 필요합니다.');
      out.confirm = argv[++i];
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (!['file', 'line', 'to'].includes(key)) die(`알 수 없는 옵션입니다: ${arg}`);
      if (argv[i + 1] === undefined) die(`${arg} 뒤에 값이 필요합니다.`);
      out[key] = argv[++i];
    } else out._.push(arg);
  }
  return out;
}

// 저장소 내부의 정규 상대 경로만 허용하고 보호 폴더를 입력 경로에서 제외합니다.
function safeRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || path.isAbsolute(rel)) {
    die(`허용되지 않는 상대 경로입니다: ${String(rel)}`);
  }
  const abs = path.resolve(ROOT, rel);
  const relative = path.relative(ROOT, abs);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    die(`저장소 바깥 경로입니다: ${rel}`);
  }
  const normalized = posix(relative);
  if (normalized !== posix(rel)
      || normalized === GUARD_NAME || normalized.startsWith(`${GUARD_NAME}/`)) {
    die(`정규 정책 파일 경로가 아닙니다: ${rel}`);
  }
  return normalized;
}

function assertDirectory(abs, label) {
  let stat;
  try { stat = fs.lstatSync(abs); } catch { die(`${label} 폴더가 없습니다.`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) die(`${label}은 심볼릭 링크가 아닌 폴더여야 합니다.`);
}

function assertRegularFile(abs, label) {
  let stat;
  try { stat = fs.lstatSync(abs); } catch { die(`파일이 없습니다: ${label}`); }
  if (!stat.isFile() || stat.isSymbolicLink()) die(`일반 파일이 아닙니다: ${label}`);
}

function ensureGuardRoot() {
  if (exists(GUARD)) assertDirectory(GUARD, GUARD_NAME);
  else fs.mkdirSync(GUARD);
}

function assertNoSymlinkPath(base, relative, label) {
  let cursor = base;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch { die(`사본 경로가 없습니다: ${label}`); }
    if (stat.isSymbolicLink()) die(`사본 경로에 심볼릭 링크가 있습니다: ${label}`);
    if (i < parts.length - 1 && !stat.isDirectory()) die(`사본 경로가 폴더가 아닙니다: ${label}`);
    if (i === parts.length - 1 && !stat.isFile()) die(`사본 경로가 일반 파일이 아닙니다: ${label}`);
  }
  return cursor;
}

function livePolicyPaths() {
  const dbAbs = path.join(ROOT, DB_DIR);
  assertDirectory(dbAbs, DB_DIR);
  const entries = fs.readdirSync(dbAbs, { withFileTypes: true });
  if (entries.length === 0) die(`${DB_DIR} 안에 DB 정책 마이그레이션이 없습니다.`);
  const migrations = [];
  for (const entry of entries) {
    const rel = `${DB_DIR}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isFile()) {
      die(`마이그레이션은 링크나 하위 폴더가 아닌 일반 파일이어야 합니다: ${rel}`);
    }
    migrations.push(rel);
  }
  return [...SOURCES, ...migrations].map(safeRel).sort();
}

function isPolicyPath(rel) {
  return SOURCES.includes(rel)
    || (rel.startsWith(`${DB_DIR}/`) && rel.slice(DB_DIR.length + 1).length > 0
      && !rel.slice(DB_DIR.length + 1).includes('/'));
}

function collectLive() {
  const paths = livePolicyPaths();
  return paths.map((rel) => {
    const abs = path.join(ROOT, rel);
    assertRegularFile(abs, rel);
    const buf = fs.readFileSync(abs);
    return { path: rel, sha256: sha(buf), bytes: buf.length, buf };
  });
}

const versionId = (files) => sha(JSON.stringify(
  files.map(({ path: rel, sha256 }) => ({ path: rel, sha256 })),
));

function gitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

function printFiles(files) {
  for (const file of files) {
    console.log(`  ${file.sha256}  ${String(file.bytes).padStart(6)}B  ${file.path}`);
  }
}

function listTreeFiles(root, relative = '') {
  const abs = relative ? path.join(root, ...relative.split('/')) : root;
  assertDirectory(abs, relative || '사본 파일');
  const found = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbs = path.join(abs, entry.name);
    if (entry.isSymbolicLink()) die(`사본에 심볼릭 링크가 있습니다: ${child}`);
    if (entry.isDirectory()) found.push(...listTreeFiles(root, child));
    else if (entry.isFile()) found.push(child);
    else die(`사본에 지원하지 않는 파일 형식이 있습니다: ${child}`);
  }
  return found.sort();
}

function readSafeFile(rel) {
  const abs = assertNoSymlinkPath(SAFE, `files/${rel}`, rel);
  return fs.readFileSync(abs);
}

// 사본이 없거나 manifest, 파일별 해시, 전체 버전 해시 중 하나라도 맞지 않으면 중단합니다.
function verifySnapshot() {
  assertDirectory(GUARD, GUARD_NAME);
  assertDirectory(SAFE, '검증된 안전 사본');
  const manifestAbs = assertNoSymlinkPath(GUARD, 'safe/manifest.json', 'safe/manifest.json');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8')); }
  catch { die('safe/manifest.json 을 읽을 수 없습니다.'); }
  if (!Array.isArray(manifest.files) || manifest.files.length < SOURCES.length + 1) {
    die('manifest.json 에 전체 정책 파일 목록이 없습니다.');
  }
  if (typeof manifest.versionId !== 'string' || !/^[a-f0-9]{64}$/u.test(manifest.versionId)) {
    die('manifest.json 의 버전 해시 형식이 잘못됐습니다.');
  }

  const paths = [];
  const files = [];
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !isPolicyPath(entry.path)
        || safeRel(entry.path) !== entry.path
        || !/^[a-f0-9]{64}$/u.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
      die('manifest.json 의 파일 정보가 잘못됐습니다.');
    }
    if (paths.includes(entry.path)) die(`manifest.json 에 중복 경로가 있습니다: ${entry.path}`);
    paths.push(entry.path);
    const buf = readSafeFile(entry.path);
    if (buf.length !== entry.bytes) die(`사본 크기가 기록과 다릅니다: ${entry.path}`);
    const actualHash = sha(buf);
    if (actualHash !== entry.sha256) {
      die(`해시가 맞지 않습니다: ${entry.path}\n  기록 ${entry.sha256}\n  현재 ${actualHash}`);
    }
    files.push({ ...entry, buf });
  }
  const sortedPaths = [...paths].sort();
  if (JSON.stringify(paths) !== JSON.stringify(sortedPaths)) die('manifest.json 파일 목록이 정렬되지 않았습니다.');
  if (!SOURCES.every((rel) => paths.includes(rel))
      || !paths.some((rel) => rel.startsWith(`${DB_DIR}/`))) {
    die('사본에 판정기, 허용 경로 설정 또는 DB 정책 마이그레이션이 빠졌습니다.');
  }
  const actualTree = listTreeFiles(path.join(SAFE, 'files'));
  if (JSON.stringify(actualTree) !== JSON.stringify(paths)) {
    die('안전 사본의 실제 파일 목록이 manifest.json 과 다릅니다.');
  }
  if (versionId(files) !== manifest.versionId) die('사본 전체 버전 해시가 맞지 않습니다.');
  return { manifest, files };
}

function printSnapshotPlan(files, id, git) {
  console.log('[실행 전 확인] 안전 정책 사본');
  console.log(`  사본 버전 / 확인값: ${id}`);
  console.log(`  기준 커밋: ${git.commit ?? '(git 정보 없음)'}${git.dirty ? '  ※ 커밋되지 않은 변경 포함' : ''}`);
  console.log(`  변경 범위: 정책 파일 ${files.length}개를 새 사본으로 복사`);
  console.log(`  저장 위치: ${GUARD_NAME}/safe/ (운영 정책 파일은 읽기만 함)`);
  console.log('  대상과 SHA-256:');
  printFiles(files);
}

function writeTree(root, files) {
  for (const file of files) {
    const dest = path.join(root, 'files', ...file.path.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.buf, { flag: 'wx' });
  }
}

function cmdSnapshot(args) {
  const files = collectLive();
  const id = versionId(files);
  const git = gitInfo();
  printSnapshotPlan(files, id, git);
  if (exists(SAFE)) die('안전 사본이 이미 있습니다. 기존 사본은 덮어쓰지 않습니다.');
  if (args.confirm === undefined) {
    return console.log('\n미리보기만 했습니다. 내용을 확인한 뒤 같은 명령에 --confirm <사본 버전>을 붙이세요.');
  }
  if (args.confirm !== id) die('확인값이 현재 미리보기의 사본 버전과 다릅니다. 아무것도 쓰지 않았습니다.');

  ensureGuardRoot();
  if (exists(SAFE)) die('확인 후 안전 사본이 생겼습니다. 덮어쓰지 않고 중단합니다.');
  const fresh = collectLive();
  if (versionId(fresh) !== id) die('미리보기 뒤 정책 파일이 바뀌었습니다. 다시 미리보기 하세요.');
  const temp = fs.mkdtempSync(path.join(GUARD, '.safe-tmp-'));
  try {
    writeTree(temp, fresh);
    const manifest = {
      versionId: id,
      createdAt: new Date().toISOString(),
      gitCommit: git.commit,
      gitDirty: git.dirty,
      files: fresh.map(({ path: rel, sha256, bytes }) => ({ path: rel, sha256, bytes })),
    };
    fs.writeFileSync(path.join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temp, SAFE);
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    die(`안전 사본 생성에 실패했습니다: ${error.message}`);
  }
  console.log(`\n안전 사본을 만들었습니다. 버전 해시: ${id}`);
}

function cmdVerify() {
  const { manifest, files } = verifySnapshot();
  console.log('안전 사본 검증 통과');
  console.log(`  버전 해시: ${manifest.versionId}`);
  console.log(`  만든 시각: ${manifest.createdAt}  기준 커밋: ${manifest.gitCommit ?? '-'}`);
  printFiles(files);
  const drift = files.filter((file) => {
    const abs = path.join(ROOT, file.path);
    try { assertRegularFile(abs, file.path); return sha(fs.readFileSync(abs)) !== file.sha256; }
    catch { return true; }
  });
  console.log(drift.length
    ? `\n참고: 현재 정책 파일 ${drift.length}개가 사본과 다릅니다: ${drift.map((file) => file.path).join(', ')}`
    : '\n참고: 현재 정책 파일은 사본과 같습니다.');
}

function planId(baseVersionId, file, line, from, to) {
  return sha(JSON.stringify({ baseVersionId, file, line, from, to }));
}

function printSimulationPlan(manifest, rel, line, from, to, confirmation) {
  console.log('[실행 전 확인] 침공 흉내 — 시험용 사본만 변경');
  console.log(`  기준 안전 사본: ${manifest.versionId}`);
  console.log('  변경 범위: 파일 1개 / 규칙 줄 1개');
  console.log(`    파일: ${rel}  ${line}번째 줄`);
  console.log(`    - ${from}`);
  console.log(`    + ${to}`);
  console.log(`  저장 위치: ${GUARD_NAME}/sim/ (실제 정책 파일은 변경하지 않음)`);
  console.log(`  변경 확인값: ${confirmation}`);
}

function prepareSimulation(args, snapshot) {
  if (typeof args.file !== 'string' || args.line === undefined || typeof args.to !== 'string') {
    die('--file, --line, --to 가 모두 필요합니다.');
  }
  if (args.to.includes('\n') || args.to.includes('\r')) die('--to 는 줄바꿈 없는 한 줄이어야 합니다.');
  const rel = safeRel(args.file);
  const target = snapshot.files.find((file) => file.path === rel);
  if (!target) die(`사본에 없는 정책 파일입니다: ${rel}`);
  const text = target.buf.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(target.buf)) die(`UTF-8 텍스트 정책 파일이 아닙니다: ${rel}`);
  const lines = text.split('\n');
  const number = Number(args.line);
  if (!Number.isInteger(number) || number < 1 || number > lines.length) {
    die(`줄 번호는 1~${lines.length} 사이여야 합니다.`);
  }
  const from = lines[number - 1];
  if (from === args.to) die('바꿀 내용이 원래와 같습니다.');
  return { rel, number, from, to: args.to, lines };
}

function cmdSimulate(args) {
  const snapshot = verifySnapshot();
  const change = prepareSimulation(args, snapshot);
  const id = planId(snapshot.manifest.versionId, change.rel, change.number, change.from, change.to);
  printSimulationPlan(snapshot.manifest, change.rel, change.number, change.from, change.to, id);
  if (exists(SIM)) die('시험용 사본이 이미 있습니다. 기존 시험본은 덮어쓰지 않습니다.');
  if (args.confirm === undefined) {
    return console.log('\n미리보기만 했습니다. 변경을 확인한 뒤 같은 명령에 --confirm <변경 확인값>을 붙이세요.');
  }
  if (args.confirm !== id) die('확인값이 현재 변경 범위와 다릅니다. 아무것도 쓰지 않았습니다.');

  const fresh = verifySnapshot();
  if (fresh.manifest.versionId !== snapshot.manifest.versionId) die('확인 후 기준 사본이 바뀌었습니다. 중단합니다.');
  const freshChange = prepareSimulation(args, fresh);
  const freshId = planId(fresh.manifest.versionId, freshChange.rel, freshChange.number, freshChange.from, freshChange.to);
  if (freshId !== id) die('확인 후 변경 범위가 바뀌었습니다. 중단합니다.');
  ensureGuardRoot();
  if (exists(SIM)) die('확인 후 시험 사본이 생겼습니다. 덮어쓰지 않고 중단합니다.');

  const temp = fs.mkdtempSync(path.join(GUARD, '.sim-tmp-'));
  try {
    const simFiles = fresh.files.map((file) => {
      if (file.path !== freshChange.rel) return { ...file, buf: file.buf };
      const lines = [...freshChange.lines];
      lines[freshChange.number - 1] = freshChange.to;
      const buf = Buffer.from(lines.join('\n'), 'utf8');
      return { ...file, buf, sha256: sha(buf), bytes: buf.length };
    });
    writeTree(temp, simFiles);
    const simManifest = {
      baseVersionId: fresh.manifest.versionId,
      change: {
        file: freshChange.rel,
        line: freshChange.number,
        from: freshChange.from,
        to: freshChange.to,
      },
      files: simFiles.map(({ path: rel, sha256, bytes }) => ({ path: rel, sha256, bytes })),
    };
    fs.writeFileSync(path.join(temp, 'sim.json'), `${JSON.stringify(simManifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temp, SIM);
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    die(`시험용 사본 생성에 실패했습니다: ${error.message}`);
  }
  console.log('\n시험용 사본을 만들었습니다. 차이는 diff 로 확인하세요.');
}

function lineDiff(before, after) {
  const dp = Array.from({ length: before.length + 1 }, () => new Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++; }
    else if (i < before.length && (j === after.length || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ kind: '-', line: i + 1, text: before[i++] });
    } else result.push({ kind: '+', line: j + 1, text: after[j++] });
  }
  return result;
}

function readSimFile(rel) {
  const abs = assertNoSymlinkPath(SIM, `files/${rel}`, rel);
  return fs.readFileSync(abs);
}

function cmdDiff() {
  const snapshot = verifySnapshot();
  assertDirectory(SIM, '시험용 사본');
  const simPath = assertNoSymlinkPath(GUARD, 'sim/sim.json', 'sim/sim.json');
  let sim;
  try { sim = JSON.parse(fs.readFileSync(simPath, 'utf8')); }
  catch { die('sim/sim.json 을 읽을 수 없습니다.'); }
  if (sim.baseVersionId !== snapshot.manifest.versionId) {
    die('시험용 사본이 현재 검증된 안전 사본과 다른 버전에서 만들어졌습니다.');
  }
  if (!Array.isArray(sim.files) || sim.files.length !== snapshot.files.length) {
    die('시험용 사본 파일 목록이 안전 사본과 다릅니다.');
  }
  const actualSimPaths = listTreeFiles(path.join(SIM, 'files'));
  const expectedPaths = snapshot.files.map((file) => file.path);
  if (JSON.stringify(actualSimPaths) !== JSON.stringify(expectedPaths)) {
    die('시험용 사본의 실제 파일 목록이 기록과 다릅니다.');
  }
  const changed = [];
  for (let i = 0; i < sim.files.length; i++) {
    const entry = sim.files[i];
    const base = snapshot.files[i];
    if (!entry || entry.path !== base.path || !/^[a-f0-9]{64}$/u.test(entry.sha256)
        || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
      die('시험용 사본의 파일 기록이 안전 사본과 일치하지 않습니다.');
    }
    const buf = readSimFile(entry.path);
    if (buf.length !== entry.bytes || sha(buf) !== entry.sha256) {
      die(`시험용 사본의 해시가 기록과 맞지 않습니다: ${entry.path}`);
    }
    if (sha(buf) !== base.sha256) {
      const oldText = base.buf.toString('utf8');
      const newText = buf.toString('utf8');
      if (!Buffer.from(oldText).equals(base.buf) || !Buffer.from(newText).equals(buf)) {
        die(`시험용 변경이 UTF-8 텍스트가 아닙니다: ${entry.path}`);
      }
      changed.push({ file: entry.path, diff: lineDiff(oldText.split('\n'), newText.split('\n')) });
    }
  }
  if (!sim.change || Object.keys(sim.change).sort().join(',') !== 'file,from,line,to'
      || !Number.isInteger(sim.change.line) || typeof sim.change.file !== 'string'
      || typeof sim.change.from !== 'string' || typeof sim.change.to !== 'string') {
    die('시험용 변경 범위 기록이 잘못됐습니다.');
  }
  if (changed.length !== 1 || changed[0].file !== sim.change.file || changed[0].diff.length !== 2) {
    die('시험용 사본은 검증된 사본에 대해 정확히 한 파일의 한 줄만 바뀌어야 합니다.');
  }
  const [removed, added] = changed[0].diff;
  if (removed.kind !== '-' || added.kind !== '+' || removed.line !== sim.change.line
      || added.line !== sim.change.line || removed.text !== sim.change.from || added.text !== sim.change.to) {
    die('실제 시험용 차이가 기록된 한 줄 변경과 일치하지 않습니다.');
  }

  console.log(`비교 기준(검증된 안전 사본): ${snapshot.manifest.versionId}`);
  console.log('변경 범위: 파일 1개 / 줄 1개');
  console.log(`── ${changed[0].file}`);
  console.log(`  - ${removed.line}: ${removed.text}`);
  console.log(`  + ${added.line}: ${added.text}`);
}

const args = parseArgs(process.argv.slice(2));
const commands = { snapshot: cmdSnapshot, verify: cmdVerify, simulate: cmdSimulate, diff: cmdDiff };
const command = commands[args._[0]];
if (!command || args._.length !== 1) die('명령: snapshot | verify | simulate | diff');
command(args);
