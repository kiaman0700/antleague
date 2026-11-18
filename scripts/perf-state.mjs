// 상태 요청(state) 응답 시간 재기: 봇전 하나를 열고 state 를 여러 번 불러 중간값·p90 (BASE=운영 주소 가능)
import { user, BASE } from './e2e/lib.mjs';
const A = await user();
const bm = (await A({ action: 'botMatch', levels: [2], totalDays: 10, turnSeconds: 60, nickname: '속도재기', mode: 'easy' })).b;
const roomId = bm?.roomId;
if (!roomId) { console.log('봇전 시작 실패', bm); process.exit(1); }
await A({ action: 'preReady', roomId });
const times = [];
let size = 0;
let key;
for (let i = 0; i < Number(process.env.N ?? 20); i++) {
  const t = performance.now();
  const r = await A({ action: 'state', roomId, ...(key ? { marketKey: key } : {}) });
  times.push(performance.now() - t);
  size = JSON.stringify(r.b).length;
  key = r.b?.marketKey;
  await new Promise((res) => setTimeout(res, 300));
}
times.sort((a, b) => a - b);
console.log(BASE, 'state ms 중간값', Math.round(times[times.length >> 1]), 'p90', Math.round(times[Math.floor(times.length * 0.9)]), '최소', Math.round(times[0]), '응답 크기', size, 'bytes');
await A({ action: 'leave', roomId });
