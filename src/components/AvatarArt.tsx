/**
 * 프로필 캐릭터 그림 2판 (이 게임만의 그림, 2026-11-17 — 사용자: '아이콘만 옆에 붙인 것 말고 퀄리티 있게')
 * 모두 개미(개미리그). 머리 + 어깨까지 그린 상반신에 업적을 '입고 들고' 있음:
 *  - back: 뒤 배경 무늬 (오르는 차트·동전·반짝이·불꽃·비·빛줄기…)
 *  - outfit: 옷 (정장·망토·메달·도복)
 *  - hat: 모자 (왕관·머리띠·새싹·꽃·후광·실크햇·헬멧·기자 모자)
 *  - face: 표정 (웃음·선글라스·눈 감음·별눈·윙크·열혈 눈썹·안경)
 *  - prop: 손에 든 것 (트로피·돈주머니·지구본·모래시계·카드·보석·과녁·방패·로봇·신문·우산·로켓·휴대폰)
 * 64×64 칸, 둥근 바탕색은 Avatar(.pf-av) 가 깔아 줌
 */
import type { ReactNode } from 'react';
import type { AvatarLook } from '../game/avatars';

const INK = '#1d1626';
const HEAD = '#3b2b2b';
const GOLD = '#ffcc3d';
const GOLD_D = '#a8740a';
const HY = -5; // 모자 위치 (머리 꼭대기 y≈15 에 맞춤)

