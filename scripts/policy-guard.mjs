#!/usr/bin/env node
// scripts/policy-guard.mjs — 10단계: 안전 정책 사본 / 해시 / 침공 흉내 / 차이 보기
//
// 쓰는 법 (저장소 루트에서 실행):
//   node scripts/policy-guard.mjs snapshot [--add 경로]... [--yes]
//   node scripts/policy-guard.mjs verify
//   node scripts/policy-guard.mjs simulate --file 경로 --line 번호 --to "새 내용" [--yes]
//   node scripts/policy-guard.mjs diff
//
// 원칙
//  - 쓰기는 .policy-guard/ 폴더 안에서만 합니다. 실제 정책 파일은 읽기만 합니다.
//  - --yes 가 없으면 무엇을 할지 보여 주기만 하고 아무것도 쓰지 않습니다.
//  - 사본이 없거나 해시가 하나라도 맞지 않으면 중단합니다.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD = path.join(ROOT, '.policy-guard');
const SAFE = path.join(GUARD, 'safe');
const SIM = path.join(GUARD, 'sim');
const SOURCES = ['src/decider.mjs', 'aleph.config.json'];
const DB_DIR = 'supabase/migrations';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');
const die = (msg) => { console.error(`\n중단: ${msg}`); process.exit(1); };

function parseArgs(argv) {
  const out = { _: [], add: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') out.yes = true;
    else if (a === '--add') out.add.push(argv[++i]);
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

// 안전한 경로인지: 저장소 안쪽의 상대 경로만 허용
function safeRel(rel) {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep) || abs.startsWith(GUARD + path.sep)) {
    die(`허용되지 않는 경로입니다: ${rel}`);
  }
  return posix(path.relative(ROOT, abs));
}

function collectLive(extra) {
  const list = [...SOURCES];
  const dbAbs = path.join(ROOT, DB_DIR);
  if (!fs.existsSync(dbAbs)) die(`DB 정책 폴더가 없습니다: ${DB_DIR}`);
  const sql = fs.readdirSync(dbAbs).filter((f) => f.endsWith('.sql')).sort();
  if (sql.length === 0) die(`${DB_DIR} 안에 .sql 파일이 없습니다`);
  list.push(...sql.map((f) => `${DB_DIR}/${f}`), ...extra);
  return [...new Set(list.map(safeRel))].sort().map((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) die(`정책 파일이 없습니다: ${rel}`);
    const buf = fs.readFileSync(abs);
    return { path: rel, sha256: sha(buf), bytes: buf.length, buf };
  });
}

const versionId = (files) =>
  sha(JSON.stringify(files.map(({ path: p, sha256 }) => ({ path: p, sha256 }))));

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
  for (const f of files) console.log(`  ${f.sha256.slice(0, 12)}  ${String(f.bytes).padStart(6)}B  ${f.path}`);
}

// ---------- 사본 검증: 없거나 해시가 안 맞으면 중단 ----------
function verifySnapshot() {
  const mPath = path.join(SAFE, 'manifest.json');
  if (!fs.existsSync(mPath)) die('검증된 사본이 없습니다. 먼저 snapshot 을 실행하세요.');
  let m;
  try { m = JSON.parse(fs.readFileSync(mPath, 'utf8')); } catch { die('manifest.json 을 읽을 수 없습니다.'); }
  if (!Array.isArray(m.files) || m.files.length === 0) die('manifest.json 에 파일 목록이 없습니다.');
  const files = [];
  for (const f of m.files) {
    const abs = path.join(SAFE, 'files', f.path);
    if (!fs.existsSync(abs)) die(`사본 파일이 없습니다: ${f.path}`);
    const buf = fs.readFileSync(abs);
    if (sha(buf) !== f.sha256) die(`해시가 맞지 않습니다: ${f.path}\n  기록 ${f.sha256}\n  현재 ${sha(buf)}`);
    files.push({ ...f, buf });
  }
  if (versionId(files) !== m.versionId) die('사본 전체 버전 해시가 맞지 않습니다.');
  return { manifest: m, files };
}

