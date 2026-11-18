/** 프로필 사진: 캐릭터(개미·황소·곰 + 업적 개미, AvatarArt) · 손님은 회색 사람 모양 */
import { avatarOf, avatarTier } from '../game/avatars';
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
  // 같은 업적을 5번·20번 넘게 딴 사진: 은색·금색 테두리 + 위에 작은 별·왕관 (design/titles-tiers-v3.md)
  const tier = guest ? 1 : avatarTier(id);
  const mark = Math.max(9, Math.round(size * 0.3));
  return (
    <span className={'pf-av ' + (guest ? 'guest ' : '') + (tier > 1 ? `av-t${tier} ` : '') + className} style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.42) }} aria-hidden title={guest ? `${name} (손님)` : undefined}>
      {guest ? <GuestFace s={Math.round(size * 0.86)} /> : <AvatarArt look={a.look} size={size} />}
      {tier > 1 && (
        <svg className="av-mark" width={mark} height={mark} viewBox="0 0 20 20">
          {tier === 2 ? (
            <path d="M10 1.5 L12.4 7 L18.3 7.4 L13.8 11.2 L15.3 17 L10 13.8 L4.7 17 L6.2 11.2 L1.7 7.4 L7.6 7 Z" fill="#e6ebf2" stroke="#59606b" strokeWidth="1.1" strokeLinejoin="round" />
          ) : (
            <path d="M2.5 15.5 L1.5 5.5 L6.5 9.5 L10 3 L13.5 9.5 L18.5 5.5 L17.5 15.5 Z" fill="#f5c542" stroke="#7a5310" strokeWidth="1.1" strokeLinejoin="round" />
          )}
        </svg>
      )}
    </span>
  );
}
