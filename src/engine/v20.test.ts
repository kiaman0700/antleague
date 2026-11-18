// (v20) 커뮤니티·SNS (design/community-news-v20.md)
import { describe, expect, it } from 'vitest';
import { buildView, marketFor, type GameData } from './engine.js';
import { communityPosts, hypeAt } from '../game/community.js';
import { dayTicks } from '../game/intraday.js';

const SALT = 'v20-test-salt-' + 'x'.repeat(20);
function game(day: number, now: number, turn = 180): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 5, status: 'playing', total_days: 10, turn_seconds: turn, day, deadline: now + 60_000, day_deadline: now + 60_000, host_id: 'a', max_players: 2, version: 20, salt: SALT },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, pre_day: day })),
    trades: [],
    items: [],
    orders: [],
  };
}

describe('v20 커뮤니티·SNS', () => {
  const m = marketFor(5, 10, 20, SALT);
  it('하루 8~14개, 올라온 시각 순', () => {
    for (let d = 0; d < 10; d++) {
      const ps = communityPosts(m, d, SALT);
      expect(ps.length).toBeGreaterThanOrEqual(8);
      expect(ps.length).toBeLessThanOrEqual(14);
      for (let i = 1; i < ps.length; i++) expect(ps[i].at).toBeGreaterThanOrEqual(ps[i - 1].at);
    }
  });
  it('진짜 약 40%, 검증 글은 일반 글보다 훨씬 잘 맞음 (약 75%)', () => {
    let real = 0, all = 0, vReal = 0, vAll = 0;
    for (let s = 0; s < 60; s++) {
      const salt = SALT + s;
      const mm = marketFor(s, 10, 20, salt);
      for (let d = 0; d < 9; d++)
        for (const p of communityPosts(mm, d, salt)) {
          all++;
          if (p.real) real++;
          if (p.verified) {
            vAll++;
            if (p.real) vReal++;
          }
        }
    }
    expect(real / all).toBeGreaterThan(0.25);
    expect(real / all).toBeLessThan(0.45);
    expect(vReal / vAll).toBeGreaterThan(0.6);
    expect(vReal / vAll).toBeLessThan(0.9);
  });
  it('들썩임은 하루 끝에 0 — 시가·종가는 그대로, 고가·저가 안', () => {
    for (let d = 0; d < 10; d++) {
      const ps = communityPosts(m, d, SALT);
      for (const p of ps) expect(hypeAt(ps, p.symbol ?? 'CORE', p.sector, 1)).toBe(0);
      for (const sym of ['CORE', 'HBIO', 'NEOT']) {
        const t = dayTicks(m, sym, d, 180);
        expect(t[0]).toBe(m.bars[sym][d].open);
        expect(t[180]).toBe(m.bars[sym][d].close);
        for (const v of t) {
          expect(v).toBeLessThanOrEqual(m.bars[sym][d].high);
          expect(v).toBeGreaterThanOrEqual(m.bars[sym][d].low);
        }
      }
    }
  });
  it('v19 방은 장중 가격이 그대로 (들썩임 없음)', () => {
    const m19 = marketFor(5, 10, 19, SALT);
    const m19b = marketFor(5, 10, 19, SALT);
    expect(dayTicks(m19, 'CORE', 2, 180)).toEqual(dayTicks(m19b, 'CORE', 2, 180));
  });
  it('화면 데이터: 아직 안 올라온 글·진위·들썩임은 없음, 장 전엔 오늘 글 없음', () => {
    const start = 1_800_000_000_000;
    const g = game(3, start);
    // 장 시간 중간쯤
    const mid = g.room.deadline! - 90_000;
    const v = buildView(g, 'a', mid);
    const all = communityPosts(m, 3, SALT);
    const shown = v.community ?? [];
    expect(shown.length).toBeLessThan(all.length);
    for (const p of shown) {
      expect(p.day).toBe(3);
      expect(p).not.toHaveProperty('real');
      expect(p).not.toHaveProperty('hype');
      expect(p).not.toHaveProperty('target');
      expect(p.verdict).toBeUndefined();
    }
    const json = JSON.stringify(v);
    for (const p of all.filter((x) => !shown.some((s) => s.id === x.id))) expect(json).not.toContain(p.text);
    expect(json).not.toContain(SALT);
  });
  it('지난 날 글은 market.community 로, 짚은 때가 지나면 진위 공개', () => {
    const start = 1_800_000_000_000;
    const g = game(5, start);
    const v = buildView(g, 'a', g.room.deadline! - 90_000);
    const past = v.market!.community ?? [];
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((p) => p.day < 5)).toBe(true);
    const d1 = communityPosts(m, 1, SALT);
    for (const p of past.filter((x) => x.day === 1)) {
      const src = d1.find((x) => x.id === p.id)!;
      if (5 > Math.max(src.day, src.target.day)) expect(p.verdict).toBe(src.real ? 'true' : 'false');
    }
  });
});

