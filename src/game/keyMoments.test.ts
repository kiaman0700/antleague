import { describe, expect, it } from 'vitest';
import { generateMarket } from './market';
import { keyMoments } from './keyMoments';
import type { Trade } from './portfolio';

const mk = (i: number) => generateMarket(900 + i, 10, 25, 'km-' + i);

describe('결정적 순간', () => {
  it('속보로 오른 종목을 전날부터 들고 있었으면 "잡았어요"', () => {
    let found = 0;
    for (let i = 0; i < 40 && !found; i++) {
      const m = mk(i);
      const n = m.news.find((x) => x.at != null && x.symbol && x.tone === 'good' && !x.rumor && !x.fake && x.day > 0 && !m.bars[x.symbol!] === false && m.bars[x.symbol!]?.[x.day] && m.bars[x.symbol!][x.day].close / m.bars[x.symbol!][x.day].open > 1.05);
      if (!n) continue;
      const t: Trade = { player_id: 'me', day: n.day - 1, symbol: n.symbol!, side: 'buy', qty: 10, price: m.bars[n.symbol!][n.day - 1].close, fee: 0 };
      const km = keyMoments(m, [t]);
      expect(km.some((k) => k.kind === 'caught' && k.symbol === n.symbol && k.amount > 0)).toBe(true);
      found++;
    }
    expect(found).toBe(1);
  });
  it('거래가 없으면 잡은·피한·속은 순간은 없음 (놓친 것만 있을 수 있음), 최대 3개', () => {
    for (let i = 0; i < 10; i++) {
      const km = keyMoments(mk(i), []);
      expect(km.length).toBeLessThanOrEqual(3);
      expect(km.every((k) => k.kind === 'missed')).toBe(true);
    }
  });
});
