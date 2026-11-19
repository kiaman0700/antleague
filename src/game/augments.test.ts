import { describe, expect, it } from 'vitest';
import { AUGMENTS, AUG_MAP, augmentDays, augmentOffer, eligible, shiftTier, tierPattern, TIER_PATTERNS, type OfferCtx } from './augments.js';

const base: OfferCtx = { salt: 'salt-x', seat: 'seat-a', n: 0, picks: 3, tier: 'gold', daysLeft: 10, multi: true, owned: [], takenUnique: [], heldSectors: [] };

describe('증강 고르는 날', () => {
  it('5일 2번, 10일 3번(1·4·7일차), 20일 4번, 마지막 20% 구간엔 없음', () => {
    expect(augmentDays(5)).toEqual([0, 2]);
    expect(augmentDays(10)).toEqual([0, 3, 6]);
    expect(augmentDays(20)).toEqual([0, 5, 10, 14]);
    for (const d of [5, 10, 20]) for (const x of augmentDays(d)) expect(x).toBeLessThan(d * 0.8);
  });
});

describe('등급 묶음', () => {
  it('확률표 합이 100', () => expect(TIER_PATTERNS.reduce((a, [, w]) => a + w, 0)).toBe(100));
  it('같은 salt 면 같은 묶음 (방 모두 같은 등급)', () => expect(tierPattern('s1', 3)).toEqual(tierPattern('s1', 3)));
  it('고르는 횟수만큼 등급', () => {
    expect(tierPattern('s2', 2)).toHaveLength(2);
    expect(tierPattern('s2', 3)).toHaveLength(3);
    expect(tierPattern('s2', 4)).toHaveLength(4);
  });
  it('많이 뽑으면 확률표와 비슷 (골드-골드-골드 약 22%)', () => {
    let ggg = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (tierPattern('t' + i, 3).join() === 'gold,gold,gold') ggg++;
    expect(ggg / N).toBeGreaterThan(0.2);
    expect(ggg / N).toBeLessThan(0.24);
  });
  it('등급 한 칸 오르내림은 실버·프리즘을 넘지 않음', () => {
    expect(shiftTier('silver', -1)).toBe('silver');
    expect(shiftTier('prism', 1)).toBe('prism');
    expect(shiftTier('gold', 1)).toBe('prism');
  });
});

describe('뜨는 규칙', () => {
  it('목록: 같은 id 없음, 등급마다 20개 넘게', () => {
    expect(new Set(AUGMENTS.map((a) => a.id)).size).toBe(AUGMENTS.length);
    for (const t of ['silver', 'gold', 'prism'] as const) expect(AUGMENTS.filter((a) => a.tier === t).length).toBeGreaterThanOrEqual(20);
  });
  it('그 등급만', () => {
    for (const id of augmentOffer({ ...base, tier: 'prism' })) expect(AUG_MAP[id].tier).toBe('prism');
  });
  it('돈 굴리기(적금·이자)는 마지막 고르기엔 안 뜸', () => {
    expect(eligible(AUG_MAP.save2, { ...base, n: 2 })).toBe(false);
    expect(eligible(AUG_MAP.int2, { ...base, n: 2 })).toBe(false);
    expect(eligible(AUG_MAP.save2, { ...base, n: 0 })).toBe(true);
  });
  it('⏳ 남은 날이 모자라면 안 뜸', () => {
    expect(eligible(AUG_MAP.save2, { ...base, daysLeft: 2 })).toBe(false);
    expect(eligible(AUG_MAP.save2, { ...base, daysLeft: 3 })).toBe(true);
  });
  it('따라잡기는 첫 고르기·혼자 판엔 안 뜸', () => {
    expect(eligible(AUG_MAP.last2, { ...base, n: 0 })).toBe(false);
    expect(eligible(AUG_MAP.last2, { ...base, n: 1, multi: false })).toBe(false);
    expect(eligible(AUG_MAP.last2, { ...base, n: 1 })).toBe(true);
  });
  it('업종 증강은 중반부터 그 업종을 들고 있을 때만', () => {
    expect(eligible(AUG_MAP.semi2, { ...base, n: 1 })).toBe(false);
    expect(eligible(AUG_MAP.semi2, { ...base, n: 1, heldSectors: ['semi'] })).toBe(true);
    expect(eligible(AUG_MAP.semi1, { ...base, tier: 'silver', n: 0 })).toBe(true);
  });
  it('같은 집안·함께 못 가지는 짝·이미 가진 것은 안 뜸', () => {
    expect(eligible(AUG_MAP.int2, { ...base, owned: ['int1'] })).toBe(false);
    expect(eligible(AUG_MAP.king, { ...base, owned: ['lev'] })).toBe(false);
    expect(eligible(AUG_MAP.scalp, { ...base, owned: ['hodl1'] })).toBe(false);
    expect(eligible(AUG_MAP.cash2, { ...base, owned: ['cash2'] })).toBe(false);
  });
  it('판에 한 명만인 증강은 누가 가졌으면 안 뜸', () => {
    expect(eligible(AUG_MAP.jackpot, { ...base, tier: 'prism', takenUnique: ['jackpot'] })).toBe(false);
  });
  it('등급을 바꾸는 증강은 마지막 고르기엔 안 뜸', () => {
    expect(eligible(AUG_MAP.eye, { ...base, n: 2 })).toBe(false);
  });
});

describe('보기 3개', () => {
  it('같은 입력이면 같은 보기(새로고침해도 같음), 사람마다 다름', () => {
    expect(augmentOffer(base)).toEqual(augmentOffer(base));
    const many = new Set(Array.from({ length: 20 }, (_, i) => augmentOffer({ ...base, seat: 's' + i }).join()));
    expect(many.size).toBeGreaterThan(5);
  });
  it('3개, 중복·같은 집안 없음, 3개 모두 같은 종류 아님 (1000번)', () => {
    for (let i = 0; i < 1000; i++) {
      for (const tier of ['silver', 'gold', 'prism'] as const) {
        const o = augmentOffer({ ...base, seat: 'p' + i, tier, n: i % 3 });
        expect(o).toHaveLength(3);
        expect(new Set(o).size).toBe(3);
        const fams = o.map((id) => AUG_MAP[id].family).filter(Boolean);
        expect(new Set(fams).size).toBe(fams.length);
        expect(new Set(o.map((id) => AUG_MAP[id].tag)).size).toBeGreaterThan(1);
      }
    }
  });
  it('한 칸을 다시 뽑으면 그 칸만 바뀌고 나머지 두 칸은 그대로, 이미 나왔던 것은 다시 안 나옴', () => {
    for (let i = 0; i < 200; i++) {
      const c = { ...base, seat: 'r' + i };
      const a = augmentOffer(c);
      const b = augmentOffer(c, [0, 1, 0]);
      expect(b[0]).toBe(a[0]);
      expect(b[2]).toBe(a[2]);
      expect(b[1]).not.toBe(a[1]);
    }
  });
  it('다른 salt(다른 방)면 보기가 달라짐', () => {
    expect(augmentOffer({ ...base, salt: 'other' }).join()).not.toBe(augmentOffer(base).join());
  });
});
