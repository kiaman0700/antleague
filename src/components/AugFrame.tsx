/**
 * 증강 카드 틀 — 티어 엠블럼과 같은 금속·보석 재질로, 등급이 오를수록 장식이 늘어남.
 *  실버: 은 테두리 · 위 방패와 얼음빛 보석 · 모서리 리벳 · 아래 보석 1
 *  골드: 금 테두리 · 두 겹 날개 · 모서리 잎 장식과 보석 · 아래 보석 2
 *  프리즘: 무지갯빛 금속 · 세 겹 날개와 왕관 · 모서리 보석 · 그림 둘레 보석 4 · 아래 보석 3
 * 안의 증강 그림(정해 둔 토스식 아이콘)은 건드리지 않음. 모양은 모두 둥근 선으로.
 */
import { useId } from 'react';
import type { AugTier } from '../game/augments';

type Stop = [number, string];
/** 재질: 증강 등급 셋 + 브랜드 보라(자수정) — 로비·게임 화면 틀에도 같은 부품을 씀 */
export type Tone = AugTier | 'amethyst';
const METAL: Record<Tone, Stop[]> = {
  silver: [[0, '#ffffff'], [0.14, '#e8ecf2'], [0.32, '#aeb6c3'], [0.45, '#f7f9fc'], [0.58, '#939cab'], [0.78, '#626a79'], [1, '#353a44']],
  gold: [[0, '#fffbe8'], [0.14, '#ffe08a'], [0.32, '#dca331'], [0.45, '#fff0b3'], [0.58, '#c4861b'], [0.8, '#83540e'], [1, '#4a2f07']],
  prism: [[0, '#ffffff'], [0.14, '#ffe6f4'], [0.3, '#d4c4ff'], [0.44, '#ffffff'], [0.58, '#a3dcff'], [0.76, '#a58cff'], [1, '#5a41c9']],
  amethyst: [[0, '#ffffff'], [0.14, '#e4ddff'], [0.32, '#9d8cf5'], [0.45, '#f1edff'], [0.58, '#7462e8'], [0.8, '#4432b0'], [1, '#231a66']],
};
const GEM: Record<Tone, Stop[]> = {
  silver: [[0, '#ffffff'], [0.35, '#cfe6ff'], [0.7, '#6fa4e8'], [1, '#2d5fae']],
  gold: [[0, '#fff6c8'], [0.3, '#ffcf3d'], [0.7, '#f08a0c'], [1, '#a34a00']],
  prism: [[0, '#ffffff'], [0.25, '#ffd1ec'], [0.5, '#c6b5ff'], [0.75, '#8fe3ff'], [1, '#6c4fe0']],
  amethyst: [[0, '#ffffff'], [0.3, '#e0d4ff'], [0.7, '#8f6cff'], [1, '#4a26c4']],
};

/** 이 SVG 안에서 쓰는 금속·보석 색 (id 는 SVG 마다 따로 — 같은 화면에 여러 장이라도 섞이지 않게) */
function Defs({ id, tier }: { id: string; tier: Tone }) {
  return (
    <defs>
      <linearGradient id={`${id}m`} x1="0" y1="0" x2="0.25" y2="1">
        {METAL[tier].map(([o, c]) => (
          <stop key={o} offset={o} stopColor={c} />
        ))}
      </linearGradient>
      <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a2a31" />
        <stop offset="1" stopColor="#0d0d10" />
      </linearGradient>
      <linearGradient id={`${id}g`} x1="0.15" y1="0" x2="0.85" y2="1">
        {GEM[tier].map(([o, c]) => (
          <stop key={o} offset={o} stopColor={c} />
        ))}
      </linearGradient>
      <radialGradient id={`${id}f`} cx="0.5" cy="0.38" r="0.62">
        <stop offset="0" stopColor={tier === 'gold' ? '#4a3a18' : tier === 'prism' ? '#3a3160' : tier === 'amethyst' ? '#33295e' : '#2f3540'} />
        <stop offset="1" stopColor="#111114" />
      </radialGradient>
    </defs>
  );
}

