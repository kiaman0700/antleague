import { describe, expect, it } from 'vitest';
import { dayTicks, releaseTick, TICK_MS } from '../game/intraday.js';
import { generateMarket } from '../game/market.js';
import { buildView, dayClock, GameError, resolveOrders, validatePlaceOrder, validateTrade, type GameData } from './engine.js';

const SEED = 4242;
const TURN = 180; // 36칸
const N = 36;
const START = 1_000_000_000_000;
const END = START + TURN * 1000;

function game(day = 2, seed = SEED): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed, status: 'playing', total_days: 20, turn_seconds: TURN, day, deadline: END, day_deadline: END, host_id: 'a' },
    players: [
      { id: 'a', room_id: 'r', nickname: 'A', mode: 'pro', ready: true, ended_day: -1, created_at: '1', version: 0 },
      { id: 'b', room_id: 'r', nickname: 'B', mode: 'pro', ready: true, ended_day: -1, created_at: '2', version: 0 },
    ],
    trades: [],
    items: [],
    orders: [],
  };
}
const at = (tick: number) => START + tick * TICK_MS + 100;
const iso = (ms: number) => new Date(ms).toISOString();

describe('장 시계', () => {
  it('장 시작부터 5초마다 한 칸, 끝나면 마지막 칸', () => {
    const r = game().room;
    expect(dayClock(r, START - 3000)).toMatchObject({ tick: 0, n: N, startAt: START, endAt: END });
    expect(dayClock(r, at(0)).tick).toBe(0);
    expect(dayClock(r, at(7)).tick).toBe(7);
    expect(dayClock(r, END + 99_000).tick).toBe(N);
  });
  it('카운트다운으로 마감이 당겨져도 칸 속도는 원래 하루 기준 (남은 흐름은 마감 때 한꺼번에)', () => {
    const r = { ...game().room, deadline: START + 50_000 };
    expect(dayClock(r, at(5)).tick).toBe(5);
    expect(dayClock(r, at(5)).n).toBe(N);
  });
});

describe('실시간 거래 가격', () => {
  it('거래 가격 = 누른 순간(서버 시각)의 칸 가격', () => {
    const m = generateMarket(SEED, 20);
    const d = game();
    for (const tick of [0, 10, 30]) {
      const t = validateTrade(d, 'a', at(tick), { symbol: 'NEOT', side: 'buy', qty: 1 });
      expect(t.price).toBe(dayTicks(m, 'NEOT', 2, N)[tick]);
    }
  });
  it('화면이 보낸 가격은 무시', () => {
    const t = validateTrade(game(), 'a', at(10), { symbol: 'NEOT', side: 'buy', qty: 1, price: 1 } as never);
    expect(t.price).toBeGreaterThan(1);
  });
});

describe('화면 데이터: 지금 칸까지만', () => {
  it('오늘 장중 가격은 지금 칸까지만 보낸다', () => {
    const v = buildView(game(), 'a', at(9));
    expect(v.live).not.toBeNull();
    expect(v.live!.tick).toBe(9);
    for (const sym of Object.keys(v.live!.krw)) expect(v.live!.krw[sym].length).toBe(10);
    const m = generateMarket(SEED, 20);
    expect(v.live!.krw.NEOT).toEqual(dayTicks(m, 'NEOT', 2, N).slice(0, 10));
    // 오늘 막대에는 여전히 종가가 없음
    expect(v.market!.bars.NEOT[2].close).toBe(m.bars.NEOT[2].open);
  });
  it('아직 안 뜬 장중 속보는 화면 데이터에 없고, 뜬 뒤에는 있다', () => {
    let checked = 0;
    for (let seed = 1; seed < 80 && checked < 5; seed++) {
      const m = generateMarket(seed, 20);
      const n = m.news.find((x) => x.day === 2 && x.at != null);
      if (!n) continue;
      checked++;
      const rel = releaseTick(n.at!, N);
      const before = buildView(game(2, seed), 'a', at(rel - 1));
      expect(before.market!.news.some((x) => x.headline === n.headline && x.day === 2)).toBe(false);
      expect(JSON.stringify(before)).not.toContain(n.headline);
      const after = buildView(game(2, seed), 'a', at(rel));
      expect(after.market!.news.some((x) => x.headline === n.headline && x.day === 2)).toBe(true);
      expect(after.marketKey).not.toBe(before.marketKey);
    }
    expect(checked).toBe(5);
  });
  it('상대 재산은 지금 가격 기준이지만 10만원 단위로만 (칸마다 역산 불가), 내 재산은 정확히', () => {
    const d = game();
    d.trades.push({ player_id: 'b', day: 2, symbol: 'NEOT', side: 'buy', qty: 100, price: 1, fee: 0, created_at: iso(at(0)) });
    d.trades.push({ player_id: 'a', day: 2, symbol: 'NEOT', side: 'buy', qty: 100, price: 1, fee: 0, created_at: iso(at(0)) });
    const v0 = buildView(d, 'a', at(0));
    const v1 = buildView(d, 'a', at(30));
    const m = generateMarket(SEED, 20);
    const t = dayTicks(m, 'NEOT', 2, N);
    const eq = (v: typeof v0, id: string) => v.players.find((p) => p.id === id)!.equity;
    expect(eq(v1, 'a') - eq(v0, 'a')).toBe(100 * (t[30] - t[0]));
    expect(eq(v0, 'b') % 100_000 === 0 && eq(v1, 'b') % 100_000 === 0).toBe(true);
    expect(Math.abs(eq(v1, 'b') - (eq(v1, 'a')))).toBeLessThanOrEqual(50_000);
  });
});

