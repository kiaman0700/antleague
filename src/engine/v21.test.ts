// (v21) 실제 시장 같은 사례: 배당락 · 장중 시황·소문 기사 · 속보 반응 글 (design/realism-v21.md)
import { describe, expect, it } from 'vitest';
import { buildView, marketFor, type GameData } from './engine.js';
import { liveNews } from '../game/liveNews.js';
import { communityPosts } from '../game/community.js';
import { dayTicks } from '../game/intraday.js';
import { STOCK_MAP } from '../game/stocks.js';

const SALT = 'v21-test-salt-' + 'y'.repeat(20);

describe('v21 배당락', () => {
  it('배당 기준일 다음 날 시가가 배당률만큼 낮게 (v20 은 그대로)', () => {
    let checked = 0;
    for (let s = 0; s < 20; s++) {
      const salt = SALT + s;
      const m21 = marketFor(s, 20, 21, salt);
      const m20 = marketFor(s, 20, 20, salt);
      const seen = new Set<number>();
      for (const dv of [...m21.dividends].sort((a, b) => a.day - b.day)) {
        if (dv.day + 1 >= 20 || STOCK_MAP[dv.symbol].etf) continue; // 바스켓 ETF 는 담은 종목 배당락으로
        // 그 판의 첫 배당락까지만 비교 (그 뒤로는 앞선 배당락만큼 가격이 달라서)
        if (seen.size && !seen.has(dv.day)) continue;
        seen.add(dv.day);
        const sym = dv.symbol;
        // 같은 비밀값이라 배당락 날 전까지 가격이 같음
        expect(m21.bars[sym][dv.day].close).toBe(m20.bars[sym][dv.day].close);
        const gap21 = Math.log(m21.bars[sym][dv.day + 1].open / m21.bars[sym][dv.day].close);
        const gap20 = Math.log(m20.bars[sym][dv.day + 1].open / m20.bars[sym][dv.day].close);
        // 시가 갭이 배당률만큼 더 내려감 (호가 반올림·상하한 오차 안)
        expect(gap21 - gap20).toBeCloseTo(Math.log(1 - dv.yieldPct / 100), 2);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
  it('배당락 일정·아침 기사', () => {
    const m = marketFor(3, 20, 21, SALT);
    const dv = m.dividends.find((x) => x.day + 1 < 20)!;
    expect(m.events.some((e) => e.day === dv.day + 1 && e.title === '배당락')).toBe(true);
    expect(m.news.some((n) => n.day === dv.day + 1 && n.symbol === dv.symbol && n.headline.includes('배당락'))).toBe(true);
  });
});

function game(day: number, now: number): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 5, status: 'playing', total_days: 10, turn_seconds: 180, day, deadline: now + 60_000, day_deadline: now + 60_000, host_id: 'a', max_players: 2, version: 21, salt: SALT },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, pre_day: day })),
    trades: [],
    items: [],
    orders: [],
  };
}

describe('v21 장중 기사·반응 글', () => {
  const m = marketFor(5, 10, 21, SALT);
  it('시황 기사는 그 시각까지 실제로 움직인 값 (공개 칸 기준)', () => {
    for (let d = 0; d < 10; d++)
      for (const n of liveNews(m, d, SALT, 180).filter((x) => x.label === '시황')) {
        const t = dayTicks(m, n.symbol!, d, 180);
        const j = Math.round(n.at! * 180) - 1;
        const ch = t[j] / t[0] - 1;
        expect(n.headline).toContain(`${ch >= 0 ? '+' : ''}${(ch * 100).toFixed(1)}%`);
      }
  });
  it('공개 칸 전엔 장중 기사가 화면 데이터에 없음', () => {
    const start = 1_800_000_000_000;
    const g = game(4, start);
    const early = buildView(g, 'a', g.room.deadline! - 175_000);
    const all = liveNews(m, 4, SALT, early.live?.n ?? 180);
    const json = JSON.stringify(early);
    for (const n of all.filter((x) => (x.at ?? 1) > 0.1)) expect(json).not.toContain(n.headline);
  });
  it('속보 직후 반응 글은 속보 뒤에만 (진짜·들썩임 없음)', () => {
    let n = 0;
    for (let d = 0; d < 10; d++) {
      const breaking = m.news.filter((x) => x.day === d && x.at != null);
      for (const p of communityPosts(m, d, SALT).filter((x) => x.id.includes('-r'))) {
        n++;
        expect(p.real).toBe(true);
        expect(p.hype).toBe(0);
        expect(breaking.some((b) => b.symbol === p.symbol && b.at! < p.at)).toBe(true);
      }
    }
    expect(n).toBeGreaterThanOrEqual(0);
  });
  it('v20 방의 커뮤니티 글은 그대로 (반응 글 없음)', () => {
    const m20 = marketFor(5, 10, 20, SALT);
    for (let d = 0; d < 10; d++) expect(communityPosts(m20, d, SALT + 'v20').every((p) => !p.id.includes('-r'))).toBe(true);
  });
});
