/**
 * 개미폰 SNS·방송 글에 붙는 그림 — 이 게임에서 직접 그린 단순한 장면(외부 사진 없음).
 * 장면·하늘·색은 글 내용 해시와 공개된 값(업종·호재/악재)으로만 고름 → 같은 글은 늘 같은 그림, 그림으로 진위가 보이지 않음.
 */
import { useId } from 'react';
import { SectorIcon } from './Icon';

export type ArtScene = 'chart' | 'factory' | 'tower' | 'meeting' | 'product' | 'broadcast' | 'ant';
const SCENES: ArtScene[] = ['chart', 'factory', 'tower', 'meeting', 'product', 'broadcast', 'ant'];

export function artHash(t: string): number {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
  return x >>> 0;
}

/** 글 하나의 그림 고르기 (테스트에서도 씀) — 진위·들썩임 같은 서버 값은 받지 않음 */
export function pickArt(p: { id: string; text: string; sector: string; tone: 'good' | 'bad' }, only?: ArtScene[]): { scene: ArtScene; sky: number; seed: number } {
  const h = artHash(p.text + '|' + p.sector);
  const list = only ?? SCENES;
  return { scene: list[h % list.length], sky: (h >>> 8) % 3, seed: h };
}

/** 개미리그 개미 머리 (앱 아이콘·글쓴이 사진·그림 속 사람 자리) — SVG 안에 넣는 조각 */
export function AntHead({ cx, cy, r, fill, face = '#1a1a1a', mood = 'smile', hat }: { cx: number; cy: number; r: number; fill: string; face?: string; mood?: 'smile' | 'sad' | 'plain'; hat?: string }) {
  const w = Math.max(0.6, r * 0.16);
  return (
    <g>
      <path d={`M${cx - r * 0.42} ${cy - r * 0.78} q${-r * 0.25} ${-r * 0.62} ${-r * 0.78} ${-r * 0.62} M${cx + r * 0.42} ${cy - r * 0.78} q${r * 0.25} ${-r * 0.62} ${r * 0.78} ${-r * 0.62}`} stroke={fill} strokeWidth={w} strokeLinecap="round" fill="none" />
      <circle cx={cx - r * 1.2} cy={cy - r * 1.4} r={w * 1.15} fill={fill} />
      <circle cx={cx + r * 1.2} cy={cy - r * 1.4} r={w * 1.15} fill={fill} />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.9} fill={fill} />
      {hat && <path d={`M${cx - r * 1.05} ${cy - r * 0.35} a${r * 1.05} ${r * 0.85} 0 0 1 ${r * 2.1} 0 z`} fill={hat} />}
      <ellipse cx={cx - r * 0.36} cy={cy - r * 0.06} rx={r * 0.17} ry={r * 0.23} fill={face} />
      <ellipse cx={cx + r * 0.36} cy={cy - r * 0.06} rx={r * 0.17} ry={r * 0.23} fill={face} />
      {r >= 5 && mood !== 'plain' && (
        <path d={mood === 'smile' ? `M${cx - r * 0.3} ${cy + r * 0.34} q${r * 0.3} ${r * 0.3} ${r * 0.6} 0` : `M${cx - r * 0.3} ${cy + r * 0.5} q${r * 0.3} ${-r * 0.26} ${r * 0.6} 0`} stroke={face} strokeWidth={Math.max(0.7, r * 0.1)} strokeLinecap="round" fill="none" />
      )}
    </g>
  );
}

const SKIES = [
  ['#2a3550', '#55406a'], // 새벽
  ['#3d5f8c', '#7a9cc6'], // 낮
  ['#141824', '#2b2440'], // 밤
];

