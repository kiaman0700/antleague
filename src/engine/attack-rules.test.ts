import { describe, expect, it } from 'vitest';
import { buildView, GameError, validateUseItem, type GameData } from './engine.js';
import type { ItemRow } from '../game/items.js';

const now = Date.now();
// 무료 카드로 방패가 나오지 않는 시드 (방어 카드 테스트를 정확히 하려고)
import { deriveItems } from '../game/items.js';
const SEED = (() => {
  for (let s = 1; s < 2000; s++) {
    const st = deriveItems(s, ['a', 'b', 'c'], [], 2, 10, false, 5);
    if (!st.players.a.inventory.shield && !st.players.c.inventory.shield) return s;
  }
  return 1;
})();
function game(): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: SEED, salt: 'ab'.repeat(16), status: 'playing', total_days: 10, turn_seconds: 180, day: 2, deadline: now + 100_000, day_deadline: now + 100_000, host_id: 'a', version: 5 },
    players: ['a', 'b', 'c'].map((id, i) => ({ id, room_id: 'r', nickname: id.toUpperCase(), mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    trades: [],
    items: [],
    orders: [],
  };
}
let n = 0;
const row = (player_id: string, kind: ItemRow['kind'], action: 'buy' | 'use', payload: ItemRow['payload'] = null, day = 2): ItemRow => ({ player_id, day, kind, action, cost: action === 'buy' ? 1 : 0, payload, created_at: String(++n).padStart(4, '0') });
const err = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof GameError ? e.message : String(e);
  }
};

describe('방해 카드: 한 사람에게 하루 한 번', () => {
  it('이미 누군가 방해한 사람에게 두 번째로 쓰면 거절 (카드는 남음) — 누가 썼는지는 말하지 않음', () => {
    const d = game();
    d.items.push(row('a', 'freeze', 'buy'), row('a', 'freeze', 'use', { target: 'c' }), row('b', 'fee', 'buy'));
    const m = err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'c' } }));
    expect(m).toMatch(/이미 누군가/);
    expect(m).not.toMatch(/A/);
    // 다른 사람에게는 쓸 수 있음
    expect(err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'a' } }))).toBeNull();
  });
  it('방패에 막혔어도 그날 그 사람은 이미 방해받은 것으로 침', () => {
    const d = game();
    d.items.push(row('c', 'shield', 'buy', null, 1), row('a', 'freeze', 'buy'), row('a', 'freeze', 'use', { target: 'c' }), row('b', 'fee', 'buy'));
    expect(err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'c' } }))).toMatch(/이미 누군가/);
  });
  it('반사로 되돌아간 경우: 원래 대상도, 되돌려 맞은 사람도 그날 이미 방해받은 것으로 침', () => {
    const d = game();
    d.items.push(row('c', 'mirror', 'buy', null, 1), row('a', 'freeze', 'buy'), row('a', 'freeze', 'use', { target: 'c' }), row('b', 'fee', 'buy'));
    expect(err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'c' } }))).toMatch(/이미 누군가/);
    expect(err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'a' } }))).toMatch(/이미 누군가/);
  });
  it('다음 날에는 다시 쓸 수 있음', () => {
    const d = game();
    d.items.push(row('a', 'freeze', 'buy', null, 1), row('a', 'freeze', 'use', { target: 'c' }, 1), row('b', 'fee', 'buy'));
    expect(err(() => validateUseItem(d, 'b', now, { kind: 'fee', payload: { target: 'c' } }))).toBeNull();
  });
});

describe('방해 알림은 익명', () => {
  it('당한 사람·막은 사람·되돌린 사람 알림에 쓴 사람 이름이 없음, 쓴 사람에게도 상대의 방어 카드 종류를 말하지 않음', () => {
    const d = game();
    d.items.push(row('c', 'shield', 'buy', null, 1), row('a', 'freeze', 'buy'), row('a', 'freeze', 'use', { target: 'c' }));
    d.items.push(row('a', 'mirror', 'buy', null, 1), row('b', 'fee', 'buy'), row('b', 'fee', 'use', { target: 'a' }));
    d.items.push(row('c', 'blackout', 'buy'));
    const cv = buildView(d, 'c', now);
    const av = buildView(d, 'a', now);
    const bv = buildView(d, 'b', now);
    for (const t of cv.notices.map((x) => x.text)) expect(t).not.toMatch(/\bA\b|A의|A가|A이/);
    for (const t of av.notices.map((x) => x.text)) expect(t).not.toMatch(/B의|B가|B이/);
    // A 가 C 를 방해한 결과 알림에 C 의 방어 카드 종류가 없음
    expect(av.notices.map((x) => x.text).filter((t) => t.includes('C에게')).join()).not.toMatch(/방패/);
    expect(bv.notices.map((x) => x.text).join()).not.toMatch(/반사 거울/);
  });
});
