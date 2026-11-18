import { describe, expect, it } from 'vitest';
import { eloDeltas } from '../../api/_lib/accounts.js';

const m = (user_id: string, rating = 1000) => ({ user_id, rating });

describe('랭킹 점수 (Elo)', () => {
  it('1대1 같은 점수: 이기면 +32, 지면 -32 (점수 폭 2판)', () => {
    const d = eloDeltas([m('a'), m('b')], new Map([['a', 1], ['b', 2]]));
    expect(d.get('a')).toBe(32);
    expect(d.get('b')).toBe(-32);
  });
  it('합은 0에 가깝다 (점수가 생기거나 사라지지 않음)', () => {
    const ms = [m('a', 1000), m('b', 1100), m('c', 950), m('d', 1200)];
    const d = eloDeltas(ms, new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]));
    const sum = [...d.values()].reduce((x, y) => x + y, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(2);
  });
  it('가중치를 주면 그만큼만 (기본은 모두 1 — 같은 상대와 여러 번 만나도 점수 그대로)', () => {
    const half = eloDeltas([m('a'), m('b')], new Map([['a', 1], ['b', 2]]), () => 0.5);
    expect(half.get('a')).toBe(16);
  });
});
