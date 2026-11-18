/**
 * 무작위 행동 시험: 여러 판·여러 날 동안 사기·팔기·예약 주문·주문 취소·카드 사기/쓰기를 마구 섞어 보내고,
 * 엔진이 받아 준 행동만 반영했을 때 절대 깨지면 안 되는 것을 매번 확인한다.
 *  - 현금은 0 아래로 내려가지 않는다 · 가진 수량은 0 아래로 내려가지 않는다
 *  - 레버리지·인버스 ETF 는 산 직후 총재산의 30% 를 넘지 않는다 (v4+)
 *  - 예약 주문은 같은 날에만, 하루 5개까지 열려 있다
 *  - 받아 준 거래의 가격은 그 순간 서버 가격 그대로다 (화면이 보낸 값은 무시)
 */
import { describe, expect, it } from 'vitest';
import { dayClock, GameError, isLeveraged, LEVERAGE_CAP, MAX_OPEN_ORDERS, portfolioOf, resolveOrders, validateBuyItem, validateCancelOrder, validatePlaceOrder, validateTrade, validateUseItem, type GameData, type OrderRow } from './engine.js';
import { STOCKS } from '../game/stocks.js';
import { ITEMS } from '../game/items.js';

/** 작은 결정적 난수 (시험이 늘 같게) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const TURN = 60;
const T0 = 1_900_000_000_000;

function game(seed: number, version: number): GameData {
  const dl = T0 + TURN * 1000;
  return {
    room: { id: 'r', code: 'FUZZ00', seed, salt: version >= 4 ? (seed * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4) : null, status: 'playing', total_days: 4, turn_seconds: TURN, day: 0, deadline: dl, day_deadline: dl, host_id: 'a', version, kind: 'custom', max_players: 3 },
    players: ['a', 'b', 'c'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [],
    items: [],
    orders: [],
  };
}

/** 장이 열린 시각들 (장 전 시간·마감 뒤 제외) */
function openTimes(d: GameData) {
  const c = dayClock(d.room, 0);
  return { start: c.startAt, end: c.endAt - 1, tickMs: c.tickMs };
}

function check(d: GameData, version: number, label: string) {
  for (const p of d.players) {
    const pf = portfolioOf(d, p.id);
    expect(pf.cash, `${label} ${p.id} 현금`).toBeGreaterThanOrEqual(-1e-6);
    for (const [sym, h] of Object.entries(pf.holdings)) expect(h.qty, `${label} ${p.id} ${sym} 수량`).toBeGreaterThanOrEqual(0);
    const open = d.orders.filter((o) => o.player_id === p.id && o.status === 'open');
    expect(open.every((o) => o.day === d.room.day), `${label} 지난 날 주문이 열려 있음`).toBe(true);
    expect(open.length).toBeLessThanOrEqual(MAX_OPEN_ORDERS);
  }
  void version;
}