/* ---------------- 배경 무늬 ---------------- */
function Back({ back }: { back?: AvatarLook['back'] }) {
  const w = { fill: 'none', stroke: '#fff', strokeOpacity: 0.28, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (back) {
    case 'rays':
      return (
        <g stroke="#fff" strokeOpacity="0.18" strokeWidth="5">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={32 + Math.cos(a) * 14} y1={30 + Math.sin(a) * 14} x2={32 + Math.cos(a) * 44} y2={30 + Math.sin(a) * 44} />;
          })}
        </g>
      );
    case 'chartUp':
      return (
        <g {...w} strokeWidth="2.6">
          <path d="M3 40 L12 33 L18 36 L27 22 L33 26 L44 10 L52 13 L61 3" />
          <path d="M55 3 H61 V9" />
        </g>
      );
    case 'chartV':
      return (
        <g {...w} strokeWidth="2.6">
          <path d="M3 8 L11 16 L17 13 L24 28 L30 24 L36 14 L44 18 L52 6 L61 4" />
          <circle cx="24" cy="28" r="3" fill="#fff" fillOpacity="0.35" stroke="none" />
        </g>
      );
    case 'chartDown':
      return (
        <g {...w} strokeWidth="2.6">
          <path d="M3 6 L11 12 L17 9 L26 24 L33 20 L44 36 L52 33 L61 44" />
          <path d="M55 44 H61 V38" />
        </g>
      );
    case 'peak':
      return (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 44 L10 36 L16 38 L24 22 L30 25 L38 6" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.6" />
          <path d="M38 6 L44 20 L50 18 L62 46" stroke="#ff6b6b" strokeOpacity="0.8" strokeWidth="2.6" />
          <circle cx="38" cy="6" r="2.6" fill="#ffd34d" stroke="none" />
        </g>
      );
    case 'dizzy':
      return (
        <g fill="#ffd34d">
          {[
            [12, 12],
            [52, 10],
            [56, 26],
          ].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y - 4} l1.2 2.8 3 0.3 -2.3 2 0.7 3 -2.6 -1.6 -2.6 1.6 0.7 -3 -2.3 -2 3 -0.3 Z`} />
          ))}
        </g>
      );
    case 'coins':
      return (
        <g>
          {[
            [9, 12, 5],
            [55, 9, 4],
            [56, 26, 3.2],
            [7, 30, 3.4],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill={GOLD} stroke={GOLD_D} strokeWidth="1" />
              <circle cx={x} cy={y} r={r * 0.55} fill="none" stroke={GOLD_D} strokeWidth="0.8" />
            </g>
          ))}
        </g>
      );
    case 'sparkles':
      return (
        <g fill="#fff" fillOpacity="0.85">
          {[
            [9, 11, 4],
            [55, 9, 3.2],
            [57, 30, 2.4],
            [6, 32, 2.6],
            [50, 20, 1.6],
          ].map(([x, y, r], i) => (
            <path key={i} d={`M${x} ${y - r * 1.6} Q${x} ${y} ${x + r * 1.6} ${y} Q${x} ${y} ${x} ${y + r * 1.6} Q${x} ${y} ${x - r * 1.6} ${y} Q${x} ${y} ${x} ${y - r * 1.6} Z`} />
          ))}
        </g>
      );
    case 'flames':
      return (
        <g>
          {[
            [10, 1],
            [54, -1],
          ].map(([x, s], i) => (
            <g key={i} transform={`translate(${x} 34) scale(${s} 1)`}>
              <path d="M0 26 C-10 18 -8 6 -2 -4 C-1 4 4 6 4 0 C10 8 10 20 0 26 Z" fill="#ff8a3d" />
              <path d="M0 24 C-5 18 -4 11 -1 6 C0 11 3 12 3 9 C6 14 5 20 0 24 Z" fill="#ffd34d" />
            </g>
          ))}
        </g>
      );
    case 'phoenix':
      return (
        <g>
          {[1, -1].map((s) => (
            <g key={s} transform={`translate(32 0) scale(${s} 1) translate(-32 0)`}>
              <path d="M22 40 C10 36 2 26 1 12 C7 20 12 22 16 22 C10 16 9 10 10 4 C15 14 20 20 26 30 Z" fill="#ff7a2f" />
              <path d="M23 38 C14 34 9 28 7 20 C12 25 16 26 19 26 C16 22 15 18 16 14 C19 21 22 26 26 32 Z" fill="#ffc23d" />
            </g>
          ))}
        </g>
      );
    case 'rain':
      return (
        <g stroke="#fff" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round">
          {[
            [6, 30],
            [12, 42],
            [5, 50],
            [58, 30],
            [54, 44],
            [60, 52],
          ].map(([x, y], i) => (
            <line key={i} x1={x} y1={y} x2={x - 2} y2={y + 5} />
          ))}
        </g>
      );
    case 'confetti':
      return (
        <g>
          {[
            [8, 10, '#ffd34d', 20],
            [16, 4, '#ff6b8a', -30],
            [52, 6, '#7ee0ff', 40],
            [58, 18, '#ffd34d', -15],
            [5, 26, '#7ee0ff', 60],
            [59, 34, '#ff6b8a', 10],
            [46, 2, '#b8ff7a', -50],
          ].map(([x, y, c, r], i) => (
            <rect key={i} x={x as number} y={y as number} width="4" height="2.2" rx="0.6" fill={c as string} transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </g>
      );
    case 'zen':
      return (
        <g fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="2">
          <circle cx="32" cy="30" r="22" />
          <circle cx="32" cy="30" r="29" />
        </g>
      );
    case 'cross':
      return (
        <g fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1.6">
          <circle cx="32" cy="30" r="26" />
          <path d="M32 0 V10 M32 50 V64 M0 30 H8 M56 30 H64" />
        </g>
      );
    case 'globe':
      return (
        <g fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.4">
          <circle cx="32" cy="30" r="27" />
          <ellipse cx="32" cy="30" rx="12" ry="27" />
          <path d="M5 30 H59 M9 16 H55 M9 44 H55" />
        </g>
      );
    case 'clock':
      return (
        <g fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="32" cy="30" r="27" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={32 + Math.cos(a) * 23} y1={30 + Math.sin(a) * 23} x2={32 + Math.cos(a) * 26} y2={30 + Math.sin(a) * 26} />;
          })}
        </g>
      );
    case 'news':
      return (
        <g fill="#fff" fillOpacity="0.16">
          {[6, 12, 18].map((y) => (
            <rect key={y} x="4" y={y} width="16" height="3" rx="1.5" />
          ))}
          {[8, 14, 20].map((y) => (
            <rect key={y} x="46" y={y} width="14" height="3" rx="1.5" />
          ))}
        </g>
      );
    case 'circuit':
      return (
        <g fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.6">
          <path d="M2 14 H12 V6 M62 16 H52 V6 M2 40 H8 V48 M62 42 H56 V50" />
          {[
            [12, 6],
            [52, 6],
            [8, 48],
            [56, 50],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#fff" fillOpacity="0.3" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

/* ---------------- 몸·옷 ---------------- */
function Body({ outfit }: { outfit?: AvatarLook['outfit'] }) {
  const torso = 'M13 64 C13 53 21 46.5 32 46.5 C43 46.5 51 53 51 64 Z';
  return (
    <g>
      {outfit === 'cape' && <path d="M7 64 L15 46 L49 46 L57 64 Z" fill="#c8303f" stroke={INK} strokeWidth="1" strokeLinejoin="round" />}
      <path d={torso} fill={outfit === 'suit' ? '#262a36' : outfit === 'robe' ? '#e0782a' : '#4a3434'} />
      {outfit === 'suit' && (
        <g>
          <path d="M26 47.2 L32 58 L38 47.2 Z" fill="#f4f4f4" />
          <path d="M26 47.2 L29.5 64 L24 64 L21 50 Z M38 47.2 L34.5 64 L40 64 L43 50 Z" fill="#1b1e28" />
          <path d="M31 50 H33 L34 57 L32 60 L30 57 Z" fill="#e8475a" />
        </g>
      )}
      {outfit === 'robe' && <path d="M22 48 L40 64 L46 64 L28 47 Z" fill="#a8461c" />}
      {outfit === 'cape' && <circle cx="32" cy="49" r="2.6" fill={GOLD} stroke={GOLD_D} strokeWidth="0.8" />}
      {outfit === 'medal' && (
        <g>
          <path d="M27 46.5 L32 56 L37 46.5" fill="none" stroke="#4a8ad8" strokeWidth="3" />
          <circle cx="32" cy="58" r="4.2" fill="#dfe3ea" stroke="#8a93a3" strokeWidth="1" />
          <path d="M32 55.5 l0.8 1.7 1.8 0.2 -1.3 1.2 0.4 1.8 -1.7 -0.9 -1.7 0.9 0.4 -1.8 -1.3 -1.2 1.8 -0.2 Z" fill="#8a93a3" />
        </g>
      )}
      {/* 어깨 빛 */}
      <path d="M18 54 C21 50 25 48.5 29 48" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/* ---------------- 표정 ---------------- */
function Face({ face }: { face?: AvatarLook['face'] }) {
  const y = 30;
  const L = 24.5;
  const R = 39.5;
  let eyes: ReactNode;
  if (face === 'sad')
    eyes = (
      <g>
        <ellipse cx={L} cy={y} rx="4.4" ry="5" fill="#fff" />
        <ellipse cx={R} cy={y} rx="4.4" ry="5" fill="#fff" />
        <ellipse cx={L} cy={y + 1.6} rx="2.7" ry="3" fill={INK} />
        <ellipse cx={R} cy={y + 1.6} rx="2.7" ry="3" fill={INK} />
        <path d={`M${L - 5} ${y - 6} l8 -2.5 M${R + 5} ${y - 6} l-8 -2.5`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <path d={`M${L - 2} ${y + 6} C${L - 4} ${y + 10} ${L - 4} ${y + 13} ${L - 2} ${y + 13.5} C${L} ${y + 13} ${L} ${y + 10} ${L - 2} ${y + 6} Z`} fill="#7ec8ff" />
      </g>
    );
  else if (face === 'dizzy')
    eyes = (
      <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
        {[L, R].map((x) => (
          <path key={x} d={`M${x} ${y} m-0.5 0 a1 1 0 1 1 1.5 1 a2.4 2.4 0 1 1 -3.6 -2 a3.8 3.8 0 1 1 5.6 3.2`} />
        ))}
      </g>
    );
  else if (face === 'sweat' || face === 'shock')
    eyes = (
      <g>
        <ellipse cx={L} cy={y} rx="5" ry="5.8" fill="#fff" />
        <ellipse cx={R} cy={y} rx="5" ry="5.8" fill="#fff" />
        <circle cx={L} cy={y} r="1.8" fill={INK} />
        <circle cx={R} cy={y} r="1.8" fill={INK} />
        {face === 'sweat' && <path d="M50 17 C47 22 47 25 50 25.5 C53 25 53 22 50 17 Z" fill="#7ec8ff" stroke={INK} strokeWidth="0.6" />}
        {face === 'shock' && <path d={`M${L - 5} ${y - 9} l7 1.5 M${R + 5} ${y - 9} l-7 1.5`} stroke={INK} strokeWidth="1.8" strokeLinecap="round" />}
      </g>
    );
  else if (face === 'cool')
    eyes = (
      <g>
        <path d={`M${L - 7} ${y - 4} H${R + 7}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <path d={`M${L - 6.5} ${y - 4} h12 l-1.2 6 a4 4 0 0 1 -4 3.2 h-1.8 a4 4 0 0 1 -4 -3.2 Z`} fill={INK} />
        <path d={`M${R - 5.5} ${y - 4} h12 l-1.2 6 a4 4 0 0 1 -4 3.2 h-1.8 a4 4 0 0 1 -4 -3.2 Z`} fill={INK} />
        <path d={`M${L - 4} ${y - 2} l3 0 M${R - 3} ${y - 2} l3 0`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
  else if (face === 'zen')
    eyes = (
      <g fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round">
        <path d={`M${L - 3.5} ${y} q3.5 3 7 0 M${R - 3.5} ${y} q3.5 3 7 0`} />
      </g>
    );
  else if (face === 'star') {
    const star = (x: number) => (
      <polygon
        points={Array.from({ length: 10 }, (_, i) => {
          const r = i % 2 ? 2.4 : 5.6;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          return `${(x + Math.cos(a) * r).toFixed(2)},${(y + Math.sin(a) * r).toFixed(2)}`;
        }).join(' ')}
        fill="#ffd34d"
        stroke={INK}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    );
    eyes = (
      <g>
        {star(L)}
        {star(R)}
      </g>
    );
  } else {
    const eye = (x: number, wink: boolean) =>
      wink ? (
        <path d={`M${x - 3.5} ${y + 0.5} q3.5 -3 7 0`} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <g>
          <ellipse cx={x} cy={y} rx="4.6" ry="5.4" fill="#fff" />
          <ellipse cx={x + 0.4} cy={y + 1} rx="2.9" ry="3.4" fill={INK} />
          <circle cx={x + 1.4} cy={y - 0.4} r="1.1" fill="#fff" />
        </g>
      );
    eyes = (
      <g>
        {eye(L, false)}
        {eye(R, face === 'wink')}
        {face === 'brave' && <path d={`M${L - 5} ${y - 9} l9 3 M${R + 5} ${y - 9} l-9 3`} stroke="#ff5a4f" strokeWidth="2.8" strokeLinecap="round" />}
        {face === 'glasses' && (
          <g fill="none" stroke="#dfe6f0" strokeWidth="1.8">
            <circle cx={L} cy={y} r="7" />
            <circle cx={R} cy={y} r="7" />
            <path d={`M${L + 7} ${y - 1} Q32 ${y - 3.5} ${R - 7} ${y - 1}`} />
          </g>
        )}
      </g>
    );
  }
  return (
    <g>
      {eyes}
      {face !== 'cool' && (
        <g fill="#ff8fa3" opacity="0.55">
          <ellipse cx="18" cy="37" rx="3.4" ry="2.2" />
          <ellipse cx="46" cy="37" rx="3.4" ry="2.2" />
        </g>
      )}
      {face === 'sad' ? (
        <path d="M27.5 41 Q32 37.5 36.5 41" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      ) : face === 'shock' ? (
        <ellipse cx="32" cy="40" rx="2.6" ry="3.2" fill="#fff" />
      ) : face === 'dizzy' || face === 'sweat' ? (
        <path d="M26.5 40 q1.4 -1.6 2.8 0 t2.8 0 t2.8 0 t2.8 0" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.8" strokeLinecap="round" />
      ) : face === 'brave' ? (
        <path d="M27.5 38.5 Q32 41.5 36.5 38.5 Z" fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      ) : (
        <path d="M27.5 38.5 Q32 42.5 36.5 38.5" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      )}
    </g>
  );
}

/* ---------------- 모자 ---------------- */
function Hat({ hat }: { hat?: AvatarLook['hat'] }) {
  let el: ReactNode = null;
  switch (hat) {
    case 'crown':
    case 'silverCrown': {
      const c = hat === 'crown' ? GOLD : '#dfe3ea';
      const d = hat === 'crown' ? GOLD_D : '#8a93a3';
      el = (
        <g stroke={d} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M22 20 L21 9 L27 14 L32 6 L37 14 L43 9 L42 20 Z" fill={c} />
          <path d="M22 20 H42" strokeWidth="2" />
          <circle cx="32" cy="14.5" r="1.8" fill="#e8475a" stroke="none" />
          <path d="M24 17 L26 12" stroke="#fff" strokeOpacity="0.6" />
        </g>
      );
      break;
    }
    case 'bigCrown':
      el = (
        <g stroke="#9a6a08" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M17 21 L15 5 L24 12 L32 2 L40 12 L49 5 L47 21 Z" fill={GOLD} />
          <path d="M17 21 H47" strokeWidth="2.2" />
          <circle cx="32" cy="11" r="2.2" fill="#e8475a" stroke="none" />
          <circle cx="23" cy="15" r="1.5" fill="#4aa3ff" stroke="none" />
          <circle cx="41" cy="15" r="1.5" fill="#4aa3ff" stroke="none" />
          <path d="M19 18 L18 9" stroke="#fff" strokeOpacity="0.6" />
        </g>
      );
      break;
    case 'headband':
      el = (
        <g transform="translate(0 -2)">
          <path d="M15 27 Q32 19 49 27 L49 31 Q32 23 15 31 Z" fill="#e8475a" stroke={INK} strokeWidth="1" />
          <path d="M49 28 l7 -4 l-1 6 l6 1 l-8 3 Z" fill="#e8475a" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        </g>
      );
      break;
    case 'sprout':
      el = (
        <g stroke="#1f5a1a" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M32 20 V11" fill="none" strokeWidth="2" strokeLinecap="round" />
          <path d="M32 13 C26 13 22 10 21 5 C27 5 31 8 32 13 Z" fill="#7ed957" />
          <path d="M32 11 C37 11 41 8 43 3 C37 3 33 6 32 11 Z" fill="#5cc23a" />
        </g>
      );
      break;
    case 'flower':
      el = (
        <g stroke="#7a5a08" strokeWidth="1">
          <path d="M32 20 V12" fill="none" stroke="#1f5a1a" strokeWidth="2" strokeLinecap="round" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="32" cy="5.5" rx="3" ry="4.2" fill="#ffd34d" transform={`rotate(${a} 32 9.5)`} />
          ))}
          <circle cx="32" cy="9.5" r="2.6" fill="#e8475a" />
        </g>
      );
      break;
    case 'bandage':
      el = (
        <g transform="translate(0 5) rotate(-18 24 20)" strokeLinejoin="round">
          <rect x="16" y="17" width="16" height="6" rx="2.4" fill="#f2d2b0" stroke={INK} strokeWidth="0.9" />
          <rect x="21" y="17" width="6" height="6" fill="#e2b48c" />
          <circle cx="23" cy="19" r="0.6" fill="#a87a50" />
          <circle cx="25" cy="21" r="0.6" fill="#a87a50" />
        </g>
      );
      break;
    case 'halo':
      el = <ellipse cx="32" cy="9" rx="12" ry="3.6" fill="none" stroke="#ffd34d" strokeWidth="3" />;
      break;
    case 'tophat':
      el = (
        <g stroke={INK} strokeWidth="1" strokeLinejoin="round">
          <path d="M18 20 H46 L44 17 H20 Z" fill="#222" />
          <rect x="23" y="3" width="18" height="15" rx="1.5" fill="#2a2a2a" />
          <rect x="23" y="13" width="18" height="3.4" fill="#e8475a" stroke="none" />
          <path d="M26 5 V12" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.6" />
        </g>
      );
      break;
    case 'gradCap':
      // 졸업모 (튜토리얼 '개미 학교 졸업')
      el = (
        <g stroke={INK} strokeWidth="1" strokeLinejoin="round">
          <path d="M22 17 C22 21 42 21 42 17 V13 H22 Z" fill="#2b2b33" />
          <path d="M10 11 L32 3 L54 11 L32 19 Z" fill="#33333d" />
          <path d="M32 11 L46 15 V24" fill="none" stroke="#f5c542" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="46" cy="25.5" r="2" fill="#f5c542" />
          <path d="M18 9.6 L32 5 L46 9.6" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.2" />
        </g>
      );
      break;
    case 'helmet':
      el = (
        <g stroke={INK} strokeWidth="1" strokeLinejoin="round">
          <path d="M15 24 C15 10 49 10 49 24 Z" fill="#9aa6b8" />
          <path d="M14 24 H50" stroke="#5a6678" strokeWidth="3" strokeLinecap="round" />
          <path d="M32 11 V23" stroke="#5a6678" strokeWidth="2.4" />
          <path d="M21 17 C23 14 26 13 28 13" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
      break;
    case 'newsCap':
      el = (
        <g stroke={INK} strokeWidth="1" strokeLinejoin="round">
          <path d="M15 23 C15 11 47 9 49 21 L49 23 Z" fill="#8a6a4a" />
          <path d="M35 23 C44 22 52 23 55 26 C49 27 40 26 35 25 Z" fill="#6e5236" />
          <circle cx="32" cy="12" r="1.8" fill="#6e5236" />
          <rect x="16" y="17" width="8" height="4.5" rx="0.8" fill="#fff" stroke="none" transform="rotate(-8 20 19)" />
        </g>
      );
      break;
  }
  return el ? <g transform={`translate(0 ${HY})`}>{el}</g> : null;
}