describe('예약 주문: 가격이 닿는 순간 체결', () => {
  // 오늘 장중에 오르내리는 종목에서, 넣은 칸 이후 처음 닿는 칸을 찾는다
  function setup() {
    const m = generateMarket(SEED, 20);
    const t = dayTicks(m, 'NEOT', 2, N);
    const placed = 5;
    const later = t.slice(placed + 1);
    const low = Math.min(...later);
    // 지금 가격보다 낮은 예약 사기 (30% 이내)
    const limit = Math.max(low, Math.ceil(t[placed] * 0.71));
    const hitTick = placed + 1 + later.findIndex((p) => p <= limit);
    return { t, placed, limit, hitTick };
  }
  it('넣기 전 칸은 무시하고, 넣은 뒤 처음 닿은 칸에서 체결', () => {
    const { placed, limit, hitTick, t } = setup();
    if (!(limit < t[placed])) return; // 이 시드에선 내려가지 않는 날 — 다른 테스트가 확인
    const d = game();
    const o = validatePlaceOrder(d, 'a', at(placed), { symbol: 'NEOT', side: 'buy', qty: 1, limit });
    d.orders.push({ ...o, id: 'o1', created_at: iso(at(placed)) });
    expect(resolveOrders(d, 2, hitTick - 1, false)).toEqual([]); // 아직 안 닿음 → 그대로 대기
    const res = resolveOrders(d, 2, hitTick, false);
    expect(res[0].status).toBe('filled');
    expect(res[0].trade!.price).toBe(limit);
    expect(new Date(res[0].trade!.created_at!).getTime()).toBe(START + hitTick * TICK_MS);
  });
  it('하루가 끝날 때까지 안 닿으면 만료', () => {
    const d = game();
    const m = generateMarket(SEED, 20);
    const t = dayTicks(m, 'NEOT', 2, N);
    const limit = Math.ceil(Math.min(...t) * 0.999) - 1;
    if (limit < t[0] * 0.7) return;
    d.orders.push({ player_id: 'a', day: 2, symbol: 'NEOT', side: 'buy', qty: 1, limit_price: limit, fee: 0.0015, status: 'open', id: 'o1', created_at: iso(at(0)) });
    expect(resolveOrders(d, 2, N - 1, false)).toEqual([]);
    expect(resolveOrders(d, 2, N, true)[0].status).toBe('expired');
  });
  it('예약 가격은 지금(장중) 가격 기준으로 검사', () => {
    const m = generateMarket(SEED, 20);
    const t = dayTicks(m, 'NEOT', 2, N);
    const k = t.findIndex((p) => p !== t[0]);
    if (k < 0) return;
    const d = game();
    const now = t[k];
    // 지금 가격보다 높은 '예약 사기'는 거절
    expect(() => validatePlaceOrder(d, 'a', at(k), { symbol: 'NEOT', side: 'buy', qty: 1, limit: now + 100 })).toThrow(GameError);
  });
});