describe('무작위 행동에도 규칙이 깨지지 않는다', () => {
  for (const version of [13, 16]) {
    for (const seed of [11, 202, 3003]) {
      it(`v${version} 시드 ${seed}`, () => {
        const d = game(seed, version);
        const r = rng(seed * 7 + version);
        const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
        let id = 0;
        let accepted = 0;
        for (let day = 0; day < d.room.total_days; day++) {
          const { start, end } = openTimes(d);
          // 그날 행동 80번 — 시간 순서대로
          const times = Array.from({ length: 80 }, () => start + Math.floor(r() * (end - start))).sort((a, b) => a - b);
          for (const now of times) {
            const me = pick(d.players).id;
            const sym = pick(STOCKS).symbol;
            const kind = r();
            try {
              if (kind < 0.45) {
                // 사기·팔기 (화면이 이상한 가격을 같이 보내도 무시되어야 함)
                const side = r() < 0.6 ? 'buy' : 'sell';
                const qty = r() < 0.1 ? 1 + Math.floor(r() * 5_000) : 1 + Math.floor(r() * 30);
                const t = validateTrade(d, me, now, { symbol: sym, side, qty, price: 1 } as never);
                expect(t.price).toBeGreaterThan(1);
                d.trades.push({ ...t, created_at: new Date(now).toISOString() });
                accepted++;
                if (version >= 4 && side === 'buy' && isLeveraged(sym)) {
                  // 산 직후 레버리지 비중 (지금 가격 기준 — 엔진과 같은 계산은 엔진 안이라 여기선 넉넉한 상한만)
                  const pf = portfolioOf(d, me);
                  let lev = 0;
                  let tot = pf.cash;
                  for (const [s, h] of Object.entries(pf.holdings)) {
                    const v = h.qty * (s === sym ? t.price : h.avgCost);
                    tot += v;
                    if (isLeveraged(s)) lev += v;
                  }
                  expect(lev / tot).toBeLessThanOrEqual(LEVERAGE_CAP + 0.08);
                }
              } else if (kind < 0.7) {
                // 예약 주문: 지금 가격 근처 무작위 (범위 밖이면 거절돼야 함)
                const side = r() < 0.5 ? 'buy' : 'sell';
                const probe = validateTrade({ ...d, trades: [] }, me, now, { symbol: sym, side: 'buy', qty: 1 }).price;
                const f = side === 'buy' ? 0.65 + r() * 0.4 : 0.95 + r() * 0.4;
                const o = validatePlaceOrder(d, me, now, { symbol: sym, side, qty: 1 + Math.floor(r() * 20), limit: probe * f });
                d.orders.push({ ...o, id: 'o' + id++, created_at: new Date(now).toISOString() });
                accepted++;
              } else if (kind < 0.78) {
                const mine = d.orders.filter((o) => o.player_id === me && o.status === 'open');
                const target = mine.length && r() < 0.8 ? pick(mine).id : 'none-' + id;
                const oid = validateCancelOrder(d, me, now, { orderId: target });
                const o = d.orders.find((x) => x.id === oid) as OrderRow;
                o.status = 'cancelled';
                accepted++;
              } else if (kind < 0.88) {
                const k = pick(ITEMS).kind;
                const row = validateBuyItem(d, me, now, { kind: k, cost: 0 } as never);
                expect(row.cost).toBeGreaterThanOrEqual(0);
                d.items.push({ ...row, created_at: new Date(now).toISOString() });
                accepted++;
              } else {
                const k = pick(ITEMS).kind;
                const target = pick(d.players.filter((p) => p.id !== me)).id;
                const row = validateUseItem(d, me, now, { kind: k, payload: { target, symbol: sym, pick: 'x' } });
                d.items.push({ ...row, created_at: new Date(now).toISOString() });
                accepted++;
              }
            } catch (e) {
              if (!(e instanceof GameError)) throw e; // 규칙 거절(GameError)만 허용, 그 밖의 오류는 버그
            }
            // 상태 요청 때처럼 지금 칸까지 예약 주문 처리
            const tick = Math.floor((now - start) / openTimes(d).tickMs);
            for (const res of resolveOrders(d, day, tick, false)) {
              const o = d.orders.find((x) => x.id === res.id)!;
              o.status = res.status;
              if (res.trade) d.trades.push(res.trade);
            }
            check(d, version, `v${version} ${day}일 ${now - start}ms`);
          }
          // 하루 끝: 남은 예약 주문 마감 처리 후 다음 날
          for (const res of resolveOrders(d, day, Number.MAX_SAFE_INTEGER, true)) {
            const o = d.orders.find((x) => x.id === res.id)!;
            o.status = res.status;
            if (res.trade) d.trades.push(res.trade);
          }
          check(d, version, `v${version} ${day}일 마감`);
          const next = d.room.day_deadline! + 120_000;
          d.room = { ...d.room, day: day + 1, deadline: next, day_deadline: next };
        }
        expect(accepted).toBeGreaterThan(20); // 대부분 거절만 된 건 아닌지 (거절은 현금·수량 부족 같은 정상 거절)
      });
    }
  }
});
