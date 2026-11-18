import { describe, expect, it } from 'vitest';
import { dayTicks } from '../game/intraday';
import { generateMarket } from '../game/market';
import { STOCKS } from '../game/stocks';
import { sliceMarket } from './engine';

describe('v23 장중 가격이 그날 고가·저가에 닿음', () => {
  it('모든 종목·날·하루 길이에서 장중 최고 = 고가, 최저 = 저가 (시가·종가는 그대로)', () => {
    const bad: string[] = [];
    for (let s = 1; s <= 3; s++) {
      const m = generateMarket(s * 13, 10, 23, 'v23-' + s);
      for (const st of STOCKS) {
        for (let d = 0; d < 10; d++) {
          for (const n of [60, 180]) {
            const t = dayTicks(m, st.symbol, d, n);
            const bar = m.bars[st.symbol][d];
            if (t[0] !== bar.open || t[n] !== bar.close) bad.push(`${st.symbol} d${d} 시가·종가`);
            if (Math.max(...t) !== bar.high || Math.min(...t) !== bar.low) bad.push(`${st.symbol} d${d} n${n} ${Math.min(...t)}/${bar.low} ${Math.max(...t)}/${bar.high}`);
          }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('장중 칸 가격은 늘 고가·저가 안', () => {
    const m = generateMarket(99, 10, 23, 'v23-x');
    for (const st of STOCKS)
      for (let d = 0; d < 10; d++) {
        const t = dayTicks(m, st.symbol, d, 180);
        const bar = m.bars[st.symbol][d];
        expect(t.every((v) => v >= bar.low && v <= bar.high)).toBe(true);
      }
  });

  it('서버 전용 흔들림 크기(span)는 화면 데이터에 없음', () => {
    const m = generateMarket(7, 10, 23, 'v23-leak');
    expect(Object.values(m.bars).some((bs) => bs.some((b) => b.span !== undefined))).toBe(true);
    for (const day of [0, 3, 9]) expect(JSON.stringify(sliceMarket(m, day, false, { rumorCheck: false, fakes: [] }))).not.toContain('"span"');
    expect(JSON.stringify(sliceMarket(m, 9, true, { rumorCheck: false, fakes: [] }))).not.toContain('"span"');
  });
});
