import { describe, expect, it } from 'vitest';
import { buildView, cardStats, type GameData } from './engine.js';

function finished(): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 99, status: 'finished', total_days: 10, turn_seconds: 0, day: 10, deadline: null, host_id: 'a', max_players: 3 },
    players: ['a', 'b', 'c'].map((id, i) => ({ id, room_id: 'r', nickname: id.toUpperCase(), mode: 'pro' as const, ready: true, ended_day: 9, created_at: String(i), version: 0 })),
    trades: [
      { player_id: 'a', day: 0, symbol: 'CORE', side: 'buy', qty: 5, price: 1, fee: 0.001 },
      { player_id: 'b', day: 1, symbol: 'NEOT', side: 'buy', qty: 2, price: 1, fee: 0.001 },
    ],
    items: [],
    orders: [],
  };
}

describe('밸런스용 카드 기록 (cardStats)', () => {
  it('언제·누구에게·결과를 적고, 맞은 사람에게 맞은 수를 센다', () => {
    const d = finished();
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'use', cost: 0, payload: { target: 'c' }, created_at: '2' });
    d.items.push({ player_id: 'b', day: 0, kind: 'paper', action: 'buy', cost: 1, created_at: '3' });
    d.items.push({ player_id: 'b', day: 0, kind: 'paper', action: 'use', cost: 0, created_at: '4' });
    const s = cardStats(d);
    const f = s.a.uses.find((u) => u.k === 'freeze')!;
    expect(f.day).toBe(3);
    expect(['ok', 'blocked', 'crowded']).toContain(f.res);
    expect(f.tgt).toBeGreaterThanOrEqual(1);
    expect(f.tgtEnd).toBeGreaterThanOrEqual(1);
    expect(f.my).toBeGreaterThanOrEqual(1);
    if (f.res === 'ok') {
      expect(s.c.hit.freeze).toBe(1);
      expect(typeof f.tgt1).toBe('number');
    } else expect(s.c.blocked).toBe(1);
    const p = s.b.uses.find((u) => u.k === 'paper')!;
    expect(p.day).toBe(1);
    expect(p.my).toBeUndefined(); // 첫날엔 순위가 없음
    expect(typeof p.me1).toBe('number');
  });
  it('카드 기록은 화면 데이터에 들어가지 않는다', () => {
    const d = finished();
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    d.items.push({ player_id: 'a', day: 2, kind: 'freeze', action: 'use', cost: 0, payload: { target: 'c' }, created_at: '2' });
    const v = JSON.stringify(buildView(d, 'c', Date.now()));
    expect(v).not.toMatch(/"tgt1"|"tgtEnd"|"me0"/);
  });
});
