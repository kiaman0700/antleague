import { describe, expect, it } from 'vitest';
import { milestoneOf, streakOf } from './streak';

const ds = (start: string, n: number, skip: number[] = []) => {
  const out: string[] = [];
  const s = Date.parse(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) if (!skip.includes(i)) out.push(new Date(s + i * 86_400_000).toISOString().slice(0, 10));
  return out;
};

describe('연속 기록 (얼리기 없음)', () => {
  it('날마다 하면 쌓이고, 오늘 아직 안 했어도 안 끊김', () => {
    expect(streakOf(ds('2026-11-01', 5), '2026-11-05').streak).toBe(5);
    expect(streakOf(ds('2026-11-01', 5), '2026-11-06')).toMatchObject({ streak: 5, playedToday: false });
  });
  it('하루 빠지면 0부터 (얼리기 없음), 최고 기록은 남음', () => {
    expect(streakOf(ds('2026-11-01', 5, [3]), '2026-11-05')).toMatchObject({ streak: 1, best: 3 });
    expect(streakOf(ds('2026-11-01', 10, [8]), '2026-11-10')).toMatchObject({ streak: 1, best: 8 });
  });
  it('어제까지 하고 이틀 쉬면 0', () => {
    expect(streakOf(ds('2026-11-01', 4), '2026-11-06')).toMatchObject({ streak: 0, best: 4, playedToday: false });
  });
  it('미래 날짜는 무시', () => {
    expect(streakOf([...ds('2026-11-01', 3), '2026-11-09'], '2026-11-03').streak).toBe(3);
  });
  it('축하 날 수', () => {
    expect([6, 7, 30, 31, 100].map(milestoneOf)).toEqual([0, 7, 30, 0, 100]);
  });
  it('기록 없음', () => expect(streakOf([], '2026-11-01').streak).toBe(0));
});
