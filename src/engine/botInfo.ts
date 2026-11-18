/** 봇 이름·난이도 설명 (가벼운 모듈 — 로비가 봇 엔진 전체를 불러오지 않게) */
export type BotLevel = 1 | 2 | 3;
export const BOT_LEVELS: { level: BotLevel; name: string; label: string; desc: string }[] = [
  { level: 1, name: '새내기봇', label: '쉬움', desc: '뉴스를 거꾸로 읽고 자주 갈아타요. 처음 하는 사람도 이길 수 있어요' },
  { level: 2, name: '개미봇', label: '보통', desc: '아침 뉴스와 소문을 그대로 믿고 따라가요. 몇 판 해 보면 이길 수 있어요' },
  { level: 3, name: '고수봇', label: '어려움', desc: '하루 종일 시장을 지켜보고 며칠 걸친 사건의 소문까지 읽어요. 고수용이에요' },
];
export const botInfo = (level: number | null | undefined) => BOT_LEVELS.find((b) => b.level === level) ?? null;
export const isBot = (p: { bot_level?: number | null }) => !!p.bot_level;
export const MAX_BOTS = 5;
