/**
 * 미션 (설계서 design/missions.md): 오늘의 미션 3개(쉬움 2 + 보통 1) · 이번 주 미션 1개(어려움).
 * 판정은 서버가 끝난 판의 데이터로만 (화면이 보내는 '했어요'는 없음). 보상은 경험치 → 레벨 → 레벨 업적(사진·칭호).
 * 서버·화면 공용 (상대 import 에 .js)
 */
export type MissionTier = 'easy' | 'normal' | 'hard';
export interface MissionDef {
  id: string;
  title: string;
  tier: MissionTier;
  xp: number;
  /** 몇 번 해야 완료 (대부분 1) */
  goal: number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'finish1', title: '대결 1판 끝까지 하기', tier: 'easy', xp: 30, goal: 1 },
  { id: 'detector', title: '루머 감별기 1번 쓰기', tier: 'easy', xp: 20, goal: 1 },
  { id: 'order', title: '예약 주문 1번 체결시키기', tier: 'easy', xp: 20, goal: 1 },
  { id: 'breaking', title: '장중 속보가 뜬 종목 사기', tier: 'easy', xp: 20, goal: 1 },
  { id: 'daily', title: '오늘의 도전 하기', tier: 'easy', xp: 30, goal: 1 },
  { id: 'trade5', title: '한 판에서 5번 넘게 거래하기', tier: 'easy', xp: 20, goal: 1 },
  { id: 'ret3', title: '수익률 +3% 넘게 마감', tier: 'normal', xp: 50, goal: 1 },
  { id: 'beatbot', title: '봇전에서 보통 이상 봇 이기기', tier: 'normal', xp: 50, goal: 1 },
  { id: 'top3', title: '4명 이상 판에서 3위 안', tier: 'normal', xp: 50, goal: 1 },
  { id: 'card2', title: '한 판에서 찬스 카드 2장 쓰기', tier: 'normal', xp: 40, goal: 1 },
  { id: 'win3', title: '대결 3판 이기기', tier: 'hard', xp: 150, goal: 3 },
  { id: 'beathard', title: '고수봇이 있는 판에서 1위', tier: 'hard', xp: 150, goal: 1 },
  { id: 'ret10', title: '수익률 +10% 넘게 마감', tier: 'hard', xp: 150, goal: 1 },
];
export const MISSION_MAP: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
/** 하루에 미션으로 받을 수 있는 경험치 상한 (짜고 치기 막기) */
export const DAILY_XP_CAP = 300;

/** 레벨: 레벨마다 필요한 경험치 100 + 20×(레벨−1) */
export function levelOf(xp: number) {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  for (;;) {
    const need = 100 + 20 * (level - 1);
    if (left < need) return { level, into: left, need };
    left -= need;
    level++;
    if (level > 999) return { level, into: 0, need };
  }
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
 * 그 사람의 오늘·이번 주 미션 고르기: hex = 서버 비밀 키로 만든 HMAC(계정+기간) — 미리 알 수 없고 사람마다 다름
 * 오늘: 쉬움 2 + 보통 1 / 이번 주: 어려움 1
 */
export function pickMissions(hex: string, kind: 'day' | 'week'): string[] {
  const nums = (hex.match(/.{1,6}/g) ?? ['0']).map((h) => parseInt(h, 16));
  const take = (tier: MissionTier, n: number, from: number) => {
    const pool = MISSIONS.filter((m) => m.tier === tier).map((m) => m.id);
    const out: string[] = [];
    for (let i = 0; out.length < n && i < 20; i++) {
      const id = pool[(nums[(from + i) % nums.length] ?? i) % pool.length];
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };
  return kind === 'day' ? [...take('easy', 2, 0), ...take('normal', 1, 3)] : take('hard', 1, 5);
}

/** 끝난 판 하나에서 그 사람이 한 일 (서버가 만들어 넘김) */
export interface MissionGame {
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
}

/** 이 판으로 각 미션이 몇 칸 나아가는지 (0 이면 해당 없음) */
export function missionGain(id: string, g: MissionGame): number {
  if (!g.finished) return 0;
  switch (id) {
    case 'finish1':
      return g.kind !== 'daily' ? 1 : 0;
    case 'detector':
      return g.detectorUses > 0 ? 1 : 0;
    case 'order':
      return g.filledOrders > 0 ? 1 : 0;
    case 'breaking':
      return g.boughtBreaking ? 1 : 0;
    case 'daily':
      return g.kind === 'daily' ? 1 : 0;
    case 'trade5':
      return g.trades > 5 ? 1 : 0;
    case 'ret3':
      return g.trades > 0 && g.ret >= 0.03 ? 1 : 0;
    case 'beatbot':
      return g.won && g.botLevels.some((l) => l >= 2) ? 1 : 0;
    case 'top3':
      return g.players >= 4 && g.rank <= 3 ? 1 : 0;
    case 'card2':
      return g.cardUses >= 2 ? 1 : 0;
    case 'win3':
      return g.won && g.players >= 2 ? 1 : 0;
    case 'beathard':
      return g.won && g.botLevels.includes(3) ? 1 : 0;
    case 'ret10':
      return g.trades > 0 && g.ret >= 0.1 ? 1 : 0;
    default:
      return 0;
  }
}

/** 한국 날짜와 그 주 월요일 (기간 이름) */
export function missionPeriods(now = Date.now()) {
  const kst = new Date(now + 9 * 3600_000);
  const day = kst.toISOString().slice(0, 10);
  const dow = (kst.getUTCDay() + 6) % 7; // 월=0
  const monday = new Date(kst.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  const nextMidnight = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 3600_000;
  const nextMonday = nextMidnight + ((7 - dow - 1 + 7) % 7) * 86_400_000;
  return { day: 'd:' + day, week: 'w:' + monday, dayEndsAt: nextMidnight, weekEndsAt: nextMonday };
}
