/**
 * 프로필 캐릭터 그림 (이 게임만의 그림, 2026-11-17)
 * - 기본 3가지 (모두 개미 — 개미리그, 우리 같은 개인 투자자): 새내기(웃음) · 열혈(불타는 눈썹) · 분석(동그란 안경)
 * - 업적 사진: 개미가 그 업적을 '입고' 있음 — 모자(왕관·머리띠·새싹·후광…) + 표정(선글라스·별눈·눈 감음…) + 오른쪽 아래 업적 스티커
 * 64×64 칸, 둥근 바탕색은 Avatar(.pf-av) 가 깔아 줌
 */
import type { AvatarLook } from '../game/avatars';
import { BadgeIcon, Icon } from './Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

const INK = '#1d1626';

function Eyes({ face, cx = 32, y = 35, gap = 7.5, white = '#fff' }: { face: AvatarLook['face']; cx?: number; y?: number; gap?: number; white?: string }) {
  const L = cx - gap;
  const R = cx + gap;
  if (face === 'cool')
    return (
      <g>
        <path d={`M${L - 7} ${y - 4} H${R + 7}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path d={`M${L - 6.5} ${y - 4} h12 l-1.2 6 a4 4 0 0 1 -4 3.2 h-1.8 a4 4 0 0 1 -4 -3.2 Z`} fill={INK} />
        <path d={`M${R - 5.5} ${y - 4} h12 l-1.2 6 a4 4 0 0 1 -4 3.2 h-1.8 a4 4 0 0 1 -4 -3.2 Z`} fill={INK} />
        <path d={`M${L - 4} ${y - 2} l3 0`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
        <path d={`M${R - 3} ${y - 2} l3 0`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
  if (face === 'zen')
    return (
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d={`M${L - 3.5} ${y} q3.5 3 7 0`} />
        <path d={`M${R - 3.5} ${y} q3.5 3 7 0`} />
      </g>
    );
  const star = (x: number) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 2.4 : 5.6;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      return `${(x + Math.cos(a) * r).toFixed(2)},${(y + Math.sin(a) * r).toFixed(2)}`;
    }).join(' ');
    return <polygon points={pts} fill="#ffd34d" stroke={INK} strokeWidth="1" strokeLinejoin="round" />;
  };
  if (face === 'star') return <g>{star(L)}{star(R)}</g>;
  const eye = (x: number, wink: boolean) =>
    wink ? (
      <path d={`M${x - 3.5} ${y + 0.5} q3.5 -3 7 0`} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    ) : (
      <g>
        <ellipse cx={x} cy={y} rx="4.6" ry="5.4" fill={white} />
        <ellipse cx={x + 0.4} cy={y + 1} rx="2.9" ry="3.4" fill={INK} />
        <circle cx={x + 1.4} cy={y - 0.4} r="1.1" fill="#fff" />
      </g>
    );
  return (
    <g>
      {eye(L, false)}
      {eye(R, face === 'wink')}
      {face === 'brave' && <path d={`M${L - 5} ${y - 9} l9 3 M${R + 5} ${y - 9} l-9 3`} stroke="#ff5a4f" strokeWidth="2.8" strokeLinecap="round" />}
      {face === 'glasses' && (
        <g fill="none" stroke="#dfe6f0" strokeWidth="1.8">
          <circle cx={L} cy={y} r="7" />
          <circle cx={R} cy={y} r="7" />
          <path d={`M${L + 7} ${y - 1} Q${cx} ${y - 3.5} ${R - 7} ${y - 1}`} />
          <path d={`M${L - 7} ${y - 1} l-5 -2 M${R + 7} ${y - 1} l5 -2`} />
        </g>
      )}
    </g>
  );
}

function Hat({ hat }: { hat: AvatarLook['hat'] }) {
  switch (hat) {
    case 'crown':
    case 'silverCrown': {
      const c = hat === 'crown' ? '#ffcc3d' : '#dfe3ea';
      const d = hat === 'crown' ? '#b8860b' : '#8a93a3';
      return (
        <g stroke={d} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M22 20 L21 9 L27 14 L32 6 L37 14 L43 9 L42 20 Z" fill={c} />
          <path d="M22 20 H42" stroke={d} strokeWidth="2" />
          <circle cx="32" cy="14.5" r="1.8" fill="#e8475a" stroke="none" />
        </g>
      );
    }
    case 'bigCrown':
      return (
        <g stroke="#9a6a08" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M17 21 L15 5 L24 12 L32 2 L40 12 L49 5 L47 21 Z" fill="#ffcc3d" />
          <path d="M17 21 H47" strokeWidth="2.2" />
          <circle cx="32" cy="11" r="2.2" fill="#e8475a" stroke="none" />
          <circle cx="23" cy="15" r="1.5" fill="#4aa3ff" stroke="none" />
          <circle cx="41" cy="15" r="1.5" fill="#4aa3ff" stroke="none" />
        </g>
      );
    case 'headband':
      return (
        <g>
          <path d="M14 27 Q32 19 50 27 L50 31 Q32 23 14 31 Z" fill="#e8475a" stroke={INK} strokeWidth="1" />
          <path d="M50 28 l7 -4 l-1 6 l6 1 l-8 3 Z" fill="#e8475a" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        </g>
      );
    case 'sprout':
      return (
        <g stroke="#1f5a1a" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M32 20 V11" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path d="M32 13 C26 13 22 10 21 5 C27 5 31 8 32 13 Z" fill="#7ed957" />
          <path d="M32 11 C37 11 41 8 43 3 C37 3 33 6 32 11 Z" fill="#5cc23a" />
        </g>
      );
    case 'flower':
      return (
        <g stroke="#7a5a08" strokeWidth="1">
          <path d="M32 20 V12" fill="none" stroke="#1f5a1a" strokeWidth="2" strokeLinecap="round" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="32" cy="5.5" rx="3" ry="4.2" fill="#ffd34d" transform={`rotate(${a} 32 9.5)`} />
          ))}
          <circle cx="32" cy="9.5" r="2.6" fill="#e8475a" />
        </g>
      );
    case 'halo':
      return <ellipse cx="32" cy="9" rx="12" ry="3.6" fill="none" stroke="#ffd34d" strokeWidth="3" />;
    default:
      return null;
  }
}

/** 업적 스티커: 오른쪽 아래 작은 동그라미 */
function Sticker({ icon }: { icon: string }) {
  const s = 14;
  return (
    <g>
      <circle cx="50" cy="50" r="10.5" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <g transform={`translate(${50 - s / 2} ${50 - s / 2})`} color={INK}>
        {icon.startsWith('badge:') ? <BadgeIcon id={icon.slice(6)} size={s} /> : <Icon name={icon as IconName} size={s} />}
      </g>
    </g>
  );
}

function Ant({ look }: { look: AvatarLook }) {
  const head = '#3b2b2b';
  return (
    <g>
      {/* 더듬이 */}
      <path d="M25 22 C22 14 18 10 13 9 M39 22 C42 14 46 10 51 9" fill="none" stroke={head} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="12.5" cy="9" r="3" fill={head} />
      <circle cx="51.5" cy="9" r="3" fill={head} />
      {/* 머리 */}
      <ellipse cx="32" cy="38" rx="20" ry="18" fill={head} />
      <ellipse cx="25" cy="29" rx="8" ry="4.5" fill="#fff" opacity="0.12" transform="rotate(-20 25 29)" />
      <Hat hat={look.hat} />
      <Eyes face={look.face} y={37} />
      {/* 볼·입·작은 턱 */}
      {look.face !== 'cool' && (
        <g fill="#ff8fa3" opacity="0.55">
          <ellipse cx="18.5" cy="44.5" rx="3.6" ry="2.4" />
          <ellipse cx="45.5" cy="44.5" rx="3.6" ry="2.4" />
        </g>
      )}
      <path d="M27.5 46.5 Q32 50.5 36.5 46.5" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      <path d="M26 54 l2.5 3 M38 54 l-2.5 3" stroke={head} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

export function AvatarArt({ look, size }: { look: AvatarLook; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <Ant look={look} />
      {look.sticker && <Sticker icon={look.sticker} />}
    </svg>
  );
}
