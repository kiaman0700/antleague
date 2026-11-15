/**
 * 시가 갭 누출 확인: 아침 뉴스가 없는데 시가가 크게 움직인 종목은 그날 장중 속보가 뜰 종목인가?
 *   npx esbuild sim/gap.ts --bundle --platform=node --format=esm --outfile=sim/.out/gap.mjs && node sim/.out/gap.mjs
 * 화면에 보이는 정보만 씀: 전일 종가, 오늘 시가, 아침 뉴스(장중 속보는 공개 전엔 안 보임)
 */
import { CURRENT_RULES_VERSION, marketFor } from '../src/engine/engine.js';
import { COMPANIES } from '../src/game/stocks.js';

const rows: Record<string, { n: number; hit: number; ret: number; laterNews: number }> = {};
for (let g = 0; g < 600; g++) {
  const m = marketFor(424242 + g, 20, CURRENT_RULES_VERSION);
  for (let day = 0; day < 20; day++) {
    const morning = new Set(m.news.filter((n) => n.day === day && n.at == null && n.symbol).map((n) => n.symbol));
    const morningSec = new Set(m.news.filter((n) => n.day === day && n.at == null && n.kind === 'sector').map((n) => n.sector));
    for (const c of COMPANIES) {
      if (morning.has(c.symbol) || morningSec.has(c.sector)) continue;
      const prev = day === 0 ? m.base[c.symbol] : m.bars[c.symbol][day - 1].close;
      const b = m.bars[c.symbol][day];
      const gap = b.open / prev - 1;
      const k = Math.abs(gap) >= 0.05 ? '|갭|≥5%' : Math.abs(gap) >= 0.03 ? '3~5%' : Math.abs(gap) >= 0.015 ? '1.5~3%' : '<1.5%';
      const r = (rows[k] ??= { n: 0, hit: 0, ret: 0, laterNews: 0 });
      const dir = Math.sign(gap) || 1;
      const intra = (b.close / b.open - 1) * dir;
      r.n++;
      if (intra > 0) r.hit++;
      r.ret += intra;
      if (m.news.some((n) => n.day === day && n.at != null && n.symbol === c.symbol && !n.fake)) r.laterNews++;
    }
  }
}
console.log('| 아침 뉴스 없는 종목의 시가 갭 | 종목·일 수 | 갭 방향으로 장중 계속 | 갭 방향 평균 장중 수익 | 그날 장중 속보가 뜬 비율 |');
console.log('|---|---|---|---|---|');
for (const [k, r] of Object.entries(rows)) console.log(`| ${k} | ${r.n} | ${((r.hit / r.n) * 100).toFixed(1)}% | ${((r.ret / r.n) * 100).toFixed(2)}% | ${((r.laterNews / r.n) * 100).toFixed(1)}% |`);
