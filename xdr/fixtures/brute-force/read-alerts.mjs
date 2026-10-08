// 확인용 읽기 모듈: 원본 경보 파일을 수정하지 않습니다.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : fileURLToPath(new URL('./brute-force.json', import.meta.url));

const document = JSON.parse(await readFile(inputPath, 'utf8'));

if (!Array.isArray(document.alerts)) {
  throw new TypeError('경보 문서에 alerts 배열이 없습니다.');
}

const alerts = document.alerts;

// 허용 목록에 있는 필드만 출력합니다.
const lines = alerts.map((alert) =>
  JSON.stringify({
    timestamp: alert.timestamp ?? null,
    sourceAddress: alert.data?.srcip ?? null,
    account: alert.data?.srcuser ?? null,
    ruleLevel: alert.rule?.level ?? null,
    description: alert.rule?.description ?? null,
  }),
);

if (lines.length !== alerts.length) {
  throw new Error(`경보 건수(${alerts.length})와 추출 줄 수(${lines.length})가 다릅니다.`);
}

// 헤더 없이 한 경보당 한 줄을 출력합니다.
if (lines.length > 0) {
  process.stdout.write(`${lines.join('\n')}\n`);
}

process.stderr.write(`확인: 경보 ${alerts.length}건, 추출 줄 ${lines.length}줄\n`);