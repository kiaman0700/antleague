/** 규칙 v17 (설계서 design/stock-news-v17.md): 회사 뉴스가 더 많고, 연관 회사(거래처·같은 업종·경쟁사)가 함께 움직이며, 장 전 찌라시도 절반은 회사 이름 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildView, marketFor, type GameData } from './engine.js';
import { preRumors, publicRumors } from '../game/rumors.js';
import { STOCK_MAP } from '../game/stocks.js';

const saltOf = (seed: number) => ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(4);
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);

describe('v16 이하 시장은 하나도 안 바뀜', () => {
  // v17 을 만들기 전에 찍어 둔 지문 (시장 전체 + 장 전 찌라시 4일치)
  const SNAP: [number, number, string][] = [
    [12, 7, 'eff31e2ca94bbdf3'],
    [12, 4242, '901f3a06ddf206ed'],
    [13, 7, 'ec21c6f618bb019e'],
    [13, 4242, '0d09a904883afb9f'],
    [15, 7, '88b06ac209f6ef2a'],
    [15, 4242, 'fee9934ba7713e92'],
    [16, 7, '88b06ac209f6ef2a'],
    [16, 4242, 'fee9934ba7713e92'],
  ];
  for (const [v, seed, want] of SNAP)
    it(`v${v} 시드 ${seed}`, () => {
      const salt = saltOf(seed);
      const m = marketFor(seed, 10, v, salt);
      const r = [0, 1, 2, 3].map((d) => preRumors(m, d, salt));
      expect(createHash('sha256').update(JSON.stringify({ ...m, version: 0 }) + JSON.stringify(r)).digest('hex').slice(0, 16)).toBe(want);
    });
});

describe('v17 아침 뉴스는 회사 소식이 더 많음', () => {
  it('회사 60~72% · 업종 8~16% (여러 판 평균, 사건 흐름·시황 기사 제외)', () => {
    let company = 0;
    let sector = 0;
    let all = 0;
    for (const seed of SEEDS) {
      const m = marketFor(seed, 20, 17, saltOf(seed));
      for (const n of m.news) {
        if (n.label === '시황' || n.label === '해외' || n.label === '단독' || n.label === '특징주' || n.fake) continue;
        all++;
        if (n.kind === 'company') company++;
        if (n.kind === 'sector') sector++;
      }
    }
    expect(company / all).toBeGreaterThan(0.6);
    expect(company / all).toBeLessThan(0.72);
    expect(sector / all).toBeGreaterThan(0.08);
    expect(sector / all).toBeLessThan(0.16);
  });
  it('v16 은 그대로 업종 소식이 더 많음 (비교)', () => {
    let sector = 0;
    let all = 0;
    for (const seed of SEEDS) for (const n of marketFor(seed, 20, 16, saltOf(seed)).news) if (!n.label && !n.fake) (all++, n.kind === 'sector' && sector++);
    expect(sector / all).toBeGreaterThan(0.18);
  });
});

describe('v17 연관 회사 표시', () => {
  it('회사 뉴스에는 관계(rel)가 붙고, 관련 칩의 회사는 모두 관계가 있음', () => {
    const m = marketFor(77, 20, 17, saltOf(77));
    const cn = m.news.filter((n) => n.kind === 'company' && n.symbol);
    expect(cn.length).toBeGreaterThan(5);
    for (const n of cn) {
      expect(n.rel, n.headline).toBeTruthy();
      for (const s of n.related) if (s !== n.symbol) expect(n.rel![s], `${n.headline} ${s}`).toBeTruthy();
    }
  });
  it('경쟁사 반대 반응: 경쟁사가 있는 회사 기사 15~40% (실적·사건 기사 포함한 전체 중), 경쟁사는 같은 업종', () => {
    let withRival = 0;
    let total = 0;
    for (const seed of SEEDS) {
      for (const n of marketFor(seed, 20, 17, saltOf(seed)).news) {
        if (n.kind !== 'company' || !n.rel || n.label || n.rumor) continue;
        total++;
        const rivals = Object.entries(n.rel).filter(([, r]) => r === 'rival');
        if (rivals.length) {
          withRival++;
          for (const [s] of rivals) expect(STOCK_MAP[s].sector).toBe(STOCK_MAP[n.symbol!].sector);
        }
      }
    }
    expect(withRival / total).toBeGreaterThan(0.15);
    expect(withRival / total).toBeLessThan(0.4);
  });
  it('경쟁사는 그날 시가가 반대쪽으로 (평균적으로)', () => {
    let opposite = 0;
    let n = 0;
    for (const seed of SEEDS) {
      const m = marketFor(seed, 20, 17, saltOf(seed));
      for (const ev of m.news) {
        if (ev.kind !== 'company' || !ev.rel || ev.rumor || ev.at != null || ev.label) continue;
        for (const [s, r] of Object.entries(ev.rel)) {
          if (r !== 'rival') continue;
          const bars = m.bars[s];
          const prev = ev.day > 0 ? bars[ev.day - 1].close : bars[0].open;
          const gap = bars[ev.day].open / prev - 1;
          n++;
          if ((ev.tone === 'good' && gap < 0) || (ev.tone === 'bad' && gap > 0)) opposite++;
        }
      }
    }
    expect(n).toBeGreaterThan(20);
    expect(opposite / n).toBeGreaterThan(0.55);
  });
});

describe('v17 장 전 찌라시도 회사 이름', () => {
  it('약 절반이 회사 이름, 진짜 단서와 헛소문의 회사 이름 비율이 비슷(10%p 안)', () => {
    let named = 0;
    let all = 0;
    const real = [0, 0];
    const fake = [0, 0];
    for (const seed of SEEDS) {
      const salt = saltOf(seed);
      const m = marketFor(seed, 20, 17, salt);
      for (let d = 1; d < 20; d++)
        for (const r of preRumors(m, d, salt)) {
          all++;
          if (r.symbol) named++;
          const bucket = r.real ? real : fake;
          bucket[0]++;
          if (r.symbol) bucket[1]++;
          if (r.symbol) {
            expect(r.text).toContain(STOCK_MAP[r.symbol].name);
            expect(STOCK_MAP[r.symbol].sector).toBe(r.sector);
          }
        }
    }
    expect(named / all).toBeGreaterThan(0.35);
    expect(named / all).toBeLessThan(0.65);
    expect(Math.abs(real[1] / real[0] - fake[1] / fake[0])).toBeLessThan(0.1);
  });
  it('화면 데이터의 찌라시에는 진위가 없음 (감별기 안 쓰면)', () => {
    const salt = saltOf(5);
    const m = marketFor(5, 20, 17, salt);
    const pub = publicRumors(preRumors(m, 3, salt), false);
    for (const r of pub) {
      expect('real' in r).toBe(false);
      expect(r.verdict).toBeUndefined();
    }
  });
});

describe('v17 화면 데이터에 미래·진실이 새지 않음', () => {
  it('오늘 뉴스의 관계 표시는 공개 방향(tone)만 — 진짜 방향(realTone)·미래 가격 없음', () => {
    const T0 = 1_900_000_000_000;
    const d: GameData = {
      room: { id: 'r', code: 'V17AAA', seed: 21, salt: saltOf(21), status: 'playing', total_days: 10, turn_seconds: 60, day: 3, deadline: T0 + 30_000, day_deadline: T0 + 30_000, host_id: 'a', version: 17 },
      players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: 2, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
      trades: [],
      items: [],
      orders: [],
    };
    const v = buildView(d, 'a', T0);
    const today = v.market!.news.filter((n) => n.day === 3);
    for (const n of today) {
      expect(n.realTone).toBe(n.tone);
      if (n.rel) for (const r of Object.values(n.rel)) expect(['link', 'peer', 'rival', 'chain', 'etf']).toContain(r);
    }
    expect(v.market!.bars.CORE.length).toBeLessThanOrEqual(4);
  });
});
