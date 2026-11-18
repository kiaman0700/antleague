import { describe, expect, it } from 'vitest';
import { isPlaced, tierOf } from './tier.js';

describe('랭킹 티어', () => {
  it('점수 → 티어·단계', () => {
    expect(tierOf(1000).label).toBe('실버 1');
    expect(tierOf(1060).label).toBe('실버 2');
    expect(tierOf(1149).label).toBe('실버 3');
    expect(tierOf(1150).label).toBe('골드 1');
    expect(tierOf(1460).label).toBe('다이아몬드 1');
    expect(tierOf(900).label).toBe('브론즈 2');
    expect(tierOf(600).label).toBe('브론즈 1');
    expect(tierOf(1700)).toMatchObject({ label: '마스터', points: 100 });
  });
  it('단계 안 점수는 0~49', () => {
    for (let r = 700; r < 1600; r += 7) {
      const t = tierOf(r);
      expect(t.points).toBeGreaterThanOrEqual(0);
      expect(t.points).toBeLessThanOrEqual(49);
    }
  });
  it('배치는 랭킹전 2판', () => {
    expect(isPlaced(0)).toBe(false);
    expect(isPlaced(1)).toBe(false);
    expect(isPlaced(2)).toBe(true);
  });
});
