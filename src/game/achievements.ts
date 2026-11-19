import { deriveItems, type ItemRow } from './items.js';
import type { Bar, Market } from './market.js';
import { computePortfolio, equityHistory, moneyScale, startCashFor, type Spend, type Trade } from './portfolio.js';
import { KR_INDEX_BASE, STOCK_MAP } from './stocks.js';

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  /** 1 흔함 · 2 드묾 · 3 전설 */
  rarity: 1 | 2 | 3;
  /** 웃픈 업적 (안 좋은 경험으로 받음, 설계서 design/achievements-v2.md) */
  funny?: true;
}

export const BADGES: Badge[] = [
  // 전설 (목록 순서 = 귀한 순서, 칭호는 가장 앞의 것)
  { id: 'bot_slayer', emoji: '🤖', name: '고수봇 사냥꾼', desc: '어려움(고수봇)이 있는 판에서 1위', rarity: 3 },
  { id: 'ret30', emoji: '💸', name: '대박', desc: '수익률 +30% 넘게 마감', rarity: 3 },
  { id: 'streak7', emoji: '📅', name: '연전연승', desc: '7일 연속 재산이 전날보다 늘어남', rarity: 3 },
  { id: 'flawless', emoji: '🧊', name: '무결점', desc: '한 번도 시작 돈 아래로 안 내려가고 +10% 넘게 마감', rarity: 3 },
  { id: 'comeback', emoji: '🔥', name: '대역전극', desc: '중반까지 1위가 아니다가 역전 우승', rarity: 3 },
  { id: 'limit_up', emoji: '🚀', name: '상한가 사냥꾼', desc: '가진 종목이 하루에 +29% 넘게(상한가) 오름', rarity: 3 },
  { id: 'zen', emoji: '🐢', name: '존버의 미학', desc: '거래 5회 이하로 승리 (연습: 플러스 수익)', rarity: 3 },
  { id: 'league_gold', emoji: '👑', name: '황금개미', desc: '주간 리그 가장 높은 단계(황금개미)에 오름', rarity: 3 },
  { id: 'lv20', emoji: '🌟', name: '개미 전설', desc: '미션으로 레벨 20 달성', rarity: 3 },
  { id: 'league_win', emoji: '🏅', name: '리그 우승', desc: '주간 리그에서 5명 이상인 조 1위로 한 주를 마침', rarity: 2 },
  { id: 'league_queen', emoji: '🐜', name: '여왕개미', desc: '주간 리그 여왕개미 단계에 오름', rarity: 2 },
  { id: 'lv15', emoji: '⭐', name: '베테랑 개미', desc: '미션으로 레벨 15 달성', rarity: 2 },
  { id: 'lv10', emoji: '✨', name: '성실한 개미', desc: '미션으로 레벨 10 달성', rarity: 2 },
  { id: 'ret15', emoji: '💹', name: '수익왕', desc: '수익률 +15% 넘게 마감', rarity: 2 },
  { id: 'news_jump', emoji: '📰', name: '사건 해결사', desc: '장중 호재 속보로 하루 +10% 넘게 오른 종목을 전날부터 들고 있었음', rarity: 2 },
  { id: 'escape', emoji: '🏃', name: '위기 탈출', desc: '하루 8% 넘게 떨어진 종목을 그날 종가보다 비싸게 팔아 피함', rarity: 2 },
  { id: 'sniper', emoji: '🔭', name: '명중', desc: '한 번 사고판 거래로 +20% 넘게 벌었음', rarity: 2 },
  { id: 'rumor_right', emoji: '🗝️', name: '찌라시 해독가', desc: '커뮤니티 소문이 나온 종목을 그날·다음 날 사서 5% 넘게 벌었음', rarity: 2 },
  { id: 'multi_win', emoji: '👑', name: '다인전의 왕', desc: '3명 이상 판에서 1위', rarity: 2 },
  { id: 'bear_proof', emoji: '☂️', name: '하락장 생존자', desc: '지수가 3% 넘게 빠진 판에서 플러스로 마감', rarity: 2 },
  { id: 'specialist', emoji: '🔬', name: '업종 전문가', desc: '한 업종 종목만 6번 이상 거래', rarity: 2 },
  { id: 'saboteur', emoji: '😈', name: '훼방꾼', desc: '방해 카드가 상대에게 2번 이상 통함', rarity: 2 },
  { id: 'crash_winner', emoji: '🐻', name: '폭락장의 승자', desc: '지수가 3% 넘게 빠진 날 인버스 ETF를 들고 있었음', rarity: 2 },
  { id: 'diamond', emoji: '💎', name: '다이아몬드 핸드', desc: '한 종목을 7일 이상 계속 보유', rarity: 2 },
  { id: 'bottom', emoji: '🎯', name: '저점 매수의 신', desc: '판 동안 10% 넘게 움직인 종목을 최저가 3% 안에서 매수', rarity: 2 },
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
  { id: 'tut_grad', emoji: '🎓', name: '개미 학교 졸업', desc: '튜토리얼 4단계(홈·게임·결과·미션)를 모두 끝냄', rarity: 1 },
  // 웃픈 업적 (안 좋은 경험으로도 받는 업적) — 칭호 고르기에서 맨 뒤
  { id: 'big_loss', emoji: '🫙', name: '깡통 계좌', desc: '거래하고 수익률 −20% 아래로 마감', rarity: 2, funny: true },
  { id: 'buy_high', emoji: '🏔️', name: '꼭지에서 산 개미', desc: '판 동안 10% 넘게 움직인 종목을 최고가 3% 안에서 매수', rarity: 1, funny: true },
  { id: 'punching_bag', emoji: '🩹', name: '동네북', desc: '한 판에 방해 카드를 3번 넘게 맞음', rarity: 2, funny: true },
  { id: 'fooled', emoji: '🙈', name: '찌라시에 속은 개미', desc: '거짓 호재 찌라시가 난 날 그 종목을 사서 손해', rarity: 1, funny: true },
  { id: 'last_place', emoji: '🕳️', name: '바닥 체험', desc: '3명 이상 판에서 꼴찌', rarity: 1, funny: true },
  { id: 'limit_down', emoji: '🧊', name: '하한가 직격', desc: '가진 종목이 하루에 −29% 넘게(하한가) 떨어짐', rarity: 2, funny: true },
  { id: 'paper_hands', emoji: '😭', name: '팔고 나니 급등', desc: '판 종목이 그 뒤 판 값보다 15% 넘게 오름', rarity: 1, funny: true },
  { id: 'fee_donor', emoji: '🧾', name: '수수료 기부왕', desc: '거래 30번 넘게 하고 마이너스 마감', rarity: 1, funny: true },
  { id: 'lev_burn', emoji: '🥵', name: '레버리지의 쓴맛', desc: '레버리지·인버스 ETF로 10% 넘게 손해 보고 팖', rarity: 1, funny: true },
  { id: 'choke', emoji: '🫠', name: '다 잡은 승리', desc: '중반까지 1위였는데 우승을 놓침', rarity: 2, funny: true },
];

