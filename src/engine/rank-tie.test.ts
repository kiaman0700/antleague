import { describe, expect, it } from 'vitest';
import { buildView, CURRENT_RULES_VERSION, type GameData } from './engine.js';

/** 재산이 같으면 같은 순위 (예전엔 먼저 들어온 사람이 앞서 보였음 — 첫날 둘 다 0% 인데 '뒤지는 중') */
const T0 = 1_900_000_000_000;
function room(): GameData {
  const dl = T0 + 63_000;
  const p = (id: string, at: string) => ({ id, room_id: 'r', nickname: id, mode: 'easy' as const, ready: true, ended_day: -1, created_at: at, version: 0, last_seen: new Date(T0).toISOString() });
  return {
    room: { id: 'r', code: 'TIE001', seed: 42, salt: 'ab'.repeat(16), status: 'playing', total_days: 10, turn_seconds: 60, day: 0, deadline: dl, day_deadline: dl, host_id: 'a', version: CURRENT_RULES_VERSION, kind: 'custom', max_players: 2 },
    players: [p('a', '1'), p('b', '2')],
    trades: [],
    items: [],
    orders: [],
  };
}

describe('순위: 동점', () => {
  it('아무도 안 샀으면 둘 다 1위 (양쪽 화면 모두)', () => {
    for (const me of ['a', 'b']) {
      const v = buildView(room(), me, T0 + 5_000);
      expect(v.players.map((x) => x.rank)).toEqual([1, 1]);
    }
  });
});
