/** 프로필 사진: 프리셋(아이콘 + 바탕색) 또는 기본(닉네임 첫 글자) */
import { avatarOf } from '../game/avatars';
import { BadgeIcon, Icon } from './Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

export function Avatar({ id, name, size = 36, className = '' }: { id?: string | null; name: string; size?: number; className?: string }) {
  const a = avatarOf(id);
  return (
    <span className={'pf-av ' + className} style={{ width: size, height: size, background: a.bg, fontSize: Math.round(size * 0.42) }} aria-hidden>
      {a.icon?.startsWith('badge:') ? (
        <BadgeIcon id={a.icon.slice(6)} size={Math.round(size * 0.52)} />
      ) : a.icon ? (
        <Icon name={a.icon as IconName} size={Math.round(size * 0.52)} />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