/** 사진만 주는 업적 (칭호로는 못 고름). 그 밖은 모두 칭호를 줌. 사진은 avatars.ts 에 그 업적 사진이 있을 때만 */
export const AVATAR_ONLY = new Set(['lv5', 'lv10', 'lv15', 'dividend', 'global', 'limit_order', 'league_queen']);
export const givesTitle = (id: string) => Object.prototype.hasOwnProperty.call(BADGE_MAP, id) && !AVATAR_ONLY.has(id);
export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/* ---------------- 업적 단계 (같은 업적을 여러 번 — design/titles-tiers-v3.md) ---------------- */
/** 단계 기준 (딴 횟수): 1번 · 5번 · 20번 · 100번 */
export const BADGE_TIER_AT = [1, 5, 20, 100] as const;
/** 한 번만 의미 있는 업적(처음 해 봄·레벨·튜토리얼)은 단계 없음 */
const NO_TIER = new Set(['first_trade', 'first_card', 'etf_fan', 'lv5', 'lv10', 'lv15', 'lv20', 'tut_first', 'tut_grad', 'league_queen', 'league_gold']);
export const badgeTiered = (id: string) => Object.prototype.hasOwnProperty.call(BADGE_MAP, id) && !NO_TIER.has(id);
/** 딴 횟수 → 단계 (0 = 아직 못 땀) */
export function badgeTier(id: string, count: number): 0 | 1 | 2 | 3 | 4 {
  if (!(count >= 1)) return 0;
  if (!badgeTiered(id)) return 1;
  return count >= BADGE_TIER_AT[3] ? 4 : count >= BADGE_TIER_AT[2] ? 3 : count >= BADGE_TIER_AT[1] ? 2 : 1;
}
/** 단계별 꾸밈말 — 웃픈 업적은 '단골 → 명예 → 영원한', 나머지는 '노련한 → 전설의 → 신화의' */
export function tierPrefix(id: string, tier: number) {
  if (tier <= 1) return '';
  const funny = BADGE_MAP[id]?.funny;
  if (tier === 2) return funny ? '단골 ' : '노련한 ';
  if (tier === 3) return funny ? '명예 ' : '전설의 ';
  return funny ? '영원한 ' : '신화의 ';
}
/**
 * 꾸밈말을 앞에 붙이면 어색한 이름(사람을 가리키지 않는 이름 등)은 단계마다 이름을 따로 (2·3·4단계).
 * 여기 없는 업적은 꾸밈말 + 원래 이름 ('노련한 투자왕')
 */
