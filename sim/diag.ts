// 진단: 카드를 쓴 판과 안 쓴 판에서 p0 의 무료 카드·봉투·현금 차이
import { newsBot } from './bots.js';
import { playGame } from './harness.js';
const base = (name: string) => newsBot({ name, news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true });
let bonusB = 0, bonusV = 0, skippedB = 0, skippedV = 0, gain = 0;
const N = 40;
for (let s = 0; s < N; s++) {
  const b = playGame(424242 + 9000 + s, 20, [base('b0'), base('b1')]);
  const v = playGame(424242 + 9000 + s, 20, [newsBot({ name: 'x', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, plan: { kind: 'detector', days: [3, 11], target: 'leader' } }), base('b1')]);
  bonusB += b.uses.filter((u) => u.pid === 'p0' && u.kind === 'bonus').length;
  bonusV += v.uses.filter((u) => u.pid === 'p0' && u.kind === 'bonus').length;
  const gs = (g: typeof b) => (g as unknown as { grants?: Record<string, { skipped: boolean }[]> }).grants?.p0?.filter((x) => x.skipped).length ?? 0;
  skippedB += gs(b); skippedV += gs(v);
  gain += v.final.p0 - b.final.p0;
}
console.log({ bonusB, bonusV, skippedB, skippedV, avgGain: Math.round(gain / N) });
