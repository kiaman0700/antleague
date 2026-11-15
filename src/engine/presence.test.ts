import { describe, expect, it } from 'vitest';
import { AWAY_MS, buildView, graceDeadline, isActive, nextRoomState, validateLeave, type GameData } from './engine.js';

const now = 1_800_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();
function game(n: number, day = 2): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 7, status: 'playing', total_days: 10, turn_seconds: 600, day, deadline: now + 500_000, day_deadline: now + 500_000, host_id: 'p0', max_players: 6 },
    players: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, room_id: 'r', nickname: 'P' + i, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0, last_seen: iso(now - 1000) })),
    trades: [],
    items: [],
    orders: [],
  };
}

describe('나감·자리 비움', () => {
  it('최근 접속이 없으면 자리 비움, 기록이 없으면(예전 데이터) 접속 중으로 봄', () => {
    const d = game(2);
    expect(isActive(d.players[0], now)).toBe(true);
    d.players[1].last_seen = iso(now - AWAY_MS - 1);
    expect(isActive(d.players[1], now)).toBe(false);
    d.players[1].last_seen = null;
    expect(isActive(d.players[1], now)).toBe(true);
    d.players[1].left_game = true;
    expect(isActive(d.players[1], now)).toBe(false);
  });
  it('6명 중 3명이 나가면 남은 3명 기준으로 카운트다운(⅔ = 2명)', () => {
    const d = game(6);
    for (const i of [3, 4, 5]) d.players[i].left_game = true;
    d.players[0].ended_day = 2;
    expect(graceDeadline(d, now)).toBeNull();
    d.players[1].ended_day = 2;
    expect(graceDeadline(d, now)).toBe(now + 30_000);
  });
  it('남은 사람이 모두 마감하면 바로 다음 날 (자리 비운 사람은 기다리지 않음)', () => {
    const d = game(3);
    d.players[2].last_seen = iso(now - AWAY_MS - 5000);
    d.players[0].ended_day = 2;
    expect(nextRoomState(d, now)).toBeNull();
    d.players[1].ended_day = 2;
    expect(nextRoomState(d, now)?.day).toBe(3);
  });
  it('1대1에서 상대가 나가면 혼자 마감해도 바로 넘어감', () => {
    const d = game(2);
    d.players[1].left_game = true;
    d.players[0].ended_day = 2;
    expect(nextRoomState(d, now)?.day).toBe(3);
  });
  it('모두 자리를 비우면 시간이 다 될 때까지 기다림', () => {
    const d = game(2);
    for (const p of d.players) p.last_seen = iso(now - AWAY_MS - 1);
    expect(nextRoomState(d, now)).toBeNull();
    expect(nextRoomState(d, now + 600_000)?.day).toBe(3);
  });
  it('게임 중 나가기는 기권: 끝까지 마감한 것으로', () => {
    const d = game(3);
    const r = validateLeave(d, 'p1');
    expect(r).toEqual({ left_game: true, ended_day: 10 });
  });
  it('화면 데이터: 나감·자리 비움 표시는 있지만 접속 시각 자체는 없음', () => {
    const d = game(3);
    d.players[1].left_game = true;
    d.players[2].last_seen = iso(now - AWAY_MS - 1);
    const v = buildView(d, 'p0', now);
    expect(v.players.find((p) => p.id === 'p1')?.status).toBe('left');
    expect(v.players.find((p) => p.id === 'p2')?.status).toBe('away');
    expect(JSON.stringify(v)).not.toContain('last_seen');
  });
});

describe('상대 재산은 대략만 (보유 종목 역산 방지)', () => {
  it('상대 재산은 10만원 단위, 내 재산은 정확히', () => {
    const d = game(2, 0);
    d.trades.push({ player_id: 'p1', day: 0, symbol: 'CORE', side: 'buy', qty: 7, price: 101_234, fee: 709 });
    d.trades.push({ player_id: 'p0', day: 0, symbol: 'CORE', side: 'buy', qty: 3, price: 101_234, fee: 304 });
    const v = buildView(d, 'p0', now - 200_000);
    const opp = v.players.find((p) => p.id === 'p1')!;
    expect(opp.equity % 100_000 === 0).toBe(true);
    expect(v.players.find((p) => p.id === 'p0')!.equity % 100_000 === 0).toBe(false);
    expect(opp.tradeCount).toBe(0); // 오늘 거래 횟수는 안 보임
  });
});
