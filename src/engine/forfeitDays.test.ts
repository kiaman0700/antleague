// 상대가 모두 기권해 판이 바로 끝나면, 업적은 실제로 한 날(마지막 기권 날)까지만
import { describe, expect, it } from 'vitest';
import { finalResults, playedLastDay, validateLeave, type GameData } from './engine.js';
import { computeAchievements, cutMarket } from '../game/achievements.js';
import { marketFor } from './engine.js';

function duel(day = 2): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 11, status: 'playing', total_days: 12, turn_seconds: 60, day, deadline: null, day_deadline: null, host_id: 'a', max_players: 2, version: 3 },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id.toUpperCase(), mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    // a 는 첫날 사서 끝까지 들고 있음 (12일 다 치면 '7일 넘게 들고 있기' 업적)
    trades: [{ player_id: 'a', day: 0, symbol: 'CORE', side: 'buy', qty: 1, price: 50_000, fee: 50 }],
    items: [],
    orders: [],
  };
}

describe('기권 뒤 자동으로 넘어간 날은 업적에서 뺌', () => {
  it('기권하면 그 날(지금 날)이 기록됨', () => {
    const d = duel(3);
    expect(validateLeave(d, 'b').left_day).toBe(3);
  });
  it('상대가 모두 기권해 끝난 판: 마지막 기권 날까지만', () => {
    const d = duel(2);
    Object.assign(d.players[1], validateLeave(d, 'b'));
    expect(playedLastDay(d)).toBe(2);
  });
  it('끝까지 한 판·예전 기록(left_day 없음)·마지막 날 기권은 그대로', () => {
    expect(playedLastDay(duel())).toBeNull();
    const old = duel();
    old.players[1].left_game = true;
    expect(playedLastDay(old)).toBeNull();
    const lastDay = duel(11);
    Object.assign(lastDay.players[1], validateLeave(lastDay, 'b'));
    expect(playedLastDay(lastDay)).toBeNull();
  });
  it('3명 중 1명만 기권하면(2명이 끝까지) 그대로', () => {
    const d = duel(2);
    d.players.push({ ...d.players[1], id: 'c', nickname: 'C', created_at: '2' });
    Object.assign(d.players[1], validateLeave(d, 'b'));
    expect(playedLastDay(d)).toBeNull();
  });
  it('남은 사람의 업적: 기권 뒤 날로 받던 업적(7일 넘게 들고 있기)은 없음', () => {
    const d = duel(2);
    Object.assign(d.players[1], validateLeave(d, 'b'));
    const done = { ...d, room: { ...d.room, day: 12, status: 'finished' as const } };
    expect(finalResults(done).badges.a).not.toContain('diamond');
    // 예전처럼 날짜가 없으면 마지막 날까지 계산 (이미 끝난 판은 바뀌지 않음)
    const old = { ...done, players: done.players.map((p) => ({ ...p, left_day: undefined })) };
    expect(finalResults(old).badges.a).toContain('diamond');
  });
  it('자른 시장은 그 날까지만 (뒤 날 가격·뉴스·배당 없음)', () => {
    const m = marketFor(11, 12, 3);
    const c = cutMarket(m, 4);
    expect(c.totalDays).toBe(5);
    expect(c.bars.CORE.length).toBe(5);
    expect(c.index.length).toBe(5);
    expect(c.news.every((n) => n.day <= 4)).toBe(true);
    expect(c.dividends.every((x) => x.day <= 4)).toBe(true);
    // endDay 가 마지막 날이면 자르지 않음
    const p = [{ id: 'a', trades: [], spends: [], filledOrders: 0 }];
    expect(computeAchievements({ market: m, seed: 11, items: [], players: p, endDay: 11 })).toEqual(computeAchievements({ market: m, seed: 11, items: [], players: p }));
  });
});

describe('기권으로 끝난 판의 재산·수익률은 기권한 날 가격으로', () => {
  it('남은 사람의 재산 = 기권한 날 종가로 계산, 화면 데이터에 endDay', async () => {
    const { buildView } = await import('./engine.js');
    const { startCashFor } = await import('../game/portfolio.js');
    const d = duel(2);
    Object.assign(d.players[1], validateLeave(d, 'b'));
    const done = { ...d, room: { ...d.room, day: 12, status: 'finished' as const } };
    const m = marketFor(11, 12, 3);
    const a = finalResults(done).results.find((r) => r.nickname === 'A')!;
    // 예전처럼 끝까지 계산한 재산과 비교: 현금은 같고, 가진 1주의 값만 기권한 날(2일차) 종가 vs 마지막 날 종가
    const old = { ...done, players: done.players.map((p) => ({ ...p, left_day: undefined })) };
    const aOld = finalResults(old).results.find((r) => r.nickname === 'A')!;
    expect(a.equity - aOld.equity).toBe(Math.round(m.bars.CORE[2].close - m.bars.CORE[11].close));
    void startCashFor;
    expect(buildView(done, 'a', Date.now()).final?.endDay).toBe(2);
  });
});
