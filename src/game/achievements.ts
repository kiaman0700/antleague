import { deriveItems, type ItemRow } from './items.js';
import { KR_INDEX_BASE, type Market } from './market.js';
import { computePortfolio, equityHistory, moneyScale, startCashFor, type Spend, type Trade } from './portfolio.js';
import { STOCK_MAP } from './stocks.js';

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  /** 1 흔함 · 2 드묾 · 3 전설 */
  rarity: 1 | 2 | 3;
}

export const BADGES: Badge[] = [
  { id: 'comeback', emoji: '🔥', name: '대역전극', desc: '중반까지 1위가 아니다가 역전 우승', rarity: 3 },
  { id: 'limit_up', emoji: '🚀', name: '상한가 사냥꾼', desc: '가진 종목이 하루에 +29% 넘게(상한가) 오름', rarity: 3 },
  { id: 'zen', emoji: '🐢', name: '존버의 미학', desc: '거래 5회 이하로 승리 (연습: 플러스 수익)', rarity: 3 },
  { id: 'crash_winner', emoji: '🐻', name: '폭락장의 승자', desc: '지수가 3% 넘게 빠진 날 인버스 ETF를 들고 있었음', rarity: 2 },
  { id: 'diamond', emoji: '💎', name: '다이아몬드 핸드', desc: '한 종목을 7일 이상 계속 보유', rarity: 2 },
  { id: 'bottom', emoji: '🎯', name: '저점 매수의 신', desc: '그 종목의 게임 중 최저가 3% 안에서 매수', rarity: 2 },
  { id: 'big_win', emoji: '🎰', name: '한 방', desc: '한 종목으로 시작 돈의 10% 넘게 수익', rarity: 2 },
  { id: 'shield', emoji: '🛡️', name: '철벽 방어', desc: '방패로 상대의 방해 카드를 막음', rarity: 2 },
  { id: 'winner', emoji: '🏆', name: '투자왕', desc: '대결에서 1위', rarity: 1 },
  { id: 'beat_market', emoji: '📈', name: '시장을 이긴 자', desc: '거래를 하고 종합지수보다 높은 수익률', rarity: 1 },
  { id: 'dividend', emoji: '💰', name: '배당 부자', desc: '배당금을 시작 돈의 1% 넘게 받음', rarity: 1 },
  { id: 'global', emoji: '🌎', name: '글로벌 투자자', desc: '국내·미국 주식을 동시에 보유', rarity: 1 },
  { id: 'limit_order', emoji: '⏳', name: '예약의 달인', desc: '지정가 주문이 3번 이상 체결', rarity: 1 },
  { id: 'card_master', emoji: '🃏', name: '카드 마스터', desc: '찬스 카드를 4장 이상 사용', rarity: 1 },
  { id: 'trader', emoji: '⚡', name: '단타왕', desc: '거래 20회 이상', rarity: 1 },
];
export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** 획득한 배지 중 가장 귀한 것이 칭호 */
export function titleOf(ids: string[]): Badge | null {
  return BADGES.find((b) => ids.includes(b.id)) ?? null;
}

export interface AchievementInput {
  market: Market;
  seed: number;
  players: { id: string; trades: Trade[]; spends: Spend[]; filledOrders: number }[];
  items: ItemRow[];
}

