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
  // 전설 (2026-11-17 추가 포함 — 목록 순서 = 귀한 순서, 칭호는 가장 앞의 것)
  { id: 'bot_slayer', emoji: '🤖', name: '고수봇 사냥꾼', desc: '어려움(고수봇)이 있는 판에서 1위', rarity: 3 },
  { id: 'ret30', emoji: '💸', name: '대박', desc: '수익률 +30% 넘게 마감', rarity: 3 },
  { id: 'streak7', emoji: '📅', name: '연전연승', desc: '7일 연속 재산이 전날보다 늘어남', rarity: 3 },
  { id: 'flawless', emoji: '🧊', name: '무결점', desc: '한 번도 시작 돈 아래로 안 내려가고 +10% 넘게 마감', rarity: 3 },
  { id: 'comeback', emoji: '🔥', name: '대역전극', desc: '중반까지 1위가 아니다가 역전 우승', rarity: 3 },
  { id: 'limit_up', emoji: '🚀', name: '상한가 사냥꾼', desc: '가진 종목이 하루에 +29% 넘게(상한가) 오름', rarity: 3 },
  { id: 'zen', emoji: '🐢', name: '존버의 미학', desc: '거래 5회 이하로 승리 (연습: 플러스 수익)', rarity: 3 },
  { id: 'lv20', emoji: '🌟', name: '개미 전설', desc: '미션으로 레벨 20 달성', rarity: 3 },
  { id: 'lv15', emoji: '⭐', name: '베테랑 개미', desc: '미션으로 레벨 15 달성', rarity: 2 },
  { id: 'lv10', emoji: '✨', name: '성실한 개미', desc: '미션으로 레벨 10 달성', rarity: 2 },
  { id: 'ret15', emoji: '💹', name: '수익왕', desc: '수익률 +15% 넘게 마감', rarity: 2 },
  { id: 'news_jump', emoji: '📰', name: '사건 해결사', desc: '장중 호재 속보로 하루 +10% 넘게 오른 종목을 전날부터 들고 있었음', rarity: 2 },
  { id: 'escape', emoji: '🏃', name: '위기 탈출', desc: '하루 8% 넘게 떨어진 종목을 그날 종가보다 비싸게 팔아 피함', rarity: 2 },
  { id: 'sniper', emoji: '🔭', name: '명중', desc: '한 번 사고판 거래로 +20% 넘게 벌었음', rarity: 2 },
  { id: 'rumor_right', emoji: '🗝️', name: '찌라시 해독가', desc: '찌라시가 나온 종목을 그날·다음 날 사서 5% 넘게 벌었음', rarity: 2 },
  { id: 'multi_win', emoji: '👑', name: '다인전의 왕', desc: '3명 이상 판에서 1위', rarity: 2 },
  { id: 'bear_proof', emoji: '☂️', name: '하락장 생존자', desc: '지수가 3% 넘게 빠진 판에서 플러스로 마감', rarity: 2 },
  { id: 'specialist', emoji: '🔬', name: '업종 전문가', desc: '한 업종 종목만 6번 이상 거래', rarity: 2 },
  { id: 'saboteur', emoji: '😈', name: '훼방꾼', desc: '방해 카드가 상대에게 2번 이상 통함', rarity: 2 },
  { id: 'crash_winner', emoji: '🐻', name: '폭락장의 승자', desc: '지수가 3% 넘게 빠진 날 인버스 ETF를 들고 있었음', rarity: 2 },
  { id: 'diamond', emoji: '💎', name: '다이아몬드 핸드', desc: '한 종목을 7일 이상 계속 보유', rarity: 2 },
  { id: 'bottom', emoji: '🎯', name: '저점 매수의 신', desc: '그 종목의 게임 중 최저가 3% 안에서 매수', rarity: 2 },
  { id: 'big_win', emoji: '🎰', name: '한 방', desc: '한 종목으로 시작 돈의 10% 넘게 수익', rarity: 2 },
  { id: 'shield', emoji: '🛡️', name: '철벽 방어', desc: '방패로 상대의 방해 카드를 막음', rarity: 2 },
  { id: 'lv5', emoji: '🌱', name: '새싹 개미', desc: '미션으로 레벨 5 달성', rarity: 1 },
  { id: 'winner', emoji: '🏆', name: '투자왕', desc: '대결에서 1위', rarity: 1 },
  { id: 'beat_market', emoji: '📈', name: '시장을 이긴 자', desc: '거래를 하고 종합지수보다 높은 수익률', rarity: 1 },
  { id: 'dividend', emoji: '💰', name: '배당 부자', desc: '배당금을 시작 돈의 1% 넘게 받음', rarity: 1 },
  { id: 'global', emoji: '🌎', name: '글로벌 투자자', desc: '국내·미국 주식을 동시에 보유', rarity: 1 },
  { id: 'limit_order', emoji: '⏳', name: '예약의 달인', desc: '지정가 주문이 3번 이상 체결', rarity: 1 },
  { id: 'card_master', emoji: '🃏', name: '카드 마스터', desc: '찬스 카드를 4장 이상 사용', rarity: 1 },
  { id: 'trader', emoji: '⚡', name: '단타왕', desc: '거래 20회 이상', rarity: 1 },
  { id: 'podium', emoji: '🥉', name: '시상대', desc: '4명 이상 판에서 3위 안', rarity: 1 },
  { id: 'plus', emoji: '➕', name: '플러스 마감', desc: '거래를 하고 수익률 플러스로 마감', rarity: 1 },
  { id: 'all_in', emoji: '🎲', name: '몰빵', desc: '장 마감에 재산의 80% 넘게를 한 종목에', rarity: 1 },
  { id: 'diversify', emoji: '🧺', name: '분산 투자', desc: '장 마감에 6종목 이상 보유', rarity: 1 },
  { id: 'leverage', emoji: '🎢', name: '레버리지 맛보기', desc: '레버리지 ETF를 들고 장 마감', rarity: 1 },
  { id: 'etf_fan', emoji: '📦', name: 'ETF 입문', desc: 'ETF를 사 봄', rarity: 1 },
  { id: 'detective', emoji: '🔍', name: '루머 감별사', desc: '루머 감별기를 3번 이상 씀', rarity: 1 },
  { id: 'first_card', emoji: '🎴', name: '첫 카드', desc: '찬스 카드를 처음 씀', rarity: 1 },
  { id: 'first_trade', emoji: '🐣', name: '첫 거래', desc: '처음으로 주식을 사 봄', rarity: 1 },
];
export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** 획득한 배지 중 가장 귀한 것이 칭호 */
export function titleOf(ids: string[]): Badge | null {
  return BADGES.find((b) => ids.includes(b.id)) ?? null;
}

