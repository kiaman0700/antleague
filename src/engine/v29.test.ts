// v29: 커뮤니티 글의 겉모습(때 문구·짚은 날·올라온 시각)만으로 진위가 드러나지 않음
import { describe, expect, it } from 'vitest';
import { marketFor } from './engine.js';
import { communityPosts } from '../game/community.js';
import { liveNews } from '../game/liveNews.js';

const SALT = (i: number) => (i.toString(16) + 'ab12').repeat(8).slice(0, 32);
const mk = (i: number, v = 29, days = [5, 10, 20][i % 3]) => marketFor(1000 + i * 7919, days, v, SALT(i));

function buckets(v: number) {
  const b = new Map<string, { n: number; real: number }>();
  let n = 0;
  let real = 0;
  for (let i = 0; i < 150; i++) {
    const m = mk(i, v);
    for (let d = 0; d < m.totalDays; d++) {
      for (const p of communityPosts(m, d, m.salt!, 60)) {
        if (p.re) continue;
        const dd = p.target.day - d;
        const kind = /장 마감 전에/.test(p.text) ? 'close' : /장 시작 전에/.test(p.text) ? 'morning' : 'time';
        const atB = Math.min(9, Math.floor(p.at * 10));
        const gap = dd === 0 ? Math.min(9, Math.floor((p.target.at - p.at) * 10)) : -1;
        for (const k of [`kind:${kind}:${dd}`, `at:${dd > 0 ? 'f' : 't'}:${atB}`, `gap:${gap}`, `dd:${dd}`]) {
          const x = b.get(k) ?? { n: 0, real: 0 };
          x.n++;
          if (p.real) x.real++;
          b.set(k, x);
        }
        n++;
        if (p.real) real++;
      }
    }
  }
  return { b, rate: real / n };
}

describe('v29 커뮤니티 글: 겉모습으로 진위가 안 보임', () => {
  it('때 문구·짚은 날·올라온 시각·남은 때 어느 묶음에서도 진짜 비율이 0%·100% 이거나 크게 치우치지 않음', () => {
    const { b, rate } = buckets(29);
    const bad: string[] = [];
    for (const [k, x] of b) {
      if (x.n < 60) continue;
      const r = x.real / x.n;
      if (r < 0.03 || r > 0.97 || Math.abs(r - rate) > 0.3) bad.push(`${k} ${x.real}/${x.n}`);
    }
    expect(bad).toEqual([]);
  });
  it('예전 판(v28)은 치우친 묶음이 있었음 — 같은 검사로 잡힘', () => {
    const { b } = buckets(28);
    const skew = [...b.values()].some((x) => x.n >= 60 && (x.real / x.n < 0.03 || x.real / x.n > 0.97));
    expect(skew).toBe(true);
  });
  it('장중 소문 기사는 이미 공개된 소식의 반응 글을 인용하지 않음', () => {
    let rumors = 0;
    for (let i = 0; i < 60; i++) {
      const m = mk(i);
      for (let d = 0; d < m.totalDays; d++) {
        const posts = communityPosts(m, d, m.salt!, 60);
        for (const a of liveNews(m, d, m.salt!, 60, 60).filter((x) => x.rumor)) {
          rumors++;
          const quoted = posts.filter((p) => p.symbol === a.symbol);
          expect(quoted.some((p) => !p.re)).toBe(true);
        }
      }
    }
    expect(rumors).toBeGreaterThan(20);
  });
  it('v28 판의 글은 그대로 (가짜 글의 예전 모양 "오늘 장 마감 전에"가 남아 있음)', () => {
    let close = 0;
    for (let i = 0; i < 20; i++) {
      const m = mk(i, 28);
      for (let d = 0; d < m.totalDays; d++) close += communityPosts(m, d, m.salt!, 60).filter((p) => /장 마감 전에/.test(p.text)).length;
    }
    expect(close).toBeGreaterThan(0);
  });
});
