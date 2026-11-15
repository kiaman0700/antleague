export const START_CASH = 10_000_000;
export const FEE_RATE = 0.001;

export interface Trade {
  id?: string;
  player_id: string;
  tick: number;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
}

export interface Holding {
  qty: number;
  avgCost: number;
}

export interface ClosedTrade {
  symbol: string;
  tick: number;
  qty: number;
  pnl: number;
  pnlPct: number;
}

export interface PortfolioState {
  cash: number;
  holdings: Record<string, Holding>;
  closed: ClosedTrade[];
}

export function buyCost(qty: number, price: number) {
  return Math.ceil(qty * price * (1 + FEE_RATE));
}
export function sellProceeds(qty: number, price: number) {
  return Math.floor(qty * price * (1 - FEE_RATE));
}
export function maxBuyQty(cash: number, price: number) {
  let q = Math.floor(cash / (price * (1 + FEE_RATE)));
  while (q > 0 && buyCost(q, price) > cash) q--;
  return Math.max(0, q);
}

/** 거래 내역 → 포트폴리오. upToTick을 주면 그 시점까지의 거래만 반영 */
export function computePortfolio(trades: Trade[], upToTick = Infinity): PortfolioState {
  let cash = START_CASH;
  const holdings: Record<string, Holding> = {};
  const closed: ClosedTrade[] = [];
  const sorted = [...trades].sort((a, b) => a.tick - b.tick);
  for (const t of sorted) {
    if (t.tick > upToTick) break;
    const h = holdings[t.symbol] ?? { qty: 0, avgCost: 0 };
    if (t.side === 'buy') {
      const cost = buyCost(t.qty, t.price);
      if (cost > cash) continue;
      cash -= cost;
      h.avgCost = (h.avgCost * h.qty + cost) / (h.qty + t.qty);
      h.qty += t.qty;
    } else {
      const q = Math.min(t.qty, h.qty);
      if (q <= 0) continue;
      const proceeds = sellProceeds(q, t.price);
      cash += proceeds;
      const pnl = proceeds - h.avgCost * q;
      closed.push({ symbol: t.symbol, tick: t.tick, qty: q, pnl, pnlPct: pnl / (h.avgCost * q) });
      h.qty -= q;
      if (h.qty === 0) h.avgCost = 0;
    }
    holdings[t.symbol] = h;
  }
  for (const k of Object.keys(holdings)) if (holdings[k].qty === 0) delete holdings[k];
  return { cash, holdings, closed };
}

export function equityAt(p: PortfolioState, prices: Record<string, number[]>, tick: number): number {
  let eq = p.cash;
  for (const [sym, h] of Object.entries(p.holdings)) eq += h.qty * prices[sym][tick];
  return eq;
}

/** 틱별 총자산 추이 (결과 그래프용) */
export function equityHistory(trades: Trade[], prices: Record<string, number[]>, totalTicks: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= totalTicks; t++) out.push(equityAt(computePortfolio(trades, t), prices, t));
  return out;
}