export function computeAchievements(inp: AchievementInput): Record<string, string[]> {
  const { market: m } = inp;
  const last = m.totalDays - 1;
  const solo = inp.players.length < 2;
  const items = deriveItems(inp.seed, inp.players.map((p) => p.id), inp.items, last, m.totalDays, solo, m.version ?? 1);
  const hist = Object.fromEntries(inp.players.map((p) => [p.id, equityHistory(p.trades, p.spends, m)]));
  const finalEq = (id: string) => hist[id][hist[id].length - 1];
  const indexRet = m.index[last].close / KR_INDEX_BASE - 1;
  const ids = inp.players.map((p) => p.id);
  const byFinal = [...ids].sort((x, y) => finalEq(y) - finalEq(x));
  const winner = !solo && finalEq(byFinal[0]) !== finalEq(byFinal[1]) ? byFinal[0] : null;

  // 각 종목의 게임 중 최저가
  const minPrice: Record<string, number> = {};
  for (const [sym, bars] of Object.entries(m.bars)) minPrice[sym] = Math.min(...bars.map((b) => Math.min(b.low, b.open, b.close)));

  const out: Record<string, string[]> = {};
  for (const p of inp.players) {
    const got = new Set<string>();
    const ret = finalEq(p.id) / startCashFor(m.version) - 1;
    if (winner === p.id) got.add('winner');
    // 한 번이라도 거래해야 (현금만 들고 시장이 내린 판에서 거저 받지 않게 — 사용자 결정 2026-11-17)
    if (ret > indexRet && p.trades.length > 0) got.add('beat_market');
    if (p.trades.length >= 20) got.add('trader');
    if (p.filledOrders >= 3) got.add('limit_order');
    if ((solo && ret > 0 && p.trades.length <= 5 && p.trades.length > 0) || (winner === p.id && p.trades.length <= 5)) got.add('zen');

    if (!solo && winner === p.id) {
      const mid = Math.floor(m.totalDays / 2);
      // 중반에 1등이 아니었는데 우승
      if (ids.some((x) => x !== p.id && hist[x][mid] > hist[p.id][mid])) got.add('comeback');
    }

    const used = Object.values(items.players[p.id]?.used ?? {}).reduce((a, n) => a + (n ?? 0), 0);
    if (used >= 4) got.add('card_master');
    if (items.effects.some((e) => e.to === p.id && e.blocked && !e.crowded)) got.add('shield');

    if (p.trades.some((t) => t.side === 'buy' && t.price <= minPrice[t.symbol] * 1.03)) got.add('bottom');

    const pfEnd = computePortfolio(p.trades, p.spends, Infinity, m.dividends, startCashFor(m.version));
    const k = moneyScale(m.version);
    if (pfEnd.dividendIncome >= 100_000 * k) got.add('dividend');
    const bigClosed = pfEnd.closed.some((c) => c.pnl >= 1_000_000 * k);
    const bigOpen = Object.entries(pfEnd.holdings).some(([s, h]) => h.qty * (m.bars[s][last].close - h.avgCost) >= 1_000_000 * k);
    if (bigClosed || bigOpen) got.add('big_win');

    // 날짜별 마감 보유로 판단하는 배지
    const streak: Record<string, number> = {};
    for (let d = 0; d <= last; d++) {
      const hold = computePortfolio(p.trades, p.spends, d, [], startCashFor(m.version)).holdings;
      const syms = Object.keys(hold);
      for (const s of Object.keys(streak)) if (!hold[s]) streak[s] = 0;
      for (const s of syms) {
        streak[s] = (streak[s] ?? 0) + 1;
        if (streak[s] >= 7) got.add('diamond');
        const prev = d === 0 ? m.base[s] : m.bars[s][d - 1].close;
        if (!STOCK_MAP[s].etf && m.bars[s][d].close / prev - 1 >= 0.29) got.add('limit_up');
      }
      const idxPrev = d === 0 ? KR_INDEX_BASE : m.index[d - 1].close;
      if (hold.KINV && m.index[d].close / idxPrev - 1 <= -0.03) got.add('crash_winner');
      const hasUS = syms.some((s) => STOCK_MAP[s].currency === 'USD');
      const hasKR = syms.some((s) => STOCK_MAP[s].currency === 'KRW' && !STOCK_MAP[s].etf);
      if (hasUS && hasKR) got.add('global');
    }
    out[p.id] = BADGES.filter((b) => got.has(b.id)).map((b) => b.id);
  }
  return out;
}
