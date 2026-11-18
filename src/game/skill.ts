/**
 * '나의 투자 감각' (밤샘 조사 2026-11-19 — 점수만 있으면 지는 날 지침, 늘 나아지는 게 보이는 지표가 필요).
 * 판이 끝난 뒤 서버만 계산 (뉴스 진위는 서버 시장의 fake/realTone 으로) → 계정마다 기록 → 마이프로필에서 최근 판 평균만 나에게.
 * 한 판에서 뽑는 숫자 4개:
 *  - catches: 진짜 장중 호재 속보 종목을 그날 사서 그날 종가가 산 값보다 높았던 횟수 (속보 잡기)
 *  - newsBuys / newsTrue: 그날 그 종목에 좋은 소식(뉴스·소문 기사)이 있던 날 산 횟수 / 그 소식이 진짜였던 횟수 (소식 고르기)
 *  - maxWeight: 날마다 장 마감 때 가장 큰 종목이 재산에서 차지한 비율의 평균 (나눠 담기 — 낮을수록 고루)
 *  - beat: 내 수익률 − 종합지수 수익률 (시장 대비)
 */
import type { Market, NewsEvent } from './market.js';
import { computePortfolio, startCashFor, type Trade } from './portfolio.js';

export interface GameSkill {
  catches: number;
  newsBuys: number;
  newsTrue: number;
  maxWeight: number;
  beat: number;
}

const fakeOf = (n: NewsEvent) => !!n.fake || (n.rumor && n.tone !== n.realTone);

export function gameSkill(m: Market, trades: Trade[], ret: number, lastDay = m.totalDays - 1): GameSkill {
  let catches = 0;
  let newsBuys = 0;
  let newsTrue = 0;
  for (const t of trades) {
    if (t.side !== 'buy' || t.day > lastDay) continue;
    const close = m.bars[t.symbol]?.[t.day]?.close;
    const goods = m.news.filter((n) => n.day === t.day && n.symbol === t.symbol && n.tone === 'good');
    if (!goods.length) continue;
    newsBuys++;
    if (goods.some((n) => !fakeOf(n))) newsTrue++;
    if (close && goods.some((n) => n.at != null && !fakeOf(n)) && close > t.price) catches++;
  }
  // 날마다 장 마감 때 가장 큰 한 종목의 비중 (들고 있는 날만)
  let wSum = 0;
  let wDays = 0;
  for (let d = 0; d <= lastDay; d++) {
    const pf = computePortfolio(trades.filter((t) => t.day <= d), [], d, [], startCashFor(m.version));
    const vals = Object.entries(pf.holdings).map(([s, h]) => h.qty * (m.bars[s]?.[d]?.close ?? 0));
    const stock = vals.reduce((a, v) => a + v, 0);
    if (stock <= 0) continue;
    wSum += Math.max(...vals) / (stock + Math.max(0, pf.cash));
    wDays++;
  }
  const idx0 = m.index[0]?.open ?? 1;
  const idx1 = m.index[lastDay]?.close ?? idx0;
  return { catches, newsBuys, newsTrue, maxWeight: wDays ? wSum / wDays : 0, beat: ret - (idx1 / idx0 - 1) };
}

/** 여러 판 평균 (화면에 보여 줄 값) */
export function skillSummary(rows: GameSkill[]) {
  const n = rows.length;
  if (!n) return null;
  const sum = (f: (r: GameSkill) => number) => rows.reduce((a, r) => a + f(r), 0);
  const nb = sum((r) => r.newsBuys);
  return {
    games: n,
    catchesPerGame: sum((r) => r.catches) / n,
    newsAccuracy: nb ? sum((r) => r.newsTrue) / nb : null,
    avgMaxWeight: sum((r) => r.maxWeight) / n,
    avgBeat: sum((r) => r.beat) / n,
  };
}
