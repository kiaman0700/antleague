import { describe, expect, it } from 'vitest';
import { buildView, dayClock, marketFor, validateTrade, type GameData } from './engine.js';
import { dayTicks, tickMsFor } from '../game/intraday.js';

const T0 = 1_900_000_000_000;
function game(version: number, turn = 60): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 21, salt: 'ab'.repeat(16), status: 'playing', total_days: 10, turn_seconds: turn, day: 0, deadline: T0 + turn * 1000, day_deadline: T0 + turn * 1000, host_id: 'a', version },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [],
    items: [],
    orders: [],
  };
}

describe('v11: 1초 가격', () => {
  it('칸 길이: v11 은 1초(하루 3분까지), 긴 날은 2~4초, 예전 방은 5초', () => {
    expect(tickMsFor(11, 60)).toBe(1000);
    expect(tickMsFor(11, 180)).toBe(1000);
    expect(tickMsFor(11, 300)).toBe(2000);
    expect(tickMsFor(11, 600)).toBe(4000);
    expect(tickMsFor(10, 60)).toBe(5000);
  });
  it('하루 1분이면 60칸, 지금 칸은 1초마다 바뀜', () => {
    const d = game(11);
    expect(dayClock(d.room, T0).n).toBe(60);
    expect(dayClock(d.room, T0 + 12_400).tick).toBe(12);
    expect(dayClock(d.room, T0 + 13_000).tick).toBe(13);
  });
  it('화면 데이터에는 지금 초까지만 (다음 초 가격은 없음)', () => {
    const d = game(11);
    const v = buildView(d, 'a', T0 + 37_500);
    expect(v.live!.tick).toBe(37);
    expect(v.live!.tickMs).toBe(1000);
    for (const arr of Object.values(v.live!.krw)) expect(arr.length).toBe(38);
    const full = dayTicks(marketFor(d.room.seed, d.room.total_days, 11, d.room.salt), 'CORE', 0, 60);
    const json = JSON.stringify(v);
    // 38번째(아직 안 온 초) 가격이 다른 곳에 우연히 같지 않은 이상 화면 데이터에 없어야 함
    expect(v.live!.krw.CORE).toEqual(full.slice(0, 38));
    expect(json.includes(String(full[59]) + ',') && !full.slice(0, 38).includes(full[59])).toBe(false);
  });
  it('거래는 지금 초의 가격으로', () => {
    const d = game(11);
    const full = dayTicks(marketFor(d.room.seed, d.room.total_days, 11, d.room.salt), 'CORE', 0, 60);
    const t = validateTrade(d, 'a', T0 + 21_700, { symbol: 'CORE', side: 'buy', qty: 1 });
    expect(t.price).toBe(full[21]);
  });
  it('예전 방(v10)은 5초 칸 그대로', () => {
    const d = game(10);
    expect(dayClock(d.room, T0).n).toBe(12);
    expect(dayClock(d.room, T0 + 12_400).tick).toBe(2);
  });
});

describe('장중 가격은 새로 생긴 칸만 (이어 받기)', () => {
  it('가진 칸 다음부터만 보내고, 이어 붙이면 처음부터 받은 것과 같음', () => {
    const d = game(12);
    const full = buildView(d, 'a', T0 + 37_500);
    const part = buildView(d, 'a', T0 + 37_500, undefined, undefined, undefined, { day: 0, from: 30 });
    expect(part.live!.from).toBe(30);
    expect(part.live!.krw.CORE.length).toBe(8);
    expect([...full.live!.krw.CORE.slice(0, 30), ...part.live!.krw.CORE]).toEqual(full.live!.krw.CORE);
    // 지금 칸보다 앞선(미래) 칸을 달라고 해도 처음부터 보냄 (미래 없음)
    const bad = buildView(d, 'a', T0 + 37_500, undefined, undefined, undefined, { day: 0, from: 50 });
    expect(bad.live!.from).toBe(0);
    expect(bad.live!.krw.CORE.length).toBe(38);
    // 다른 날 기준이면 처음부터
    expect(buildView(d, 'a', T0 + 37_500, undefined, undefined, undefined, { day: 3, from: 10 }).live!.from).toBe(0);
  });
});
