/**
 * 프로필 사진 프리셋 (이 게임만의 그림: 아이콘 + 바탕색)
 * - 'default' = 기본 프로필 (닉네임 첫 글자). 처음엔 이걸로 시작
 * - need 가 없는 건 누구나, need 가 있는 건 그 업적을 깨면 열림 (서버가 다시 확인)
 */
export interface AvatarDef {
  id: string;
  name: string;
  /** components/Icon 의 이름 (null 이면 닉네임 첫 글자) */
  icon: string | null;
  bg: string;
  /** 열리는 조건: 업적 id */
  need: string | null;
}

export const AVATARS: AvatarDef[] = [
  { id: 'default', name: '기본', icon: null, bg: '#2b303b', need: null },
  { id: 'chart', name: '상승 차트', icon: 'chart', bg: '#1d6b57', need: null },
  { id: 'piggy', name: '저금통', icon: 'piggy', bg: '#7d4a74', need: null },
  { id: 'coins', name: '동전', icon: 'coins', bg: '#6b5a22', need: null },
  { id: 'briefcase', name: '서류가방', icon: 'briefcase', bg: '#38477a', need: null },
  { id: 'globe2', name: '세계 시장', icon: 'globe', bg: '#255a80', need: null },
  // 업적으로 열리는 사진
  { id: 'trophy', name: '투자왕 트로피', icon: 'trophy', bg: '#6a5be0', need: 'winner' },
  { id: 'trend', name: '시장을 이긴 자', icon: 'trend', bg: '#2d7d6a', need: 'beat_market' },
  { id: 'bank', name: '배당 부자', icon: 'bank', bg: '#7a6a2c', need: 'dividend' },
  { id: 'earth', name: '글로벌 투자자', icon: 'badge:global', bg: '#2a6b8f', need: 'global' },
  { id: 'clock', name: '예약의 달인', icon: 'hourglass', bg: '#5a4a86', need: 'limit_order' },
  { id: 'cards', name: '카드 마스터', icon: 'cards', bg: '#86455b', need: 'card_master' },
  { id: 'bolt', name: '단타왕', icon: 'flame', bg: '#8a4a2a', need: 'trader' },
  { id: 'gem', name: '다이아몬드 핸드', icon: 'badge:diamond', bg: '#3c6f9a', need: 'diamond' },
  { id: 'aim', name: '저점 매수의 신', icon: 'target', bg: '#7a3a3a', need: 'bottom' },
  { id: 'shield2', name: '철벽 방어', icon: 'badge:shield', bg: '#3e5b4a', need: 'shield' },
  { id: 'bear', name: '폭락장의 승자', icon: 'down', bg: '#4a3f6b', need: 'crash_winner' },
  { id: 'rocket', name: '상한가 사냥꾼', icon: 'up', bg: '#8a2f4a', need: 'limit_up' },
  { id: 'zen2', name: '존버의 미학', icon: 'badge:zen', bg: '#2f6b5e', need: 'zen' },
  { id: 'phoenix', name: '대역전극', icon: 'badge:comeback', bg: '#9a5a1f', need: 'comeback' },
  { id: 'jackpot', name: '한 방', icon: 'sparkles', bg: '#6b2f8a', need: 'big_win' },
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
