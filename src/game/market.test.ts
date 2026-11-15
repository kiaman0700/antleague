import { describe, expect, it } from 'vitest';
import { generateMarket, TICKS_PER_DAY } from './market';
import { buyCost, computePortfolio, equityAt, maxBuyQty, START_CASH } from './portfolio';

describe('market', () => {
  it('같은 seed → 완전히 같은 시장', () => {
    const a = generateMarket(12345, 30);
    const b = generateMarket(12345, 30);
    expect(a).toEqual(b);
    expect(a.prices.NEOT.length).toBe(30 * TICKS_PER_DAY + 1);
  });
  it('다른 seed → 다른 시장', () => {
    expect(generateMarket(1, 30).prices.NEOT).not.toEqual(generateMarket(2, 30).prices.NEOT);
  });
  it('가격은 항상 양수, 뉴스는 매일 존재', () => {
    const m = generateMarket(999, 60);
    for (const path of Object.values(m.prices)) for (const p of path) expect(p).toBeGreaterThan(0);
    for (let d = 1; d < 60; d++) expect(m.news.some((n) => n.day === d)).toBe(true);
  });
});

describe('portfolio', () => {
  it('매수 후 매도 계산', () => {
    const p = computePortfolio([
      { player_id: 'a', tick: 0, symbol: 'X', side: 'buy', qty: 10, price: 1000 },
      { player_id: 'a', tick: 3, symbol: 'X', side: 'sell', qty: 10, price: 1200 },
    ]);
    expect(p.holdings.X).toBeUndefined();
    expect(p.cash).toBe(START_CASH - 10010 + 11988);
    expect(p.closed[0].pnl).toBeCloseTo(11988 - 10010);
  });
  it('최대 매수 수량은 현금을 넘지 않음', () => {
    const q = maxBuyQty(START_CASH, 52300);
    expect(buyCost(q, 52300)).toBeLessThanOrEqual(START_CASH);
    expect(buyCost(q + 1, 52300)).toBeGreaterThan(START_CASH);
  });
  it('평가액', () => {
    const p = computePortfolio([{ player_id: 'a', tick: 0, symbol: 'X', side: 'buy', qty: 2, price: 100 }]);
    expect(equityAt(p, { X: [100, 150] }, 1)).toBe(p.cash + 300);
  });
});
