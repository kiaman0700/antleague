/**
 * 증강 카드 꾸밈 — 티어 엠블럼과 같은 재질(위가 밝고 아래가 어두운 금속, 여러 면 보석, 날개).
 * 등급이 오를수록 장식이 늘어남: 실버 = 판 + 보석 1 · 골드 = 날개 2깃 + 보석 · 프리즘 = 날개 3깃 + 뿔 + 큰 보석.
 * 안의 증강 그림(토스식 아이콘)은 건드리지 않음.
 */
import { useId } from 'react';
import type { AugTier } from '../game/augments';

const BASE: Record<AugTier, string> = { silver: '#b9c0cc', gold: '#e3b23c', prism: '#b9a6ff' };
const mix = (c: string, to: string, k: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(c);
  const b = p(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

function Defs({ id, tier }: { id: string; tier: AugTier }) {
  const base = BASE[tier];
  return (
    <defs>
      <linearGradient id={`${id}m`} x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stopColor={mix(base, '#ffffff', 0.85)} />
        <stop offset="0.3" stopColor={mix(base, '#ffffff', 0.55)} />
        <stop offset="0.5" stopColor={base} />
        <stop offset="0.65" stopColor={mix(base, '#000000', 0.2)} />
        <stop offset="1" stopColor={mix(base, '#000000', 0.55)} />
      </linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
        {tier === 'prism' ? (
          <>
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.35" stopColor="#f6a8d8" />
            <stop offset="0.7" stopColor="#9fd8ff" />
            <stop offset="1" stopColor="#b9a6ff" />
          </>
        ) : tier === 'gold' ? (
          <>
            <stop offset="0" stopColor="#fff6d0" />
            <stop offset="0.5" stopColor="#ffc93d" />
            <stop offset="1" stopColor="#c7791a" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#cfe0f5" />
            <stop offset="1" stopColor="#7f93b0" />
          </>
        )}
      </linearGradient>
    </defs>
  );
}

/** 여러 면으로 깎은 보석 (가운데 cx, 위 y, 폭 w) */
function Gem({ cx, y, w, fill }: { cx: number; y: number; w: number; fill: string }) {
  const h = w * 1.25;
  const l = cx - w / 2;
  const r = cx + w / 2;
  const s = y + h * 0.32;
  return (
    <g>
      <path d={`M${cx} ${y}L${r} ${s}L${cx} ${y + h}L${l} ${s}Z`} fill={fill} stroke="#1a1a1e" strokeWidth="0.8" strokeLinejoin="round" />
      <path d={`M${cx} ${y}L${cx + w * 0.2} ${s}L${cx} ${y + h}L${cx - w * 0.2} ${s}Z`} fill="#fff" opacity="0.28" />
      <path d={`M${l} ${s}H${r}`} stroke="#fff" strokeOpacity="0.5" strokeWidth="0.7" />
    </g>
  );
}

/** 카드 위 가운데 장식 (날개·보석) */
export function AugCrest({ tier }: { tier: AugTier }) {
  const id = useId().replace(/:/g, '');
  const metal = `url(#${id}m)`;
  const gem = `url(#${id}g)`;
  const feathers = tier === 'silver' ? 0 : tier === 'gold' ? 2 : 3;
  const wing = (side: 1 | -1) =>
    Array.from({ length: feathers }, (_, i) => {
      const len = 30 - i * 7;
      const y = 15 + i * 6.5;
      const x0 = 60 + side * 13;
      return <path key={i} d={`M${x0} ${y}C${x0 + side * len * 0.5} ${y - 9} ${x0 + side * len} ${y - 8} ${x0 + side * (len + 8)} ${y - 13}C${x0 + side * len} ${y + 1} ${x0 + side * len * 0.5} ${y + 5} ${x0} ${y + 6}Z`} fill={metal} stroke="#1a1a1e" strokeWidth="0.8" strokeLinejoin="round" />;
    });
  return (
    <svg className={`aug-crest t-${tier}`} viewBox="0 0 120 44" aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      {wing(-1)}
      {wing(1)}
      {tier === 'prism' && <path d="M48 16L52 4L57 13L60 2L63 13L68 4L72 16Z" fill={metal} stroke="#1a1a1e" strokeWidth="0.8" strokeLinejoin="round" />}
      <path d="M44 14H76L72 34L60 42L48 34Z" fill={metal} stroke="#1a1a1e" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M48.500 17H71.500L68.500 32L60 37.800L51.500 32Z" fill="#141418" />
      <Gem cx={60} y={tier === 'prism' ? 17 : 19} w={tier === 'prism' ? 13 : 11} fill={gem} />
      <path d="M46.500 16.500H60" stroke="#fff" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** 카드 아래 띠의 등급 보석 (1·2·3개) */
export function AugGems({ tier }: { tier: AugTier }) {
  const id = useId().replace(/:/g, '');
  const n = tier === 'silver' ? 1 : tier === 'gold' ? 2 : 3;
  return (
    <svg className="aug-gems" viewBox={`0 0 ${n * 14} 16`} width={n * 14} height={16} aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      {Array.from({ length: n }, (_, i) => (
        <Gem key={i} cx={7 + i * 14} y={1.5} w={10} fill={`url(#${id}g)`} />
      ))}
    </svg>
  );
}
