/**
 * 밸런스 시뮬레이션 하네스 — 실제 엔진(src/engine/engine.ts)을 그대로 써서 한 판을 끝까지 돌린다.
 * 봇은 buildView 가 주는 화면 데이터(View)와 자기 포트폴리오만 본다 (미래 가격·루머 진실·상대 거래는 못 봄).
 * 모든 행동은 validate* 를 거치므로 실제 게임 규칙(카드 제한·거래 정지·수수료 폭탄 등)이 그대로 적용된다.
 */
import { SIM_V } from './version.js';
import { buildView, finalResults, marketFor, nextRoomState, portfolioOf, validateBuyItem, validateTrade, validateUseItem, GameError, type GameData, type View } from '../src/engine/engine.js';
import { deriveItems, type ItemKind } from '../src/game/items.js';
import { ticksPerDay, TICK_MS } from '../src/game/intraday.js';
import { equityWith, FEE_RATE, maxBuyQty, type Holding } from '../src/game/portfolio.js';
import { STOCKS } from '../src/game/stocks.js';
import { mulberry32 } from '../src/lib/rng.js';
import type { Market } from '../src/game/market.js';

export const TURN_SECONDS = 180;
export const N_TICKS = ticksPerDay(TURN_SECONDS); // 36
/** 봇이 화면을 다시 보는 칸 (장중 속보 반응용). 마지막은 장 마감 직전 */
export const CHECKPOINTS = [0, 6, 12, 18, 24, 30, N_TICKS - 1];

export interface Ctx {
  me: string;
  day: number;
  tick: number;
  n: number;
  totalDays: number;
  nPlayers: number;
  view: View;
  /** 지금까지 받은 시장 데이터 (View.market 이 null 이면 이전 것 유지 — 실제 클라이언트와 같음) */
  market: Market;
  rng: () => number;
  isLast: boolean;
  cash(): number;
  holdings(): Record<string, Holding>;
  price(sym: string): number;
  feeRate(): number;
  trade(sym: string, side: 'buy' | 'sell', qty: number): boolean;
  /** 현금의 frac 만큼 사기 */
  buyCash(sym: string, krw: number): boolean;
  sellAll(sym?: string): void;
  buyCard(kind: ItemKind): boolean;
  useCard(kind: ItemKind, payload?: Record<string, unknown>): boolean;
  /** 카드를 쓴 뒤 화면 다시 받기 */
  refresh(): void;
  /** 다른 플레이어 (화면에 보이는 총자산 기준 내림차순) */
  others(): { id: string; equity: number }[];
}

export interface Bot {
  name: string;
  act(ctx: Ctx): void;
}

export interface GameLog {
  seed: number;
  days: number;
  ids: string[];
  bots: string[];
  final: Record<string, number>;
  /** 매일 장 마감 총자산 [day][player] */
  eqByDay: number[][];
  /** 카드 효과 (공격) */
  effects: ReturnType<typeof deriveItems>['effects'];
  buys: { pid: string; kind: ItemKind; day: number; cost: number }[];
  uses: { pid: string; kind: ItemKind; day: number }[];
  /** 1등 지분 (동점은 나눔) */
  winShare: Record<string, number>;
}

const BASE_T = 1_800_000_000_000;

