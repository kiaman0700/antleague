import { describe, expect, it } from 'vitest';
import { isPlaced, tierOf } from './tier.js';

describe('랭킹 티어', () => {
  it('점수 → 티어·단계', () => {
    expect(tierOf(1000).label).toBe('실버 1');
    expect(tierOf(1100).label).toBe('실버 2');
    expect(tierOf(1299).label).toBe('실버 3');
    expect(tierOf(1300).label).toBe('골드 1');
    expect(tierOf(1600).label).toBe('플래티넘 1');
    expect(tierOf(1900).label).toBe('다이아몬드 1');
    expect(tierOf(2199).label).toBe('다이아몬드 3');
    expect(tierOf(900).label).toBe('브론즈 3');
    expect(tierOf(800).label).toBe('브론즈 2');
    expect(tierOf(600).label).toBe('브론즈 1');
    expect(tierOf(2300)).toMatchObject({ label: '마스터', points: 100 });
  });
  it('단계 안 점수는 0~99, 경계는 모두 100점 단위', () => {
    for (let r = 700; r < 2200; r += 7) {
      const t = tierOf(r);
      expect(t.points).toBeGreaterThanOrEqual(0);
      expect(t.points).toBeLessThanOrEqual(99);
      expect(t.points).toBe((r - 700) % 100);
    }
  });
  it('배치는 랭킹전 2판', () => {
    expect(isPlaced(0)).toBe(false);
    expect(isPlaced(1)).toBe(false);
    expect(isPlaced(2)).toBe(true);
  });
});
