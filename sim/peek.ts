// 확인용: v12 한 판의 사건 흐름 뉴스와 그날 주가 변화
import { marketFor } from '../src/engine/engine.js';
import { STOCK_MAP } from '../src/game/stocks.js';
const m = marketFor(Number(process.env.SEED ?? 4242), 10, Number(process.env.SIM_V ?? 15), 'c3'.repeat(16));
const syms = new Set(m.news.filter((n) => n.label === '속보' && n.at != null).map((n) => n.symbol));
for (const n of m.news.filter((x) => x.symbol && syms.has(x.symbol)).sort((a, b) => a.day - b.day)) {
  const b = m.bars[n.symbol!][n.day];
  const prev = n.day ? m.bars[n.symbol!][n.day - 1].close : m.base[n.symbol!];
  console.log(`${n.day + 1}일차 ${n.label ? '[' + n.label + '] ' : ''}${n.headline}  → ${STOCK_MAP[n.symbol!].name} ${((b.close / prev - 1) * 100).toFixed(1)}%`);
}