/** 위에서 본 브릴리언트 컷 보석 (가운데 cx·cy, 반지름 r) — 면마다 밝기가 달라 반짝임이 보임 */
function Brilliant({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  const pt = (a: number, k = 1) => `${(cx + Math.cos(a) * r * k).toFixed(2)} ${(cy + Math.sin(a) * r * k).toFixed(2)}`;
  const n = 8;
  const outer = Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);
  const table = outer.map((a) => pt(a + Math.PI / n, 0.48));
  const shades = [0.5, 0.3, 0.05, 0, 0.12, 0.22, 0.4, 0.55];
  return (
    <g>
      <path d={`M${outer.map((a) => pt(a)).join('L')}Z`} fill={`url(#${id}g)`} stroke="#0c0c10" strokeWidth={r * 0.09} strokeLinejoin="round" />
      {outer.map((a, i) => (
        <path key={i} d={`M${pt(a)}L${pt(outer[(i + 1) % n])}L${table[i]}Z`} fill="#000" opacity={shades[i]} />
      ))}
      {outer.map((a, i) => (
        <path key={'t' + i} d={`M${pt(a)}L${table[i]}L${table[(i + n - 1) % n]}Z`} fill="#fff" opacity={i < 3 ? 0.35 : 0.08} />
      ))}
      <path d={`M${table.join('L')}Z`} fill={`url(#${id}g)`} stroke="#fff" strokeOpacity="0.55" strokeWidth={r * 0.05} strokeLinejoin="round" />
      <path d={`M${table[6]}L${table[7]}L${table[0]}`} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth={r * 0.08} strokeLinecap="round" />
      <circle cx={cx - r * 0.32} cy={cy - r * 0.34} r={r * 0.12} fill="#fff" />
    </g>
  );
}

/** 날개 한쪽: 겹마다 깃 끝이 둥근 금속 깃 + 깃 결 */
function Wing({ id, side, layers }: { id: string; side: 1 | -1; layers: number }) {
  const out = [];
  for (let k = layers - 1; k >= 0; k--) {
    const len = 52 + k * 15;
    const y = 30 + k * 7;
    const x0 = 100 + side * 22;
    const tip = x0 + side * len;
    const d = `M${x0} ${y + 10}C${x0 + side * len * 0.35} ${y - 10} ${x0 + side * len * 0.75} ${y - 16 - k * 3} ${tip} ${y - 22 - k * 4}C${tip - side * 4} ${y - 12} ${tip - side * 10} ${y - 4} ${tip - side * 18} ${y + 1}C${x0 + side * len * 0.5} ${y + 8} ${x0 + side * len * 0.25} ${y + 14} ${x0} ${y + 16}Z`;
    out.push(
      <g key={k}>
        <path d={d} fill={`url(#${id}m)`} stroke="#121216" strokeWidth="1.4" strokeLinejoin="round" />
        {[0.35, 0.58, 0.8].map((t) => (
          <path key={t} d={`M${x0 + side * len * t * 0.92} ${y + 12 - t * 14}q${side * 6} ${-4} ${side * 10} ${-12 - k}`} fill="none" stroke="#121216" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
        ))}
        <path d={`M${x0 + side * 6} ${y + 6}C${x0 + side * len * 0.4} ${y - 9} ${x0 + side * len * 0.7} ${y - 14 - k * 3} ${tip - side * 3} ${y - 20 - k * 4}`} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" />
      </g>,
    );
  }
  return <>{out}</>;
}

