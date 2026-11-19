/**
 * 증강 효과 (규칙 v27). 모든 돈은 거래·시장 종가·고른 줄에서 늘 같은 값으로 다시 계산한다 — 저장하지 않으니 고칠 곳이 없고,
 * 화면이 보낸 값은 쓰지 않는다. 아직 안 온 날의 돈(복권 결과·내일 마감 보너스)은 그날이 되기 전엔 절대 포함하지 않는다.
 */
import { seeded } from '../lib/rng.js';
import { pricesAt, type Market } from '../game/market.js';
import { computePortfolio, equityWith, startCashFor, type PaidDividend, type PortfolioState, type Trade } from '../game/portfolio.js';
import { STOCK_MAP } from '../game/stocks.js';
import { deriveAugs, ownedAugs, sectorCondOf, type AugState } from './augs.js';
import type { GameData } from './engine.js';

export interface AugIncome {
  day: number;
  amount: number;
  aug: string;
}

/** 고르면 바로 받는 돈 */
const NOW_CASH: Record<string, number> = {
  cash1: 12_000, cash2: 30_000, cash3: 60_000, nofee: 5_000, orders: 10_000, lev: 10_000, review: 10_000, calendar: 10_000,
  loan: 20_000, sleepy: 15_000, div: 10_000, semi1: 10_000, battery1: 10_000, bio1: 10_000, crypto1: 10_000, us1: 10_000, etf1: 10_000, principal: 45_000,
};
/** 며칠 뒤에 받는 돈 [며칠 뒤, 금액] */
const LATER_CASH: Record<string, [number, number]> = { save1: [3, 15_000], save2: [3, 33_000], save3: [4, 68_000] };
/** 판당 최대로 받는 돈 */
export const AUG_CAP: Record<string, number> = {
  int1: 15_000, int2: 35_000, int3: 60_000, king: 40_000, cushion1: 15_000, cushion2: 30_000, insure: 70_000, hodl1: 15_000, hodl2: 35_000,
  div: 20_000, attend: 15_000, climb: 20_000, last1: 15_000, last2: 30_000, army: 60_000, chaser: 35_000, payday: 30_000, spread: 30_000, steel: 30_000,
  semi2: 30_000, battery2: 30_000, bio2: 30_000, crypto2: 30_000, us2: 30_000, us3: 60_000, rule: 60_000, allin: 35_000, artisan: 60_000, scalp: 30_000,
  average: 30_000, compound: 60_000, timing: 70_000, slot: 40_000, gambler: 120_000,
};
/** 공개 확률표 [금액, 확률] — 화면 설명에도 그대로 보여 줌 */
export const AUG_TABLES: Record<string, [number, number][]> = {
  lotto: [[0, 0.4], [10_000, 0.3], [20_000, 0.15], [40_000, 0.15]],
  jackpot: [[0, 0.3], [30_000, 0.3], [100_000, 0.3], [200_000, 0.1]],
  slot: [[-5_000, 0.4], [5_000, 0.3], [15_000, 0.3]],
  gambler: [[-20_000, 0.4], [10_000, 0.35], [40_000, 0.25]],
};
/** 정보 증강 → 쓸 수 있는 횟수 */
export const AUG_INFO: Record<string, { kind: 'detector' | 'scout' | 'paper' | 'analyst'; n: number; acc?: number }> = {
  verdict1: { kind: 'detector', n: 1 }, memo: { kind: 'detector', n: 1 }, guru: { kind: 'detector', n: 2 }, verdict3: { kind: 'detector', n: 3 }, verdict6: { kind: 'detector', n: 6 },
  scout1: { kind: 'scout', n: 1, acc: 0.7 }, scout3: { kind: 'scout', n: 3, acc: 0.75 }, scout6: { kind: 'scout', n: 6, acc: 0.8 },
  paper1: { kind: 'paper', n: 1 }, paper2: { kind: 'paper', n: 2 }, analyst1: { kind: 'analyst', n: 1 }, analyst2: { kind: 'analyst', n: 2 },
};
const SECTOR_RATE: Record<string, [string, number]> = { semi2: ['semi', 0.15], battery2: ['battery', 0.15], bio2: ['bio', 0.15], crypto2: ['crypto', 0.15], us2: ['us', 0.15], us3: ['us', 0.2] };

function draw(table: [number, number][], u: number) {
  let x = u;
  for (const [v, p] of table) {
    if (x < p) return v;
    x -= p;
  }
  return table[table.length - 1][0];
}