const TIER_NAMES: Record<string, [string, string, string]> = {
  ret30: ['대박 행진', '대박 제조기', '대박의 신'],
  streak7: ['연승 행진', '연승 기계', '불패의 개미'],
  flawless: ['무결점 장인', '완벽주의 개미', '무결점의 전설'],
  comeback: ['역전의 명수', '역전의 제왕', '역전의 신'],
  zen: ['존버 장인', '존버의 달인', '존버의 신'],
  escape: ['탈출 장인', '탈출의 달인', '탈출의 신'],
  sniper: ['명사수', '백발백중', '저격의 신'],
  big_win: ['한 방 장인', '한 방의 제왕', '한 방의 신'],
  shield: ['철벽 수비수', '난공불락', '철벽의 신'],
  podium: ['시상대 단골', '시상대 주인', '시상대의 전설'],
  plus: ['플러스 장인', '플러스 제조기', '플러스의 신'],
  all_in: ['몰빵 장인', '몰빵의 제왕', '몰빵의 신'],
  diversify: ['분산 투자의 달인', '분산의 제왕', '분산의 신'],
  leverage: ['레버리지 애호가', '레버리지 장인', '레버리지의 신'],
  dividend: ['배당 갑부', '배당 재벌', '배당의 신'],
  limit_order: ['예약의 고수', '예약의 제왕', '예약의 신'],
  card_master: ['카드 그랜드마스터', '카드의 제왕', '카드의 신'],
  bear_proof: ['하락장 사냥꾼', '하락장의 제왕', '하락장의 신'],
  specialist: ['업종 박사', '업종의 제왕', '업종의 신'],
  crash_winner: ['폭락장 사냥꾼', '폭락장의 제왕', '폭락장의 신'],
  diamond: ['강철 손', '티타늄 핸드', '불멸의 손'],
  bottom: ['노련한 저점 사냥꾼', '저점의 지배자', '바닥의 신'],
  multi_win: ['다인전의 황제', '다인전의 패왕', '다인전의 신'],
  beat_market: ['시장을 꺾은 자', '시장을 지배하는 자', '시장의 신'],
  limit_up: ['상한가 수집가', '상한가의 제왕', '상한가의 신'],
  news_jump: ['노련한 사건 해결사', '전설의 사건 해결사', '사건의 신'],
  // 웃픈 업적
  buy_high: ['꼭지 단골 개미', '명예 꼭지 개미', '영원한 꼭지 개미'],
  fooled: ['찌라시 단골 개미', '명예 찌라시 개미', '영원한 찌라시 개미'],
  last_place: ['바닥 단골', '바닥 전문가', '바닥의 주인'],
  limit_down: ['하한가 단골', '하한가 수집가', '하한가의 주인'],
  paper_hands: ['팔면 오르는 개미', '저주받은 손', '팔면 오르는 전설'],
  lev_burn: ['레버리지 단골 손님', '레버리지 명예 피해자', '영원한 레버리지 피해자'],
  choke: ['아깝다 장인', '아깝다의 달인', '영원한 2등'],
};
/** 단계에 맞는 칭호 이름 (1단계는 원래 이름) */
export function tierName(id: string, tier: number): string {
  const b = BADGE_MAP[id];
  if (!b) return id;
  if (tier <= 1 || !badgeTiered(id)) return b.name;
  return TIER_NAMES[id]?.[Math.min(4, tier) - 2] ?? tierPrefix(id, tier) + b.name;
}
/** 저장 값('winner' · 'winner:2' · 'sprout:3') → 업적(사진) id 와 단계 */
export function parseTiered(v: string | null | undefined): { id: string; tier: 1 | 2 | 3 | 4 } | null {
  if (!v || typeof v !== 'string') return null;
  const m = /^([a-z0-9_]{1,32})(?::([234]))?$/.exec(v);
  if (!m) return null;
  return { id: m[1], tier: (m[2] ? Number(m[2]) : 1) as 1 | 2 | 3 | 4 };
}
/** 저장된 칭호 → 보여 줄 이름 ('노련한 투자왕') · 없으면 null */
export function titleLabel(v: string | null | undefined): { id: string; tier: number; name: string; badge: Badge } | null {
  const t = parseTiered(v);
  const b = t ? BADGE_MAP[t.id] : undefined;
  if (!t || !b) return null;
  const tier = badgeTiered(t.id) ? t.tier : 1;
  return { id: t.id, tier, name: tierName(t.id, tier), badge: b };
}