/** 카드 위 가운데 장식: 방패 + 보석, 등급이 오를수록 날개·왕관 */
export function AugCrest({ tier, className }: { tier: Tone; className?: string }) {
  const id = useId().replace(/:/g, '');
  const m = `url(#${id}m)`;
  const layers = tier === 'silver' ? 0 : tier === 'prism' ? 3 : 2;
  return (
    <svg className={className ?? `aug-crest t-${tier}`} viewBox="0 0 200 92" aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      {layers > 0 && <Wing id={id} side={-1} layers={layers} />}
      {layers > 0 && <Wing id={id} side={1} layers={layers} />}
      {tier === 'silver' && (
        // 실버: 날개 대신 양옆 둥근 소용돌이
        <g fill="none" stroke={m} strokeWidth="5" strokeLinecap="round">
          <path d="M76 44c-12 0-20-6-20-14 0-6 5-10 10-9" />
          <path d="M124 44c12 0 20-6 20-14 0-6-5-10-10-9" />
        </g>
      )}
      {tier === 'prism' && (
        // 프리즘: 방패 위 둥근 왕관 (끝마다 작은 보석)
        <g>
          <path d="M74 30C74 20 79 10 84 6c1 8 5 13 9 15 2-8 5-14 7-18 2 4 5 10 7 18 4-2 8-7 9-15 5 4 10 14 10 24z" fill={m} stroke="#121216" strokeWidth="1.4" strokeLinejoin="round" />
          {[
            [84, 7],
            [100, 4],
            [116, 7],
          ].map(([x, y]) => (
            <Brilliant key={x} id={id} cx={x} cy={y + 1} r={3.6} />
          ))}
        </g>
      )}
      {/* 방패: 바깥 금속 → 홈 → 안쪽 판 */}
      <path d="M72 24c0-4 3-7 7-7h42c4 0 7 3 7 7v24c0 16-13 28-28 36C85 76 72 64 72 48z" fill={m} stroke="#121216" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M78 27c0-2.5 2-4.5 4.5-4.5h35c2.5 0 4.5 2 4.5 4.5v20.5c0 12.5-10 22-22 28.5-12-6.5-22-16-22-28.5z" fill={`url(#${id}f)`} stroke="#000" strokeOpacity="0.6" strokeWidth="1.2" />
      <path d="M80 26.5h40" stroke="#fff" strokeOpacity="0.18" strokeWidth="1" strokeLinecap="round" />
      <Brilliant id={id} cx={100} cy={46} r={tier === 'prism' ? 15 : tier === 'silver' ? 12 : 13.5} />
      {/* 금속 윗면 빛 한 줄 */}
      <path d="M77 21.5c1-1.5 2.4-2.3 4.2-2.3H100" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 카드 모서리 장식 (왼쪽 위 기준 — 다른 모서리는 CSS 로 뒤집음) */
export function AugCorner({ tier, pos }: { tier: Tone; pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const id = useId().replace(/:/g, '');
  const m = `url(#${id}m)`;
  return (
    <svg className={`aug-corner c-${pos}`} viewBox="0 0 48 48" aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      {/* 카드 모서리를 따라 도는 둥근 금속 띠 */}
      <path d="M4 40V20C4 11 11 4 20 4h20" fill="none" stroke="#121216" strokeWidth="8.5" strokeLinecap="round" />
      <path d="M4 40V20C4 11 11 4 20 4h20" fill="none" stroke={m} strokeWidth="6" strokeLinecap="round" />
      <path d="M6 36V20c0-7.5 6.5-14 14-14h17" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
      {tier !== 'silver' && (
        // 골드·프리즘: 안쪽으로 말린 잎
        <g fill="none" strokeLinecap="round">
          {/* 안쪽으로 감기는 둥근 덩굴 두 줄 (가로·세로 대칭) */}
          <path d="M20 10c8 0 13 3 13 8 0 3.5-2.5 5.5-5.5 5.5-2.5 0-4-1.6-4-3.6" stroke="#121216" strokeWidth="5" />
          <path d="M20 10c8 0 13 3 13 8 0 3.5-2.5 5.5-5.5 5.5-2.5 0-4-1.6-4-3.6" stroke={m} strokeWidth="3" />
          <path d="M10 20c0 8 3 13 8 13 3.5 0 5.5-2.5 5.5-5.5 0-2.5-1.6-4-3.6-4" stroke="#121216" strokeWidth="5" />
          <path d="M10 20c0 8 3 13 8 13 3.5 0 5.5-2.5 5.5-5.5 0-2.5-1.6-4-3.6-4" stroke={m} strokeWidth="3" />
        </g>
      )}
      {tier === 'silver' ? (
        <g>
          <circle cx="12" cy="12" r="5.5" fill={m} stroke="#121216" strokeWidth="1.2" />
          <circle cx="10.6" cy="10.6" r="1.6" fill="#fff" opacity="0.85" />
        </g>
      ) : (
        <g>
          <circle cx="12" cy="12" r="7.5" fill={m} stroke="#121216" strokeWidth="1.2" />
          <Brilliant id={id} cx={12} cy={12} r={5.2} />
        </g>
      )}
    </svg>
  );
}

/** 그림 뒤 둥근 메달 (금속 고리 + 새긴 눈금 + 안쪽 판). 프리즘은 고리에 보석 넷 */
export function AugMedal({ tier, mini = false }: { tier: Tone; mini?: boolean }) {
  const id = useId().replace(/:/g, '');
  const ticks = Array.from({ length: 36 }, (_, i) => (i * Math.PI * 2) / 36);
  return (
    <svg className={`aug-medal t-${tier}`} viewBox="0 0 120 120" aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      <circle cx="60" cy="60" r="56" fill="#0c0c0f" />
      <circle cx="60" cy="60" r="53" fill={`url(#${id}m)`} stroke="#121216" strokeWidth="1.4" />
      <circle cx="60" cy="60" r="45" fill={`url(#${id}d)`} />
      {!mini && ticks.map((a, i) => (
        <path key={i} d={`M${60 + Math.cos(a) * 46.5} ${60 + Math.sin(a) * 46.5}L${60 + Math.cos(a) * (i % 3 === 0 ? 50.5 : 49)} ${60 + Math.sin(a) * (i % 3 === 0 ? 50.5 : 49)}`} stroke="#000" strokeOpacity="0.45" strokeWidth="1.2" strokeLinecap="round" />
      ))}
      <circle cx="60" cy="60" r="42" fill={`url(#${id}f)`} stroke="#000" strokeOpacity="0.7" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="40" fill="none" stroke="#fff" strokeOpacity="0.07" strokeWidth="1" />
      <path d="M22 44A40 40 0 0 1 60 15" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" transform="translate(-0.5 -1) scale(1.02)" />
      {tier === 'prism' &&
        [0, 90, 180, 270].map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return <Brilliant key={deg} id={id} cx={60 + Math.cos(a) * 49} cy={60 + Math.sin(a) * 49} r={5.6} />;
        })}
      {tier === 'gold' &&
        [45, 135, 225, 315].map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return <circle key={deg} cx={60 + Math.cos(a) * 49} cy={60 + Math.sin(a) * 49} r="2.4" fill="#fff6c8" stroke="#6b4a10" strokeWidth="0.8" />;
        })}
    </svg>
  );
}

