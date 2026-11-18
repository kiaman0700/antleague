import { describe, expect, it } from 'vitest';
import { generateMarket } from '../game/market';
import { communityPosts, MACRO_REACT_TEXTS, REACT_VERSION } from '../game/community';

const mk = (i: number, v = 25) => {
  const m = generateMarket(500 + i, 15, v, 'v25-' + i);
  return m;
};

describe('v25 모든 소식에 커뮤니티 반응', () => {
  it('그날 공개된 소식마다 반응 글이 있고, 뉴스보다 늦게 올라오며, 가격(들썩임)과 무관', () => {
    let news = 0;
    let reacted = 0;
    for (let i = 0; i < 30; i++) {
      const m = mk(i);
      expect(m.version).toBeGreaterThanOrEqual(REACT_VERSION);
      for (let d = 0; d < m.totalDays; d++) {
        const posts = communityPosts(m, d, m.salt!);
        const reacts = posts.filter((p) => p.id.includes('-n'));
        for (const p of reacts) {
          expect(p.hype).toBe(0);
          expect(p.real).toBe(true);
        }
        for (const n of m.news.filter((x) => x.day === d && x.at != null)) {
          // 속보 반응은 속보가 뜬 뒤에만
          for (const p of reacts.filter((x) => x.target.day === d && x.target.at === n.at)) expect(p.at).toBeGreaterThan(n.at!);
        }
        news += m.news.filter((x) => x.day === d).length;
        reacted += reacts.length;
      }
    }
    expect(reacted).toBeGreaterThan(news); // 소식 하나에 1~3개
  });

  it('반응 글은 기사의 진위와 상관없음 (표시 없는 가짜 기사에도 똑같이 반응 — 반응으로 진위가 새지 않음)', () => {
    for (let i = 0; i < 20; i++) {
      const m = mk(i);
      const d = 3;
      const a = communityPosts(m, d, m.salt! + 'x').filter((p) => p.id.includes('-n'));
      const flipped = { ...m, news: m.news.map((n) => (n.day === d ? { ...n, fake: !n.fake, realTone: n.realTone === 'good' ? ('bad' as const) : ('good' as const) } : n)) };
      const b = communityPosts(flipped, d, m.salt! + 'x').filter((p) => p.id.includes('-n'));
      expect(JSON.stringify(b.map((p) => [p.at, p.text, p.likes, p.tone]))).toBe(JSON.stringify(a.map((p) => [p.at, p.text, p.likes, p.tone])));
    }
  });

  it('거시 소식 반응 글은 엉뚱한 업종(에너지) 꼬리표가 아니라 영향받는 업종으로', () => {
    let seen = 0;
    for (let i = 0; i < 20; i++) {
      const m = mk(i);
      for (let d = 0; d < m.totalDays; d++) {
        for (const n of m.news.filter((x) => x.day === d && x.kind === 'macro' && !x.sector && x.macro !== 'oil')) {
          const ps = communityPosts(m, d, m.salt!).filter((p) => p.re && p.target.day === d && p.target.at === (n.at ?? 0) && !p.symbol);
          for (const p of ps) if (MACRO_REACT_TEXTS.some((t) => t === p.text)) {
            expect(p.sector).not.toBe('energy');
            seen++;
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('v24 판의 커뮤니티 글은 그대로 (반응 글 없음)', () => {
    const m = mk(1, 24);
    for (let d = 0; d < 5; d++) expect(communityPosts(m, d, m.salt!).some((p) => p.id.includes('-n'))).toBe(false);
  });

  it('관계(거래처·경쟁사·ETF) 반응: 경쟁사 글은 방향이 반대', () => {
    let rival = 0;
    for (let i = 0; i < 40; i++) {
      const m = mk(i);
      for (let d = 0; d < m.totalDays; d++) {
        const posts = communityPosts(m, d, m.salt!).filter((p) => p.id.includes('-n') && /경쟁사/.test(p.text));
        for (const p of posts) {
          const n = m.news.find((x) => x.day === d && x.symbol && x.rel?.[p.symbol!] === 'rival' && p.text.includes(x.symbol ? '' : ''));
          if (n) {
            expect(p.tone).not.toBe(n.tone);
            rival++;
          }
        }
      }
    }
    expect(rival).toBeGreaterThan(3);
  });
});