describe('v20 들썩임·기사', () => {
  it('글을 보고 바로 따라 사서 짚은 때에 팔아도 가짜 글로는 이득이 없음 (글이 보이는 칸에서 이미 튐)', () => {
    let fakeGain = 0, fakeN = 0;
    for (let s = 0; s < 30; s++) {
      const salt = 'hype-' + s;
      const m = marketFor(s, 10, 20, salt);
      for (let d = 0; d < 9; d++)
        for (const p of communityPosts(m, d, salt)) {
          if (p.real || !p.symbol || p.target.day !== d) continue;
          const t = dayTicks(m, p.symbol, d, 180);
          const buy = t[Math.min(180, Math.ceil(p.at * 180))];
          const sell = t[Math.min(180, Math.ceil(p.target.at * 180))];
          fakeGain += (p.tone === 'good' ? 1 : -1) * Math.log(sell / buy);
          fakeN++;
        }
    }
    // 수수료(0.1%)보다 작아야 — 평균적으로 따라 해 봐야 남는 게 없음
    expect(fakeN).toBeGreaterThan(50);
    expect(fakeGain / fakeN).toBeLessThan(0.002);
  });
  it('기사: 인터뷰가 있는 기사가 진짜일 확률이 더 높음, 화면 기사엔 진위가 없음', async () => {
    const { articleOf } = await import('../game/articles.js');
    const { isFakeNews } = await import('./engine.js');
    let qReal = 0, q = 0, nqReal = 0, nq = 0;
    for (let s = 0; s < 60; s++) {
      const salt = 'art-' + s;
      const m = marketFor(s, 10, 20, salt);
      for (const n of m.news) {
        if (n.rumor || n.kind === 'macro') continue;
        const fake = isFakeNews(n);
        const a = articleOf(n, salt, fake);
        expect(JSON.stringify(a)).not.toMatch(/fake|verdict|real/);
        if (a.quote) { q++; if (!fake) qReal++; } else { nq++; if (!fake) nqReal++; }
      }
    }
    expect(q).toBeGreaterThan(30);
    expect(qReal / q).toBeGreaterThan(nqReal / nq);
  });
});

describe('v20 커뮤니티 글 다시 보내지 않기', () => {
  it('화면이 같은 표시를 보내면 글을 빼고 communitySame', () => {
    const start = 1_800_000_000_000;
    const g = game(3, start);
    const at = g.room.deadline! - 90_000;
    const v1 = buildView(g, 'a', at);
    expect(v1.community?.length).toBeGreaterThan(0);
    const v2 = buildView(g, 'a', at, undefined, undefined, undefined, undefined, v1.communityKey);
    expect(v2.community).toBeUndefined();
    expect(v2.communitySame).toBe(true);
    // 글이 늘면 다시 보냄
    const v3 = buildView(g, 'a', g.room.deadline! - 2_000, undefined, undefined, undefined, undefined, v1.communityKey);
    if ((v3.communityKey ?? '') !== v1.communityKey) expect(v3.community?.length).toBeGreaterThan(v1.community!.length);
  });
});

describe('v20 감별기로 커뮤니티 글 고르기', () => {
  it('지금까지 올라온 글은 고를 수 있고, 그 글에만 판정이 붙음 · 아직 안 올라온 글은 거절', async () => {
    const { validateUseItem } = await import('./engine.js');
    const start = 1_800_000_000_000;
    const g = game(3, start);
    const at = g.room.deadline! - 90_000;
    g.items.push({ id: 'i1', player_id: 'a', day: 3, kind: 'detector', action: 'buy', cost: 0, created_at: new Date(at).toISOString() });
    const shown = buildView(g, 'a', at).community!;
    const all = communityPosts(marketFor(5, 10, 20, SALT), 3, SALT);
    const future = all.find((p) => !shown.some((x) => x.id === p.id))!;
    expect(() => validateUseItem(g, 'a', at, { kind: 'detector', payload: { pick: future.text } })).toThrow();
    const target = shown[0];
    const row = validateUseItem(g, 'a', at, { kind: 'detector', payload: { pick: target.text } });
    g.items.push({ ...(row as object), id: 'i2', created_at: new Date(at).toISOString() } as never);
    const v = buildView(g, 'a', at);
    const src = all.find((p) => p.id === target.id)!;
    expect(v.community!.find((p) => p.id === target.id)?.verdict).toBe(src.real ? 'true' : 'false');
    expect(v.community!.filter((p) => p.verdict).length).toBe(1);
    // 상대 화면에는 판정이 없음
    expect(buildView(g, 'b', at).community!.some((p) => p.verdict)).toBe(false);
  });
});
