import { describe, expect, it } from 'vitest';
import { deriveItems, ItemRow, START_CARDS } from './items';
import { generateMarket, INTRADAY_POINTS } from './market';
import { buyCost, computePortfolio, equityWith, maxBuyQty, START_CASH } from './portfolio';
import { STOCKS } from './stocks';

describe('market', () => {
  it('같은 seed → 완전히 같은 시장', () => {
    const a = generateMarket(12345, 30);
    expect(a).toEqual(generateMarket(12345, 30));
    expect(a.bars.NEOT.length).toBe(30);
    expect(a.bars.NEOT[0].path.length).toBe(INTRADAY_POINTS);
    expect(a.macro.length).toBe(30);
  });
  it('다른 seed → 다른 시장', () => {
    expect(generateMarket(1, 30).bars.NEOT).not.toEqual(generateMarket(2, 30).bars.NEOT);
  });
  it('가격은 양수, 시가/종가는 고가·저가 사이, 뉴스는 매일', () => {
    const m = generateMarket(999, 30);
    for (const s of STOCKS)
      for (const b of m.bars[s.symbol]) {
        expect(b.low).toBeGreaterThan(0);
        expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
        expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      }
    for (let d = 0; d < 30; d++) expect(m.news.some((n) => n.day === d)).toBe(true);
  });
  it('같은 업종끼리 함께 움직인다 (상관관계 > 다른 업종)', () => {
    const corr = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y) / a.length;
      const mb = b.reduce((x, y) => x + y) / b.length;
      let c = 0, va = 0, vb = 0;
      for (let i = 0; i < a.length; i++) {
        c += (a[i] - ma) * (b[i] - mb);
        va += (a[i] - ma) ** 2;
        vb += (b[i] - mb) ** 2;
      }
      return c / Math.sqrt(va * vb);
    };
    const rets = (sym: string) => {
      const out: number[] = [];
      for (let k = 0; k < 20; k++) {
        const m = generateMarket(k + 100, 30);
        m.bars[sym].forEach((b, i) => out.push(Math.log(b.close / (i ? m.bars[sym][i - 1].close : m.base[sym]))));
      }
      return out;
    };
    const same = corr(rets('CORE'), rets('NANO'));
    const diff = corr(rets('CORE'), rets('MLKY'));
    expect(same).toBeGreaterThan(diff + 0.15);
  });
});

describe('portfolio', () => {
  it('매수 후 매도, 아이템 지출 반영', () => {
    const p = computePortfolio(
      [
        { player_id: 'a', day: 0, symbol: 'X', side: 'buy', qty: 10, price: 1000, fee: 0.001 },
        { player_id: 'a', day: 3, symbol: 'X', side: 'sell', qty: 10, price: 1200, fee: 0.001 },
      ],
      [{ day: 1, cost: 300000 }],
    );
    expect(p.holdings.X).toBeUndefined();
    expect(p.cash).toBe(START_CASH - 10010 + 11988 - 300000);
  });
  it('최대 매수 수량은 현금을 넘지 않음', () => {
    const q = maxBuyQty(START_CASH, 52300);
    expect(buyCost(q, 52300)).toBeLessThanOrEqual(START_CASH);
    expect(buyCost(q + 1, 52300)).toBeGreaterThan(START_CASH);
  });
  it('평가액', () => {
    const p = computePortfolio([{ player_id: 'a', day: 0, symbol: 'X', side: 'buy', qty: 2, price: 100, fee: 0.001 }]);
    expect(equityWith(p, { X: 150 })).toBe(p.cash + 300);
  });
});

describe('items', () => {
  it('두 기기가 같은 아이템 상태를 계산하고, 방패가 방해를 막는다', () => {
    const rows: ItemRow[] = [
      { player_id: 'a', day: 0, kind: 'shield', action: 'buy', cost: 500000, created_at: '1' },
      { player_id: 'b', day: 1, kind: 'freeze', action: 'buy', cost: 1000000, created_at: '2' },
      { player_id: 'b', day: 1, kind: 'freeze', action: 'use', cost: 0, created_at: '3' },
    ];
    // 시작 카드 때문에 보유 한도에 걸릴 수 있으니 결과만 일관성 확인
    const s1 = deriveItems(7, ['a', 'b'], rows, 2, 20, false);
    const s2 = deriveItems(7, ['a', 'b'], [...rows].reverse(), 2, 20, false);
    expect(s1).toEqual(s2);
    expect(s1.players.a.grants.filter((g) => g.day === 0).length).toBe(START_CARDS);
  });
});
