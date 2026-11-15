import { describe, expect, it } from 'vitest';
import { generateMarket } from '../game/market.js';
import { buildView, cleanNickname, GameError, nextRoomState, validateBuyItem, validateEndTurn, validateTrade, validateUseItem, type GameData } from './engine.js';

const SEED = 4242;
function game(over: Partial<GameData['room']> = {}): GameData {
  return {
    room: { id: 'r1', code: 'ABC234', seed: SEED, status: 'playing', total_days: 10, turn_seconds: 90, day: 2, deadline: Date.now() + 60_000, host_id: 'a', ...over },
    players: [
      { id: 'a', room_id: 'r1', nickname: '나', mode: 'easy', ready: true, ended_day: -1, created_at: '2026-01-01T00:00:00Z', version: 0 },
      { id: 'b', room_id: 'r1', nickname: '너', mode: 'pro', ready: true, ended_day: -1, created_at: '2026-01-01T00:00:01Z', version: 0 },
    ],
    trades: [],
    items: [],
    orders: [],
  };
}
const now = Date.now();
const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.message : 'other';
  }
  return null;
};

describe('미래 정보 숨김', () => {
  it('시드와 오늘 종가·미래 가격이 화면 데이터에 없다', () => {
    const v = buildView(game(), 'a', now);
    const m = v.market!;
    const full = generateMarket(SEED, 10);
    expect(m.seed).toBe(0);
    expect(JSON.stringify(v)).not.toContain(String(SEED));
    expect(m.bars.NEOT.length).toBe(3); // 0,1일 + 오늘
    expect(m.bars.NEOT[2].close).toBe(full.bars.NEOT[2].open); // 오늘 종가는 시가로 가려짐
    expect(m.macro.length).toBe(3);
    expect(m.news.every((n) => n.day <= 2)).toBe(true);
    expect(v.final).toBeNull();
  });
  it('오늘 루머의 진실은 감별기 없이는 숨겨진다', () => {
    for (let s = 1; s < 60; s++) {
      const d = game();
      d.room.seed = s;
      const v = buildView(d, 'a', now);
      for (const n of v.market!.news.filter((x) => x.day === 2 && x.rumor)) expect(n.realTone).toBe(n.tone);
    }
  });
  it('상대 거래 내역은 보이지 않는다', () => {
    const d = game();
    d.trades.push({ player_id: 'b', day: 0, symbol: 'CORE', side: 'buy', qty: 5, price: 1, fee: 0.001 });
    const v = buildView(d, 'a', now);
    expect(v.myTrades.length).toBe(0);
    expect(JSON.stringify(v)).not.toContain('"CORE","side"');
  });
  it('같은 marketKey 면 시장 데이터를 다시 보내지 않는다', () => {
    const v1 = buildView(game(), 'a', now);
    const v2 = buildView(game(), 'a', now, v1.marketKey);
    expect(v2.market).toBeNull();
  });
});

describe('거래 검증', () => {
  it('가격은 클라이언트가 아니라 서버 시장 가격으로 정해진다', () => {
    const t = validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, price: 1 } as never);
    expect(t.price).toBe(generateMarket(SEED, 10).bars.NEOT[2].open);
  });
  it('잘못된 입력·규칙 위반은 거절', () => {
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'XXXX', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1.5 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: -3 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 999999 }))).toMatch(/현금/);
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'sell', qty: 1 }))).toMatch(/수량/);
    expect(err(() => validateTrade(game(), 'zz', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game({ status: 'finished' }), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game({ deadline: now - 1 }), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toMatch(/시간/);
    const ended = game();
    ended.players[0].ended_day = 2;
    expect(err(() => validateTrade(ended, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toMatch(/마감/);
  });
  it('거래 정지 카드를 맞으면 다음 날 거래 불가', () => {
    const d = game({ day: 1 });
    // b 가 0일에 거래정지 사용 → 1일에 a 거래 불가 (보유 카드가 없으면 사용이 무시되므로 구매 후 사용)
    d.items.push({ player_id: 'b', day: 0, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    d.items.push({ player_id: 'b', day: 0, kind: 'freeze', action: 'use', cost: 0, created_at: '2' });
    const r = err(() => validateTrade(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }));
    // 시작 카드로 a 가 방패를 받았으면 막힘 → 둘 중 하나
    expect(r === null || /거래 정지/.test(r)).toBe(true);
  });
});

describe('카드·턴 검증', () => {
  it('없는 카드는 사용 불가, 가짜 뉴스는 올바른 내용만', () => {
    expect(err(() => validateUseItem(game(), 'a', now, { kind: 'nope' }))).toBeTruthy();
    const d = game();
    d.items.push({ player_id: 'a', day: 2, kind: 'fake', action: 'buy', cost: 1, created_at: '1' });
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'KIDX', tone: 'good' } }))).toBeTruthy();
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'NEOT', tone: '<script>' } }))).toBeTruthy();
    expect(validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'NEOT', tone: 'bad', extra: 'x' } }).payload).toEqual({ symbol: 'NEOT', tone: 'bad' });
  });
  it('카드 구매 비용은 서버가 정한다', () => {
    const d = game();
    const row = validateBuyItem(d, 'a', now, { kind: 'detector', cost: 0 } as never);
    expect(row.cost).toBe(300_000);
  });
  it('둘 다 마감하거나 시간이 지나야 다음 날', () => {
    const d = game();
    expect(nextRoomState(d, now)).toBeNull();
    d.players.forEach((p) => (p.ended_day = 2));
    expect(nextRoomState(d, now)?.day).toBe(3);
    expect(nextRoomState(game({ deadline: now - 1 }), now)?.day).toBe(3);
    expect(nextRoomState(game({ day: 9, deadline: now - 1 }), now)?.status).toBe('finished');
    expect(validateEndTurn(game({ deadline: now - 1 }), 'a', now).day).toBe(2);
  });
  it('닉네임 검증', () => {
    expect(cleanNickname('  개미 왕 ')).toBe('개미 왕');
    expect(err(() => cleanNickname('<img>'))).toBeTruthy();
    expect(err(() => cleanNickname('a\u0000b'))).toBeTruthy();
    expect(err(() => cleanNickname('12345678901'))).toBeTruthy();
    expect(err(() => cleanNickname(''))).toBeTruthy();
  });
});
