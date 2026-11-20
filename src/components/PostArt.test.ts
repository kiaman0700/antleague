import { describe, expect, it } from 'vitest';
import { pickArt } from './PostArt';
import { generateMarket } from '../game/market';
import { communityPosts } from '../game/community';
import { CURRENT_RULES_VERSION } from '../engine/engine';

describe('개미폰 그림 고르기', () => {
  it('같은 글은 늘 같은 그림', () => {
    const p = { id: 'x', text: '코어반도체 신제품 반응 좋대요', sector: 'kr_semi', tone: 'good' as const };
    expect(pickArt(p)).toEqual(pickArt({ ...p }));
  });

  it('그림은 진위·들썩임과 상관없음 — 같은 글이면 진짜든 헛소문이든 같은 그림', () => {
    const base = { id: 'y', text: '피즈콜라에 오늘 악재가 나온다는 얘기가 돌아요', sector: 'kr_food', tone: 'bad' as const };
    const asTrue = pickArt({ ...base, verdict: 'true' } as typeof base);
    const asFalse = pickArt({ ...base, verdict: 'false' } as typeof base);
    expect(asTrue).toEqual(asFalse);
  });

  it('실제 판의 글에서 진짜 글과 가짜 글의 그림 장면 비율이 크게 다르지 않음 (그림으로 진위를 짐작할 수 없음)', () => {
    const count = { t: new Map<string, number>(), f: new Map<string, number>(), nt: 0, nf: 0 };
    for (let s = 1; s <= 25; s++) {
      const m = generateMarket(3000 + s, 10, CURRENT_RULES_VERSION, 'art-' + s);
      for (let d = 0; d < 8; d++) {
        for (const post of communityPosts(m, d, 'art-' + s)) {
          if (post.re) continue;
          const real = post.real;
          if (real === undefined) continue;
          const { scene } = pickArt(post);
          const k = real ? count.t : count.f;
          k.set(scene, (k.get(scene) ?? 0) + 1);
          if (real) count.nt++;
          else count.nf++;
        }
      }
    }
    expect(count.nt).toBeGreaterThan(50);
    expect(count.nf).toBeGreaterThan(50);
    for (const scene of new Set([...count.t.keys(), ...count.f.keys()])) {
      const a = (count.t.get(scene) ?? 0) / count.nt;
      const b = (count.f.get(scene) ?? 0) / count.nf;
      expect(Math.abs(a - b)).toBeLessThan(0.08);
    }
  });
});