export interface AchievementInput {
  market: Market;
  seed: number;
  players: { id: string; trades: Trade[]; spends: Spend[]; filledOrders: number; /** 봇이면 난이도 */ bot?: number | null }[];
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

    // ---- 2026-11-17 추가 ----
    const traded = p.trades.length > 0;
    if (p.trades.some((t) => t.side === 'buy')) got.add('first_trade');
    if (traded && ret > 0) got.add('plus');
    if (traded && ret >= 0.15) got.add('ret15');
    if (traded && ret >= 0.3) got.add('ret30');
    if (traded && indexRet <= -0.03 && ret > 0) got.add('bear_proof');
    const h = hist[p.id];
    if (traded && ret >= 0.1 && h.every((v) => v >= startCashFor(m.version) - 1)) got.add('flawless');
    let run = 0;
    for (let i = 1; i < h.length; i++) {
      run = h[i] > h[i - 1] ? run + 1 : 0;
      if (run >= 7) got.add('streak7');
    }
    const rank = byFinal.indexOf(p.id);
    if (ids.length >= 3 && winner === p.id) got.add('multi_win');
    if (ids.length >= 4 && rank <= 2) got.add('podium');
    if (winner === p.id && inp.players.some((o) => o.id !== p.id && o.bot === 3)) got.add('bot_slayer');
    if (p.trades.some((t) => t.side === 'buy' && STOCK_MAP[t.symbol]?.etf)) got.add('etf_fan');
    const sectors = new Set(p.trades.map((t) => STOCK_MAP[t.symbol]?.sector));
    if (p.trades.length > 5 && sectors.size === 1 && !sectors.has('etf')) got.add('specialist');
    const usedBy = items.players[p.id]?.used ?? {};
    if (Object.values(usedBy).some((n) => (n ?? 0) > 0)) got.add('first_card');
    if ((usedBy.detector ?? 0) >= 3) got.add('detective');
    if (items.effects.filter((e) => e.from === p.id && e.to !== p.id && !e.blocked && !e.crowded && !e.reflected).length >= 2) got.add('saboteur');
    // 찌라시가 나온 종목을 그날·다음 날 사서 5% 넘게 (판 안에서 판 값 또는 마지막 날 종가 기준)
    const rumorDays = new Map<string, number[]>();
    for (const n of m.news) if (n.rumor && n.symbol) rumorDays.set(n.symbol, [...(rumorDays.get(n.symbol) ?? []), n.day]);
    for (const t of p.trades) {
      if (t.side !== 'buy' || !(rumorDays.get(t.symbol) ?? []).some((d) => t.day === d || t.day === d + 1)) continue;
      const sold = p.trades.find((x) => x.side === 'sell' && x.symbol === t.symbol && x.day >= t.day && (x.created_at ?? '') >= (t.created_at ?? ''));
      const exit = sold ? sold.price : m.bars[t.symbol][last].close;
      if (exit >= t.price * 1.05) got.add('rumor_right');
    }

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
    if (pfEnd.closed.some((c) => c.pnlPct >= 0.2)) got.add('sniper');
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
      if (syms.length > 5) got.add('diversify');
      if (syms.some((s) => (STOCK_MAP[s].etf?.lev ?? 1) >= 2)) got.add('leverage');
      const eqD = h[d + 1];
      if (eqD > 0 && syms.some((s) => (hold[s].qty * m.bars[s][d].close) / eqD >= 0.8)) got.add('all_in');
      // 장중 호재 속보로 +10% 넘게 오른 종목을 전날 장 마감부터 들고 있었음
      if (d > 0) {
        const prevHold = computePortfolio(p.trades, p.spends, d - 1, [], startCashFor(m.version)).holdings;
        for (const s of Object.keys(prevHold)) {
          const jumped = m.bars[s][d].close / m.bars[s][d - 1].close - 1 >= 0.1;
          if (jumped && m.news.some((n) => n.day === d && n.symbol === s && n.at != null && n.tone === 'good')) got.add('news_jump');
        }
      }
      // 하루 8% 넘게 떨어진 종목을 그날 종가보다 비싸게 팔았음
      const prevClose = (s: string) => (d === 0 ? m.base[s] : m.bars[s][d - 1].close);
      if (p.trades.some((t) => t.day === d && t.side === 'sell' && m.bars[t.symbol][d].close / prevClose(t.symbol) - 1 <= -0.08 && t.price > m.bars[t.symbol][d].close)) got.add('escape');
      const hasUS = syms.some((s) => STOCK_MAP[s].currency === 'USD');
      const hasKR = syms.some((s) => STOCK_MAP[s].currency === 'KRW' && !STOCK_MAP[s].etf);
      if (hasUS && hasKR) got.add('global');
    }
    out[p.id] = BADGES.filter((b) => got.has(b.id)).map((b) => b.id);
  }
  return out;
}
