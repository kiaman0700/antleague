/** 랭킹 티어 표시: 금속 테두리 방패 + 가운데 깎은 보석(이 게임만의 그림) + 티어 이름 + 단계 점수. 배치 중이면 '배치 n/2' */
import { isPlaced, PLACEMENT_GAMES, TIERS, tierOf } from '../game/tier';
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
 * 같은 티어 안 단계(III → II → I)는 아래 띠의 보석 수(1~3)와 장식 길이로 보여 줌
 */
export function TierEmblem({ rating, placed = true, size = 28 }: { rating: number; placed?: boolean; size?: number }) {
  const t = tierOf(rating);
  const base = placed ? t.color : '#7a7a7a';
  const light = mix(base, '#ffffff', 0.62);
  const shine = mix(base, '#ffffff', 0.85);
  const mid = mix(base, '#000000', 0.18);
  const dark = mix(base, '#000000', 0.5);
  const deep = mix(base, '#000000', 0.78);
  const lv = placed ? (TIER_LEVEL[t.id] ?? 0) : -1;
  const dv = !placed ? 0 : t.id === 'master' ? 3 : t.division === 'I' ? 2 : t.division === 'II' ? 1 : 0;
  const pips = !placed || t.id === 'master' ? 0 : dv + 1;
  const id = `te-${placed ? t.id : 'none'}`;
  const metal = `url(#${id}-m)`;
  const gem = `url(#${id}-g)`;
  const grow = dv * 0.9;

  const blades: [string, string][] = [];
  if (lv === 1) blades.push(blade(6.2, 12, 202, 10 + grow, 2.6), blade(6, 17.5, 192, 7 + grow, 2));
  if (lv >= 2) {
    const n = lv >= 5 ? 4 : 3;
    const len = lv >= 5 ? 19 : lv >= 4 ? 16 : lv >= 3 ? 15 : 13;
    for (let i = 0; i < n; i++) blades.push(blade(6.2, 10 + i * 4.4, 200 + i * 14, len + grow - i * 2.2, 2.9));
  }
  const shards = lv === 4 ? [-128, -104, -90, -76, -52].map((a, i) => shard(20, 10, a, (i === 2 ? 19 : 15) + grow, 3.4)) : [];
  const bladeEl = (d: string, v: string) => (
    <>
      <path d={d} fill={metal} stroke={deep} strokeWidth="0.6" />
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
        <radialGradient id={`${id}-o`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={base} stopOpacity="0.5" />
          <stop offset="1" stopColor={base} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 다이아몬드·마스터: 뒤 은은한 빛 */}
      {lv >= 4 && <circle cx="20" cy="18" r={lv >= 5 ? 26 : 23} fill={`url(#${id}-o)`} />}

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
        </g>
      )}
      {lv === 3 && (
        <g fill={metal} stroke={deep} strokeWidth="0.6" strokeLinejoin="round">
          <path d={`M20 ${-4.5 - grow} L23 3.5 L20 6 L17 3.5 Z`} />
          <path d={`M8.4 9 L${5.5 - grow * 0.4} ${-0.5 - grow * 0.6} L12 6.2 Z`} />
          <path d={`M31.6 9 L${34.5 + grow * 0.4} ${-0.5 - grow * 0.6} L28 6.2 Z`} />
        </g>
      )}
      {lv === 5 && (
        <g stroke={deep} strokeWidth="0.7" strokeLinejoin="round">
          <path d="M9.5 6.5 L8.5 -4 L14 0.5 L20 -7 L26 0.5 L31.5 -4 L30.5 6.5 Q20 3.6 9.5 6.5 Z" fill={metal} />
          <path d="M11 4.6 Q20 2.4 29 4.6" fill="none" stroke={shine} strokeOpacity="0.6" strokeWidth="0.6" />
          <circle cx="20" cy="-7" r="1.9" fill={gem} />
          <circle cx="8.5" cy="-4" r="1.4" fill={gem} />
          <circle cx="31.5" cy="-4" r="1.4" fill={gem} />
          <path d="M18 1.8 L20 -0.6 L22 1.8 L20 4.2 Z" fill={gem} />
        </g>
      )}

      {/* 방패: 바깥 금속 테두리 → 어두운 홈 → 안쪽 면 */}
      <path d={SHIELD} fill={metal} stroke={deep} strokeWidth="0.8" strokeLinejoin="round" />
      <path d={SHIELD} transform={at(0.86)} fill={deep} />
      <path d={SHIELD} transform={at(0.8)} fill={`url(#${id}-f)`} stroke={mix(base, '#000000', 0.25)} strokeWidth="0.5" />
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
          <path d="M20 14.6 L24 20 L20 25.6 L16 20 Z" fill={gem} />
          <path d="M20 10 L27.6 20 L20 30.5 L12.4 20 Z" fill="none" stroke={shine} strokeWidth="0.6" />
          <path d="M17.6 18.2 L20 15.6" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      ) : (
        <text x="20" y="25.5" textAnchor="middle" fontSize="13" fontWeight="800" fill={light}>
          ?
        </text>
      )}

      {/* 아래 띠 + 단계 보석 (III 1개 · II 2개 · I 3개) */}
      {pips > 0 && (
        <g>
          <path d="M8 37.6 Q20 42.6 32 37.6 L33.5 42 Q20 47.2 6.5 42 Z" fill={metal} stroke={deep} strokeWidth="0.6" strokeLinejoin="round" />
          {Array.from({ length: pips }, (_, i) => (
            <path key={i} d={`M${20 - (pips - 1) * 4 + i * 8} 40.4 l1.9 2.2 l-1.9 2.2 l-1.9 -2.2 Z`} fill={deep} stroke={shine} strokeWidth="0.5" />
          ))}
        </g>
      )}
    </svg>
  );
}