/** 획득한 배지 중 가장 귀한 것이 칭호 */
export function titleOf(ids: string[]): Badge | null {
  return BADGES.find((b) => ids.includes(b.id) && !AVATAR_ONLY.has(b.id)) ?? null;
}

export interface AchievementInput {
  market: Market;
  seed: number;
  players: { id: string; trades: Trade[]; spends: Spend[]; filledOrders: number; /** 봇이면 난이도 */ bot?: number | null; /** 기권함 — 업적 없음, 순위는 맨 뒤 */ left?: boolean }[];
  items: ItemRow[];
  /** 실제로 한 마지막 날 (상대가 모두 기권해 바로 끝난 판) — 그 뒤 날은 업적 계산에서 뺌 */
  endDay?: number | null;
}

/** 시장을 0..endDay 날까지만 남김 (기권 뒤 아무도 하지 않은 날 빼기) */
export function cutMarket(m: Market, endDay: number): Market {
  const n = endDay + 1;
  const cut = <T>(a: T[]) => a.slice(0, n);
  const map = (r: Record<string, Bar[]>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cut(v)]));
  return {
    ...m,
    totalDays: n,
    bars: map(m.bars),
    usd: map(m.usd),
    index: cut(m.index),
    usIndex: cut(m.usIndex),
    macro: cut(m.macro),
    news: m.news.filter((x) => x.day <= endDay),
    events: m.events.filter((x) => x.day <= endDay),
    dividends: m.dividends.filter((x) => x.day <= endDay),
  };
}

