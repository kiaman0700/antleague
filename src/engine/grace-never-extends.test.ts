import { describe, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, graceDeadline, graceSecondsFor, type GameData } from './engine.js';

/**
 * 카운트다운은 시간을 '당기기만' 함 — 원래 남은 시간이 카운트다운보다 짧으면 그대로 (사용자 질문 2026-11-17:
 * "1분 남았는데 장 마감 눌러서 카운트다운 1분 30초가 되면 오히려 늘어나지 않아?")
 */
const T0 = 1_900_000_000_000;
function room(players: number, turnSeconds: number, leftMs: number): GameData {
  const dl = T0 + leftMs;
  const p = (id: string) => ({ id, room_id: 'r', nickname: id, mode: 'easy' as const, ready: true, ended_day: -1, created_at: id, version: 0, last_seen: new Date(T0).toISOString() });
  return {
    room: { id: 'r', code: 'GRACE1', seed: 7, salt: 'cd'.repeat(16), status: 'playing', total_days: 10, turn_seconds: turnSeconds, day: 0, deadline: dl, day_deadline: dl, host_id: 'a', version: CURRENT_RULES_VERSION, kind: 'custom', max_players: players },
    players: Array.from({ length: players }, (_, i) => p('p' + i)),
    trades: [],
    items: [],
    orders: [],
  };
}

describe('카운트다운은 남은 시간을 늘리지 않는다', () => {
  for (const turn of [60, 180, 300, 600]) {
    for (const n of [2, 3, 4, 6]) {
      const grace = graceSecondsFor(n, turn) * 1000;
      const need = n <= 2 ? 1 : Math.ceil((n * 2) / 3);
      it(`${n}명 · 하루 ${turn}초: 남은 시간이 카운트다운(${grace / 1000}초)보다 짧으면 그대로`, () => {
        const d = room(n, turn, grace - 10_000); // 카운트다운보다 10초 짧게 남음
        for (let i = 0; i < need; i++) d.players[i].ended_day = 0;
        expect(graceDeadline(d, T0)).toBeNull();
      });
      it(`${n}명 · 하루 ${turn}초: 남은 시간이 더 길면 카운트다운으로 당김`, () => {
        const d = room(n, turn, grace + 30_000);
        for (let i = 0; i < need; i++) d.players[i].ended_day = 0;
        const g = graceDeadline(d, T0);
        expect(g).not.toBeNull();
        expect(g!).toBeLessThan(d.room.deadline!);
        expect(g! - T0).toBe(grace);
      });
    }
  }
});
