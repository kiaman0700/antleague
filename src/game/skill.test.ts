import { describe, expect, it } from 'vitest';
import { generateMarket } from './market';
import { gameSkill, skillSummary } from './skill';
import type { Trade } from './portfolio';

describe('나의 투자 감각', () => {
  it('거래가 없으면 모두 0, 시장 대비는 지수만큼', () => {
    const m = generateMarket(4242, 10, 25, 'sk-1');
    const s = gameSkill(m, [], 0);
    expect(s.catches + s.newsBuys + s.newsTrue + s.maxWeight).toBe(0);
    expect(Math.abs(s.beat + (m.index[9].close / m.index[0].open - 1))).toBeLessThan(1e-9);
  });
  it('한 종목만 들고 있으면 몰빵 비중이 큼, 진짜 호재 속보 날 산 것은 속보 잡기', () => {
    for (let i = 0; i < 60; i++) {
      const m = generateMarket(5000 + i, 10, 25, 'sk-' + i);
      const n = m.news.find((x) => x.at != null && x.symbol && x.tone === 'good' && !x.fake && !x.rumor && m.bars[x.symbol!]?.[x.day] && m.bars[x.symbol!][x.day].close > m.bars[x.symbol!][x.day].open * 1.02);
      if (!n) continue;
      const price = m.bars[n.symbol!][n.day].open;
      const t: Trade = { player_id: 'me', day: n.day, symbol: n.symbol!, side: 'buy', qty: Math.floor(900_000 / price), price, fee: 0 };
      const s = gameSkill(m, [t], 0);
      expect(s.catches).toBe(1);
      expect(s.newsBuys).toBeGreaterThanOrEqual(1);
      expect(s.maxWeight).toBeGreaterThan(0.5);
      const sum = skillSummary([s, s]);
      expect(sum?.games).toBe(2);
      return;
    }
    throw new Error('속보 판을 못 찾음');
  });
});
