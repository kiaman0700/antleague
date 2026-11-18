/** 랭킹 티어 표시: 금속 테두리 방패 + 가운데 깎은 보석(이 게임만의 그림) + 티어 이름 + 단계 점수. 배치 중이면 '배치 n/2' */
import { CHALLENGER_MIN, isPlaced, MASTER_MIN, PLACEMENT_GAMES, TIERS, tierOf } from '../game/tier';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const TIER_LEVEL: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4, master: 5 };

/** 색 섞기: c 를 to 쪽으로 k 만큼 (#rrggbb) */
function mix(c: string, to: string, k: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(c);
  const b = p(to);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// 방패: 위가 뾰족하고 어깨가 각진 모양 (가운데를 기준으로 줄여 겹겹이 그림)
const SHIELD = 'M20 2.5 L33.5 8 L35 20.5 C34.2 28.8 28.4 34.6 20 38.8 C11.6 34.6 5.8 28.8 5 20.5 L6.5 8 Z';
const at = (k: number) => `translate(20 20.5) scale(${k}) translate(-20 -20.5)`;
const f2 = (n: number) => n.toFixed(2);

/** 날 하나(왼쪽): 시작점에서 각도 a(도) 방향으로 길이 len, 두께 w 인 나뭇잎 모양 + 가운데 밝은 결 */
function blade(ox: number, oy: number, a: number, len: number, w: number): [string, string] {
  const r = (a * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const mx = ox + dx * len * 0.45;
  const my = oy + dy * len * 0.45;
  const shape = `M${ox} ${oy} Q${f2(mx - dy * w)} ${f2(my + dx * w)} ${f2(ox + dx * len)} ${f2(oy + dy * len)} Q${f2(mx + dy * w)} ${f2(my - dx * w)} ${ox} ${oy} Z`;
  const vein = `M${f2(ox + dx * len * 0.12)} ${f2(oy + dy * len * 0.12)} L${f2(ox + dx * len * 0.78)} ${f2(oy + dy * len * 0.78)}`;
  return [shape, vein];
}

/** 수정 조각(각도 a, 길이 len): 밝은 반쪽 + 어두운 반쪽 */
function shard(ox: number, oy: number, a: number, len: number, w: number): [string, string] {
  const r = (a * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const P = (t: number, s: number) => `${f2(ox + dx * len * t - dy * s)} ${f2(oy + dy * len * t + dx * s)}`;
  return [`M${P(0, 0)} L${P(0.3, w)} L${P(0.8, w * 0.7)} L${P(1, 0)} Z`, `M${P(0, 0)} L${P(0.3, -w)} L${P(0.8, -w * 0.7)} L${P(1, 0)} Z`];
}

/**
 * 티어 엠블럼 3판 (2026-11-17 사용자 요청 '더 퀄리티 있게'): 금속 질감 테두리 + 깊은 안쪽 면(오르는 차트 선을 새김) + 여러 면으로 깎은 보석 + 아래 띠.
 * 티어가 오를수록 방패 밖 장식이 늘어남 — 브론즈 방패만 · 실버 옆 날·어깨 못 · 골드 날개 · 플래티넘 위 첨탑 · 다이아몬드 수정 조각·은은한 빛 · 마스터 왕관과 큰 날개.
 * 같은 티어 안 단계(1 → 2 → 3, 3이 가장 높음)는 아래 띠의 보석 수(1~3)와 장식 길이로 보여 줌
 */
export function TierEmblem({ rating, placed = true, size = 28, challenger }: { rating: number; placed?: boolean; size?: number; /** 챌린저면 #순위 (서버가 정함) */ challenger?: number }) {
  const t = tierOf(rating);
  // 챌린저: 마스터 위 — 같은 방패 계열, 진주빛 금속 + 무지갯빛 후광 + 빨간 핵 보석 (사용자: 챌린저도 다른 티어와 비슷하게)
  const chal = placed && !!challenger;
  const base = chal ? '#cfc4ef' : placed ? t.color : '#7a7a7a';
  const light = mix(base, '#ffffff', 0.62);
  const shine = mix(base, '#ffffff', 0.85);
  const mid = mix(base, '#000000', 0.18);
  const dark = mix(base, '#000000', 0.5);
  const deep = mix(base, '#000000', 0.78);
  const lv = chal ? 6 : placed ? (TIER_LEVEL[t.id] ?? 0) : -1;
  const dv = !placed ? 0 : lv >= 5 ? 3 : t.division === '3' ? 2 : t.division === '2' ? 1 : 0;
  const pips = !placed || lv >= 5 ? 0 : dv + 1;
  const id = `te-${chal ? 'challenger' : placed ? t.id : 'none'}`;
  const metal = `url(#${id}-m)`;
  const gem = `url(#${id}-g)`;
  const grow = dv * 0.9;
  const gold = `url(#${id}-au)`;

  // 날개: 티어가 오를수록 깃이 많아지고 길어지며 화려해짐 (사용자 요청) — 실버 2 · 골드 3 · 플래티넘 3+안쪽 깃 · 다이아 4+안쪽 깃+끝 보석 · 마스터 5 · 챌린저 6
  const blades: [string, string][] = [];
  const inner: [string, string][] = [];
  const NB = [0, 2, 3, 3, 4, 5, 6][lv] ?? 0;
  const LEN = [0, 9.5, 13, 14, 15, 16, 17][lv] ?? 0;
  for (let i = 0; i < NB; i++) {
    const step = NB > 4 ? 3.6 : 4.4;
    blades.push(blade(6.2, 10 + i * step, 198 + i * (NB > 4 ? 11 : 14), LEN + grow - i * (NB > 4 ? 1.6 : 2.2), lv >= 4 ? 3.1 : 2.8));
  }
  if (lv >= 3) for (let i = 0; i < NB - 1; i++) inner.push(blade(6.6, 12 + i * (NB > 4 ? 3.6 : 4.4), 204 + i * (NB > 4 ? 11 : 14), (LEN + grow) * 0.62 - i * 1.2, 1.9));
  // 날개 끝 보석 (다이아몬드부터): 맨 위 깃 끝
  const tips = lv >= 4 ? blades.slice(0, lv >= 6 ? 3 : lv >= 5 ? 2 : 1).map((_, i) => {
    const a = ((198 + i * (NB > 4 ? 11 : 14)) * Math.PI) / 180;
    const L = LEN + grow - i * (NB > 4 ? 1.6 : 2.2);
    return [6.2 + Math.cos(a) * L, 10 + i * (NB > 4 ? 3.6 : 4.4) + Math.sin(a) * L] as [number, number];
  }) : [];
  // 다이아몬드 수정: 플래티넘 첨탑보다 크게, 마스터 왕관보다는 작게
  const shards = lv === 4 ? [-122, -100, -80, -58].map((a, i) => shard(20, 8.5, a, (i === 1 || i === 2 ? 12.5 : 9.5) + grow * 0.5, 2.6)) : [];
  const bladeEl = (d: string, v: string) => (
    <>
      <path d={d} fill={lv >= 5 ? gold : metal} stroke={lv >= 5 ? (lv === 6 ? '#3b3466' : '#24124f') : deep} strokeWidth="0.6" />
      <path d={v} fill="none" stroke={shine} strokeOpacity="0.7" strokeWidth="0.55" strokeLinecap="round" />
    </>
  );

  return (
    // 장식(날개·왕관) 자리만큼 그림 칸이 넓어져 방패가 작아지지 않게 1.3배로 그림
    <svg className="tier-emblem" width={Math.round(size * 1.3)} height={Math.round(size * 1.3)} viewBox="-7 -8 54 54" aria-hidden>
      <defs>
        <linearGradient id={`${id}-m`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={shine} />
          <stop offset="0.3" stopColor={light} />
          <stop offset="0.5" stopColor={base} />
          <stop offset="0.62" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`${id}-f`} cx="0.5" cy="0.32" r="0.78">
          <stop offset="0" stopColor={mix(base, '#000000', 0.4)} />
          <stop offset="1" stopColor={mix(base, '#000000', 0.88)} />
        </radialGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shine} />
          <stop offset="0.55" stopColor={light} />
          <stop offset="1" stopColor={base} />
        </linearGradient>
        <filter id={`${id}-sh`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.4" floodColor="#000" floodOpacity="0.55" />
        </filter>
        <linearGradient id={`${id}-bv`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* 단계 보석: 티어 색이 살아 있게 (밝은 꼭대기 → 티어 색 → 짙은 아래) */}
        <linearGradient id={`${id}-pg`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.45" stopColor={base} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        {/* 마스터: 보라 금속 테두리·왕관·날개 (사용자: 금색 말고 마스터의 보라색 그대로 — 골드 티어와 헷갈리지 않게) */}
        {lv === 6 ? (
          <linearGradient id={`${id}-au`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.3" stopColor="#f1ecff" />
            <stop offset="0.55" stopColor="#c9c0e6" />
            <stop offset="0.8" stopColor="#8d84b3" />
            <stop offset="1" stopColor="#4a4270" />
          </linearGradient>
        ) : (
          <linearGradient id={`${id}-au`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#f3ecff" />
            <stop offset="0.28" stopColor="#cdb6ff" />
            <stop offset="0.55" stopColor="#9a74f2" />
            <stop offset="0.78" stopColor="#6a45c9" />
            <stop offset="1" stopColor="#36206e" />
          </linearGradient>
        )}
        <linearGradient id={`${id}-halo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4d6d" />
          <stop offset="0.5" stopColor="#9a74f2" />
          <stop offset="1" stopColor="#36c5f0" />
        </linearGradient>
        <radialGradient id={`${id}-o`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={base} stopOpacity="0.5" />
          <stop offset="1" stopColor={base} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 마스터: 단계가 없는 대신 가장 화려하게 (사용자 요청 2026-11-18) — 뒤에서 천천히 도는 빛줄기 */}
      {/* 다이아몬드·마스터: 뒤 은은한 빛 */}
      {lv >= 4 && <circle cx="20" cy="18" r={lv >= 5 ? 26 : 23} fill={`url(#${id}-o)`} />}
      {lv === 6 && (
        <g>
          <circle cx="20" cy="19" r="23.5" fill="none" stroke={`url(#${id}-halo)`} strokeWidth={size < 40 ? 2.4 : 1.8} />
          {size >= 40 && <circle cx="20" cy="19" r="21.6" fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.5" />}
        </g>
      )}

      {/* 뒤 장식 */}
      {shards.map(([a, b], i) => (
        <g key={i} stroke={deep} strokeWidth="0.5" strokeLinejoin="round">
          <path d={a} fill={light} />
          <path d={b} fill={mid} />
        </g>
      ))}
      {blades.length > 0 && (
        <g strokeLinejoin="round">
          {blades.map(([d, v], i) => (
            <g key={i}>
              {bladeEl(d, v)}
              <g transform="matrix(-1 0 0 1 40 0)">{bladeEl(d, v)}</g>
            </g>
          ))}
          {/* 안쪽 깃: 밝은 색 한 겹 더 (플래티넘부터) */}
          {inner.map(([d], i) => (
            <g key={'i' + i} fill={lv >= 5 ? '#f3ecff' : shine} fillOpacity="0.55" stroke="none">
              <path d={d} />
              <path d={d} transform="matrix(-1 0 0 1 40 0)" />
            </g>
          ))}
          {tips.map(([x, y], i) =>
            [x, 40 - x].map((xx, k) => (
              <path key={i + '-' + k} d={`M${f2(xx)} ${f2(y - 1.9)} L${f2(xx + 1.4)} ${f2(y)} L${f2(xx)} ${f2(y + 1.9)} L${f2(xx - 1.4)} ${f2(y)} Z`} fill={lv === 6 ? '#d9364b' : gem} stroke={deep} strokeWidth="0.35" />
            )),
          )}
        </g>
      )}
      {lv === 3 && (
        <g fill={metal} stroke={deep} strokeWidth="0.6" strokeLinejoin="round">
          {/* 플래티넘 첨탑: 다이아 수정보다 작게 (사용자 의견) */}
          <path d={`M20 ${-1.2 - grow * 0.6} L22.2 3.6 L20 5.6 L17.8 3.6 Z`} />
          <path d={`M8.6 8.6 L${7.2 - grow * 0.3} ${2.6 - grow * 0.4} L11.6 6.4 Z`} />
          <path d={`M31.4 8.6 L${32.8 + grow * 0.3} ${2.6 - grow * 0.4} L28.4 6.4 Z`} />
        </g>
      )}
      {lv >= 5 && (
        // 왕관 (다이아 원석보다 크게 — 사용자 의견): 봉우리 끝 보석, 가운데 큰 보석, 아래 테에 작은 구슬 줄. 챌린저는 진주 왕관 + 빨간 보석
        <g stroke={lv === 6 ? '#3b3466' : '#24124f'} strokeWidth="0.6" strokeLinejoin="round" transform="translate(20 7.5) scale(1.22) translate(-20 -7.5)">
          <path d="M8.6 7 L7.4 -3.2 L12.6 1.2 L15.6 -5.2 L20 0.2 L24.4 -5.2 L27.4 1.2 L32.6 -3.2 L31.4 7 Q20 4 8.6 7 Z" fill={gold} />
          <path d="M9.6 5.2 Q20 2.6 30.4 5.2" fill="none" stroke="#f3ecff" strokeOpacity="0.75" strokeWidth="0.55" />
          {[[7.4, -3.2, 1.25], [15.6, -5.2, 1.35], [24.4, -5.2, 1.35], [32.6, -3.2, 1.25]].map(([x, y, r], k) => (
            <g key={k}>
              <path d={`M${x} ${y + 3 - r * 1.3} L${x + r} ${y + 3} L${x} ${y + 3 + r * 1.3} L${x - r} ${y + 3} Z`} fill={lv === 6 ? '#d9364b' : gem} stroke={deep} strokeWidth="0.4" />
              <path d={`M${x} ${y + 3 - r * 1.3} L${x - r} ${y + 3} L${x} ${y + 3}`} fill="#ffffff" opacity="0.55" stroke="none" />
            </g>
          ))}
          <path d="M20 -4.6 L22.6 -1 L20 2.8 L17.4 -1 Z" fill={lv === 6 ? '#d9364b' : gem} stroke={deep} strokeWidth="0.45" />
          <path d="M20 -4.6 L17.4 -1 L20 -1 Z" fill="#ffffff" opacity="0.6" stroke="none" />
          {[11.5, 14.6, 17.6, 22.4, 25.4, 28.5].map((x, k) => (
            <circle key={k} cx={x} cy={4.7 - Math.sin(((x - 8.6) / 22.8) * Math.PI) * 0.9} r="0.55" fill="#f3ecff" stroke="none" />
          ))}
        </g>
      )}

      {lv >= 5 && <path d={SHIELD} transform={at(1.1)} fill="none" stroke={gold} strokeWidth="1.5" strokeLinejoin="round" />}
      {/* 방패: 바깥 금속 테두리 → 어두운 홈 → 안쪽 면 (그림자로 띄우고, 테두리에 빛·그늘을 넣어 입체로) */}
      <path d={SHIELD} fill={lv >= 5 ? gold : metal} stroke={lv >= 5 ? (lv === 6 ? '#3b3466' : '#24124f') : deep} strokeWidth="0.8" strokeLinejoin="round" filter={`url(#${id}-sh)`} />
      <path d={SHIELD} transform={at(0.93)} fill="none" stroke={`url(#${id}-bv)`} strokeWidth="1.1" strokeLinejoin="round" />
      <path d={SHIELD} transform={at(0.86)} fill={deep} />
      <path d={SHIELD} transform={at(0.8)} fill={`url(#${id}-f)`} stroke={mix(base, '#000000', 0.25)} strokeWidth="0.5" />
      {lv >= 2 && (
        <g fill={light} fillOpacity="0.32">
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <ellipse cx={10.6 + k * 0.5} cy={28 - k * 3.6} rx="1.1" ry="2.1" transform={`rotate(${-30 + k * 8} ${10.6 + k * 0.5} ${28 - k * 3.6})`} />
              <ellipse cx={29.4 - k * 0.5} cy={28 - k * 3.6} rx="1.1" ry="2.1" transform={`rotate(${30 - k * 8} ${29.4 - k * 0.5} ${28 - k * 3.6})`} />
            </g>
          ))}
        </g>
      )}
      {/* 안쪽 면에 새긴 오르는 차트 선 (이 게임 표시) */}
      <path d="M9.5 27.5 L14 23.5 L17 25.5 L23 18.5 L26 20.5 L30.5 14.5" fill="none" stroke={light} strokeOpacity="0.16" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* 테두리 반사광 */}
      <path d="M8 9 L20 4.2 L32 9" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.8" strokeLinecap="round" />
      {/* 어깨 장식 못 (실버부터) */}
      {lv >= 1 && (
        <g fill={shine} stroke={deep} strokeWidth="0.4">
          <circle cx="8.1" cy="9.4" r="0.9" />
          <circle cx="31.9" cy="9.4" r="0.9" />
        </g>
      )}

      {placed ? (
        // 가운데 깎은 보석: 바깥 네 면 + 가운데 평평한 면(테이블) — 면마다 밝기를 달리해 입체로
        <g strokeLinejoin="round">
          <path d="M20 10 L27.6 20 L20 30.5 L12.4 20 Z" fill={deep} />
          <path d="M20 10 L12.4 20 L16 20 L20 14.6 Z" fill={shine} />
          <path d="M20 10 L27.6 20 L24 20 L20 14.6 Z" fill={light} />
          <path d="M12.4 20 L20 30.5 L20 25.6 L16 20 Z" fill={mid} />
          <path d="M27.6 20 L20 30.5 L20 25.6 L24 20 Z" fill={dark} />
          <path d="M20 14.6 L24 20 L20 25.6 L16 20 Z" fill={lv === 6 ? '#d9364b' : gem} />
          <path d="M20 10 L27.6 20 L20 30.5 L12.4 20 Z" fill="none" stroke={shine} strokeWidth="0.6" />
          <path d="M17.6 18.2 L20 15.6" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="0.9" strokeLinecap="round" />
          {lv >= 2 && <path d="M16 13.2 l0.55 1.45 l1.45 0.55 l-1.45 0.55 l-0.55 1.45 l-0.55 -1.45 l-1.45 -0.55 l1.45 -0.55 z" fill="#ffffff" opacity="0.95" />}
        </g>
      ) : (
        <text x="20" y="25.5" textAnchor="middle" fontSize="13" fontWeight="800" fill={light}>
          ?
        </text>
      )}

      {lv >= 5 && (
        <g clipPath={`url(#${id}-c)`}>
          <rect className="te-sweep" x="-12" y="0" width="10" height="44" fill={`url(#${id}-s)`} transform="skewX(-18)" />
        </g>
      )}
      {lv >= 5 && (
        // 금 리본 + 가운데 보라 보석
        <g strokeLinejoin="round">
          <path d="M2.5 42.6 L-1.5 46 L5 45.4 Z M37.5 42.6 L41.5 46 L35 45.4 Z" fill={lv === 6 ? '#8d84b3' : '#5a3aa8'} stroke={lv === 6 ? '#3b3466' : '#24124f'} strokeWidth="0.5" />
          <path d="M4.5 37 Q20 43.5 35.5 37 L37.5 42.6 Q20 49.6 2.5 42.6 Z" fill={gold} stroke={lv === 6 ? '#3b3466' : '#24124f'} strokeWidth="0.6" />
          <path d="M6 39.4 Q20 45 34 39.4" fill="none" stroke="#f3ecff" strokeOpacity="0.6" strokeWidth="0.5" />
          {/* 띠 보석: 마스터 4개 · 챌린저 좌우 2개씩 + 가운데 순위 (사용자 제안) */}
          {(lv === 6 ? [7.6, 12.9, 27.1, 32.4] : [8.8, 16.2, 23.8, 31.2]).map((x, k) => {
            const y = 43.3 - 2.9 * ((x - 20) / 15) ** 2;
            const r = 2.3;
            return (
              <g key={k}>
                <path d={`M${x} ${f2(y - r * 1.2)} L${x + r} ${f2(y)} L${x} ${f2(y + r * 1.2)} L${x - r} ${f2(y)} Z`} fill={lv === 6 ? '#d9364b' : `url(#${id}-pg)`} stroke={lv === 6 ? '#3b3466' : '#24124f'} strokeWidth="0.4" />
                <path d={`M${x} ${f2(y - r * 1.2)} L${x - r} ${f2(y)} L${x - 0.7} ${f2(y)} L${x} ${f2(y - 0.6)} Z`} fill="#ffffff" opacity="0.7" />
              </g>
            );
          })}
          {lv === 6 &&
            (size >= 40 ? (
              <text x="20" y="45.4" textAnchor="middle" fontSize="5.4" fontWeight="900" fill="#d9364b">
                {challenger && challenger > 0 ? `#${challenger}` : '#1'}
              </text>
            ) : (
              <circle cx="20" cy="43.3" r="1.6" fill="#ffffff" stroke="#d9364b" strokeWidth="0.6" />
            ))}
        </g>
      )}
      {/* 아래 띠 + 단계 보석 (1단계 1개 · 2단계 2개 · 3단계 3개) */}
      {pips > 0 && (
        <g>
          <path d="M5.5 37 Q20 42.2 34.5 37 L36.8 43.4 Q20 49.6 3.2 43.4 Z" fill={metal} stroke={deep} strokeWidth="0.6" strokeLinejoin="round" />
          {/* 박힌 보석: 단계 수만큼 밝게 깎은 보석 (빈 홈 없음) */}
          {Array.from({ length: pips }, (_, i) => {
            const x = 20 - (pips - 1) * 5 + i * 10;
            const y = 42.6;
            return (
              <g key={i} strokeLinejoin="round">
                <path d={`M${x} ${y - 3.6} L${x + 3.1} ${y} L${x} ${y + 3.6} L${x - 3.1} ${y} Z`} fill={deep} />
                <path d={`M${x} ${y - 3.1} L${x + 2.6} ${y} L${x} ${y + 3.1} L${x - 2.6} ${y} Z`} fill={`url(#${id}-pg)`} stroke={shine} strokeWidth="0.4" />
                <path d={`M${x} ${y - 3.1} L${x - 2.6} ${y} L${x - 0.9} ${y} L${x} ${y - 1.4} Z`} fill="#ffffff" opacity="0.75" />
                <path d={`M${x} ${y + 3.1} L${x + 2.6} ${y} L${x + 0.9} ${y} L${x} ${y + 1.4} Z`} fill={deep} opacity="0.5" />
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

/** "골드 II · 23점" 또는 "언랭크 · 배치 1/2" */
export const CHALLENGER_COLOR = '#ff6b85';
export function tierText(rating: number, rankedGames: number | null | undefined, chal?: number) {
  if (!isPlaced(rankedGames)) return `언랭크 · 배치 ${rankedGames ?? 0}/${PLACEMENT_GAMES}`;
  if (chal) return `챌린저 #${chal} · ${Math.max(0, Math.round(rating - MASTER_MIN))}점`;
  const t = tierOf(rating);
  return `${t.label} · ${t.points}점`;
}

export function TierBadge({ rating, rankedGames, size = 28, showPoints = true, chal }: { rating: number; rankedGames: number | null | undefined; size?: number; showPoints?: boolean; /** 챌린저 #순위 */ chal?: number }) {
  const placed = isPlaced(rankedGames);
  const t = tierOf(rating);
  const isChal = placed && !!chal;
  return (
    <span className={'tier-badge' + (isChal ? ' t-challenger' : placed ? ' t-' + t.id : ' t-unplaced')}>
      <TierEmblem rating={rating} placed={placed} size={size} challenger={isChal ? chal : undefined} />
      <span className="tb-txt">
        <b style={isChal ? { color: CHALLENGER_COLOR } : placed ? { color: t.color } : undefined}>{isChal ? `챌린저 #${chal}` : placed ? t.label : '언랭크'}</b>
        {showPoints && <small>{placed ? `${t.points}점` : `${rankedGames ?? 0}/${PLACEMENT_GAMES}판`}</small>}
      </span>
    </span>
  );
}

/** 짧게: "골드 2" 또는 "언랭크" (친구·파티 목록용) */
export function tierShort(rating: number, rankedGames: number | null | undefined, chal?: number) {
  return isPlaced(rankedGames) ? (chal ? `챌린저 #${chal}` : tierOf(rating).label) : '언랭크';
}

/**
 * 티어표: 브론즈 → 마스터로 오르는 계단. 계단이 높아질수록 그림도 커지고, 계단 안에 단계 1 · 2 · 3 (3이 가장 높음).
 * mine 을 주면 내 티어에 '나' 표시
 */
export function TierLadder({ mine }: { mine?: { rating: number; rankedGames: number | null | undefined; chal?: number } }) {
  const my = mine && isPlaced(mine.rankedGames) ? tierOf(mine.rating) : null;
  // 휴대폰처럼 좁아 옆으로 밀어야 할 때: 내 티어가 보이게 옮겨 두고, 끝까지 안 밀었으면 오른쪽을 흐리게 + 안내
  const ref = useRef<HTMLOListElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const me = el.querySelector<HTMLElement>('.tl-step.me');
    if (me && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, me.offsetLeft - el.offsetLeft - 8);
    const upd = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    return () => {
      el.removeEventListener('scroll', upd);
      window.removeEventListener('resize', upd);
    };
  }, [my?.id, mine?.chal]);
  return (
    <section className={'panel pad tier-ladder' + (more ? ' tl-more' : '')} aria-label="랭킹 티어">
      <h3>
        <Icon name="crown" size={18} /> 랭킹 티어
      </h3>
      <p className="muted small">배치 2판 뒤 점수로 정해져요. 단계는 100점씩, 3이 가장 높아요. 챌린저는 2,500점 넘는 상위 1%예요.</p>
      <ol className="tl-stairs" ref={ref}>
        {TIERS.map((t, i) => {
          const base = t.id === 'bronze' ? 700 : t.min;
          const here = my?.id === t.id;
          return (
            <li key={t.id} className={'tl-step' + (here ? ' me' : '')} style={{ ['--tc' as string]: t.color, ['--h' as string]: `${86 + i * 18}px` }}>
              <div className="tl-emb">
                <TierEmblem rating={t.id === 'master' ? MASTER_MIN : base + 200} size={40 + i * 5} />
              </div>
              <div className="tl-block">
                {here && <span className="tl-me">나</span>}
                <b>{t.name}</b>
                <small>{t.id === 'bronze' ? '1,000점 아래' : t.min.toLocaleString() + '점'}</small>
                {t.id !== 'master' ? (
                  <span className="tl-divs" aria-label={`${t.name} 1, 2, 3단계`}>
                    {(['1', '2', '3'] as const).map((dv, k) => (
                      <span key={dv} className={'tl-div' + (here && my?.division === dv ? ' me' : '')} title={`${t.name} ${dv}`}>
                        {/* 단계가 높을수록 보석이 늘어남 (1개 → 3개) — 3이 가장 높음 */}
                        <span className="tl-pips" aria-hidden>
                          {Array.from({ length: k + 1 }, (_, g) => (
                            <svg key={g} width="9" height="11" viewBox="0 0 9 11">
                              <path d="M4.5 0.6 L8.4 5.5 L4.5 10.4 L0.6 5.5 Z" fill={t.color} stroke="#0008" strokeWidth="0.8" />
                              <path d="M4.5 0.6 L6.3 4.2 L4.5 5.5 L2.7 4.2 Z" fill="#fff" fillOpacity="0.55" />
                            </svg>
                          ))}
                        </span>
                        <i>{dv}</i>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="tl-top">점수 순위</span>
                )}
              </div>
            </li>
          );
        })}
        {/* 챌린저: 마스터 중 2500점 이상 · 상위 1%(3~50자리) · 최근 7일 랭킹전 — 자리가 정해져 있음 */}
        <li className={'tl-step tl-chal' + (mine?.chal ? ' me' : '')} style={{ ['--tc' as string]: CHALLENGER_COLOR, ['--h' as string]: `${86 + TIERS.length * 18}px` }}>
          <div className="tl-emb">
            <TierEmblem rating={CHALLENGER_MIN} size={40 + TIERS.length * 5} challenger={mine?.chal || -1} />
          </div>
          <div className="tl-block">
            {mine?.chal ? <span className="tl-me">나</span> : null}
            <b>챌린저</b>
            <small>2,500점 이상</small>
            <span className="tl-top">상위 1% · 최고 티어</span>
          </div>
        </li>
      </ol>
      {more && <p className="muted small tl-hint">옆으로 밀면 위 티어도 보여요 →</p>}
    </section>
  );
}