export function computeAchievements(inp: AchievementInput): Record<string, string[]> {
  const full = inp.market;
  const m = inp.endDay != null && inp.endDay >= 0 && inp.endDay < full.totalDays - 1 ? cutMarket(full, inp.endDay) : full;
  const last = m.totalDays - 1;
  const solo = inp.players.length < 2;
  const items = deriveItems(inp.seed, inp.players.map((p) => p.id), inp.items, last, full.totalDays, solo, m.version ?? 1);
  const hist = Object.fromEntries(inp.players.map((p) => [p.id, equityHistory(p.trades, p.spends, m)]));
  const finalEq = (id: string) => hist[id][hist[id].length - 1];
  const indexRet = m.index[last].close / KR_INDEX_BASE - 1;
  const ids = inp.players.map((p) => p.id);
  // 기권한 사람은 재산과 상관없이 맨 뒤 (화면 순위·랭킹 점수와 같게), 1위는 끝까지 한 사람 중에서만
  const leftSet = new Set(inp.players.filter((p) => p.left).map((p) => p.id));
  const byFinal = [...ids].sort((x, y) => Number(leftSet.has(x)) - Number(leftSet.has(y)) || finalEq(y) - finalEq(x));
  const stay = byFinal.filter((x) => !leftSet.has(x));
  const winner = !solo && stay.length >= 1 && (stay.length === 1 || finalEq(stay[0]) !== finalEq(stay[1])) ? stay[0] : null;

  // 각 종목의 게임 중 최저가
  const minPrice: Record<string, number> = {};
  for (const [sym, bars] of Object.entries(m.bars)) minPrice[sym] = Math.min(...bars.map((b) => Math.min(b.low, b.open, b.close)));
  const maxOf = (sym: string) => Math.max(...m.bars[sym].map((b) => Math.max(b.high, b.open, b.close)));

  const out: Record<string, string[]> = {};
  for (const p of inp.players) {
    // 기권한 사람은 업적 없음 (현금만 들고 기권해 투자왕·존버의 미학 등을 받던 빈틈)
    // 봇도 업적이 없음 (업적을 모으는 사람이 아니라서)
    if (p.left || p.bot) {
      out[p.id] = [];
      continue;
    }
    const got = new Set<string>();
    const ret = finalEq(p.id) / startCashFor(m.version) - 1;
    if (winner === p.id) got.add('winner');
    // 한 번이라도 거래해야 (현금만 들고 시장이 내린 판에서 거저 받지 않게)
    if (ret > indexRet && p.trades.length > 0) got.add('beat_market');
    if (p.trades.length >= 20) got.add('trader');
    if (p.filledOrders >= 3) got.add('limit_order');
    if ((solo && ret > 0 && p.trades.length <= 5 && p.trades.length > 0) || (winner === p.id && p.trades.length <= 5)) got.add('zen');

    // ---- 거래·카드·종목 관련 ----
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

    // 판 동안 10% 넘게 움직인 종목만 (거의 안 움직인 종목은 산 값이 최저·최고 3% 안에 다 들어가 '저점'·'꼭지'를 한 번에 받던 문제)
    const moved = (sym: string) => maxOf(sym) >= minPrice[sym] * 1.1;
    if (p.trades.some((t) => t.side === 'buy' && moved(t.symbol) && t.price <= minPrice[t.symbol] * 1.03)) got.add('bottom');

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
        if (!STOCK_MAP[s].etf && m.bars[s][d].close / prev - 1 <= -0.29) got.add('limit_down');
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
    // ---- 웃픈 업적 (design/achievements-v2.md) ----
    if (traded && ret <= -0.2) got.add('big_loss');
    if (p.trades.length > 30 && ret < 0) got.add('fee_donor');
    if (ids.length >= 3 && rank === ids.length - 1 && finalEq(p.id) < finalEq(byFinal[ids.length - 2])) got.add('last_place');
    if (p.trades.some((t) => t.side === 'buy' && moved(t.symbol) && t.price >= maxOf(t.symbol) * 0.97)) got.add('buy_high');
    if (items.effects.filter((e) => e.to === p.id && e.from !== p.id && !e.blocked && !e.crowded).length > 3) got.add('punching_bag');
    // 판 뒤 그 종목이 판 값보다 15% 넘게 오름 (판 날 다음 날부터 마지막 날까지 종가 중 가장 높은 것)
    if (p.trades.some((t) => t.side === 'sell' && m.bars[t.symbol].slice(t.day + 1).some((b) => b.close >= t.price * 1.15))) got.add('paper_hands');
    // 거짓 호재 찌라시(헤드라인은 호재, 실제는 악재)가 난 날 그 종목을 사서 손해 (판 값 또는 마지막 날 종가)
    for (const t of p.trades) {
      if (t.side !== 'buy' || !m.news.some((n) => n.rumor && n.symbol === t.symbol && n.day === t.day && n.tone === 'good' && n.realTone === 'bad')) continue;
      const sold = p.trades.find((x) => x.side === 'sell' && x.symbol === t.symbol && x.day >= t.day && (x.created_at ?? '') >= (t.created_at ?? ''));
      if ((sold ? sold.price : m.bars[t.symbol][last].close) < t.price) got.add('fooled');
    }
    if (pfEnd.closed.some((c) => (STOCK_MAP[c.symbol]?.etf?.lev ?? 1) !== 1 && c.pnlPct <= -0.1)) got.add('lev_burn');
    if (!solo && winner !== p.id) {
      const mid = Math.floor(m.totalDays / 2);
      if (ids.every((x) => x === p.id || hist[x][mid] < hist[p.id][mid])) got.add('choke');
    }
    out[p.id] = BADGES.filter((b) => got.has(b.id)).map((b) => b.id);
  }
  return out;
}
