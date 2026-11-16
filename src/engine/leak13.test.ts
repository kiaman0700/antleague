import { describe, expect, it } from 'vitest';
import { marketFor, sliceMarket } from './engine.js';
import { dayTicks } from '../game/intraday.js';
import { preRumors } from '../game/rumors.js';

describe('사건 결과가 미리 새지 않음 (검토 지적 3건)', () => {
  it('사건 찌라시는 결과 발표 날까지 진위(verdict)·실제 방향이 화면에 없음', () => {
    let checked = 0;
    for (let s = 0; s < 60; s++) {
      const m = marketFor(900 + s, 20, 13, (s + 3).toString(16).padStart(32, '0'));
      for (const n of m.news.filter((x) => x.revealDay != null)) {
        for (let day = n.day + 1; day < n.revealDay! && day < 20; day++) {
          const v = sliceMarket(m, day, false, { rumorCheck: false, fakes: [] });
          const shown = v.news.find((x) => x.headline === n.headline && x.day === n.day)!;
          expect(shown.verdict).toBeUndefined();
          expect(shown.realTone).toBe(shown.tone);
          expect('revealDay' in shown).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
  it('장 전 찌라시만 보고는 속보 방향을 맞히기 어려움 (감별기 없이)', () => {
    let hit = 0;
    let total = 0;
    for (let s = 0; s < 150; s++) {
      const m = marketFor(2000 + s, 10, 13, (s + 11).toString(16).padStart(32, '0'));
      for (let day = 1; day < 10; day++) {
        const rs = preRumors(m, day, 'k' + s);
        for (const b of m.news.filter((n) => n.day === day && n.at != null && n.sector)) {
          const same = rs.filter((r) => r.sector === b.sector);
          // 그 업종 찌라시가 한 방향으로만 있을 때 그 방향을 믿으면 맞는 비율
          if (same.length === 1) {
            total++;
            if (same[0].tone === b.tone) hit++;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(hit / total).toBeLessThan(0.85);
  });
  it('v13: 장중 속보 전에는 그날 방향으로 미리 움직이지 않음', () => {
    let same = 0;
    let n = 0;
    for (let s = 0; s < 40; s++) {
      const m = marketFor(3000 + s, 10, 13, (s + 5).toString(16).padStart(32, '0'));
      for (const b of m.news.filter((x) => x.at != null && x.symbol && !x.fake)) {
        const t = dayTicks(m, b.symbol!, b.day, 60);
        const rel = Math.min(59, Math.max(1, Math.ceil(b.at! * 60)));
        const pre = t[rel - 1] - t[0];
        const after = t[60] - t[rel - 1];
        if (pre === 0 || after === 0) continue;
        n++;
        if (Math.sign(pre) === Math.sign(after)) same++;
      }
    }
    expect(n).toBeGreaterThan(20);
    // 예전엔 92% 같은 방향 — 이제는 동전 던지기 근처
    expect(same / n).toBeLessThan(0.75);
  });
});

describe('장 전 찌라시 모양으로 속보 업종을 알 수 없음', () => {
  it('두 번 나온 업종이 속보 업종일 확률이 한 번 나온 업종과 비슷함', () => {
    const rate = { pair: [0, 0], single: [0, 0] };
    for (let s = 0; s < 200; s++) {
      const m = marketFor(5000 + s, 10, 13, (s + 7).toString(16).padStart(32, '0'));
      for (let day = 1; day < 10; day++) {
        const rs = preRumors(m, day, 'p' + s);
        const hot = new Set(m.news.filter((n) => n.day === day && n.at != null && !n.fake && n.sector).map((n) => n.sector));
        const cnt = new Map<string, number>();
        for (const r of rs) cnt.set(r.sector, (cnt.get(r.sector) ?? 0) + 1);
        for (const [sec, c] of cnt) {
          const k = c >= 2 ? 'pair' : 'single';
          rate[k][1]++;
          if (hot.has(sec)) rate[k][0]++;
        }
      }
    }
    const p = rate.pair[0] / rate.pair[1];
    const q = rate.single[0] / rate.single[1];
    expect(rate.pair[1]).toBeGreaterThan(100);
    expect(Math.abs(p - q)).toBeLessThan(0.12);
  });
});

describe('레버리지 30% 제한은 예약 주문에도', () => {
  it('예약 사기로 레버리지 ETF 를 30% 넘게 걸 수 없음 (나눠 걸어도)', async () => {
    const { validatePlaceOrder, LEVERAGE_CAP } = await import('./engine.js');
    const { STOCKS } = await import('../game/stocks.js');
    const lev = STOCKS.find((s) => s.etf && s.etf.lev !== 1 && s.currency !== 'USD')!;
    const T = 1_900_000_000_000;
    // 1일째 장이 막 열린 상태 (장 마감까지 60초)
    const d = {
      room: { id: 'r', code: 'AAAAAA', seed: 11, salt: 'ef'.repeat(16), status: 'playing', total_days: 10, turn_seconds: 60, day: 0, deadline: T + 60_000, day_deadline: T + 60_000, host_id: 'a', version: 13 },
      players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0, last_seen: new Date(T).toISOString() })),
      trades: [],
      items: [],
      orders: [] as any[],
    } as any;
    const now = T + 1000;
    const base = marketFor(11, 10, 13, 'ef'.repeat(16)).bars[lev.symbol][0].open;
    let lim = 0;
    for (let f = 0.99; f > 0.72 && !lim; f -= 0.01) {
      try {
        validatePlaceOrder(d, 'a', now, { symbol: lev.symbol, side: 'buy', qty: 1, limit: Math.round(base * f) });
        lim = Math.round(base * f);
      } catch {}
    }
    expect(lim).toBeGreaterThan(0);
    const big = Math.floor((1_000_000 * LEVERAGE_CAP * 1.5) / lim);
    expect(() => validatePlaceOrder(d, 'a', now, { symbol: lev.symbol, side: 'buy', qty: big, limit: lim })).toThrow(/레버리지/);
    const part = Math.floor(big / 3);
    for (let i = 0; i < 3; i++) {
      try {
        const o = validatePlaceOrder(d, 'a', now, { symbol: lev.symbol, side: 'buy', qty: part, limit: lim });
        d.orders.push({ ...o, id: 'o' + i, created_at: new Date(now).toISOString() });
      } catch {}
    }
    expect(d.orders.length).toBeGreaterThan(0);
    const total = d.orders.reduce((a: number, o: any) => a + o.qty * o.limit_price, 0);
    expect(total).toBeLessThanOrEqual(1_000_000 * LEVERAGE_CAP * 1.01);
  });
});
