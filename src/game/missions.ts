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

/** 최대 레벨 (2026-11-17 사용자: 오래 걸렸으면) — 매일 미션 + 5판쯤이면 1년쯤 */
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
  return { day: 'd:' + day, week: 'w:' + monday, dayEndsAt: nextMidnight, weekEndsAt: nextMonday };
}
