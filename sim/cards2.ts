/**
 * 카드 가치 (비김이 거의 없는 판): 뉴스봇 p0 이 카드를 쓴 판 vs 안 쓴 판, 상대는 여러 유형 섞음.
 *   node sim/build.mjs sim/cards2.ts && SIM_V=8 node sim/.out/cards2.mjs [--n=200]
 */
import type { ItemKind } from '../src/game/items.js';
import { ITEM_MAP, itemCost } from '../src/game/items.js';
import { ARCHETYPES, newsBot } from './bots.js';
import { playGame } from './harness.js';
import { SIM_V } from './version.js';
import { startCashFor } from '../src/game/portfolio.js';

const n = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 150);
const START = startCashFor(SIM_V);
const opp = ['news', 'smart', 'random', 'hold', 'lev', 'aggro'];
const me = (plan?: { kind: ItemKind; days: number[] }) => newsBot({ name: 'me', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, ...(plan ? { plan: { ...plan, target: 'leader' } } : {}) });
const kinds: ItemKind[] = ['paper', 'analyst', 'scout', 'detector', 'freeze', 'blackout', 'fake', 'fee'];
for (const P of [2, 4]) {
  console.log(`\n## ${P}인 — 3·11일차에 카드 1장씩 (상대 유형 섞음, ${n}판, v${SIM_V})`);
  console.log('| 카드 (값) | 쓴 사람 승률 변화 | 판당 금액 차이 (시작 돈 대비) |');
  console.log('|---|---|---|');
  const others = (s: number) => Array.from({ length: P - 1 }, (_, i) => ARCHETYPES[opp[(s + i * 2) % opp.length]]());
  const base = Array.from({ length: n }, (_, s) => playGame(777000 + s, 20, [me(), ...others(s)]));
  const winB = base.reduce((a, g) => a + g.winShare.p0, 0) / n;
  for (const kind of kinds) {
    let win = 0;
    let diff = 0;
    for (let s = 0; s < n; s++) {
      const v = playGame(777000 + s, 20, [me({ kind, days: [3, 11] }), ...others(s)]);
      win += v.winShare.p0;
      diff += v.final.p0 - base[s].final.p0;
    }
    console.log(`| ${ITEM_MAP[kind].name} (${(itemCost(kind, P, SIM_V) / 1e4).toFixed(1)}만) | ${(winB * 100).toFixed(1)}% → ${((win / n) * 100).toFixed(1)}% | ${((diff / n / START) * 100).toFixed(2)}% |`);
  }
}