/** 카드 아래 가운데 금속 판의 등급 보석 (1·2·3개) */
export function AugGems({ tier }: { tier: AugTier }) {
  const id = useId().replace(/:/g, '');
  const n = tier === 'silver' ? 1 : tier === 'gold' ? 2 : 3;
  const w = 26 + n * 20;
  return (
    <svg className={`aug-gems t-${tier}`} viewBox={`0 0 ${w} 30`} style={{ width: w, height: 30 }} aria-hidden focusable="false">
      <Defs id={id} tier={tier} />
      <rect x="1" y="4" width={w - 2} height="22" rx="11" fill="#0c0c0f" />
      <rect x="2.5" y="5.5" width={w - 5} height="19" rx="9.5" fill={`url(#${id}m)`} stroke="#121216" strokeWidth="1.2" />
      <rect x="6" y="9" width={w - 12} height="12" rx="6" fill={`url(#${id}d)`} />
      <path d={`M8 7.5H${w / 2}`} stroke="#fff" strokeOpacity="0.8" strokeWidth="1.2" strokeLinecap="round" />
      {Array.from({ length: n }, (_, i) => (
        <Brilliant key={i} id={id} cx={w / 2 + (i - (n - 1) / 2) * 20} cy={15} r={7} />
      ))}
    </svg>
  );
}

/** 작은 증강 동전: 메달 위에 그림 (게임 중 '내 증강' 줄·목록) — 고르기 카드와 같은 재질 */
export function AugCoin({ tier, size, children }: { tier: Tone; size: number; children: React.ReactNode }) {
  return (
    <span className={`aug-coin t-${tier}`} style={{ width: size, height: size }}>
      <AugMedal tier={tier} mini />
      <span className="aug-coin-in">{children}</span>
    </span>
  );
}

/**
 * 어느 칸에나 두르는 금속 틀: 네 모서리 장식 + 안쪽 가는 선. 테두리 금속은 CSS(.orn + .orn-톤)가 그림.
 * 부모에 className="orn orn-gold" 처럼 주고 맨 앞에 <OrnCorners tone="gold" /> 를 넣음
 */
export function OrnCorners({ tone, plain = false }: { tone: Tone; plain?: boolean }) {
  return (
    <>
      <span className="orn-line" aria-hidden />
      {!plain && (['tl', 'tr', 'bl', 'br'] as const).map((p) => <AugCorner key={p} tier={tone} pos={p} />)}
    </>
  );
}
