import { describe, expect, it } from 'vitest';
import { marketFor } from './engine.js';
import { dayTicks } from '../game/intraday.js';

// 속보가 뜰 종목이 속보 전에 다른 종목보다 눈에 띄게 많이 흔들리면 '곧 뉴스가 있다'가 보임
describe('v13: 속보 전 흔들림 크기로 속보 종목을 알 수 없음', () => {
  it('속보 종목의 속보 전 흔들림이 같은 날 다른 종목과 비슷함', () => {
    const vol = (t: number[], a: number, b: number) => {
      let s = 0;
      for (let k = a + 1; k <= b; k++) s += Math.abs(Math.log(t[k] / t[k - 1]));
      return s / Math.max(1, b - a);
    };
    let ratioSum = 0;
    let n = 0;
    for (let s = 0; s < 30; s++) {
      const m = marketFor(7000 + s, 10, 13, (s + 9).toString(16).padStart(32, '0'));
      for (const b of m.news.filter((x) => x.at != null && x.symbol && !x.fake)) {
        const rel = Math.max(10, Math.floor(b.at! * 120) - 1);
        const mine = vol(dayTicks(m, b.symbol!, b.day, 120), 0, rel);
        const others = Object.keys(m.bars).filter((k) => k !== b.symbol && !m.news.some((x) => x.day === b.day && x.symbol === k));
        const avg = others.reduce((a, k) => a + vol(dayTicks(m, k, b.day, 120), 0, rel), 0) / others.length;
        if (avg > 0) {
          ratioSum += mine / avg;
          n++;
        }
      }
    }
    const ratio = ratioSum / n;
    console.log('속보 종목 / 다른 종목 흔들림 =', ratio.toFixed(2), n);
    expect(n).toBeGreaterThan(20);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.4);
  });
});
