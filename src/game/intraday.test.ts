import { describe, expect, it } from 'vitest';
import { dayTicks, releaseTick, ticksPerDay, TICK_MS } from './intraday.js';
import { generateMarket } from './market.js';
import { COMPANIES } from './stocks.js';

const SEED = 4242;
const m = generateMarket(SEED, 20);

describe('장중 5초 칸', () => {
  it('하루 제한 시간에 맞춰 5초마다 한 칸', () => {
    expect(TICK_MS).toBe(5000);
    expect(ticksPerDay(60)).toBe(12);
    expect(ticksPerDay(180)).toBe(36);
    expect(ticksPerDay(600)).toBe(120);
  });

  it('첫 칸 = 시가, 마지막 칸 = 종가, 회사 주식은 모든 칸이 그날 고가·저가 안', () => {
    for (const s of COMPANIES) {
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

describe('장중 연관성 (지수·ETF·같은 업종)', () => {
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((x, y) => x + y, 0) / a.length;
    const mb = b.reduce((x, y) => x + y, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db || 1);
  };
  const rets = (t: number[]) => t.slice(1).map((v, i) => Math.log(v / t[i]));

  it('지수 칸의 시작·끝 = 그날 지수 시가·종가', async () => {
    const { indexTicks } = await import('./intraday.js');
    for (const ver of [1, 2]) {
      const mm = generateMarket(SEED, 20, ver);
      for (const day of [0, 7]) {
        const t = indexTicks(mm, 'kr', day, 36);
        expect(t[0]).toBeCloseTo(mm.index[day].open, 1);
        expect(t[36]).toBeCloseTo(mm.index[day].close, 1);
        const u = indexTicks(mm, 'us', day, 36);
        expect(u[0]).toBeCloseTo(mm.usIndex[day].open, 1);
        expect(u[36]).toBeCloseTo(mm.usIndex[day].close, 1);
      }
    }
  });

  it('장중 지수는 종목들과 같이 움직인다 (대형주와 상관)', async () => {
    const { indexTicks } = await import('./intraday.js');
    const mm = generateMarket(SEED, 20, 2);
    let sum = 0;
    for (let day = 0; day < 20; day++) sum += corr(rets(indexTicks(mm, 'kr', day, 60)), rets(dayTicks(mm, 'CORE', day, 60)));
    expect(sum / 20).toBeGreaterThan(0.3);
  });

  it('같은 업종 종목은 장중에 함께 움직인다', () => {
    const mm = generateMarket(SEED, 20, 2);
    let same = 0, diff = 0;
    for (let day = 0; day < 20; day++) {
      same += corr(rets(dayTicks(mm, 'CORE', day, 60)), rets(dayTicks(mm, 'NANO', day, 60)));
      diff += corr(rets(dayTicks(mm, 'CORE', day, 60)), rets(dayTicks(mm, 'MLKY', day, 60)));
    }
    expect(same / 20).toBeGreaterThan(diff / 20 + 0.1);
  });

  it('지수 ETF·레버리지·인버스는 장중에도 지수를 따라간다 (인버스는 반대)', () => {
    let lev = 0, inv = 0, cnt = 0;
    // 호가 단위(50원 등)보다 작은 5초 움직임은 가격에 안 잡히므로 50초(10칸) 간격, 시드 3개 × 20일
    const every10 = (t: number[]) => t.filter((_, i) => i % 10 === 0);
    for (const seed of [SEED, 777, 31337]) {
      const mm = generateMarket(seed, 20, 2);
      for (let day = 0; day < 20; day++) {
        const base = rets(every10(dayTicks(mm, 'KIDX', day, 120)));
        lev += corr(base, rets(every10(dayTicks(mm, 'KLEV', day, 120))));
        inv += corr(base, rets(every10(dayTicks(mm, 'KINV', day, 120))));
        cnt++;
      }
    }
    expect(lev / cnt).toBeGreaterThan(0.8);
    expect(inv / cnt).toBeLessThan(-0.5); // 인버스는 호가 단위 때문에 조금 덜 매끄러움
  });

  it('지수가 크게 움직인 구간에서는 인버스가 반드시 반대로', () => {
    let checked = 0;
    for (const seed of [SEED, 777, 31337])
    for (let day = 0; day < 20; day++) {
      const mm = generateMarket(seed, 20, 2);
      const k = dayTicks(mm, 'KIDX', day, 120);
      const v = dayTicks(mm, 'KINV', day, 120);
      for (let j = 30; j <= 120; j += 30) {
        const rk = Math.log(k[j] / k[j - 30]);
        if (Math.abs(rk) < 0.006) continue;
        checked++;
        expect(Math.sign(Math.log(v[j] / v[j - 30]))).toBe(-Math.sign(rk));
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('ETF 칸의 시작·끝 = 그날 시가·종가', () => {
    const mm = generateMarket(SEED, 20, 2);
    for (const sym of ['KIDX', 'KLEV', 'KINV', 'SEMI', 'OILX', 'USDX']) {
      const t = dayTicks(mm, sym, 5, 36);
      expect(t[0]).toBe(mm.bars[sym][5].open);
      expect(t[36]).toBe(mm.bars[sym][5].close);
    }
  });
});

