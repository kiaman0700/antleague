import { describe, expect, it } from 'vitest';
import { eloDeltas, pairWeight } from '../../api/_lib/accounts.js';

const m = (user_id: string, rating = 1000) => ({ user_id, rating });

describe('랭킹 점수 (Elo)', () => {
  it('1대1 같은 점수: 이기면 +16, 지면 -16', () => {
    const d = eloDeltas([m('a'), m('b')], new Map([['a', 1], ['b', 2]]));
    expect(d.get('a')).toBe(16);
    expect(d.get('b')).toBe(-16);
  });
  it('합은 0에 가깝다 (점수가 생기거나 사라지지 않음)', () => {
    const ms = [m('a', 1000), m('b', 1100), m('c', 950), m('d', 1200)];
    const d = eloDeltas(ms, new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]));
    const sum = [...d.values()].reduce((x, y) => x + y, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(2);
  });
  it('같은 상대와 하루 3판까지 그대로, 6판까지 절반, 그 뒤로는 점수 없음 (만나는 건 얼마든지)', () => {
    expect([0, 2, 3, 5, 6, 10].map(pairWeight)).toEqual([1, 1, 0.5, 0.5, 0, 0]);
    const half = eloDeltas([m('a'), m('b')], new Map([['a', 1], ['b', 2]]), () => 0.5);
    expect(half.get('a')).toBe(8);
    const d = eloDeltas([m('a'), m('b')], new Map([['a', 1], ['b', 2]]), () => 0);
    expect(d.get('a')).toBe(0);
    expect(d.get('b')).toBe(0);
  });
});
