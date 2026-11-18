import { describe, expect, it } from 'vitest';
import { streakOf } from './streak';

const ds = (start: string, n: number, skip: number[] = []) => {
  const out: string[] = [];
  const s = Date.parse(start + 'T00:00:00Z');
  for (let i = 0; i < n; i++) if (!skip.includes(i)) out.push(new Date(s + i * 86_400_000).toISOString().slice(0, 10));
  return out;
};

describe('오늘의 도전 연속 기록', () => {
  it('날마다 하면 쌓이고, 오늘 아직 안 했어도 안 끊김', () => {
    expect(streakOf(ds('2026-11-01', 5), '2026-11-05').streak).toBe(5);
    expect(streakOf(ds('2026-11-01', 5), '2026-11-06')).toMatchObject({ streak: 5, playedToday: false });
  });
  it('하루 놓치면 얼리기가 없으면 0부터', () => {
    expect(streakOf(ds('2026-11-01', 5, [3]), '2026-11-05').streak).toBe(1);
  });
  it('7일마다 얼리기 1개 — 하루 놓쳐도 이어짐(그날은 +1 없음)', () => {
    const r = streakOf(ds('2026-11-01', 10, [8]), '2026-11-10');
    expect(r.streak).toBe(9);
    expect(r.freezes).toBe(0);
  });
  it('얼리기는 최대 2개, 가장 긴 기록 유지', () => {
    expect(streakOf(ds('2026-11-01', 30), '2026-11-30').freezes).toBe(2);
    const r = streakOf([...ds('2026-11-01', 4), ...ds('2026-11-10', 2)], '2026-11-11');
    expect(r).toMatchObject({ streak: 2, best: 4 });
  });
  it('기록 없음', () => expect(streakOf([], '2026-11-01').streak).toBe(0));
});
