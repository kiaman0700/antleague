/**
 * 프로필 사진 = 캐릭터 (이 게임만의 그림, 2026-11-17 — 그림은 components/AvatarArt.tsx)
 * - 기본 3가지(누구나, 모두 개미 — 개미리그): 새내기 개미('default', 처음 사진, 보라) · 열혈 개미(빨강, 눈썹) · 분석 개미(파랑, 동그란 안경)
 * - 업적 사진: 개미가 그 업적을 '입은' 모습 — 모자 + 표정 + 업적 스티커. 그 업적을 깨면 열림 (서버가 다시 확인)
 * - 예전 아이콘 사진(chart·piggy 등)은 없앰 → 저장돼 있으면 기본 개미로 보임
 */
export interface AvatarLook {
  char: 'ant';
  hat?: 'crown' | 'silverCrown' | 'bigCrown' | 'headband' | 'sprout' | 'flower' | 'halo';
  face?: 'happy' | 'cool' | 'zen' | 'star' | 'wink' | 'brave' | 'glasses';
  /** 오른쪽 아래 스티커: components/Icon 이름 또는 'badge:업적id' */
  sticker?: string;
}
export interface AvatarDef {
  id: string;
  name: string;
  look: AvatarLook;
  bg: string;
  /** 열리는 조건: 업적 id */
  need: string | null;
}

const ant = (hat?: AvatarLook['hat'], face: AvatarLook['face'] = 'happy', sticker?: string): AvatarLook => ({ char: 'ant', hat, face, sticker });

export const AVATARS: AvatarDef[] = [
  { id: 'default', name: '새내기 개미', look: ant(), bg: '#6b58ee', need: null },
  { id: 'antred', name: '열혈 개미', look: ant(undefined, 'brave'), bg: '#d9364b', need: null },
  { id: 'antblue', name: '분석 개미', look: ant(undefined, 'glasses'), bg: '#2563eb', need: null },
  // 업적으로 열리는 사진 (개미가 업적을 입음)
  { id: 'trophy', name: '투자왕', look: ant('crown', 'happy', 'trophy'), bg: '#c98a1a', need: 'winner' },
  { id: 'trend', name: '시장을 이긴 자', look: ant(undefined, 'cool', 'trend'), bg: '#1f8a5b', need: 'beat_market' },
  { id: 'bank', name: '배당 부자', look: ant(undefined, 'happy', 'bank'), bg: '#a67c1d', need: 'dividend' },
  { id: 'earth', name: '글로벌 투자자', look: ant(undefined, 'wink', 'badge:global'), bg: '#1f7a8c', need: 'global' },
  { id: 'clock', name: '예약의 달인', look: ant(undefined, 'wink', 'hourglass'), bg: '#6a4fc9', need: 'limit_order' },
  { id: 'cards', name: '카드 마스터', look: ant(undefined, 'cool', 'cards'), bg: '#b0405f', need: 'card_master' },
  { id: 'bolt', name: '단타왕', look: ant('headband', 'happy', 'flame'), bg: '#c0562a', need: 'trader' },
  { id: 'gem', name: '다이아몬드 핸드', look: ant(undefined, 'star', 'badge:diamond'), bg: '#2f7fb8', need: 'diamond' },
  { id: 'aim', name: '저점 매수의 신', look: ant(undefined, 'wink', 'target'), bg: '#a33a3a', need: 'bottom' },
  { id: 'shield2', name: '철벽 방어', look: ant('headband', 'cool', 'badge:shield'), bg: '#3e7a52', need: 'shield' },
  { id: 'bear', name: '폭락장의 승자', look: ant(undefined, 'cool', 'down'), bg: '#3a4a8a', need: 'crash_winner' },
  { id: 'rocket', name: '상한가 사냥꾼', look: ant(undefined, 'star', 'up'), bg: '#d9364b', need: 'limit_up' },
  { id: 'zen2', name: '존버의 미학', look: ant(undefined, 'zen', 'badge:zen'), bg: '#2f8a74', need: 'zen' },
  { id: 'phoenix', name: '대역전극', look: ant('headband', 'star', 'badge:comeback'), bg: '#d0702a', need: 'comeback' },
  { id: 'jackpot', name: '한 방', look: ant(undefined, 'star', 'sparkles'), bg: '#8a3fc0', need: 'big_win' },
  { id: 'botslayer', name: '고수봇 사냥꾼', look: ant('headband', 'cool', 'badge:bot_slayer'), bg: '#4a5a7a', need: 'bot_slayer' },
  { id: 'moneybag', name: '대박', look: ant(undefined, 'star', 'badge:ret30'), bg: '#2f8a45', need: 'ret30' },
  { id: 'streak', name: '연전연승', look: ant('headband', 'happy', 'badge:streak7'), bg: '#c0452a', need: 'streak7' },
  { id: 'ice', name: '무결점', look: ant('halo', 'zen', 'badge:flawless'), bg: '#4a90b0', need: 'flawless' },
  { id: 'king', name: '다인전의 왕', look: ant('bigCrown', 'cool', 'badge:multi_win'), bg: '#b8862a', need: 'multi_win' },
  { id: 'scoop', name: '사건 해결사', look: ant(undefined, 'wink', 'badge:news_jump'), bg: '#7a4ab0', need: 'news_jump' },
  { id: 'umbrella', name: '하락장 생존자', look: ant(undefined, 'happy', 'badge:bear_proof'), bg: '#3a7a7a', need: 'bear_proof' },
  { id: 'sniper', name: '명중', look: ant(undefined, 'wink', 'badge:sniper'), bg: '#7a2f2f', need: 'sniper' },
  // 레벨 (경험치) — 개미가 자라남
  { id: 'sprout', name: '새싹 개미', look: ant('sprout'), bg: '#4a9a3a', need: 'lv5' },
  { id: 'star', name: '꽃핀 개미', look: ant('flower'), bg: '#c9a020', need: 'lv10' },
  { id: 'medal2', name: '베테랑 개미', look: ant('silverCrown', 'cool'), bg: '#5a6f8f', need: 'lv15' },
  { id: 'legend', name: '개미 전설', look: ant('bigCrown', 'star'), bg: '#8a2f6b', need: 'lv20' },
];
export const AVATAR_MAP: Record<string, AvatarDef> = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
export const avatarOf = (id: string | null | undefined) => (id && Object.prototype.hasOwnProperty.call(AVATAR_MAP, id) ? AVATAR_MAP[id] : AVATAR_MAP.default);
/** 이 사람이 고를 수 있는 사진인지 (badges = 얻은 업적 id 목록) */
export const canUseAvatar = (id: string, badges: Iterable<string>) => {
  if (!Object.prototype.hasOwnProperty.call(AVATAR_MAP, id)) return false;
  const a = AVATAR_MAP[id];
  if (!a.need) return true;
  return new Set(badges).has(a.need);
};
