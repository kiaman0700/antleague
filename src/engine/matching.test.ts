import { describe, expect, it } from 'vitest';
import { parseQueue, pickGroup, ratingWindow, type Ticket } from './matching.js';

const now = 1_800_000_000_000;
const t = (id: string, rating: number, agoSec: number): Ticket => ({ id, rating, createdAt: now - agoSec * 1000 });

describe('매칭', () => {
  it('대기열 이름 검사', () => {
    expect(parseQueue('ranked_duel_quick')).toEqual({ kind: 'ranked', size: 'duel', speed: 'quick' });
    expect(parseQueue('ranked_trio_quick')).toBeNull();
    expect(parseQueue(42)).toBeNull();
  });
  it('기다릴수록 점수 범위가 넓어짐', () => {
    expect(ratingWindow(t('a', 1000, 0), now)).toBe(100);
    expect(ratingWindow(t('a', 1000, 25), now)).toBe(200);
  });
  it('1대1: 점수가 가까운 사람과', () => {
    const me = t('me', 1200, 0);
    const g = pickGroup(me, [me, t('far', 900, 0), t('near', 1250, 0)], 'duel', now);
    expect(g?.map((x) => x.id)).toEqual(['me', 'near']);
  });
  it('1대1: 범위 밖이면 기다림, 오래 기다리면 잡힘', () => {
    const me = t('me', 1500, 0);
    expect(pickGroup(me, [me, t('x', 1000, 0)], 'duel', now)).toBeNull();
    expect(pickGroup(t('me', 1500, 90), [t('x', 1000, 0)], 'duel', now)).not.toBeNull();
  });
  it('다인전: 4명이면 바로', () => {
    const me = t('me', 1000, 0);
    const g = pickGroup(me, [me, t('a', 1010, 0), t('b', 990, 0), t('c', 1020, 0), t('d', 1050, 0)], 'multi', now);
    expect(g?.length).toBe(4);
    expect(g?.map((x) => x.id)).not.toContain('d');
  });
  it('다인전: 3명은 40초 넘게 기다렸을 때만', () => {
    const me = t('me', 1000, 10);
    expect(pickGroup(me, [me, t('a', 1000, 10), t('b', 1000, 10)], 'multi', now)).toBeNull();
    expect(pickGroup(me, [me, t('a', 1000, 45), t('b', 1000, 10)], 'multi', now)?.length).toBe(3);
  });
  it('다인전: 2명뿐이면 시작 안 함', () => {
    const me = t('me', 1000, 300);
    expect(pickGroup(me, [me, t('a', 1000, 300)], 'multi', now)).toBeNull();
  });
});
