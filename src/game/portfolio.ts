import type { Market } from './market.js';
import { STOCKS } from './stocks.js';

export const START_CASH = 10_000_000;
/** 규칙 v6 부터 시작 돈 100만원 (그 전 방은 1,000만원 그대로) */
export const startCashFor = (version?: number | null) => ((version ?? 1) >= 6 ? 1_000_000 : START_CASH);
/** 돈 단위 배율: v6 = 1/10 (카드 값·업적 기준 금액 등) */
export const moneyScale = (version?: number | null) => startCashFor(version) / START_CASH;
export const FEE_RATE = 0.001;

export interface Trade {
  id?: string;
  player_id: string;
  day: number;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  /** 체결 당시 수수료율 (수수료 폭탄 아이템이면 1%) */
  fee: number;
  created_at?: string;
}

export interface Holding {
  qty: number;
  /** 수수료 포함 1주당 평균 매입가 */
  avgCost: number;
}

export interface ClosedTrade {
  symbol: string;
  day: number;
  qty: number;
  pnl: number;
  pnlPct: number;
}

export interface PortfolioState {
  cash: number;
  holdings: Record<string, Holding>;
  closed: ClosedTrade[];
  itemSpend: number;
  /** 받은 배당 */
  dividendIncome: number;
  dividendLog: { day: number; symbol: string; qty: number; amount: number }[];
}

export function buyCost(qty: number, price: number, fee = FEE_RATE) {
  return Math.ceil(qty * price * (1 + fee));
}
export function sellProceeds(qty: number, price: number, fee = FEE_RATE) {
  return Math.floor(qty * price * (1 - fee));
}
export function maxBuyQty(cash: number, price: number, fee = FEE_RATE) {
  let q = Math.floor(cash / (price * (1 + fee)));
  while (q > 0 && buyCost(q, price, fee) > cash) q--;
  return Math.max(0, q);
}

export interface Spend {
  day: number;
  cost: number;
}

/** 확정된 배당 (perShare > 0 인 것만 지급) */
export interface PaidDividend {
  day: number;
  symbol: string;
  perShare: number;
}

/**
 * 거래 + 카드 구매 + 배당 → 포트폴리오.
 * upToDay 를 주면 그 날(마감 포함)까지만 반영. 배당은 기준일 마감 때 보유 수량만큼 지급.
 */
export function computePortfolio(trades: Trade[], spends: Spend[] = [], upToDay = Infinity, dividends: PaidDividend[] = [], start = START_CASH): PortfolioState {
  let cash = start;
  const holdings: Record<string, Holding> = {};
  const closed: ClosedTrade[] = [];
  let itemSpend = 0;
  let dividendIncome = 0;
  const dividendLog: PortfolioState['dividendLog'] = [];
  for (const s of spends) {
    if (s.day > upToDay) continue;
    cash -= s.cost;
    itemSpend += s.cost;
  }
  const sorted = [...trades].sort((a, b) => a.day - b.day || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const divs = dividends.filter((d) => d.perShare > 0 && d.day <= upToDay).sort((a, b) => a.day - b.day);
  let di = 0;
  const payUntil = (day: number) => {
    // day 이전(포함) 기준일 배당을 지급
    while (di < divs.length && divs[di].day <= day) {
      const d = divs[di++];
      const qty = holdings[d.symbol]?.qty ?? 0;
      if (qty > 0) {
        const amount = qty * d.perShare;
        cash += amount;
        dividendIncome += amount;
        dividendLog.push({ day: d.day, symbol: d.symbol, qty, amount });
      }
    }
  };
  for (const t of sorted) {
    if (t.day > upToDay) break;
    payUntil(t.day - 1);
    const h = holdings[t.symbol] ?? { qty: 0, avgCost: 0 };
    if (t.side === 'buy') {
      const cost = buyCost(t.qty, t.price, t.fee);
      cash -= cost;
      h.avgCost = (h.avgCost * h.qty + cost) / (h.qty + t.qty);
      h.qty += t.qty;
    } else {
      const q = Math.min(t.qty, h.qty);
      if (q <= 0) continue;
      const proceeds = sellProceeds(q, t.price, t.fee);
      cash += proceeds;
      const pnl = proceeds - h.avgCost * q;
      closed.push({ symbol: t.symbol, day: t.day, qty: q, pnl, pnlPct: pnl / (h.avgCost * q) });
      h.qty -= q;
      if (h.qty === 0) h.avgCost = 0;
    }
    holdings[t.symbol] = h;
  }
  payUntil(Number.isFinite(upToDay) ? upToDay : Number.MAX_SAFE_INTEGER);
  for (const k of Object.keys(holdings)) if (holdings[k].qty === 0) delete holdings[k];
  return { cash, holdings, closed, itemSpend, dividendIncome, dividendLog };
}

export function equityWith(p: PortfolioState, prices: Record<string, number>): number {
  let eq = p.cash;
  for (const [sym, h] of Object.entries(p.holdings)) eq += h.qty * prices[sym];
  return eq;
}

/** 날짜별 마감 총자산 (index 0 = 시작 전, i = i-1일차 종가) */
export function equityHistory(trades: Trade[], spends: Spend[], m: Market, upToDay = m.totalDays - 1): number[] {
  const start = startCashFor(m.version);
  const out = [start];
  for (let d = 0; d <= upToDay; d++) {
    const closes: Record<string, number> = {};
    for (const s of STOCKS) closes[s.symbol] = m.bars[s.symbol][d].close;
    out.push(equityWith(computePortfolio(trades, spends, d, m.dividends, start), closes));
  }
  return out;
}
