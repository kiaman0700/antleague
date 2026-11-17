// 서버 시험 전부 차례로: 하나가 실패해도 나머지는 계속 돌리고, 끝에 한눈에 요약 (실패가 있으면 종료 코드 1)
import { spawnSync } from 'node:child_process';

const TESTS = [
  'three-players', 'cards', 'turn-rules', 'realtime', 'lifecycle', 'attacks', 'admin', 'accounts', 'matching',
  'injection', 'social', 'avatar', 'reactions', 'db-direct', 'realtime-privacy', 'history-privacy', 'bots', 'daily',
];
const only = process.argv.slice(2);
const list = only.length ? TESTS.filter((t) => only.includes(t)) : TESTS;
const result = [];
for (const t of list) {
  console.log(`== ${t}`);
  const r = spawnSync(process.execPath, [`scripts/e2e/${t}.mjs`], { stdio: 'inherit', env: process.env });
  result.push([t, r.status === 0]);
}
const bad = result.filter(([, okk]) => !okk).map(([t]) => t);
console.log('\n== 요약');
console.log(`통과 ${result.length - bad.length} / ${result.length}` + (bad.length ? ` · 실패: ${bad.join(', ')}` : ''));
process.exit(bad.length ? 1 : 0);