/* ---------------- 든 것 (오른쪽 아래, 손으로 받침) ---------------- */
function Hand({ x, y }: { x: number; y: number }) {
  return <ellipse cx={x} cy={y} rx="3.4" ry="3" fill="#4a3434" stroke={INK} strokeWidth="0.8" />;
}
function Prop({ prop }: { prop?: AvatarLook['prop'] }) {
  switch (prop) {
    case 'trophy':
      return (
        <g strokeLinejoin="round">
          <path d="M40 43 C35 43 35 50 41 50 M54 43 C59 43 59 50 53 50" fill="none" stroke={GOLD_D} strokeWidth="1.8" />
          <path d="M40 41 H54 V46 A7 7 0 0 1 40 46 Z" fill={GOLD} stroke={GOLD_D} strokeWidth="1" />
          <path d="M43 43 V47" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="45.6" y="52.5" width="2.8" height="4" fill={GOLD_D} />
          <rect x="42" y="56" width="10" height="3.6" rx="1" fill={GOLD} stroke={GOLD_D} strokeWidth="1" />
          <Hand x={41} y={58} />
          <Hand x={53} y={58} />
        </g>
      );
    case 'moneybag':
      return (
        <g strokeLinejoin="round">
          <path d="M44 41 L42 37 H52 L50 41 Z" fill="#c9922e" stroke="#7a5410" strokeWidth="1" />
          <path d="M44 41 C36 45 37 60 47 60 C57 60 58 45 50 41 Z" fill="#e2ad48" stroke="#7a5410" strokeWidth="1" />
          <path d="M43.5 41 H50.5" stroke="#7a5410" strokeWidth="2" />
          <text x="47" y="55.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#7a5410">
            ₩
          </text>
          <Hand x={40} y={57} />
        </g>
      );
    case 'globe':
      return (
        <g>
          <circle cx="47" cy="50" r="9" fill="#3a9ad8" stroke={INK} strokeWidth="1" />
          <path d="M41 46 C44 44 46 47 44 49 C42 51 45 53 43 55 C40 53 39 49 41 46 Z M49 43 C53 43 55 46 53 48 C51 49 52 52 55 52 C54 55 50 57 49 55 C48 52 46 49 49 43 Z" fill="#6ad06a" />
          <ellipse cx="44" cy="46" rx="2.4" ry="1.4" fill="#fff" opacity="0.5" />
          <Hand x={41} y={57} />
        </g>
      );
    case 'hourglass':
      return (
        <g strokeLinejoin="round">
          <rect x="39" y="39" width="16" height="3" rx="1" fill="#8a5a2a" />
          <rect x="39" y="58" width="16" height="3" rx="1" fill="#8a5a2a" />
          <path d="M41 42 H53 C53 47 49 49 47 50 C49 51 53 53 53 58 H41 C41 53 45 51 47 50 C45 49 41 47 41 42 Z" fill="#dff3ff" fillOpacity="0.85" stroke={INK} strokeWidth="0.9" />
          <path d="M43.5 44 H50.5 C50 46.5 48 48 47 48.6 C46 48 44 46.5 43.5 44 Z M42.5 57.5 H51.5 C51 55 49 53.6 47 53.2 C45 53.6 43 55 42.5 57.5 Z" fill={GOLD} />
          <Hand x={38} y={56} />
        </g>
      );
    case 'cards':
      return (
        <g strokeLinejoin="round">
          {[
            [-16, '#fff', '#e8475a', '♥'],
            [0, '#fff', INK, '♠'],
            [16, '#fff', '#e8475a', '♦'],
          ].map(([r, f, c, s], i) => (
            <g key={i} transform={`rotate(${r} 47 62)`}>
              <rect x="41.5" y="40" width="11" height="15" rx="1.6" fill={f as string} stroke={INK} strokeWidth="0.9" />
              <text x="47" y="51" textAnchor="middle" fontSize="8" fontWeight="700" fill={c as string}>
                {s}
              </text>
            </g>
          ))}
          <Hand x={45} y={57} />
        </g>
      );
    case 'diamond':
      return (
        <g strokeLinejoin="round">
          <path d="M24 49 L28 44 H36 L40 49 L32 60 Z" fill="#8fdcff" stroke={INK} strokeWidth="1" />
          <path d="M24 49 H40 M28 44 L30 49 L32 60 L34 49 L36 44" fill="none" stroke="#4aa3d8" strokeWidth="0.8" />
          <path d="M28 44 L30 49 H24 Z" fill="#dff6ff" />
          <Hand x={22} y={55} />
          <Hand x={42} y={55} />
        </g>
      );
    case 'target':
      return (
        <g>
          <circle cx="47" cy="50" r="9" fill="#fff" stroke={INK} strokeWidth="1" />
          <circle cx="47" cy="50" r="6.2" fill="#e8475a" />
          <circle cx="47" cy="50" r="3.6" fill="#fff" />
          <circle cx="47" cy="50" r="1.6" fill="#e8475a" />
          <path d="M58 40 L48 49.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M58 40 l1 -4 M58 40 l4 -1" stroke="#e8475a" strokeWidth="1.6" strokeLinecap="round" />
          <Hand x={40} y={57} />
        </g>
      );
    case 'shield':
      return (
        <g strokeLinejoin="round">
          <path d="M47 39 L57 43 V50 C57 56 52 60 47 62 C42 60 37 56 37 50 V43 Z" fill="#4a8ad8" stroke={INK} strokeWidth="1" />
          <path d="M47 42 L54 45 V50 C54 54 51 57 47 59 Z" fill="#7ab4ff" />
          <path d="M42.5 50 L46 53.5 L52 46.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <Hand x={37} y={56} />
        </g>
      );
    case 'robot':
      return (
        <g strokeLinejoin="round">
          <path d="M47 38 V41" stroke={INK} strokeWidth="1.4" />
          <circle cx="47" cy="37.5" r="1.6" fill="#e8475a" />
          <rect x="39" y="41" width="16" height="13" rx="3" fill="#b8c2d2" stroke={INK} strokeWidth="1" />
          <path d="M42 45 l3 3 M45 45 l-3 3 M49 45 l3 3 M52 45 l-3 3" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M43 51 H51" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
          <Hand x={39} y={56} />
        </g>
      );
    case 'wallet':
      return (
        <g strokeLinejoin="round">
          <path d="M38 44 H56 V58 H38 Z" fill="#8a5a3a" stroke={INK} strokeWidth="1" />
          <path d="M38 44 L42 39 H56 V44" fill="#6e4428" stroke={INK} strokeWidth="1" />
          <rect x="49" y="49" width="8" height="5" rx="1.4" fill="#6e4428" stroke={INK} strokeWidth="0.8" />
          <circle cx="51.5" cy="51.5" r="0.9" fill={GOLD} />
          <g transform="translate(46 33)">
            <path d="M0 0 C-3 -3 -6 -1 -4 1 C-6 3 -3 5 0 2 C3 5 6 3 4 1 C6 -1 3 -3 0 0 Z" fill="#d8d0c0" stroke={INK} strokeWidth="0.6" />
          </g>
          <path d="M43 31 q1 -2 2 0 M49 29 q1 -2 2 0" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
          <Hand x={38} y={56} />
        </g>
      );
    case 'fakeNews':
      return (
        <g strokeLinejoin="round">
          <g transform="rotate(-10 47 50)">
            <rect x="37" y="40" width="20" height="18" rx="1.2" fill="#f4f1ea" stroke={INK} strokeWidth="0.9" />
            <rect x="39" y="42" width="16" height="4.2" fill="#2563eb" />
            <text x="47" y="45.6" textAnchor="middle" fontSize="3.6" fontWeight="900" fill="#fff">
              찌라시
            </text>
            <path d="M39 49 H55 M39 52 H50 M39 55 H53" stroke="#9a9a9a" strokeWidth="1.2" />
            <g transform="rotate(-18 48 52)">
              <rect x="40.5" y="48.5" width="15" height="7" rx="1.2" fill="none" stroke="#e8475a" strokeWidth="1.4" />
              <text x="48" y="54" textAnchor="middle" fontSize="5" fontWeight="900" fill="#e8475a">
                가짜
              </text>
            </g>
          </g>
          <Hand x={38} y={57} />
        </g>
      );
    case 'newspaper':
      return (
        <g strokeLinejoin="round">
          <g transform="rotate(-10 47 50)">
            <rect x="37" y="40" width="20" height="18" rx="1.2" fill="#f4f1ea" stroke={INK} strokeWidth="0.9" />
            <rect x="39" y="42" width="16" height="4.2" fill="#e8475a" />
            <text x="47" y="45.6" textAnchor="middle" fontSize="3.6" fontWeight="900" fill="#fff">
              속보
            </text>
            <path d="M39 49 H55 M39 52 H50 M39 55 H53" stroke="#9a9a9a" strokeWidth="1.2" />
          </g>
          <Hand x={38} y={57} />
        </g>
      );
    case 'umbrella':
      // 손잡이 막대는 머리 뒤(AvatarArt 에서 먼저 그림), 여기선 머리 위를 덮는 우산 + 손
      return (
        <g strokeLinejoin="round">
          <path d="M10 15 C12 -4 68 -4 70 15 C66 12 62 12 58 15 C54 12 50 12 46 15 C42 12 38 12 34 15 C30 12 26 12 22 15 C18 12 14 12 10 15 Z" fill="#e8475a" stroke={INK} strokeWidth="1" />
          <path d="M22 15 C24 2 32 -1 40 -1 M46 15 C46 4 42 0 40 -1 M58 15 C56 4 48 0 40 -1" fill="none" stroke="#b8303f" strokeWidth="1" />
          <path d="M18 9 C22 3 28 1 33 0.5" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.4" strokeLinecap="round" />
          <Hand x={52} y={55} />
        </g>
      );
    case 'rocket':
      return (
        <g strokeLinejoin="round" transform="rotate(35 48 48)">
          <path d="M48 32 C53 37 54 46 52 54 H44 C42 46 43 37 48 32 Z" fill="#f4f4f4" stroke={INK} strokeWidth="1" />
          <circle cx="48" cy="43" r="2.6" fill="#4aa3ff" stroke={INK} strokeWidth="0.8" />
          <path d="M44 50 L40 56 L44 55 Z M52 50 L56 56 L52 55 Z" fill="#e8475a" stroke={INK} strokeWidth="0.8" />
          <path d="M45 54 C45 60 48 63 48 63 C48 63 51 60 51 54 Z" fill="#ff8a3d" />
          <path d="M46.6 54 C46.6 58 48 60 48 60 C48 60 49.4 58 49.4 54 Z" fill="#ffd34d" />
        </g>
      );
    case 'phone':
      return (
        <g strokeLinejoin="round">
          <rect x="40" y="38" width="13" height="22" rx="2.4" fill="#222" stroke={INK} strokeWidth="1" />
          <rect x="41.6" y="41" width="9.8" height="15" rx="1" fill="#0f2b1e" />
          <path d="M42.6 53 L45 49 L47 51 L50.6 44" fill="none" stroke="#ff5a5a" strokeWidth="1.4" strokeLinecap="round" />
          <Hand x={41} y={58} />
        </g>
      );
    default:
      return null;
  }
}

/* ---------------- 개미 ---------------- */
export function AvatarArt({ look, size }: { look: AvatarLook; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="av-glow" cx="0.5" cy="0.38" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="av-head" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#5e4646" />
          <stop offset="0.6" stopColor={HEAD} />
          <stop offset="1" stopColor="#241818" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill="url(#av-glow)" />
      <Back back={look.back} />
      <Body outfit={look.outfit} />
      {look.prop === 'umbrella' && <path d="M40 2 L52 54 C53 59 48 60 47 56" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />}
      {/* 더듬이 */}
      <path d="M26 17 C23 10 19 6 14 5 M38 17 C41 10 45 6 50 5" fill="none" stroke={HEAD} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="13.5" cy="5" r="3" fill={HEAD} />
      <circle cx="50.5" cy="5" r="3" fill={HEAD} />
      {/* 머리 */}
      <ellipse cx="32" cy="31" rx="18" ry="16" fill="url(#av-head)" />
      <ellipse cx="25" cy="22" rx="6.5" ry="3.4" fill="#fff" opacity="0.14" transform="rotate(-22 25 22)" />
      <Face face={look.face} />
      <Hat hat={look.hat} />
      <Prop prop={look.prop} />
    </svg>
  );
}
