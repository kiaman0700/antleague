import { describe, expect, it } from 'vitest';
import { parseQueue, pickGroup, ratingWindow, RANKED_MAX_WINDOW, rankedMax, type Ticket } from './matching.js';

const now = 1_800_000_000_000;
const t = (id: string, rating: number, agoSec: number): Ticket => ({ id, rating, createdAt: now - agoSec * 1000 });

describe('매칭', () => {
  it('대기열 이름 검사', () => {
    expect(parseQueue('ranked_duel_quick')).toEqual({ kind: 'ranked', size: 'duel', speed: 'quick' });
    expect(parseQueue('ranked_trio_quick')).toBeNull();
    expect(parseQueue(42)).toBeNull();
  });
  it('기다릴수록 점수 범위가 넓어짐', () => {
    expect(ratingWindow(t('a', 1000, 0), now)).toBe(200);
    expect(ratingWindow(t('a', 1000, 25), now)).toBe(400);
  });
  it('1대1: 점수가 가까운 사람과', () => {
    const me = t('me', 1400, 0);
    const g = pickGroup(me, [me, t('far', 800, 0), t('near', 1500, 0)], 'duel', now);
    expect(g?.map((x) => x.id)).toEqual(['me', 'near']);
  });
  it('1대1: 범위 밖이면 기다림, 오래 기다리면 잡힘', () => {
    const me = t('me', 2000, 0);
    expect(pickGroup(me, [me, t('x', 1000, 0)], 'duel', now)).toBeNull();
    expect(pickGroup(t('me', 2000, 90), [t('x', 1000, 0)], 'duel', now)).not.toBeNull();
  });
  it('다인전: 4명이면 바로', () => {
    const me = t('me', 1000, 0);
    const g = pickGroup(me, [me, t('a', 1020, 0), t('b', 980, 0), t('c', 1040, 0), t('d', 1100, 0)], 'multi', now);
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
  it('랭킹전: 처음 2분은 ±800까지, 2분 넘게 못 만나면 더 넓게 (사람이 적을 때 끝없이 기다리지 않게)', () => {
    expect(ratingWindow(t('a', 1000, 100), now, rankedMax)).toBe(800);
    expect(ratingWindow(t('a', 1000, 130), now, rankedMax)).toBe(1500);
    expect(pickGroup(t('me', 2200, 30), [t('x', 1000, 30)], 'duel', now, rankedMax)).toBeNull();
    expect(pickGroup(t('me', 2200, 130), [t('x', 1000, 130)], 'duel', now, rankedMax)).not.toBeNull();
  });
  it('랭킹전(고정 800): 점수 차 800 넘게는 안 만남', () => {
    expect(ratingWindow(t('a', 1000, 3600), now, RANKED_MAX_WINDOW)).toBe(800);
    expect(pickGroup(t('me', 2000, 600), [t('x', 1000, 600)], 'duel', now, RANKED_MAX_WINDOW)).toBeNull();
    expect(pickGroup(t('me', 1800, 600), [t('x', 1000, 600)], 'duel', now, RANKED_MAX_WINDOW)).not.toBeNull();
  });
  it('다인전: 고른 사람끼리 모두 서로 범위 안', () => {
    // 1100 은 1000·1200 둘 다와 맞지만 1000 과 1200 은 서로 안 맞음 (막 들어옴: ±200)
    const me = t('me', 1200, 0);
    const g = pickGroup(me, [t('lo', 1000, 0), t('hi', 1400, 0), t('lo2', 1100, 0), t('mid', 1200, 0)], 'multi', now);
    expect(g?.length).toBe(4);
    const r = g!.map((x) => x.rating);
    expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(200);
  });
});

import { estimateWaitSec, waitLabel } from './matching.js';
describe('예상 대기 시간', () => {
  it('1대1: 범위 안에 사람이 있으면 곧', () => {
    expect(estimateWaitSec({ size: 'duel', similar: 1, nearestGap: null, arrivalsPerMin: 0, waitedMs: 0 })).toBe(5);
  });
  it('1대1: 범위 밖 사람만 있으면 범위가 넓어질 때까지 (점수 차 600 → 약 40초)', () => {
    expect(estimateWaitSec({ size: 'duel', similar: 0, nearestGap: 600, arrivalsPerMin: 0, waitedMs: 0 })).toBe(40);
  });
  it('1대1: 아무도 없고 최근 매칭도 없으면 모름', () => {
    expect(estimateWaitSec({ size: 'duel', similar: 0, nearestGap: null, arrivalsPerMin: 0, waitedMs: 0 })).toBeNull();
    expect(waitLabel(null)).toBe('알 수 없어요');
  });
  it('1대1: 분당 2명 들어오면 약 30초', () => {
    expect(estimateWaitSec({ size: 'duel', similar: 0, nearestGap: null, arrivalsPerMin: 2, waitedMs: 0 })).toBe(30);
  });
  it('다인전: 4명이면 곧, 3명이면 40초 규칙까지', () => {
    expect(estimateWaitSec({ size: 'multi', similar: 3, nearestGap: null, arrivalsPerMin: 0, waitedMs: 0 })).toBe(5);
    expect(estimateWaitSec({ size: 'multi', similar: 2, nearestGap: null, arrivalsPerMin: 0, waitedMs: 10_000 })).toBe(30);
  });
  it('랭킹전 상한(처음 2분 ±800) 때문에 더 걸리는 경우도 계산', () => {
    const s = estimateWaitSec({ size: 'duel', similar: 0, nearestGap: 1200, arrivalsPerMin: 0, waitedMs: 0, max: rankedMax });
    expect(s).toBeGreaterThanOrEqual(120);
  });
  it('표시 문구', () => {
    expect(waitLabel(5)).toBe('곧 잡혀요');
    expect(waitLabel(45)).toBe('약 45초');
    expect(waitLabel(150)).toBe('약 3분');
  });
});

describe('파티·랭킹전 분리', () => {
  const tp = (id: string, rating: number, agoSec: number, party: string | null) => ({ id, rating, createdAt: now - agoSec * 1000, party });
  it('파티 2명 + 혼자 2명 = 4인 방, 파티는 같이 들어감', () => {
    const me = tp('me', 1000, 0, 'P');
    const g = pickGroup(me, [tp('mate', 1000, 0, 'P'), tp('a', 1000, 0, null), tp('b', 1000, 0, null)], 'multi', now);
    expect(g?.map((x) => x.id).sort()).toEqual(['a', 'b', 'mate', 'me']);
  });
  it('파티 2 + 혼자 1: 1분 30초 전엔 기다리고, 넘으면 3명 판으로 시작', () => {
    expect(pickGroup(tp('me', 1000, 60, 'P'), [tp('mate', 1000, 60, 'P'), tp('a', 1000, 60, null)], 'multi', now)).toBeNull();
    expect(pickGroup(tp('me', 1000, 95, 'P'), [tp('mate', 1000, 95, 'P'), tp('a', 1000, 95, null)], 'multi', now)?.length).toBe(3);
  });
  it('파티 둘이면 2+2', () => {
    const me = tp('me', 1000, 0, 'P');
    const g = pickGroup(me, [tp('mate', 1000, 0, 'P'), tp('x', 1000, 0, 'Q'), tp('y', 1000, 0, 'Q')], 'multi', now);
    expect(g?.length).toBe(4);
  });
  it('3명 이상 파티는 매칭 안 됨', () => {
    const me = tp('me', 1000, 0, 'P');
    expect(pickGroup(me, [tp('m2', 1000, 0, 'P'), tp('m3', 1000, 0, 'P'), tp('a', 1000, 0, null)], 'multi', now)).toBeNull();
  });
  it('파티 다른 사람 중 한 명만 쏙 빼 가지 않음 (혼자 자리 하나 남으면 파티는 건너뜀)', () => {
    const me = tp('me', 1000, 0, null);
    const g = pickGroup(me, [tp('a', 1000, 0, null), tp('b', 1000, 0, null), tp('x', 1000, 0, 'Q'), tp('y', 1000, 0, 'Q')], 'multi', now);
    // me+a+b = 3, 파티(2)는 넘쳐서 못 들어감 → 4명이 안 되고 3명 규칙(40초)도 아직 → null
    expect(g === null || !g.some((t) => t.id === 'x') || g.some((t) => t.id === 'y')).toBe(true);
  });
  it('1대1 에는 파티로 못 들어감', () => {
    const me = tp('me', 1000, 0, 'P');
    expect(pickGroup(me, [tp('mate', 1000, 0, 'P'), tp('a', 1000, 0, null)], 'duel', now)).toBeNull();
  });
  it('랭킹전: 친구·같은 인터넷(forbid)끼리는 같은 판에 넣지 않음', () => {
    const me = t('me', 1000, 0);
    const forbid = (a: Ticket, b: Ticket) => [a.id, b.id].sort().join() === 'friend,me';
    expect(pickGroup(me, [t('friend', 1000, 0)], 'duel', now, rankedMax, forbid)).toBeNull();
    expect(pickGroup(me, [t('friend', 1000, 0), t('other', 1100, 0)], 'duel', now, rankedMax, forbid)?.map((x) => x.id)).toEqual(['me', 'other']);
  });
});