export function playGame(seed: number, days: number, bots: Bot[], opts: { quiet?: boolean } = {}): GameLog {
  const ids = bots.map((_, i) => `p${i}`);
  const startAt = (day: number) => BASE_T + day * 1e9;
  const deadline = (day: number) => startAt(day) + N_TICKS * TICK_MS;
  const d: GameData = {
    room: { id: 'sim', code: 'SIM000', seed, status: 'playing', total_days: days, turn_seconds: TURN_SECONDS, day: 0, deadline: deadline(0), day_deadline: deadline(0), host_id: ids[0], version: SIM_V, max_players: bots.length },
    players: ids.map((id, i) => ({ id, room_id: 'sim', nickname: id, mode: 'pro', ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    trades: [],
    items: [],
    orders: [],
  };
  const full = marketFor(seed, days, SIM_V);
  const markets: Record<string, Market | null> = {};
  const keys: Record<string, string | undefined> = {};
  const rngs = ids.map((id, i) => mulberry32((seed * 31 + i * 7919) >>> 0));
  const eqByDay: number[][] = [];
  let seq = 0;

  for (let day = 0; day < days; day++) {
    d.room.deadline = deadline(day);
    d.room.day_deadline = deadline(day);
    // 매일 플레이어 순서를 섞어 먼저 행동하는 이점이 없게 (가격은 플레이어 행동과 무관하지만 카드 순서는 영향)
    const order = ids.map((_, i) => i);
    const orng = mulberry32((seed ^ (day * 2654435761)) >>> 0);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(orng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const tick of CHECKPOINTS) {
      seq = 0;
      for (const pi of order) {
        const me = ids[pi];
        let now = startAt(day) + tick * TICK_MS + 1;
        const getView = () => {
          const v = buildView(d, me, now, keys[me]);
          if (v.market) markets[me] = v.market;
          keys[me] = v.marketKey;
          return v;
        };
        const stamp = () => new Date(now + seq++ % 4000).toISOString();
        const ctx: Ctx = {
          me,
          day,
          tick,
          n: N_TICKS,
          totalDays: days,
          nPlayers: ids.length,
          view: getView(),
          market: markets[me]!,
          rng: rngs[pi],
          isLast: tick === CHECKPOINTS[CHECKPOINTS.length - 1],
          cash: () => portfolioOf(d, me).cash,
          holdings: () => portfolioOf(d, me).holdings,
          price: (sym) => {
            const arr = ctx.view.live!.krw[sym];
            return arr[arr.length - 1];
          },
          feeRate: () => (ctx.view.effectsToday.includes('fee') ? 0.01 : FEE_RATE),
          trade: (symbol, side, qty) => {
            if (qty < 1) return false;
            try {
              d.trades.push({ ...validateTrade(d, me, now, { symbol, side, qty }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          buyCash: (sym, krw) => {
            const q = maxBuyQty(Math.min(krw, ctx.cash()), ctx.price(sym), ctx.feeRate());
            return ctx.trade(sym, 'buy', q);
          },
          sellAll: (sym) => {
            const h = ctx.holdings();
            for (const [s, x] of Object.entries(h)) if (!sym || s === sym) ctx.trade(s, 'sell', x.qty);
          },
          buyCard: (kind) => {
            try {
              d.items.push({ ...validateBuyItem(d, me, now, { kind }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          useCard: (kind, payload) => {
            try {
              d.items.push({ ...validateUseItem(d, me, now, { kind, payload }), created_at: stamp() });
              return true;
            } catch (e) {
              if (e instanceof GameError) return false;
              throw e;
            }
          },
          refresh: () => {
            now += 1;
            ctx.view = getView();
            ctx.market = markets[me]!;
          },
          others: () => ctx.view.players.filter((p) => p.id !== me).map((p) => ({ id: p.id, equity: p.equity })).sort((a, b) => b.equity - a.equity),
        };
        bots[pi].act(ctx);
      }
    }
    // 장 마감 총자산 기록 (서버 쪽 집계 — 봇에게는 안 보임)
    const closes: Record<string, number> = {};
    for (const s of STOCKS) closes[s.symbol] = full.bars[s.symbol][day].close;
    eqByDay.push(ids.map((id) => equityWith(portfolioOf(d, id), closes)));
    for (const p of d.players) p.ended_day = day;
    const next = nextRoomState(d, deadline(day) + 1);
    if (!next) throw new Error('day did not advance');
    d.room = { ...d.room, ...next };
  }
  const fin = finalResults(d);
  const final: Record<string, number> = {};
  for (const r of fin.results) final[r.nickname] = r.equity;
  const best = Math.max(...Object.values(final));
  const winners = ids.filter((id) => final[id] === best);
  const winShare: Record<string, number> = {};
  for (const id of ids) winShare[id] = winners.includes(id) ? 1 / winners.length : 0;
  const st = deriveItems(seed, ids, d.items, days - 1, days, ids.length < 2);
  void opts;
  return {
    seed,
    days,
    ids,
    bots: bots.map((b) => b.name),
    final,
    eqByDay,
    effects: st.effects,
    buys: d.items.filter((r) => r.action === 'buy').map((r) => ({ pid: r.player_id, kind: r.kind, day: r.day, cost: r.cost })),
    uses: d.items.filter((r) => r.action === 'use').map((r) => ({ pid: r.player_id, kind: r.kind, day: r.day })),
    winShare,
  };
}