// ---------- snapshot ----------
function cmdSnapshot(args) {
  const files = collectLive(args.add);
  const id = versionId(files);
  const git = gitInfo();
  console.log('[실행 전 확인] 안전 정책 사본 만들기');
  console.log(`  버전 해시  : ${id}`);
  console.log(`  기준 커밋  : ${git.commit ?? '(git 정보 없음)'}${git.dirty ? '  ※ 커밋되지 않은 변경이 있음 — 작업 폴더 현재 상태를 복사합니다' : ''}`);
  console.log(`  저장 위치  : ${posix(path.relative(ROOT, SAFE))}/  (실제 정책 파일은 읽기만 함)`);
  console.log(`  대상 ${files.length}개:`);
  printFiles(files);
  if (fs.existsSync(SAFE)) die('이미 사본이 있습니다. 덮어쓰지 않습니다. (.policy-guard/safe 를 직접 확인한 뒤 지우세요)');
  if (!args.yes) return console.log('\n미리보기만 했습니다. 만들려면 --yes 를 붙여 다시 실행하세요.');
  for (const f of files) {
    const dest = path.join(SAFE, 'files', f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.buf);
  }
  const manifest = {
    versionId: id,
    createdAt: new Date().toISOString(),
    gitCommit: git.commit,
    gitDirty: git.dirty,
    files: files.map(({ path: p, sha256, bytes }) => ({ path: p, sha256, bytes })),
  };
  fs.writeFileSync(path.join(SAFE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n사본을 만들었습니다. 버전 해시: ${id}`);
  console.log('이 해시를 README의 10단계 기록에 적어 두세요.');
}

// ---------- verify ----------
function cmdVerify() {
  const { manifest, files } = verifySnapshot();
  console.log('사본 검증 통과');
  console.log(`  버전 해시 : ${manifest.versionId}`);
  console.log(`  만든 시각 : ${manifest.createdAt}   기준 커밋: ${manifest.gitCommit ?? '-'}`);
  printFiles(files);
  // 참고: 지금 실제 정책 파일이 사본과 달라졌는지 (중단 사유는 아님)
  const drift = files.filter((f) => {
    const abs = path.join(ROOT, f.path);
    return !fs.existsSync(abs) || sha(fs.readFileSync(abs)) !== f.sha256;
  });
  console.log(drift.length ? `\n참고: 실제 파일 ${drift.length}개가 사본과 다릅니다 → ${drift.map((f) => f.path).join(', ')}` : '\n참고: 실제 정책 파일은 사본과 같습니다.');
}

// ---------- simulate ----------
function cmdSimulate(args) {
  const { manifest, files } = verifySnapshot(); // 사본 없음·해시 불일치면 여기서 중단
  if (!args.file || !args.line || args.to === undefined) die('--file, --line, --to 가 모두 필요합니다.');
  const rel = safeRel(args.file);
  const target = files.find((f) => f.path === rel);
  if (!target) die(`사본에 없는 파일입니다: ${rel}\n  대상: ${files.map((f) => f.path).join(', ')}`);
  const lines = target.buf.toString('utf8').split('\n');
  const n = Number(args.line);
  if (!Number.isInteger(n) || n < 1 || n > lines.length) die(`줄 번호는 1~${lines.length} 사이여야 합니다.`);
  const from = lines[n - 1];
  if (from === args.to) die('바꿀 내용이 원래와 같습니다.');
  console.log('[실행 전 확인] 침공 흉내 (시험용 사본 1개)');
  console.log(`  기준 버전  : ${manifest.versionId}`);
  console.log(`  변경 범위  : 1개 파일, 1줄  →  ${rel} ${n}번째 줄`);
  console.log(`    - ${from}`);
  console.log(`    + ${args.to}`);
  console.log(`  저장 위치  : ${posix(path.relative(ROOT, SIM))}/  (실제 정책 파일은 건드리지 않음)`);
  if (!args.yes) return console.log('\n미리보기만 했습니다. 만들려면 --yes 를 붙여 다시 실행하세요.');
  fs.rmSync(SIM, { recursive: true, force: true }); // 시험용 폴더만 지움
  const out = [];
  for (const f of files) {
    let buf = f.buf;
    if (f.path === rel) { lines[n - 1] = args.to; buf = Buffer.from(lines.join('\n')); }
    const dest = path.join(SIM, 'files', f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    out.push({ path: f.path, sha256: sha(buf) });
  }
  fs.writeFileSync(path.join(SIM, 'sim.json'), JSON.stringify({
    baseVersionId: manifest.versionId, createdAt: new Date().toISOString(),
    change: { file: rel, line: n, from, to: args.to }, files: out,
  }, null, 2) + '\n');
  console.log('\n시험용 사본을 만들었습니다. 차이는 diff 로 확인하세요.');
}

// ---------- diff ----------
function lineDiff(a, b) { // 작은 파일용 LCS 차이
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const res = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (i < a.length && (j === b.length || dp[i + 1][j] >= dp[i][j + 1])) res.push(`- ${i + 1}: ${a[i++]}`);
    else res.push(`+ ${j + 1}: ${b[j++]}`);
  }
  return res;
}

function cmdDiff() {
  const { manifest, files } = verifySnapshot();
  const sPath = path.join(SIM, 'sim.json');
  if (!fs.existsSync(sPath)) die('시험용 사본이 없습니다. 먼저 simulate 를 실행하세요.');
  const sim = JSON.parse(fs.readFileSync(sPath, 'utf8'));
  if (sim.baseVersionId !== manifest.versionId) die('시험용 사본이 현재 검증된 사본과 다른 버전에서 만들어졌습니다.');
  const changed = [];
  for (const s of sim.files) {
    const abs = path.join(SIM, 'files', s.path);
    if (!fs.existsSync(abs)) die(`시험용 파일이 없습니다: ${s.path}`);
    const buf = fs.readFileSync(abs);
    if (sha(buf) !== s.sha256) die(`시험용 사본이 기록과 다릅니다: ${s.path}`);
    const base = files.find((f) => f.path === s.path);
    if (!base) die(`사본에 없는 파일: ${s.path}`);
    if (sha(buf) !== base.sha256) changed.push({ rel: s.path, a: base.buf.toString('utf8').split('\n'), b: buf.toString('utf8').split('\n') });
  }
  console.log(`비교 기준(검증된 사본): ${manifest.versionId}`);
  console.log(`변경 범위: ${changed.length}개 파일 / 전체 ${files.length}개 중\n`);
  if (!changed.length) return console.log('차이가 없습니다.');
  for (const c of changed) { console.log(`── ${c.rel}`); lineDiff(c.a, c.b).forEach((l) => console.log('  ' + l)); }
}

const args = parseArgs(process.argv.slice(2));
const cmds = { snapshot: cmdSnapshot, verify: cmdVerify, simulate: cmdSimulate, diff: cmdDiff };
(cmds[args._[0]] ?? (() => die('명령: snapshot | verify | simulate | diff')))(args);
