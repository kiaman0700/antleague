/**
 * 미션 (설계서 design/missions-v2.md): 일일 미션 6개(쉬움 3 + 보통 3) · 주간 미션 3개(보통 1 + 어려움 2).
 * 일일·주간은 서로 다른 목록에서만 나오고, 미션마다 깰 수 있는 게임 종류(modes)가 정해져 있음.
 * 판정은 서버가 끝난 판의 데이터로만 (화면이 보내는 '했어요'는 없음). 보상은 경험치 → 레벨 → 레벨 업적(사진·칭호).
 * 서버·화면 공용 (상대 import 에 .js)
 */
export type MissionTier = 'easy' | 'normal' | 'hard';
/** 미션을 깰 수 있는 게임 종류: match = 랭킹전·일반전(매칭), bot = 봇전, daily = 오늘의 도전, custom = 커스텀 방·친구 1대1 */
export type MissionMode = 'match' | 'bot' | 'daily' | 'custom';
export const MODE_LABEL: Record<MissionMode, string> = { match: '일반·랭킹전', bot: '봇전', daily: '오늘의 도전', custom: '커스텀' };
const ALL: MissionMode[] = ['match', 'bot', 'daily', 'custom'];
const VERSUS: MissionMode[] = ['match', 'bot', 'custom'];
export interface MissionDef {
  id: string;
  title: string;
  tier: MissionTier;
  xp: number;
  /** 몇 번 해야 완료 (대부분 1) */
  goal: number;
  /** 일일 / 주간 목록 (서로 겹치지 않음) */
  scope: 'day' | 'week';
  /** 깰 수 있는 게임 종류 */
  modes: MissionMode[];
  /** 더는 새로 뽑지 않음 (카드가 없어져 깰 수 없음) — 이미 받은 사람의 판정은 그대로 */
  retired?: true;
}

