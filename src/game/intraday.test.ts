import { describe, expect, it } from 'vitest';
import { dayTicks, releaseTick, ticksPerDay, TICK_MS } from './intraday.js';
import { generateMarket } from './market.js';
import { COMPANIES, STOCKS } from './stocks.js';

const SEED = 4242;
const m = generateMarket(SEED, 20);

describe('장중 5초 칸', () => {
  it('하루 제한 시간에 맞춰 5초마다 한 칸', () => {
    expect(TICK_MS).toBe(5000);
    expect(ticksPerDay(60)).toBe(12);
    expect(ticksPerDay(180)).toBe(36);
    expect(ticksPerDay(600)).toBe(120);
  });

  it('첫 칸 = 시가, 마지막 칸 = 종가, 모든 칸이 그날 고가·저가 안', () => {
    for (const s of STOCKS) {
      for (const day of [0, 5, 19]) {
        const b = m.bars[s.symbol][day];
        const t = dayTicks(m, s.symbol, day, 36);
        expect(t.length).toBe(37);
        expect(t[0]).toBe(b.open);
        expect(t[36]).toBe(b.close);
        for (const p of t) {
          expect(p).toBeGreaterThanOrEqual(b.low);
          expect(p).toBeLessThanOrEqual(b.high);
        }
      }
    }
  });

  it('미국 주식은 달러 칸도 같은 규칙', () => {
    const us = COMPANIES.find((c) => c.currency === 'USD')!;
    const b = m.usd[us.symbol][3];
    const t = dayTicks(m, us.symbol, 3, 12, 'usd');
    expect(t[0]).toBe(b.open);
    expect(t[12]).toBe(b.close);
    for (const p of t) expect(p).toBeGreaterThanOrEqual(b.low);
  });

  it('같은 시드면 항상 같은 칸 (서버·화면이 같은 가격)', () => {
    expect(dayTicks(m, 'NEOT', 4, 60)).toEqual(dayTicks(generateMarket(SEED, 20), 'NEOT', 4, 60));
  });

  it('장중 칸을 만들어도 일별 가격은 그대로 (진행 중인 게임 보호)', () => {
    const before = JSON.stringify(generateMarket(SEED, 20).bars);
    dayTicks(m, 'NEOT', 4, 60);
    expect(JSON.stringify(m.bars)).toBe(before);
  });

  it('장중 속보가 있는 종목은 큰 움직임이 속보 뒤에 나온다', () => {
    let checked = 0;
    for (const n of m.news) {
      if (n.at == null || !n.symbol || n.fake) continue;
      const b = m.bars[n.symbol][n.day];
      const move = b.close - b.open;
      if (Math.abs(move) / b.open < 0.03) continue;
      const N = 60;
      const t = dayTicks(m, n.symbol, n.day, N);
      const rel = releaseTick(n.at, N);
      const before = Math.abs(t[rel - 1] - b.open);
      const after = Math.abs(b.close - t[rel - 1]);
      expect(after).toBeGreaterThan(before);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
