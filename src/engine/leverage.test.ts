import { describe, expect, it } from 'vitest';
import { GameError, validateTrade, type GameData } from './engine.js';

const now = Date.now();
function game(version: number): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 5, salt: version >= 4 ? 'ab'.repeat(16) : null, status: 'playing', total_days: 10, turn_seconds: 180, day: 1, deadline: now + 100_000, day_deadline: now + 100_000, host_id: 'a', version },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0 })),
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
    return e instanceof GameError ? e.message : String(e);
  }
};

describe('레버리지·인버스 ETF 비중 제한 (v4)', () => {
  it('총재산 절반 넘게는 못 삼 (최대 수량을 알려 줌)', () => {
    const d = game(4);
    const t = validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: 1 });
    const half = Math.floor((3_000_000 / (t.price * 1.0015)));
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: half + 5 }))).toMatch(/30%까지만.*최대/);
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: Math.floor(half * 0.95) }))).toBeNull();
  });
  it('이미 가진 레버리지·인버스와 합쳐서 계산', () => {
    const d = game(4);
    const p = validateTrade(d, 'a', now, { symbol: 'KINV', side: 'buy', qty: 1 }).price;
    const q = Math.floor(2_900_000 / p);
    d.trades.push({ player_id: 'a', day: 1, symbol: 'KINV', side: 'buy', qty: q, price: p, fee: 0.0015 });
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: 20 }))).toMatch(/30%까지만/);
    // 일반 종목·지수 ETF 는 제한 없음
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KIDX', side: 'buy', qty: 10 }))).toBeNull();
    // 팔기는 언제나 가능
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KINV', side: 'sell', qty: q }))).toBeNull();
  });
  it('예전 방(v3 이하)은 규칙 그대로', () => {
    const d = game(3);
    const t = validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: 1 });
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'KLEV', side: 'buy', qty: Math.floor(9_000_000 / t.price) }))).toBeNull();
  });
});
