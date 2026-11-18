import { describe, expect, it } from 'vitest';
import { delistStages, planEvents24 } from '../game/events24';
import { generateMarket } from '../game/market';
import { communityPosts } from '../game/community';
import { seeded } from '../lib/rng';
import { GameError, sliceMarket, validateTrade, type GameData } from './engine';

const markets = (n: number, days = 20) => Array.from({ length: n }, (_, i) => generateMarket(1000 + i, days, 24, 'v24-' + i));

describe('v24 실제 시장 같은 사건', () => {
  it('사건은 한 판에 최대 3개, 여러 판이면 골고루 나옴', () => {
    const kinds: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const ev = planEvents24(seeded('plan-' + i), 20, new Set());
      expect(ev.length).toBeLessThanOrEqual(3);
      for (const e of ev) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    }
    for (const k of ['pump', 'binary', 'delist', 'war', 'rights', 'short']) expect(kinds[k] ?? 0).toBeGreaterThan(10);
  });

  it('상장 폐지: 징조 → 거래정지(가격 그대로) → 정리매매(첫날 -80% 넘게) → 폐지(1원), 거래 상태는 그날까지만 보임', () => {
    let checked = 0;
    for (const m of markets(120)) {
      for (const h of (m.halts ?? []).filter((x) => x.kind === 'halt')) {
        const b = m.bars[h.symbol][h.day];
        expect(b.open).toBe(b.close);
        expect(b.high).toBe(b.low);
        // 앞날 거래 상태는 화면 데이터에 없음
        const before = sliceMarket(m, h.day - 1, false, { rumorCheck: false, fakes: [] });
        expect((before.halts ?? []).some((x) => x.day >= h.day)).toBe(false);
        // 거래정지 전날까지 징조 뉴스(소문·공시)가 있음
        expect(m.news.some((n) => n.symbol === h.symbol && n.day < h.day && n.tone === 'bad')).toBe(true);
      }
      for (const h of (m.halts ?? []).filter((x) => x.kind === 'clear')) {
        const prevClear = (m.halts ?? []).some((x) => x.symbol === h.symbol && x.day === h.day - 1 && x.kind === 'clear');
        if (prevClear) continue;
        const prev = m.bars[h.symbol][h.day - 1].close;
        expect(m.bars[h.symbol][h.day].open / prev).toBeLessThan(0.3);
        checked++;
      }
      for (const h of (m.halts ?? []).filter((x) => x.kind === 'delisted')) expect(m.bars[h.symbol][h.day].close).toBe(1);
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('거래정지·상장폐지 종목은 사고팔 수 없음 (서버 규칙)', () => {
    for (const m of markets(150)) {
      const h = (m.halts ?? []).find((x) => x.kind === 'halt' || x.kind === 'delisted');
      if (!h) continue;
      const d = {
        room: { id: 'r', code: 'C', seed: 1000 + markets.length, status: 'playing', total_days: 20, turn_seconds: 60, day: h.day, deadline: Date.now() + 60000, day_deadline: Date.now() + 60000, host_id: 'a', version: 24, salt: '' },
        players: [{ id: 'a', room_id: 'r', nickname: 'A', mode: 'easy', ready: true, ended_day: -1, version: 0 }],
        trades: [],
        items: [],
        orders: [],
      } as unknown as GameData;
      // 이 시장을 그대로 쓰도록 같은 시드·비밀값을 찾음
      const i = Number((m.salt ?? '').replace('v24-', ''));
      d.room.seed = 1000 + i;
      d.room.salt = 'v24-' + i;
      expect(() => validateTrade(d, 'a', Date.now() + 10_000, { symbol: h.symbol, side: 'buy', qty: 1 })).toThrow(GameError);
      return;
    }
    throw new Error('거래정지 판을 못 찾음');
  });

  it('미국 종목 승인 결과: 하루 +50% 넘게 오르거나 -45% 넘게 빠지는 날이 있음', () => {
    let big = 0;
    for (const m of markets(150)) {
      for (const [sym, bars] of Object.entries(m.usd)) {
        for (let d = 1; d < bars.length; d++) {
          const r = bars[d].close / bars[d - 1].close;
          if (r > 1.5 || r < 0.55) big++;
        }
        void sym;
      }
    }
    expect(big).toBeGreaterThan(3);
  });

  it('테마주: 상한가 근처로 이틀 넘게 연속 오른 뒤 크게 빠지는 판이 있음, 빠지기 전날 투자경고 뉴스', () => {
    let runs = 0;
    for (const m of markets(150)) {
      for (const n of m.news.filter((x) => x.headline.includes('투자경고'))) {
        const b = m.bars[n.symbol!];
        const up = (d: number) => b[d].close / b[d - 1].close > 1.25;
        if (up(n.day) && up(n.day - 1) && b[n.day + 1].close / b[n.day].close < 0.8) runs++;
      }
    }
    expect(runs).toBeGreaterThan(3);
  });

  it('전쟁: 전날 긴장 뉴스, 당일 유가 급등', () => {
    let seen = 0;
    for (const m of markets(200)) {
      const w = m.news.find((n) => n.headline.includes('무력 충돌'));
      if (!w) continue;
      expect(m.news.some((n) => n.day === w.day - 1 && n.headline.includes('긴장 고조'))).toBe(true);
      expect(m.macro[w.day].oil / m.macro[w.day - 1].oil).toBeGreaterThan(1.04);
      seen++;
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('상장 폐지 단계 날짜가 판 안에 있음', () => {
    for (let s = 1; s < 14; s++) {
      const st = delistStages({ kind: 'delist', symbol: 'X', start: s, survive: false }, 20);
      expect(st.delistFrom).toBeLessThan(20);
    }
  });

  it('뉴스·속보·커뮤니티가 서로 이어짐: 전쟁 날 유가 하락 뉴스 없음, 정유·항공 원인 기사, 사건 반응 글은 뉴스 뒤에', () => {
    let seen = 0;
    for (const m of markets(200)) {
      const w = m.news.find((n) => n.headline.includes('무력 충돌'));
      if (!w) continue;
      seen++;
      expect(m.news.some((n) => n.day === w.day && /유가/.test(n.headline) && /하락|급락/.test(n.headline))).toBe(false);
      expect(m.news.some((n) => n.day === w.day && n.sector === 'energy' && n.headline.includes('충돌'))).toBe(true);
      expect(m.news.some((n) => n.day === w.day && n.sector === 'air' && n.headline.includes('충돌'))).toBe(true);
      const posts = communityPosts(m, w.day, m.salt!).filter((p) => /전쟁|유가|기름값/.test(p.text));
      expect(posts.length).toBeGreaterThan(0);
      for (const p of posts) expect(p.at).toBeGreaterThan(w.at ?? 0);
    }
    expect(seen).toBeGreaterThan(3);
    // 테마주·상장 폐지 반응 글
    let reacts = 0;
    for (const m of markets(150)) {
      for (const n of m.news.filter((x) => /투자경고|거래정지|유상증자/.test(x.headline))) {
        const ps = communityPosts(m, n.day, m.salt!).filter((p) => p.symbol === n.symbol && p.hype === 0 && p.at > (n.at ?? 0));
        if (ps.length) reacts++;
      }
    }
    expect(reacts).toBeGreaterThan(5);
  });
});