/** 업종 장악: 고른 날이 시작될 때 가장 많이(금액) 들고 있던 업종 */
export function ruleSector(d: GameData, m: Market, pid: string, day: number): string | null {
  if (day <= 0) return null;
  const close = pricesAt(m, day - 1, true);
  const q: Record<string, number> = {};
  for (const t of d.trades) if (t.player_id === pid && t.day < day) q[t.symbol] = (q[t.symbol] ?? 0) + (t.side === 'buy' ? t.qty : -t.qty);
  const by: Record<string, number> = {};
  for (const [s, n] of Object.entries(q)) if (n > 0 && STOCK_MAP[s]) by[STOCK_MAP[s].sector] = (by[STOCK_MAP[s].sector] ?? 0) + n * (close[s] ?? 0);
  const best = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function inSector(symbol: string, key: string) {
  return sectorCondOf(symbol) === key || STOCK_MAP[symbol]?.sector === key;
}

const cache = new Map<string, Record<string, AugIncome[]>>();

/**
 * 모든 자리의 증강 수입 — 순위를 보는 증강이 있어서 날마다 모두를 함께 계산.
 * 결과는 지금 날까지 받은 것만 (끝난 판은 전부)
 */
export function augIncomeAll(d: GameData, m: Market, divs: PaidDividend[], st: AugState = deriveAugs(d)): Record<string, AugIncome[]> {
  const r = d.room;
  const finished = r.status === 'finished' || r.day >= r.total_days;
  const lastT = d.trades.at(-1);
  const lastA = (d.augs ?? []).at(-1);
  const key = `${r.id}:${r.salt ?? ''}:${r.total_days}:${r.version}:${r.status}:${r.day}:${d.trades.length}:${lastT?.id ?? lastT?.created_at ?? ''}:${(d.augs ?? []).length}:${lastA?.id ?? lastA?.created_at ?? ''}:${d.players.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const salt = r.salt ?? r.id;
  const start = startCashFor(r.version);
  const pids = Object.keys(st.players);
  const out: Record<string, AugIncome[]> = Object.fromEntries(pids.map((p) => [p, []]));
  const used: Record<string, number> = {};
  const add = (pid: string, day: number, aug: string, amount: number) => {
    const cap = AUG_CAP[aug];
    const k = `${pid}:${aug}`;
    let a = Math.round(amount);
    // 마지막 날 마감 뒤에 받는 돈은 마지막 날 몫으로 (그래프·최종 재산이 같은 날에 끝나게). 판이 끝나야만 계산되는 돈이라 미리 새지 않음
    day = Math.min(day, r.total_days - 1);
    if (cap !== undefined && a > 0) a = Math.min(a, cap - (used[k] ?? 0));
    if (!a) return;
    used[k] = (used[k] ?? 0) + a;
    out[pid].push({ day, amount: a, aug });
  };
  // 날마다 받는 효과는 고른 다음 날부터 — 고르는 날 장 끝 무렵 그날 결과를 보고 보상을 고르지 못하게
  const owned = (pid: string, t: number) => (st.players[pid] ?? []).filter((s) => s.picked && s.day < t).map((s) => ({ id: s.picked!, day: s.day, n: s.n }));
  const total = r.total_days;

  // 날짜가 정해진 돈 (바로·며칠 뒤·확률표)
  for (const pid of pids) {
    for (const s of st.players[pid]) {
      if (!s.picked) continue;
      const a = s.picked;
      // 고른 돈도 다음 날 아침에 — 상대에게 공개되는 재산이 고른 순간 뛰어 무엇을 골랐는지 드러나지 않게
      if (NOW_CASH[a]) add(pid, s.day + 1, a, NOW_CASH[a]);
      if (LATER_CASH[a] && s.day + LATER_CASH[a][0] < total) add(pid, s.day + LATER_CASH[a][0], a, LATER_CASH[a][1]);
      if (a === 'payday') for (let k = 1; k <= 3; k++) if (s.day + 3 * k < total) add(pid, s.day + 3 * k, a, 10_000);
      if ((a === 'lotto' || a === 'jackpot') && s.day + 1 < total) add(pid, s.day + 1, a, draw(AUG_TABLES[a], seeded(`${salt}:auglot:${pid}:${s.n}`)()));
      // 슬롯머신·도박사는 아래 날마다 계산에서 (잃는 돈을 그때 현금까지만 하려고)
    }
  }

  // 날마다 장 마감 때 (마감한 날만 — 진행 중이면 오늘은 아직)
  const lastClosed = finished ? total - 1 : r.day - 1;
  const pf: Record<string, PortfolioState[]> = Object.fromEntries(pids.map((p) => [p, []]));
  const eqs: Record<string, number[]> = Object.fromEntries(pids.map((p) => [p, []]));
  const ranks: Record<string, number[]> = Object.fromEntries(pids.map((p) => [p, []]));
  const tradesOf = Object.fromEntries(pids.map((p) => [p, d.trades.filter((t) => t.player_id === p)])) as Record<string, Trade[]>;
  const multi = pids.length >= 2;
  const gnet: Record<string, number> = {};
  for (let t = 0; t <= lastClosed; t++) {
    const close = pricesAt(m, t, true);
    const prev = t > 0 ? pricesAt(m, t - 1, true) : null;
    for (const pid of pids) {
      const spends = out[pid].filter((x) => x.day <= t).map((x) => ({ day: x.day, cost: -x.amount }));
      const p = computePortfolio(tradesOf[pid], spends, t, divs, start);
      pf[pid][t] = p;
      eqs[pid][t] = equityWith(p, close);
    }
    for (const pid of pids) ranks[pid][t] = 1 + pids.filter((q) => eqs[q][t] > eqs[pid][t]).length;
    // 다음 날 아침 슬롯머신·도박사 — 판 전체로 잃는 돈은 도박사 −6만·슬롯 −2만까지, 그리고 그때 현금까지만 (빚 없음)
    for (const pid of pids) {
      for (const sl of st.players[pid]) {
        const a = sl.picked;
        const tt = t + 1;
        if ((a !== 'slot' && a !== 'gambler') || sl.day >= tt || tt >= total) continue;
        const k = `${pid}:${a}`;
        const net = gnet[k] ?? 0;
        let v = draw(AUG_TABLES[a], seeded(`${salt}:augday:${pid}:${a}:${tt}`)());
        const floor = a === 'gambler' ? -60_000 : -20_000;
        if (net + v < floor) v = floor - net;
        if (v < 0) v = Math.max(v, -Math.max(0, Math.floor(pf[pid][t].cash)));
        if (v > 0) v = Math.min(v, AUG_CAP[a] - Math.max(0, net));
        gnet[k] = net + v;
        if (v) out[pid].push({ day: tt, amount: v, aug: a });
      }
    }
    const worst = Math.max(...pids.map((q) => ranks[q][t]));
    const top = Math.max(...pids.map((q) => eqs[q][t]));
    for (const pid of pids) {
      const mine = owned(pid, t);
      if (!mine.length) continue;
      const p = pf[pid][t];
      const eq = eqs[pid][t];
      const creditsToday = out[pid].filter((x) => x.day === t).reduce((a, x) => a + x.amount, 0);
      const baseEq = (t > 0 ? eqs[pid][t - 1] : start) + creditsToday;
      const pnl = eq - baseEq;
      const todays = tradesOf[pid].filter((x) => x.day === t);
      const nextDay = t + 1;
      const prevQty = (sym: string) => (t > 0 ? (pf[pid][t - 1].holdings[sym]?.qty ?? 0) : 0);
      /** 전날부터 계속 들고 있던 만큼의 오늘 평가이익 */
      const heldGain = (pred: (s: string) => boolean) => {
        if (!prev) return 0;
        let g = 0;
        for (const [sym, h] of Object.entries(p.holdings)) if (pred(sym)) g += Math.min(h.qty, prevQty(sym)) * ((close[sym] ?? 0) - (prev[sym] ?? 0));
        return g;
      };
      for (const { id: a, day: a0 } of mine) {
        switch (a) {
          case 'int1': case 'int2': case 'int3':
            if (todays.length) add(pid, nextDay, a, Math.max(0, p.cash) * (a === 'int1' ? 0.0018 : a === 'int2' ? 0.0045 : 0.005));
            break;
          case 'king':
            add(pid, nextDay, a, Math.max(0, p.cash) * 0.004);
            break;
          case 'cushion1': case 'cushion2': case 'insure': {
            const over = -pnl - (a === 'insure' ? 0.02 : 0.03) * baseEq;
            if (over > 0) add(pid, nextDay, a, over * (a === 'cushion1' ? 0.6 : a === 'cushion2' ? 0.5 : 1));
            break;
          }
          case 'compound':
            add(pid, nextDay, a, eq * 0.006);
            break;
          case 'attend':
            if (todays.length) add(pid, nextDay, a, 2_000);
            break;
          case 'climb':
            if (multi && t > a0 && ranks[pid][t] < ranks[pid][t - 1]) add(pid, nextDay, a, 15_000);
            break;
          case 'last1': case 'last2':
            if (multi && ranks[pid][t] === worst && worst > 1) add(pid, nextDay, a, a === 'last1' ? 10_000 : 25_000);
            break;
          case 'army':
            // 꼴찌이거나 1위와 10% 넘게 차이 나는 날 — 꼴찌 하나만 보면 판마다 너무 들쭉날쭉
            if (multi && ((ranks[pid][t] === worst && worst > 1) || (top > 0 && (top - eq) / top > 0.1))) add(pid, nextDay, a, 15_000);
            break;
          case 'chaser':
            if (multi && top > 0 && (top - eq) / top > 0.1) add(pid, nextDay, a, 20_000);
            break;
          case 'semi2': case 'battery2': case 'bio2': case 'crypto2': case 'us2': case 'us3': {
            const [k, rate] = SECTOR_RATE[a];
            const g = heldGain((s) => inSector(s, k));
            if (g > 0) add(pid, nextDay, a, g * rate);
            break;
          }
          case 'rule': {
            const sec = ruleSector(d, m, pid, a0);
            const g = sec ? heldGain((s) => STOCK_MAP[s]?.sector === sec) : 0;
            if (g > 0) add(pid, nextDay, a, g * 0.2);
            break;
          }
          case 'spread': {
            const secs = new Set(Object.entries(p.holdings).filter(([s, h]) => h.qty * (close[s] ?? 0) >= eq * 0.03).map(([s]) => STOCK_MAP[s]?.sector));
            if (secs.size >= 3) add(pid, nextDay, a, 10_000);
            break;
          }
          case 'steel':
            if (pnl < -0.03 * baseEq) add(pid, nextDay, a, 10_000);
            break;
          case 'allin': {
            const big = Object.entries(p.holdings).sort((x, y) => y[1].qty * (close[y[0]] ?? 0) - x[1].qty * (close[x[0]] ?? 0))[0];
            if (big && big[1].qty * (close[big[0]] ?? 0) > eq * 0.7) {
              const g = heldGain((s) => s === big[0]);
              if (g > 0) add(pid, nextDay, a, g * 0.15);
            }
            break;
          }
          case 'artisan':
            if (todays.length >= 1 && todays.length <= 3 && pnl > 0) add(pid, nextDay, a, pnl * 0.25);
            break;
          case 'scalp': {
            // 같은 날 사서 같은 날 판 만큼의 이익
            const bought: Record<string, { q: number; cost: number }> = {};
            let gain = 0;
            for (const x of todays) {
              const b = (bought[x.symbol] ??= { q: 0, cost: 0 });
              if (x.side === 'buy') {
                b.q += x.qty;
                b.cost += x.qty * x.price;
              } else if (b.q > 0) {
                const q = Math.min(b.q, x.qty);
                const avg = b.cost / b.q;
                gain += q * (x.price - avg);
                b.q -= q;
                b.cost -= q * avg;
              }
            }
            if (gain > 0) add(pid, nextDay, a, gain * 0.2);
            break;
          }
          case 'div': {
            const got = p.dividendLog.filter((x) => x.day === t).reduce((s, x) => s + x.amount, 0);
            if (got > 0) add(pid, nextDay, a, got);
            break;
          }
        }
      }
      // 타이밍의 신: 그날 최저가는 장이 끝나야 정해지므로 마감 뒤에
      for (const u of (d.augs ?? []).filter((x) => x.player_id === pid && x.action === 'use' && x.aug === 'timing' && x.day === t)) {
        const tr = todays.find((x) => (x.id ?? '') === u.payload?.trade && x.side === 'buy');
        const low = tr ? m.bars[tr.symbol]?.[t]?.low : undefined;
        if (tr && low && tr.price > low) add(pid, nextDay, 'timing', tr.qty * (tr.price - low));
      }
      // 마지막 날 마감
      if (t === total - 1) {
        for (const { id: a } of mine) {
          if (a === 'comeback' && multi && ranks[pid][t] === worst && worst > 1) add(pid, total, a, 100_000);
          if (a === 'oneshot') add(pid, total, a, eq / start - 1 > 0.05 ? 100_000 : -Math.min(20_000, Math.max(0, Math.floor(p.cash))));
          // 존버·물타기는 마지막 날 전날 마감 기준 — 마지막 날 다 팔아도 그동안 들고 버틴 몫은 받음
          const tb = Math.max(0, t - 1);
          const pb = pf[pid][tb];
          const cb = pricesAt(m, tb, true);
          if (a === 'hodl1' || a === 'hodl2') {
            let g = 0;
            for (const [sym, h] of Object.entries(pb.holdings)) {
              let q = h.qty;
              for (let k = Math.max(0, tb - 3); k < tb; k++) q = Math.min(q, pf[pid][k]?.holdings[sym]?.qty ?? 0);
              if (tb < 3) q = 0;
              g += q * ((cb[sym] ?? 0) - h.avgCost);
            }
            if (g > 0) add(pid, total, a, g * (a === 'hodl1' ? 0.6 : 0.7));
          }
          if (a === 'average') {
            let loss = 0;
            for (const [sym, h] of Object.entries(pb.holdings)) loss += Math.max(0, h.qty * (h.avgCost - (cb[sym] ?? 0)));
            if (loss > 0) add(pid, total, a, loss * 0.5);
          }
        }
      }
    }
  }
  // 되돌리기: 처음 거래의 수수료를 돌려받음 (되돌린 거래 자체는 수수료 없이 반대로 체결)
  for (const u of (d.augs ?? []).filter((x) => x.action === 'use' && x.aug === 'undo')) {
    const tr = d.trades.find((x) => (x.id ?? '') === u.payload?.trade);
    if (tr && out[u.player_id]) out[u.player_id].push({ day: u.day, amount: Math.round(tr.qty * tr.price * tr.fee), aug: 'undo' });
  }

  const shown = finished ? out : Object.fromEntries(Object.entries(out).map(([p, xs]) => [p, xs.filter((x) => x.day <= r.day)]));
  cache.set(key, shown);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return shown;
}

/** 수수료율 — 증강이 없으면 base 그대로 */
export function augFeeRate(owned: string[], ctx: { symbol: string; side: 'buy' | 'sell'; qty: number; held: number; boughtToday: number; biggest: string | null; ruleSector: string | null }, base: number): number {
  if (!owned.length) return base;
  const { symbol, side } = ctx;
  const cond = sectorCondOf(symbol);
  if (owned.includes('nofee') || owned.includes('int3')) return 0;
  if (cond && (owned.includes(`${cond}1`) || owned.includes(`${cond}2`))) return 0;
  if (cond === 'us' && owned.includes('us3')) return 0;
  if (ctx.ruleSector && owned.includes('rule') && STOCK_MAP[symbol]?.sector === ctx.ruleSector) return 0;
  if (owned.includes('average') && side === 'buy' && ctx.held > 0) return 0;
  // 단타: 오늘 산 만큼 안에서 판 것만 0, 그보다 많이 팔면(들고 있던 주식) 2배
  if (owned.includes('scalp') && side === 'sell') return ctx.qty <= ctx.boughtToday ? 0 : base * 2;
  if (owned.includes('allin') && ctx.biggest && ctx.biggest !== symbol) return base * 2;
  return base;
}

export const augMaxOrders = (owned: string[], base: number) => (owned.includes('orders') || owned.includes('int3') ? 10 : base);
export const augOrderRange = (owned: string[]) => (owned.includes('orders') ? 0.4 : 0.3);
export const augLevCap = (owned: string[], base: number) => (owned.includes('king') ? 0 : owned.includes('lev') ? 0.6 : base);

/** 정보 증강: 종류별 판 전체 횟수와 이미 쓴 횟수 */
export function augInfoLeft(d: GameData, st: AugState, pid: string) {
  const owned = ownedAugs(st, pid);
  const cap: Record<string, number> = { detector: 0, scout: 0, paper: 0, analyst: 0 };
  let acc = 0.7;
  for (const a of owned) {
    const x = AUG_INFO[a];
    if (!x) continue;
    cap[x.kind] += x.n;
    if (x.acc) acc = Math.max(acc, x.acc);
  }
  const uses = (d.augs ?? []).filter((x) => x.player_id === pid && x.action === 'use' && x.aug in cap);
  const left = Object.fromEntries(Object.entries(cap).map(([k, n]) => [k, n - uses.filter((u) => u.aug === k).length])) as Record<'detector' | 'scout' | 'paper' | 'analyst', number>;
  return { left, acc, uses };
}