/** "골드 II · 23점" 또는 "언랭크 · 배치 1/2" */
export function tierText(rating: number, rankedGames: number | null | undefined) {
  if (!isPlaced(rankedGames)) return `언랭크 · 배치 ${rankedGames ?? 0}/${PLACEMENT_GAMES}`;
  const t = tierOf(rating);
  return `${t.label} · ${t.points}점`;
}

export function TierBadge({ rating, rankedGames, size = 28, showPoints = true }: { rating: number; rankedGames: number | null | undefined; size?: number; showPoints?: boolean }) {
  const placed = isPlaced(rankedGames);
  const t = tierOf(rating);
  return (
    <span className={'tier-badge' + (placed ? ' t-' + t.id : ' t-unplaced')}>
      <TierEmblem rating={rating} placed={placed} size={size} />
      <span className="tb-txt">
        <b style={placed ? { color: t.color } : undefined}>{placed ? t.label : '언랭크'}</b>
        {showPoints && <small>{placed ? `${t.points}점` : `${rankedGames ?? 0}/${PLACEMENT_GAMES}판`}</small>}
      </span>
    </span>
  );
}

/** 짧게: "골드 II" 또는 "언랭크" (친구·파티 목록용) */
export function tierShort(rating: number, rankedGames: number | null | undefined) {
  return isPlaced(rankedGames) ? tierOf(rating).label : '언랭크';
}

/**
 * 티어표: 브론즈 → 마스터로 오르는 계단. 계단이 높아질수록 그림도 커지고, 계단 안에 단계 III · II · I.
 * mine 을 주면 내 티어에 '나' 표시
 */
export function TierLadder({ mine }: { mine?: { rating: number; rankedGames: number | null | undefined } }) {
  const my = mine && isPlaced(mine.rankedGames) ? tierOf(mine.rating) : null;
  return (
    <section className="panel pad tier-ladder" aria-label="랭킹 티어">
      <h3>
        <Icon name="crown" size={18} /> 랭킹 티어
      </h3>
      <p className="muted small">처음 2판은 배치 경기예요. 그 뒤 점수에 따라 티어가 정해지고, 티어마다 III → II → I 단계(50점씩)가 있어요.</p>
      <ol className="tl-stairs">
        {TIERS.map((t, i) => {
          const base = t.id === 'bronze' ? 850 : t.min;
          const here = my?.id === t.id;
          return (
            <li key={t.id} className={'tl-step' + (here ? ' me' : '')} style={{ ['--tc' as string]: t.color, ['--h' as string]: `${86 + i * 18}px` }}>
              <div className="tl-emb">
                <TierEmblem rating={t.id === 'master' ? 1600 : base + 100} size={40 + i * 5} />
              </div>
              <div className="tl-block">
                {here && <span className="tl-me">나</span>}
                <b>{t.name}</b>
                <small>{t.id === 'bronze' ? '시작' : t.min.toLocaleString() + '점'}</small>
                {t.id !== 'master' ? (
                  <span className="tl-divs" aria-label={`${t.name} III, II, I`}>
                    {(['III', 'II', 'I'] as const).map((dv, k) => (
                      <span key={dv} className={'tl-div' + (here && my?.division === dv ? ' me' : '')} title={`${t.name} ${dv}`}>
                        <TierEmblem rating={base + k * 50} size={14} />
                        <i>{dv}</i>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="tl-top">최고 티어</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
