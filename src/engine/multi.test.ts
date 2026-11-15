import { describe, expect, it } from 'vitest';
import { activeEffects, deriveItems } from '../game/items.js';
import { buildView, finalResults, GameError, nextRoomState, validateTrade, validateUseItem, type GameData } from './engine.js';

const now = Date.now();
function game3(day = 2): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 99, status: 'playing', total_days: 10, turn_seconds: 0, day, deadline: null, host_id: 'a', max_players: 3 },
    players: ['a', 'b', 'c'].map((id, i) => ({ id, room_id: 'r', nickname: id.toUpperCase(), mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    trades: [],
    items: [],
    orders: [],
  };
}
const err = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof GameError ? e.message : 'other';
  }
};

describe('3명 이상', () => {
  it('방해 카드는 대상을 꼭 골라야 하고, 나 자신·없는 사람은 안 된다', () => {
    const d = game3();
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'freeze' }))).toMatch(/상대를 골라/);
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'freeze', payload: { target: 'a' } }))).toMatch(/상대를 골라/);
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'freeze', payload: { target: 'zzz' } }))).toMatch(/상대를 골라/);
    expect(validateUseItem(d, 'a', now, { kind: 'freeze', payload: { target: 'c' } }).payload).toEqual({ target: 'c' });
  });
  it('고른 사람만 효과를 받는다', () => {
    const d = game3(3);
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'use', cost: 0, payload: { target: 'c' }, created_at: '2' });
    const st = deriveItems(99, ['a', 'b', 'c'], d.items, 3, 10, false);
    const cFrozen = activeEffects(st, 'c', 3).some((e) => e.kind === 'freeze') || st.effects.some((e) => e.to === 'c' && e.blocked);
    expect(cFrozen).toBe(true);
    expect(activeEffects(st, 'b', 3).length).toBe(0);
    // c 는 (방패가 없으면) 거래 불가, b 는 가능
    const cErr = err(() => validateTrade(d, 'c', now, { symbol: 'NEOT', side: 'buy', qty: 1 }));
    expect(cErr === null || /거래 정지/.test(cErr)).toBe(true);
    expect(err(() => validateTrade(d, 'b', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toBeNull();
  });
  it('세 명 모두 마감해야 다음 날, 결과는 1등부터', () => {
    const d = game3();
    d.players[0].ended_day = 2;
    d.players[1].ended_day = 2;
    expect(nextRoomState(d, now)).toBeNull();
    d.players[2].ended_day = 2;
    expect(nextRoomState(d, now)?.day).toBe(3);
    const fin = finalResults({ ...game3(10), room: { ...game3().room, day: 10, status: 'finished' } });
    expect(fin.results.length).toBe(3);
    expect(fin.results[0].equity).toBeGreaterThanOrEqual(fin.results[2].equity);
  });
  it('화면 데이터에 다른 사람들의 거래·카드 기록은 없다', () => {
    const d = game3();
    d.trades.push({ player_id: 'b', day: 0, symbol: 'CORE', side: 'buy', qty: 3, price: 1, fee: 0.001 });
    d.items.push({ player_id: 'c', day: 0, kind: 'paper', action: 'buy', cost: 1, created_at: '1' });
    const v = buildView(d, 'a', now);
    expect(v.myTrades.length).toBe(0);
    expect(v.myItemRows.length).toBe(0);
    expect(v.players.length).toBe(3);
    expect(v.room.maxPlayers).toBe(3);
  });
});