export function PostArt({ p, ratio = 'wide', only, label }: { p: { id: string; text: string; sector: string; tone: 'good' | 'bad' }; ratio?: 'wide' | 'square'; only?: ArtScene[]; label?: string }) {
  const { scene, sky, seed } = pickArt(p, only);
  const uid = useId().replace(/:/g, '');
  const W = 160;
  const H = ratio === 'square' ? 160 : 100;
  const up = p.tone === 'good';
  const accent = up ? '#e5484d' : '#3b82f6';
  const [s0, s1] = SKIES[sky];
  const r = (n: number) => ((seed >>> n) & 0xff) / 255;
  const ground = H * 0.78;
  const body = (() => {
    switch (scene) {
      case 'chart': {
        // 증권 앱 화면을 찍은 듯한 모양: 봉 12개 + 이동평균선
        const n = 12;
        let v = 0.5;
        const bars = Array.from({ length: n }, (_, i) => {
          const step = (r(i % 24) - 0.5) * 0.18 + (up ? 0.035 : -0.035);
          const o = v;
          v = Math.min(0.92, Math.max(0.08, v + step));
          return { o, c: v, i };
        });
        const y = (t: number) => 14 + (1 - t) * (H - 34);
        const bw = (W - 28) / n;
        return (
          <>
            <rect width={W} height={H} fill="#101114" />
            <rect x="0" y="0" width={W} height="10" fill="#1b1c20" />
            <circle cx="8" cy="5" r="2" fill={accent} />
            <rect x="14" y="3" width="34" height="4" rx="2" fill="#3a3b40" />
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="8" x2={W - 8} y1={14 + g * (H - 34)} y2={14 + g * (H - 34)} stroke="#24252a" strokeWidth="1" />
            ))}
            {bars.map((b) => {
              const isUp = b.c >= b.o;
              const x = 14 + b.i * bw;
              const top = y(Math.max(b.o, b.c));
              const h2 = Math.max(2, Math.abs(y(b.o) - y(b.c)));
              return (
                <g key={b.i}>
                  <line x1={x + bw * 0.35} x2={x + bw * 0.35} y1={top - 3} y2={top + h2 + 3} stroke={isUp ? '#e5484d' : '#3b82f6'} strokeWidth="1" />
                  <rect x={x} y={top} width={bw * 0.7} height={h2} rx="1" fill={isUp ? '#e5484d' : '#3b82f6'} />
                </g>
              );
            })}
            <polyline fill="none" stroke="#f5b83d" strokeWidth="1.4" points={bars.map((b) => `${14 + b.i * bw + bw * 0.35},${y((b.o + b.c) / 2)}`).join(' ')} />
            <rect x="8" y={H - 16} width="58" height="10" rx="3" fill={accent} opacity=".9" />
            <text x="12" y={H - 8.5} fontSize="7" fontWeight="800" fill="#fff">{up ? '▲ 급등' : '▼ 급락'}</text>
            {/* 화면을 들여다보는 개미 */}
            <AntHead cx={W - 18} cy={H - 4} r={11} fill="#8b7bff" mood={up ? 'smile' : 'sad'} />
          </>
        );
      }
      case 'factory':
        return (
          <>
            <rect width={W} height={H} fill={`url(#sky${uid})`} />
            {[0, 1, 2].map((i) => (
              <circle key={i} cx={52 + i * 16 + r(i) * 6} cy={ground - 56 - i * 6} r={7 + i * 2} fill="#cfd4dc" opacity={0.25 - i * 0.05} />
            ))}
            <rect x="46" y={ground - 50} width="8" height="50" fill="#3a3f4a" />
            <rect x="62" y={ground - 40} width="8" height="40" fill="#3a3f4a" />
            <path d={`M20 ${ground} V${ground - 26} l18 -10 v10 l18 -10 v10 l18 -10 v10 l18 -10 V${ground} z`} fill="#2b2f38" />
            <rect x="100" y={ground - 30} width="44" height="30" fill="#353a45" />
            {[0, 1, 2].map((i) => (
              <rect key={i} x={106 + i * 12} y={ground - 22} width="7" height="6" fill="#f5d27a" opacity={sky === 2 ? 0.9 : 0.45} />
            ))}
            <rect y={ground} width={W} height={H - ground} fill="#1f2228" />
            {/* 안전모 쓴 개미 직원 */}
            <rect x="83" y={ground - 6} width="12" height="9" rx="3" fill="#f5b83d" />
            <AntHead cx={89} cy={ground - 12} r={6.5} fill="#8b7bff" hat="#f5b83d" mood={up ? 'smile' : 'sad'} />
          </>
        );
      case 'tower':
        return (
          <>
            <rect width={W} height={H} fill={`url(#sky${uid})`} />
            {Array.from({ length: 7 }, (_, i) => {
              const h2 = 20 + r(i * 3) * 34;
              return <rect key={i} x={6 + i * 22} y={ground - h2} width="18" height={h2} fill="#262a33" />;
            })}
            <rect x="62" y={ground - 66} width="36" height="66" fill="#323845" />
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={66 + (i % 3) * 10} y={ground - 58 + Math.floor(i / 3) * 12} width="6" height="7" fill="#f5d27a" opacity={(seed >>> i) & 1 ? 0.75 : 0.2} />
            ))}
            <rect x="68" y={ground - 76} width="24" height="10" rx="2" fill="#1a1d23" />
            <rect y={ground} width={W} height={H - ground} fill="#1c1f25" />
          </>
        );
      case 'meeting':
        return (
          <>
            <rect width={W} height={H} fill="#2a2724" />
            <rect x="34" y="10" width="92" height={H * 0.42} rx="3" fill="#e9e6df" />
            <polyline fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={up ? `44,${10 + H * 0.34} 62,${10 + H * 0.26} 80,${10 + H * 0.3} 98,${10 + H * 0.16} 116,${10 + H * 0.08}` : `44,${10 + H * 0.1} 62,${10 + H * 0.16} 80,${10 + H * 0.13} 98,${10 + H * 0.28} 116,${10 + H * 0.36}`} />
            <path d={`M14 ${H} L30 ${H * 0.66} H130 L146 ${H} z`} fill="#4a3a2c" />
            {[44, 68, 92, 116].map((x, i) => (
              <g key={x}>
                <rect x={x - 8} y={H * 0.64} width="16" height="10" rx="4" fill={i % 2 ? '#30343c' : '#24272d'} />
                <AntHead cx={x} cy={H * 0.6} r={5.6} fill={['#8b7bff', '#6f63c9', '#9d8cff', '#7a6be0'][i]} mood="plain" />
              </g>
            ))}
          </>
        );
      case 'product':
        return (
          <>
            <rect width={W} height={H} fill="#1b1b1f" />
            <ellipse cx={W / 2} cy={ground + 4} rx="46" ry="7" fill="#000" opacity=".5" />
            <path d={`M${W / 2 - 40} ${ground} L${W / 2 - 26} ${ground - 16} H${W / 2 + 26} L${W / 2 + 40} ${ground} z`} fill="#2a2a30" />
            <rect x={W / 2 - 22} y={ground - 54} width="44" height="40" rx="7" fill="#e9e9ee" />
            <rect x={W / 2 - 16} y={ground - 48} width="32" height="22" rx="3" fill="#1c1c22" />
            <path d={`M0 0 L${W / 2 - 12} ${ground - 54} H${W / 2 + 12} L${W} 0 z`} fill="#fff" opacity=".05" />
            <rect x="8" y="8" width="38" height="11" rx="3" fill="#6b58ee" />
            <text x="12" y="16" fontSize="7" fontWeight="800" fill="#fff">NEW</text>
            {/* 발표하는 개미 */}
            <rect x={W - 34} y={ground - 12} width="16" height="14" rx="4" fill="#30343c" />
            <path d={`M${W - 34} ${ground - 8} L${W / 2 + 26} ${ground - 34}`} stroke="#c8c8c8" strokeWidth="1.4" strokeLinecap="round" />
            <AntHead cx={W - 26} cy={ground - 20} r={8} fill="#8b7bff" mood={up ? 'smile' : 'plain'} />
          </>
        );
      case 'broadcast':
        return (
          <>
            <rect width={W} height={H} fill="#16213a" />
            <rect x="10" y="8" width="62" height={H * 0.5} rx="3" fill="#24345a" />
            <polyline fill="none" stroke={accent} strokeWidth="2.2" points={up ? '14,40 28,34 42,37 56,24 68,18' : '14,18 28,24 42,21 56,34 68,40'} transform={`translate(0 ${H * 0.02})`} />
            {/* 개미 앵커: 정장 + 넥타이 */}
            <path d={`M86 ${H - 18} q0 ${-H * 0.3} 26 ${-H * 0.32} q26 ${H * 0.02} 26 ${H * 0.32} z`} fill="#2d3e66" />
            <path d={`M106 ${H * 0.5 - 1} l6 6 l6 -6 z`} fill="#e9e9ee" />
            <path d={`M109.6 ${H * 0.55} h4.8 l1.4 ${H * 0.2} l-3.8 4 l-3.8 -4 z`} fill={accent} />
            <AntHead cx={112} cy={H * 0.44} r={12} fill="#8b7bff" mood={up ? 'smile' : 'plain'} />
            <rect y={H - 18} width={W} height="18" fill={up ? '#b4232f' : '#1d4ed8'} />
            <rect x="0" y={H - 18} width="34" height="18" fill="#111" />
            <text x="6" y={H - 6} fontSize="8" fontWeight="800" fill="#fff">LIVE</text>
            <rect x="40" y={H - 12} width={60 + r(4) * 40} height="5" rx="2" fill="#fff" opacity=".85" />
          </>
        );
      case 'ant': {
        // 개미 캐릭터가 소식에 반응 (오르면 웃음, 내리면 울상)
        const cx = W / 2;
        const cy = H * 0.55;
        return (
          <>
            <rect width={W} height={H} fill={up ? '#2b1f22' : '#1c2333'} />
            <path d={`M${cx - 14} ${cy - 26} q-10 -18 -22 -16 M${cx + 14} ${cy - 26} q10 -18 22 -16`} stroke="#8b7bff" strokeWidth="4" strokeLinecap="round" fill="none" />
            <ellipse cx={cx} cy={cy} rx="30" ry="26" fill="#8b7bff" />
            <ellipse cx={cx - 10} cy={cy - 4} rx="5" ry="6.5" fill="#1a1a1a" />
            <ellipse cx={cx + 10} cy={cy - 4} rx="5" ry="6.5" fill="#1a1a1a" />
            <circle cx={cx - 8.5} cy={cy - 6} r="1.6" fill="#fff" />
            <circle cx={cx + 11.5} cy={cy - 6} r="1.6" fill="#fff" />
            {up ? <path d={`M${cx - 9} ${cy + 9} q9 9 18 0`} stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none" /> : <path d={`M${cx - 9} ${cy + 13} q9 -8 18 0`} stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" fill="none" />}
            {!up && <path d={`M${cx + 18} ${cy + 2} q3 7 0 10 q-3 -3 0 -10`} fill="#7cc4ff" />}
            <text x={cx} y={H - 8} fontSize="11" fontWeight="800" fill={up ? '#ff6b6b' : '#7cc4ff'} textAnchor="middle">{up ? '가즈아!' : '물렸다…'}</text>
          </>
        );
      }
    }
  })();
  return (
    <figure className={'post-art pa-' + ratio} aria-label={label ?? '글에 붙은 그림'}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-hidden>
        <defs>
          <linearGradient id={`sky${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s0} />
            <stop offset="1" stopColor={s1} />
          </linearGradient>
        </defs>
        {body}
      </svg>
      {(scene === 'factory' || scene === 'tower' || scene === 'product') && (
        <span className="pa-sector" aria-hidden>
          <SectorIcon id={p.sector} />
        </span>
      )}
    </figure>
  );
}
