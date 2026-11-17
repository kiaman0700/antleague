import { describe, expect, it } from 'vitest';
import { buildView, CURRENT_RULES_VERSION, nextRoomState, type GameData } from './engine.js';

/** 오늘의 도전(설계서 design/bots-daily.md 3단계): 모두 같은 시장이라 시드·비밀값이 새면 그날 시장 전체가 드러남 */
const T0 = 1_900_000_000_000;
const SALT = 'd41f'.repeat(8);
function daily(): GameData {
  const dl = T0 + 63_000;
  return {
    room: { id: 'daily-room', code: 'DAILY1', seed: 1_234_567_891, salt: SALT, status: 'playing', total_days: 10, turn_seconds: 60, day: 0, deadline: dl, day_deadline: dl, host_id: 'me', version: CURRENT_RULES_VERSION, kind: 'daily', max_players: 2 },
    players: [{ id: 'me', room_id: 'daily-room', nickname: '나', mode: 'easy', ready: true, ended_day: -1, created_at: '1', version: 0, last_seen: new Date(T0).toISOString() }],
    trades: [],
    items: [],
    orders: [],
  };
}

describe('오늘의 도전: 정보가 새지 않는다', () => {
  it('진행 중 화면 데이터에 시드·비밀값이 없음 (seed 칸은 0)', () => {
    const v = buildView(daily(), 'me', T0 + 5_000);
    const s = JSON.stringify(v);
    expect(v.market!.seed).toBe(0);
    expect(s.includes(SALT)).toBe(false);
    expect(s.includes('1234567891')).toBe(false);
    expect(v.final).toBeNull();
    expect(v.room.kind).toBe('daily');
  });
  it('혼자여도 장 마감을 누르면 바로 다음 날 (기다릴 상대 없음)', () => {
    const d = daily();
    d.players[0].ended_day = 0;
    expect(nextRoomState(d, T0 + 5_000)?.day).toBe(1);
  });
  it('끝난 뒤에도 비밀값(salt)은 안 나감 — 시장은 salt 로만 만들어져 시드 숫자만으로는 다시 못 만듦', () => {
    const d = daily();
    d.room = { ...d.room, status: 'finished', day: 10, deadline: null, day_deadline: null };
    const s = JSON.stringify(buildView(d, 'me', T0 + 5_000));
    expect(s.includes(SALT)).toBe(false);
  });
});
