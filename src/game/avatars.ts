/**
 * 프로필 사진 = 캐릭터 (이 게임만의 그림, 2026-11-17 — 그림은 components/AvatarArt.tsx)
 * - 기본 3가지(누구나, 모두 개미 — 개미리그): 새내기 개미('default', 처음 사진, 보라) · 열혈 개미(빨강, 눈썹) · 분석 개미(파랑, 동그란 안경)
 * - 업적 사진: 개미가 그 업적을 '입은' 모습 — 모자 + 표정 + 업적 스티커. 그 업적을 깨면 열림 (서버가 다시 확인)
 * - 예전 아이콘 사진(chart·piggy 등)은 없앰 → 저장돼 있으면 기본 개미로 보임
 */
export interface AvatarLook {
  char: 'ant';
  hat?: 'crown' | 'silverCrown' | 'bigCrown' | 'headband' | 'sprout' | 'flower' | 'halo' | 'tophat' | 'helmet' | 'newsCap' | 'bandage' | 'gradCap';
  face?: 'happy' | 'cool' | 'zen' | 'star' | 'wink' | 'brave' | 'glasses' | 'sad' | 'dizzy' | 'sweat' | 'shock' | 'visor';
  /** 로봇 개미(봇): 금속 머리·빛나는 더듬이 */
  metal?: boolean;
  outfit?: 'suit' | 'cape' | 'medal' | 'robe';
  prop?: 'trophy' | 'moneybag' | 'globe' | 'hourglass' | 'cards' | 'diamond' | 'target' | 'shield' | 'robot' | 'newspaper' | 'umbrella' | 'rocket' | 'phone' | 'wallet' | 'fakeNews';
  back?: 'rays' | 'chartUp' | 'chartV' | 'chartDown' | 'coins' | 'sparkles' | 'flames' | 'phoenix' | 'rain' | 'confetti' | 'zen' | 'cross' | 'globe' | 'clock' | 'news' | 'circuit' | 'peak' | 'dizzy';
}
export interface AvatarDef {
  id: string;
  name: string;
  look: AvatarLook;
  bg: string;
  /** 열리는 조건: 업적 id */
  need: string | null;
}

const ant = (l: Omit<AvatarLook, 'char'> = {}): AvatarLook => ({ char: 'ant', face: 'happy', ...l });

