/** 프로필 사진: 캐릭터(개미·황소·곰 + 업적 개미, AvatarArt) · 손님은 회색 사람 모양 */
import { avatarOf } from '../game/avatars';
import { AvatarArt } from './AvatarArt';

/** 손님 사진: 회색 바탕에 이름 없는 사람 모양 */
function GuestFace({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="12.5" r="5.6" fill="#9a9a9a" />
      <path d="M6.5 27.5 C7.5 21.5 11.3 19 16 19 C20.7 19 24.5 21.5 25.5 27.5 Z" fill="#9a9a9a" />
    </svg>
  );
}

export function Avatar({ id, name, size = 36, className = '', guest = false }: { id?: string | null; name: string; size?: number; className?: string; /** 손님(회원 아님) */ guest?: boolean }) {
  const a = avatarOf(id);
  const bg = guest ? '#3a3a3a' : a.bg;
  return (
    <span className={'pf-av ' + (guest ? 'guest ' : '') + className} style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.42) }} aria-hidden title={guest ? `${name} (손님)` : undefined}>
      {guest ? <GuestFace s={Math.round(size * 0.86)} /> : <AvatarArt look={a.look} size={size} />}
    </span>
  );
}