export const MISSIONS: MissionDef[] = [
  // ---- 일일 · 쉬움 (25) ----
  { id: 'finish1', title: '대결 1판 끝까지 하기', tier: 'easy', xp: 30, goal: 1, scope: 'day', modes: VERSUS },
  { id: 'detector', title: '소식 진위 판정 1번 하기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'order', title: '예약 주문 1번 체결시키기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'breaking', title: '장중 속보가 뜬 종목 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'daily', title: '오늘의 도전 하기', tier: 'easy', xp: 30, goal: 1, scope: 'day', modes: ['daily'] },
  { id: 'trade5', title: '한 판에서 5번 넘게 거래하기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'bot1', title: '봇전 1판 끝까지 하기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ['bot'] },
  { id: 'match1', title: '일반전·랭킹전 1판 끝까지 하기', tier: 'easy', xp: 30, goal: 1, scope: 'day', modes: ['match'] },
  { id: 'custom1', title: '커스텀 방에서 1판 끝까지 하기', tier: 'easy', xp: 30, goal: 1, scope: 'day', modes: ['custom'] },
  { id: 'rumorbuy', title: '커뮤니티 소문에 나온 업종 종목 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'krus', title: '한 판에서 국내·미국 종목 둘 다 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'etf1', title: 'ETF 사 보기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'sell3', title: '한 판에서 3번 넘게 팔기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'sym3', title: '한 판에서 서로 다른 종목 3개 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'sector3', title: '한 판에서 업종 3곳의 종목 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'us1', title: '미국 종목 사 보기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'card1', title: '증강 고르기·쓰기 1번', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'bonus1', title: '용돈 봉투 쓰기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL, retired: true },
  { id: 'analyst1', title: '오늘 강한 업종 보기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'scout1', title: '오를지 내릴지 보기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'bio1', title: '바이오 종목 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'semi1', title: '반도체 종목 사기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'profit1', title: '수익을 내고 팔기 1번', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'allcash', title: '거래하고 마지막 날 전부 현금으로 마감', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  { id: 'hold2', title: '한 종목을 2일 넘게 들고 있기', tier: 'easy', xp: 20, goal: 1, scope: 'day', modes: ALL },
  // ---- 일일 · 보통 (25) ----
  { id: 'ret3', title: '수익률 +3% 넘게 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ALL },
  { id: 'beatbot', title: '보통 이상 봇 이기기', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['bot'] },
  { id: 'top3', title: '4명 이상 판에서 3위 안', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['match', 'custom'] },
  { id: 'card2', title: '한 판에서 증강 2번 고르거나 쓰기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: VERSUS },
  { id: 'win1', title: '일반전·랭킹전 1판 이기기', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['match'] },
  { id: 'beatidx', title: '종합지수보다 높은 수익률로 마감', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'dailyplus', title: '오늘의 도전 플러스로 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['daily'] },
  { id: 'customwin', title: '커스텀 방에서 1위', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['custom'] },
  { id: 'ret5', title: '수익률 +5% 넘게 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ALL },
  { id: 'profit3', title: '한 판에서 수익을 내고 3번 팔기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'trade15', title: '한 판에서 15번 넘게 거래하기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'levplus', title: '레버리지 ETF를 사고 플러스로 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ALL },
  { id: 'invplus', title: '인버스 ETF를 사고 플러스로 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ALL },
  { id: 'sector5', title: '한 판에서 업종 5곳의 종목 사기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'attack1', title: '방해 카드 1장 쓰기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: VERSUS, retired: true },
  { id: 'paper1', title: '내일 아침 헤드라인 보기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'duelwin', title: '1대1에서 이기기', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: VERSUS },
  { id: 'steady', title: '거래 10번 넘게 하고 손해 없이 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ALL },
  { id: 'hold5', title: '한 종목을 5일 넘게 들고 있기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'dividend', title: '배당금 받기', tier: 'normal', xp: 40, goal: 1, scope: 'day', modes: ALL },
  { id: 'top2', title: '3명 이상 판에서 2위 안', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['match', 'bot', 'custom'] },
  { id: 'bots2', title: '봇 2명 이상인 봇전에서 1위', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['bot'] },
  { id: 'daily3', title: '오늘의 도전 +3% 넘게 마감', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['daily'] },
  { id: 'ranked1', title: '랭킹전 1판 끝까지 하기', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: ['match'] },
  { id: 'fastwin', title: '10일짜리 판에서 1위', tier: 'normal', xp: 50, goal: 1, scope: 'day', modes: VERSUS },
  // ---- 주간 · 보통 (12) ----
  { id: 'w_finish5', title: '대결 5판 끝까지 하기', tier: 'normal', xp: 120, goal: 5, scope: 'week', modes: VERSUS },
  { id: 'w_bot3', title: '봇전 3판 이기기', tier: 'normal', xp: 120, goal: 3, scope: 'week', modes: ['bot'] },
  { id: 'w_daily3', title: '오늘의 도전 3번 하기', tier: 'normal', xp: 120, goal: 3, scope: 'week', modes: ['daily'] },
  { id: 'w_trade30', title: '거래 30번 하기', tier: 'normal', xp: 120, goal: 30, scope: 'week', modes: ALL },
  { id: 'w_profit10', title: '수익을 내고 팔기 10번', tier: 'normal', xp: 120, goal: 10, scope: 'week', modes: ALL },
  { id: 'w_cards5', title: '증강 고르기·쓰기 5번', tier: 'normal', xp: 120, goal: 5, scope: 'week', modes: ALL },
  { id: 'w_match5', title: '일반전·랭킹전 5판 끝까지 하기', tier: 'normal', xp: 120, goal: 5, scope: 'week', modes: ['match'] },
  { id: 'w_custom3', title: '커스텀 방에서 3판 끝까지 하기', tier: 'normal', xp: 120, goal: 3, scope: 'week', modes: ['custom'] },
  { id: 'w_bio5', title: '바이오 종목 5번 사기', tier: 'normal', xp: 120, goal: 5, scope: 'week', modes: ALL },
  { id: 'w_us5', title: '미국 종목 5번 사기', tier: 'normal', xp: 120, goal: 5, scope: 'week', modes: ALL },
  { id: 'w_detector3', title: '소식 진위 판정 3번 하기', tier: 'normal', xp: 120, goal: 3, scope: 'week', modes: ALL },
  { id: 'w_plus3', title: '플러스로 3판 마감', tier: 'normal', xp: 120, goal: 3, scope: 'week', modes: ALL },
  // ---- 주간 · 어려움 (18) ----
  { id: 'win3', title: '일반전·랭킹전 3판 이기기', tier: 'hard', xp: 200, goal: 3, scope: 'week', modes: ['match'] },
  { id: 'beathard', title: '고수봇이 있는 판에서 1위', tier: 'hard', xp: 150, goal: 1, scope: 'week', modes: ['bot', 'custom'] },
  { id: 'ret10', title: '수익률 +10% 넘게 마감', tier: 'hard', xp: 150, goal: 1, scope: 'week', modes: ALL },
  { id: 'w_ranked2', title: '랭킹전 2판 이기기', tier: 'hard', xp: 200, goal: 2, scope: 'week', modes: ['match'] },
  { id: 'w_multi1', title: '3명 이상 판에서 1위', tier: 'hard', xp: 150, goal: 1, scope: 'week', modes: ['match', 'custom'] },
  { id: 'w_win5', title: '대결 5판 이기기', tier: 'hard', xp: 200, goal: 5, scope: 'week', modes: VERSUS },
  { id: 'w_ret20', title: '수익률 +20% 넘게 마감', tier: 'hard', xp: 200, goal: 1, scope: 'week', modes: ALL },
  { id: 'w_hard3', title: '고수봇을 3번 이기기', tier: 'hard', xp: 200, goal: 3, scope: 'week', modes: ['bot', 'custom'] },
  { id: 'w_daily5', title: '오늘의 도전 5번 하기', tier: 'hard', xp: 150, goal: 5, scope: 'week', modes: ['daily'] },
  { id: 'w_multi3', title: '3명 이상 판에서 3번 1위', tier: 'hard', xp: 200, goal: 3, scope: 'week', modes: ['match', 'bot', 'custom'] },
  { id: 'w_ranked5', title: '랭킹전 5판 끝까지 하기', tier: 'hard', xp: 150, goal: 5, scope: 'week', modes: ['match'] },
  { id: 'w_beatidx5', title: '종합지수보다 높게 5판 마감', tier: 'hard', xp: 150, goal: 5, scope: 'week', modes: ALL },
  { id: 'w_profit30', title: '수익을 내고 팔기 30번', tier: 'hard', xp: 150, goal: 30, scope: 'week', modes: ALL },
  { id: 'w_trade100', title: '거래 100번 하기', tier: 'hard', xp: 150, goal: 100, scope: 'week', modes: ALL },
  { id: 'w_duel5', title: '1대1에서 5번 이기기', tier: 'hard', xp: 200, goal: 5, scope: 'week', modes: VERSUS },
  { id: 'w_customwin3', title: '커스텀 방에서 3번 1위', tier: 'hard', xp: 200, goal: 3, scope: 'week', modes: ['custom'] },
  { id: 'w_cards12', title: '증강 고르기·쓰기 12번', tier: 'hard', xp: 150, goal: 12, scope: 'week', modes: ALL },
  { id: 'w_hold7', title: '한 종목을 7일 넘게 들고 있기', tier: 'hard', xp: 150, goal: 1, scope: 'week', modes: ALL },
];
export const MISSION_MAP: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
/** 하루에 일일 미션으로 받을 수 있는 경험치 상한 (짜고 치기 막기) — 주간 미션은 따로 */
export const DAILY_XP_CAP = 450;
/** 미완료 미션 바꾸기 횟수: 일일은 하루 3번, 주간은 한 주 1번 — 각각 갱신 때 다시 채워짐 */
export const REROLLS: Record<'day' | 'week', number> = { day: 3, week: 1 };
export const DAY_COUNT = 6;
export const WEEK_COUNT = 3;
/** 칸 순서: 일일 [쉬움 3, 보통 3], 주간 [보통 1, 어려움 2] */
const SLOT_TIERS: Record<'day' | 'week', MissionTier[]> = { day: ['easy', 'easy', 'easy', 'normal', 'normal', 'normal'], week: ['normal', 'hard', 'hard'] };
export const slotTier = (kind: 'day' | 'week', slot: number) => SLOT_TIERS[kind][slot];

/** 최대 레벨 — 매일 미션 + 5판쯤이면 1년쯤 */
export const MAX_LEVEL = 100;
/** 레벨 l 에서 다음 레벨까지 필요한 경험치: 100 에서 시작해 레벨마다 4.5%씩 늘어남 (10 단위) */
export const levelNeed = (l: number) => Math.round((100 * Math.pow(1.045, l - 1)) / 10) * 10;
/** 레벨 (최대 레벨이면 need 0) */
export function levelOf(xp: number) {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL) {
    const need = levelNeed(level);
    if (left < need) return { level, into: left, need };
    left -= need;
    level++;
  }
  return { level: MAX_LEVEL, into: 0, need: 0 };
}
/** 레벨 업적 (사진·대표 칭호를 엶) — achievements.ts 의 BADGES 에도 있음 */
export const LEVEL_BADGES: { level: number; id: string }[] = [
  { level: 5, id: 'lv5' },
  { level: 10, id: 'lv10' },
  { level: 15, id: 'lv15' },
  { level: 20, id: 'lv20' },
];
export const levelBadges = (xp: number) => {
  const { level } = levelOf(xp);
  return LEVEL_BADGES.filter((b) => level >= b.level).map((b) => b.id);
};

/**
 * 그 사람의 일일·주간 미션 고르기: hex = 서버 비밀 키로 만든 HMAC(계정+기간) — 미리 알 수 없고 사람마다 다름.
 * 칸마다 정해진 등급(SLOT_TIERS)에서, 그 목록(일일/주간) 안에서만, 겹치지 않게
 */
export function pickMissions(hex: string, kind: 'day' | 'week'): string[] {
  const nums = (hex.match(/.{1,6}/g) ?? ['0']).map((h) => parseInt(h, 16));
  const out: string[] = [];
  SLOT_TIERS[kind].forEach((tier, slot) => {
    const pool = MISSIONS.filter((m) => !m.retired && m.scope === kind && m.tier === tier && !out.includes(m.id)).map((m) => m.id);
    out.push(pool[(nums[(slot * 2) % nums.length] ?? slot) % pool.length]);
  });
  return out;
}
/** 미션 바꾸기: 같은 칸 등급·같은 목록에서 지금 목록에 없는 것 하나 (hex = 바꾼 횟수까지 넣은 HMAC) */
export function rerollPick(hex: string, kind: 'day' | 'week', slot: number, current: string[]): string | null {
  const tier = SLOT_TIERS[kind][slot];
  const pool = MISSIONS.filter((m) => !m.retired && m.scope === kind && m.tier === tier && !current.includes(m.id)).map((m) => m.id);
  if (!pool.length) return null;
  return pool[parseInt(hex.slice(0, 8), 16) % pool.length];
}

/** 끝난 판 하나에서 그 사람이 한 일 (서버가 만들어 넘김) */
export interface MissionGame {
  /** rooms.kind: match · bot · daily · custom · friend */
  kind: string;
  /** 끝까지 함 (기권 아님) */
  finished: boolean;
  ret: number;
  rank: number;
  players: number;
  won: boolean;
  /** 같이 한 봇의 난이도들 */
  botLevels: number[];
  trades: number;
  boughtBreaking: boolean;
  detectorUses: number;
  cardUses: number;
  filledOrders: number;
  /** 랭킹전 */
  ranked?: boolean;
  boughtKr?: boolean;
  boughtUs?: boolean;
  boughtEtf?: boolean;
  /** 그날 장 전 찌라시에 나온 업종의 종목을 그날 삼 */
  boughtRumorSector?: boolean;
  /** 종합지수 수익률 */
  indexRet?: number;
  /** (50·30가지) 판 기록 */
  sells?: number;
  profitSells?: number;
  symbolsBought?: number;
  sectorsBought?: string[];
  usBuys?: number;
  bioBuys?: number;
  boughtLev?: boolean;
  boughtInverse?: boolean;
  usedKinds?: string[];
  endedCash?: boolean;
  maxHoldDays?: number;
  dividends?: number;
  days?: number;
}
/** 판 종류 → 미션 모드 (친구 1대1은 커스텀) */
export const modeOf = (kind: string): MissionMode => (kind === 'match' || kind === 'bot' || kind === 'daily' ? kind : 'custom');

/** 이 판으로 각 미션이 몇 칸 나아가는지 (0 이면 해당 없음) */
export function missionGain(id: string, g: MissionGame): number {
  if (!g.finished) return 0;
  const def = MISSION_MAP[id];
  if (!def || !def.modes.includes(modeOf(g.kind))) return 0;
  switch (id) {
    case 'finish1':
    case 'bot1':
    case 'match1':
    case 'custom1':
    case 'daily':
    case 'w_finish5':
    case 'w_daily3':
    case 'w_custom3':
      return 1;
    case 'detector':
      return g.detectorUses > 0 ? 1 : 0;
    case 'order':
      return g.filledOrders > 0 ? 1 : 0;
    case 'breaking':
      return g.boughtBreaking ? 1 : 0;
    case 'trade5':
      return g.trades > 5 ? 1 : 0;
    case 'rumorbuy':
      return g.boughtRumorSector ? 1 : 0;
    case 'krus':
      return g.boughtKr && g.boughtUs ? 1 : 0;
    case 'etf1':
      return g.boughtEtf ? 1 : 0;
    case 'ret3':
      return g.trades > 0 && g.ret >= 0.03 ? 1 : 0;
    case 'beatbot':
      return g.won && g.botLevels.some((l) => l >= 2) ? 1 : 0;
    case 'top3':
      return g.players >= 4 && g.rank <= 3 ? 1 : 0;
    case 'card2':
      return g.cardUses >= 2 ? 1 : 0;
    case 'win1':
    case 'win3':
      return g.won && g.players >= 2 ? 1 : 0;
    case 'beatidx':
      return g.trades > 0 && g.indexRet !== undefined && g.ret > g.indexRet ? 1 : 0;
    case 'dailyplus':
      return g.trades > 0 && g.ret > 0 ? 1 : 0;
    case 'customwin':
      return g.won && g.players >= 2 ? 1 : 0;
    case 'w_bot3':
      return g.won ? 1 : 0;
    case 'w_trade30':
      return g.trades;
    case 'beathard':
      return g.won && g.botLevels.includes(3) ? 1 : 0;
    case 'ret10':
      return g.trades > 0 && g.ret >= 0.1 ? 1 : 0;
    case 'w_ranked2':
      return g.ranked && g.won ? 1 : 0;
    case 'w_multi1':
      return g.players >= 3 && g.won ? 1 : 0;
    // ---- 50·30가지로 늘린 것 ----
    case 'sell3':
      return (g.sells ?? 0) > 3 ? 1 : 0;
    case 'sym3':
      return (g.symbolsBought ?? 0) >= 3 ? 1 : 0;
    case 'sector3':
      return (g.sectorsBought?.length ?? 0) >= 3 ? 1 : 0;
    case 'sector5':
      return (g.sectorsBought?.length ?? 0) >= 5 ? 1 : 0;
    case 'us1':
      return g.boughtUs ? 1 : 0;
    case 'card1':
      return g.cardUses >= 1 ? 1 : 0;
    case 'bonus1':
      return g.usedKinds?.includes('bonus') ? 1 : 0;
    case 'analyst1':
      return g.usedKinds?.includes('analyst') ? 1 : 0;
    case 'scout1':
      return g.usedKinds?.includes('scout') ? 1 : 0;
    case 'paper1':
      return g.usedKinds?.includes('paper') ? 1 : 0;
    case 'attack1':
      return g.usedKinds?.some((k) => ['freeze', 'blackout', 'fake', 'fee'].includes(k)) ? 1 : 0;
    case 'bio1':
      return g.sectorsBought?.includes('bio') ? 1 : 0;
    case 'semi1':
      return g.sectorsBought?.includes('semi') ? 1 : 0;
    case 'profit1':
      return (g.profitSells ?? 0) >= 1 ? 1 : 0;
    case 'profit3':
      return (g.profitSells ?? 0) >= 3 ? 1 : 0;
    case 'allcash':
      return g.trades > 0 && g.endedCash ? 1 : 0;
    case 'hold2':
      return (g.maxHoldDays ?? 0) > 2 ? 1 : 0;
    case 'hold5':
      return (g.maxHoldDays ?? 0) > 5 ? 1 : 0;
    case 'w_hold7':
      return (g.maxHoldDays ?? 0) > 7 ? 1 : 0;
    case 'ret5':
      return g.trades > 0 && g.ret >= 0.05 ? 1 : 0;
    case 'trade15':
      return g.trades > 15 ? 1 : 0;
    case 'levplus':
      return g.boughtLev && g.ret > 0 ? 1 : 0;
    case 'invplus':
      return g.boughtInverse && g.ret > 0 ? 1 : 0;
    case 'duelwin':
      return g.players === 2 && g.won ? 1 : 0;
    case 'steady':
      return g.trades > 10 && g.ret >= 0 ? 1 : 0;
    case 'dividend':
      return (g.dividends ?? 0) > 0 ? 1 : 0;
    case 'top2':
      return g.players >= 3 && g.rank <= 2 ? 1 : 0;
    case 'bots2':
      return g.botLevels.length >= 2 && g.won ? 1 : 0;
    case 'daily3':
      return g.trades > 0 && g.ret >= 0.03 ? 1 : 0;
    case 'ranked1':
      return g.ranked ? 1 : 0;
    case 'fastwin':
      return g.days === 10 && g.won && g.players >= 2 ? 1 : 0;
    case 'w_profit10':
    case 'w_profit30':
      return g.profitSells ?? 0;
    case 'w_cards5':
    case 'w_cards12':
      return g.cardUses;
    case 'w_match5':
      return 1;
    case 'w_bio5':
      return g.bioBuys ?? 0;
    case 'w_us5':
      return g.usBuys ?? 0;
    case 'w_detector3':
      return g.detectorUses;
    case 'w_plus3':
      return g.trades > 0 && g.ret > 0 ? 1 : 0;
    case 'w_win5':
      return g.won && g.players >= 2 ? 1 : 0;
    case 'w_ret20':
      return g.trades > 0 && g.ret >= 0.2 ? 1 : 0;
    case 'w_hard3':
      return g.won && g.botLevels.includes(3) ? 1 : 0;
    case 'w_daily5':
      return 1;
    case 'w_multi3':
      return g.players >= 3 && g.won ? 1 : 0;
    case 'w_ranked5':
      return g.ranked ? 1 : 0;
    case 'w_beatidx5':
      return g.trades > 0 && g.indexRet !== undefined && g.ret > g.indexRet ? 1 : 0;
    case 'w_trade100':
      return g.trades;
    case 'w_duel5':
      return g.players === 2 && g.won ? 1 : 0;
    case 'w_customwin3':
      return g.won && g.players >= 2 ? 1 : 0;
    default:
      return 0;
  }
}

/* ---- 판 경험치 (설계서 design/game-xp.md) — 미션과 따로, 판마다 한 번, 판정·지급은 서버만 ---- */
export const GAME_XP_CAP = 600;
export const FIRST_WIN_XP = 50;
export const BADGE_XP = 20;
/** 이 판으로 받는 경험치 항목 (커스텀·친구 1대1·기권·거래 없음은 없음) */
export function gameXp(g: MissionGame): { label: string; xp: number }[] {
  if (!g.finished || g.trades <= 0) return [];
  if (g.kind === 'match') {
    const out = [{ label: '끝내기', xp: 40 }];
    if (g.won) out.push({ label: '1위', xp: 30 });
    else if (g.players >= 3 && g.rank === 2) out.push({ label: '2위', xp: 10 });
    return out;
  }
  if (g.kind === 'bot') {
    const out = [{ label: '봇전', xp: 10 }];
    if (g.won) out.push({ label: g.botLevels.includes(3) ? '어려움 봇 이김' : '1위', xp: g.botLevels.includes(3) ? 10 : 5 });
    return out;
  }
  if (g.kind === 'daily') return [{ label: '오늘의 도전', xp: 20 }];
  return [];
}
/** 오늘 첫 승 보너스를 받을 수 있는 판 (랭킹전·일반전 1위) */
export const firstWinEligible = (g: MissionGame) => g.kind === 'match' && g.finished && g.trades > 0 && g.won;
/** 하루 상한 안에서 줄 수 있는 만큼 */
export const capXp = (want: number, budget: number) => Math.max(0, Math.min(want, budget));

/** 한국 날짜와 그 주 월요일 (기간 이름) */
export function missionPeriods(now = Date.now()) {
  const kst = new Date(now + 9 * 3600_000);
  const day = kst.toISOString().slice(0, 10);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  const monday = new Date(kst.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  const nextMidnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 3600_000;
  const nextMonday = nextMidnight + ((7 - dow - 1 + 7) % 7) * 86_400_000;
  return { day: 'd2:' + day, week: 'w2:' + monday, dayEndsAt: nextMidnight, weekEndsAt: nextMonday };
}