export const AVATARS: AvatarDef[] = [
  { id: 'default', name: '새내기 개미', look: ant(), bg: '#6b58ee', need: null },
  { id: 'antred', name: '열혈 개미', look: ant({ face: 'brave', back: 'chartUp' }), bg: '#d9364b', need: null },
  { id: 'antblue', name: '분석 개미', look: ant({ face: 'glasses', outfit: 'suit', back: 'chartV' }), bg: '#2563eb', need: null },
  // 업적으로 열리는 사진 — 개미가 업적을 입고 들고 있음
  { id: 'trophy', name: '투자왕', look: ant({ hat: 'crown', outfit: 'suit', prop: 'trophy', back: 'rays' }), bg: '#c98a1a', need: 'winner' },
  { id: 'trend', name: '시장을 이긴 자', look: ant({ face: 'cool', outfit: 'suit', prop: 'phone', back: 'chartUp' }), bg: '#1f8a5b', need: 'beat_market' },
  { id: 'bank', name: '배당 부자', look: ant({ outfit: 'suit', prop: 'moneybag', back: 'coins' }), bg: '#a67c1d', need: 'dividend' },
  { id: 'earth', name: '글로벌 투자자', look: ant({ face: 'wink', prop: 'globe', back: 'globe' }), bg: '#1f7a8c', need: 'global' },
  { id: 'clock', name: '예약의 달인', look: ant({ face: 'glasses', prop: 'hourglass', back: 'clock' }), bg: '#6a4fc9', need: 'limit_order' },
  { id: 'cards', name: '카드 마스터', look: ant({ face: 'wink', hat: 'tophat', outfit: 'suit', prop: 'cards', back: 'sparkles' }), bg: '#b0405f', need: 'card_master' },
  { id: 'bolt', name: '단타왕', look: ant({ face: 'brave', hat: 'headband', prop: 'phone', back: 'flames' }), bg: '#c0562a', need: 'trader' },
  { id: 'gem', name: '다이아몬드 핸드', look: ant({ face: 'star', prop: 'diamond', back: 'sparkles' }), bg: '#2f7fb8', need: 'diamond' },
  { id: 'aim', name: '저점 매수의 신', look: ant({ face: 'wink', prop: 'target', back: 'chartV' }), bg: '#a33a3a', need: 'bottom' },
  { id: 'shield2', name: '철벽 방어', look: ant({ face: 'brave', hat: 'helmet', prop: 'shield' }), bg: '#3e7a52', need: 'shield' },
  { id: 'bear', name: '폭락장의 승자', look: ant({ face: 'cool', outfit: 'suit', back: 'chartDown' }), bg: '#3a4a8a', need: 'crash_winner' },
  { id: 'rocket', name: '상한가 사냥꾼', look: ant({ face: 'star', prop: 'rocket', back: 'chartUp' }), bg: '#d9364b', need: 'limit_up' },
  { id: 'zen2', name: '존버의 미학', look: ant({ face: 'zen', outfit: 'robe', back: 'zen' }), bg: '#2f8a74', need: 'zen' },
  { id: 'phoenix', name: '대역전극', look: ant({ face: 'brave', back: 'phoenix' }), bg: '#b0461f', need: 'comeback' },
  { id: 'jackpot', name: '한 방', look: ant({ face: 'star', prop: 'moneybag', back: 'confetti' }), bg: '#8a3fc0', need: 'big_win' },
  { id: 'botslayer', name: '고수봇 사냥꾼', look: ant({ face: 'cool', hat: 'headband', prop: 'robot', back: 'circuit' }), bg: '#4a5a7a', need: 'bot_slayer' },
  { id: 'moneybag', name: '대박', look: ant({ face: 'star', outfit: 'suit', prop: 'moneybag', back: 'confetti' }), bg: '#2f8a45', need: 'ret30' },
  { id: 'streak', name: '연전연승', look: ant({ face: 'brave', hat: 'headband', outfit: 'medal', back: 'flames' }), bg: '#c0452a', need: 'streak7' },
  { id: 'ice', name: '무결점', look: ant({ face: 'zen', hat: 'halo', back: 'sparkles' }), bg: '#4a90b0', need: 'flawless' },
  { id: 'king', name: '다인전의 왕', look: ant({ face: 'cool', hat: 'bigCrown', outfit: 'cape', back: 'rays' }), bg: '#b8862a', need: 'multi_win' },
  { id: 'scoop', name: '사건 해결사', look: ant({ face: 'wink', hat: 'newsCap', prop: 'newspaper', back: 'news' }), bg: '#7a4ab0', need: 'news_jump' },
  { id: 'umbrella', name: '하락장 생존자', look: ant({ prop: 'umbrella', back: 'rain' }), bg: '#3a7a7a', need: 'bear_proof' },
  { id: 'sniper', name: '명중', look: ant({ face: 'wink', prop: 'target', back: 'cross' }), bg: '#7a2f2f', need: 'sniper' },
  // 웃픈 업적 (design/achievements-v2.md)
  { id: 'broke', name: '깡통 계좌', look: ant({ face: 'sad', prop: 'wallet', back: 'chartDown' }), bg: '#5a5f6b', need: 'big_loss' },
  { id: 'peak', name: '꼭지에서 산 개미', look: ant({ face: 'sweat', back: 'peak' }), bg: '#8a4a6b', need: 'buy_high' },
  { id: 'bruised', name: '동네북', look: ant({ face: 'dizzy', hat: 'bandage', back: 'dizzy' }), bg: '#7a5a3a', need: 'punching_bag' },
  { id: 'fooled', name: '찌라시에 속은 개미', look: ant({ face: 'shock', prop: 'fakeNews', back: 'news' }), bg: '#3f6b8a', need: 'fooled' },
  // 게임 안 봇 자리 그림 (고를 수 없음: need '__' 로 시작하는 건 어떤 업적으로도 안 열림)
  { id: '__bot', name: '봇', look: ant({ face: 'visor', metal: true, back: 'circuit' }), bg: '#2f4a52', need: '__bot' },
  // 튜토리얼을 모두 끝낸 개미 (design/titles-tiers-v3.md)
  { id: 'graduate', name: '졸업한 개미', look: ant({ face: 'happy', hat: 'gradCap', back: 'confetti' }), bg: '#3d4f8a', need: 'tut_grad' },
  // 레벨 (경험치) — 개미가 자라남
  { id: 'sprout', name: '새싹 개미', look: ant({ hat: 'sprout' }), bg: '#4a9a3a', need: 'lv5' },
  { id: 'star', name: '꽃핀 개미', look: ant({ hat: 'flower', back: 'sparkles' }), bg: '#c9a020', need: 'lv10' },
  { id: 'medal2', name: '베테랑 개미', look: ant({ face: 'cool', hat: 'silverCrown', outfit: 'medal' }), bg: '#5a6f8f', need: 'lv15' },
  { id: 'legend', name: '개미 전설', look: ant({ face: 'star', hat: 'bigCrown', outfit: 'cape', back: 'rays' }), bg: '#8a2f6b', need: 'lv20' },
];
export const AVATAR_MAP: Record<string, AvatarDef> = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
/** 저장 값('sprout' · 'sprout:2' · 'sprout:3') → 사진 (단계는 테두리만 바꿈) */
export const avatarOf = (v: string | null | undefined) => {
  const id = typeof v === 'string' ? v.split(':')[0] : '';
  return id && Object.prototype.hasOwnProperty.call(AVATAR_MAP, id) ? AVATAR_MAP[id] : AVATAR_MAP.default;
};
/** 사진 단계 (1~4) — 2 은색 테두리·별, 3 금색 테두리·왕관, 4 무지개 보석 테두리·보석 왕관 */
export const avatarTier = (v: string | null | undefined): 1 | 2 | 3 | 4 => {
  const m = typeof v === 'string' ? /:([234])$/.exec(v) : null;
  return (m ? Number(m[1]) : 1) as 1 | 2 | 3 | 4;
};
/** 이 사람이 고를 수 있는 사진인지 (badges = 얻은 업적 id 목록) */
export const canUseAvatar = (id: string, badges: Iterable<string>) => {
  if (!Object.prototype.hasOwnProperty.call(AVATAR_MAP, id)) return false;
  const a = AVATAR_MAP[id];
  if (!a.need) return true;
  return new Set(badges).has(a.need);
};
