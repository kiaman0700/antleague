import { describe, expect, it } from 'vitest';
import { buildView, inPremarket, marketFor, nextRoomState, preAllReadyDeadline, premarketEnd, preSeconds, validateEndTurn, validatePlaceOrder, validatePreReady, validateTrade, type GameData } from './engine.js';
import { preRumors } from '../game/rumors.js';

const T0 = 1_900_000_000_000;
function game(version: number, day = 1): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 11, salt: 'ef'.repeat(16), status: 'playing', total_days: 10, turn_seconds: 60, day: day - 1, deadline: T0, day_deadline: T0, host_id: 'a', version },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [],
    items: [],
    orders: [],
  };
}
/** 하루를 넘겨 장 전 시간이 시작된 상태 (now = 넘긴 시각) */
function advanced(version: number) {
  const d = game(version);
  const next = nextRoomState(d, T0)!;
  d.room = { ...d.room, ...next };
  d.players = d.players.map((p) => ({ ...p, last_seen: new Date(T0).toISOString() }));
  return d;
}
const err = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

describe('v7 장 전 시간', () => {
  it('신속 20초 · 일반 30초 · 3분 방 45초 이하', () => {
    expect(preSeconds(60)).toBe(20);
    expect(preSeconds(90)).toBe(30);
    expect(preSeconds(180)).toBe(45);
    expect(preSeconds(300)).toBe(45);
  });
  it('하루가 넘어가면 장 전 시간이 생기고, v6 이하는 그대로(바로 장)', () => {
    const d7 = advanced(7);
    expect(inPremarket(d7.room, T0 + 1000)).toBe(true);
    expect(premarketEnd(d7.room, T0) - T0).toBe(20_000);
    const d6 = advanced(6);
    expect(inPremarket(d6.room, T0 + 1000)).toBe(false);
  });
  it('장 전에는 지금 가격 거래·장 마감이 막히고 예약 주문은 됨', () => {
    const d = advanced(7);
    const now = T0 + 2000;
    expect(err(() => validateTrade(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 1 }))).toMatch(/예약 주문만/);
    expect(err(() => validateEndTurn(d, 'a', now))).toMatch(/장이 열린 뒤/);
    const open0 = marketFor(d.room.seed, d.room.total_days, 7, d.room.salt).bars.CORE[d.room.day].open;
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 1, limit: Math.round((open0 * 0.9) / 100) * 100 }))).toBeNull();
    // 장이 열리면 거래 가능
    const open = premarketEnd(d.room, T0) + 4500;
    expect(err(() => validateTrade(d, 'a', open, { symbol: 'CORE', side: 'buy', qty: 1 }))).toBeNull();
  });
  it('모두 준비 완료하면 바로 장이 열리는 새 마감 시각, 한 명만이면 그대로', () => {
    const d = advanced(7);
    const now = T0 + 3000;
    expect(validatePreReady(d, 'a', now).day).toBe(d.room.day);
    d.players[0].pre_day = d.room.day;
    expect(preAllReadyDeadline(d, now)).toBeNull();
    d.players[1].pre_day = d.room.day;
    const dl = preAllReadyDeadline(d, now)!;
    expect(dl).toBeGreaterThan(now);
    expect(inPremarket({ ...d.room, deadline: dl, day_deadline: dl }, now + 1)).toBe(false);
  });
  it('장 전이 아닐 때 준비 완료는 거절', () => {
    const d = advanced(7);
    expect(err(() => validatePreReady(d, 'a', premarketEnd(d.room, T0) + 10))).toMatch(/장 전 시간이 아니에요/);
  });
  it('찌라시: 화면 데이터에 진위가 없고(감별기 안 쓰면), 문구에도 real 이 없음', () => {
    const d = advanced(7);
    const v = buildView(d, 'a', T0 + 2000);
    expect(v.room.preUntil).toBeGreaterThan(T0);
    expect(v.rumors && v.rumors.length).toBeGreaterThanOrEqual(3);
    const json = JSON.stringify(v.rumors);
    expect(json).not.toContain('verdict');
    expect(json).not.toContain('real');
    expect(JSON.stringify(v)).not.toContain(d.room.salt!);
  });
  it('찌라시 진짜 단서는 그날 장중 속보의 업종·방향과 같고, 가격(시장)은 v6 과 똑같음', () => {
    for (let s = 0; s < 30; s++) {
      const m = marketFor(1000 + s, 10, 7, 'ab'.repeat(16));
      const m6 = marketFor(1000 + s, 10, 6, 'ab'.repeat(16));
      expect(m.bars.CORE.map((b) => b.close)).toEqual(m6.bars.CORE.map((b) => b.close));
      for (let day = 1; day < 10; day++) {
        const rs = preRumors(m, day, 'k');
        expect(rs.length).toBeGreaterThanOrEqual(3);
        expect(rs.length).toBeLessThanOrEqual(5);
        for (const r of rs.filter((x) => x.real)) expect(m.news.some((n) => n.day === day && n.at != null && n.sector === r.sector && n.tone === r.tone)).toBe(true);
      }
    }
  });
});

describe('리뷰 수정: 기권·대상·찌라시 순서', () => {
  it('상대가 모두 기권하면 남은 사람 승리로 바로 끝', () => {
    const d = game(8, 3);
    d.players[1] = { ...d.players[1], left_game: true, ended_day: d.room.total_days };
    const next = nextRoomState(d, T0 - 100_000)!;
    expect(next.status).toBe('finished');
    expect(next.day).toBe(d.room.total_days);
  });
  it('3명 중 1명만 기권하면 계속', () => {
    const d = game(8, 3);
    d.players.push({ id: 'c', room_id: 'r', nickname: 'c', mode: 'pro', ready: true, ended_day: 1, created_at: '2', version: 0 });
    d.players[1] = { ...d.players[1], left_game: true, ended_day: d.room.total_days };
    expect(nextRoomState(d, T0 - 100_000)).toBeNull();
  });
  it('찌라시 진짜 단서 자리는 고르게 섞임 (첫·끝 자리 쏠림 없음)', () => {
    const pos = [0, 0, 0, 0, 0];
    let n = 0;
    for (let s = 0; s < 400; s++) {
      const m = marketFor(5000 + s, 10, 8, 'cd'.repeat(16));
      for (let day = 1; day < 10; day++) {
        const rs = preRumors(m, day, 'k' + s);
        if (rs.length !== 3 || rs.filter((r) => r.real).length !== 1) continue;
        pos[rs.findIndex((r) => r.real)]++;
        n++;
      }
    }
    expect(n).toBeGreaterThan(200);
    for (let i = 0; i < 3; i++) expect(Math.abs(pos[i] / n - 1 / 3)).toBeLessThan(0.07);
  });
});

describe('기권 승리 결과', () => {
  it('재산이 같아도 기권한 사람은 뒤, 남은 사람이 승자', async () => {
    const { finalResults } = await import('./engine.js');
    const d = game(8, 3);
    d.room = { ...d.room, status: 'finished', day: d.room.total_days };
    d.players[0] = { ...d.players[0], left_game: true };
    const fin = finalResults(d);
    expect(fin.winner).toBe('b');
    expect(fin.results[fin.results.length - 1].nickname).toBe('a');
  });
});
