/** 랭킹 티어 표시: 방패 모양 엠블럼(이 게임만의 그림) + 티어 이름 + 단계 점수. 배치 중이면 '배치 n/2' */
import { isPlaced, PLACEMENT_GAMES, TIERS, tierOf } from '../game/tier';
import { Icon } from './Icon';

const TIER_LEVEL: Record<string, number> = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4, master: 5 };
const SHIELD = 'M20 2 L35 8 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V8 Z';
const INNER = 'M20 6 L31.5 10.6 V20 C31.5 27 26.4 31.6 20 34.2 C13.6 31.6 8.5 27 8.5 20 V10.6 Z';

/**
 * 티어 엠블럼: 색은 티어 색 그대로, 오를수록 장식이 늘어남.
 * 단계 g = 티어(0~5)×3 + 단계(III 0 · II 1 · I 2) → 0(브론즈 III) ~ 17(마스터)
 *  - 아래 표시: 단계 수만큼(III 1 · II 2 · I 3, 마스터 4)
 *  - 1+ 안쪽 테두리 · 2+ 위 모서리 장식 · 3+ 굵은 테두리 · 4+ 위 장식(5+ 크게)
 *  - 6+(골드) 양옆 날개: 두 단계마다 깃 +1, 단계마다 조금 길게
 *  - 9+(플래티넘) 위 보석(단계마다 크게) · 12+(다이아몬드) 뒤 빛줄기(단계마다 늘어남) · 마스터 왕관
 */
export function TierEmblem({ rating, placed = true, size = 28 }: { rating: number; placed?: boolean; size?: number }) {
  const t = tierOf(rating);
  const c = placed ? t.color : '#6b7385';
  const lv = TIER_LEVEL[t.id] ?? 0;
  const dv = t.division === 'I' ? 2 : t.division === 'II' ? 1 : 0;
  const g = placed ? (t.id === 'master' ? 17 : lv * 3 + dv) : -1;
  const pips = !placed ? 0 : t.id === 'master' ? 4 : dv + 1;
  const feathers = g >= 6 ? Math.min(5, Math.ceil((g - 5) / 2)) : 0;
  const fLen = 5 + dv * 1.2 + (t.id === 'master' ? 2.4 : 0);
  const rays = g >= 12 ? Math.min(13, 5 + (g - 12) * 2) : 0;
  const gid = `tg-${t.id}-${placed ? 1 : 0}`;
  const ink = '#111111';
  const wing = (i: number) => {
    // 왼쪽 깃 하나: 방패 옆에서 바깥 위로 뻗음 (아래 깃일수록 짧게)
    const y = 9 + i * 4.6;
    const len = fLen - i * 0.9;
    return `M7 ${y} L${7 - len} ${y - 3.2} L${7 - len + 1.6} ${y + 1.4} L7 ${y + 3.6} Z`;
  };
  return (
    // 장식(날개·왕관) 자리만큼 그림 칸이 넓어져 방패가 작아지지 않게 1.3배로 그림
    <svg className="tier-emblem" width={Math.round(size * 1.3)} height={Math.round(size * 1.3)} viewBox="-7 -8 54 54" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="1" />
          <stop offset="1" stopColor={c} stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {rays > 0 && (
        <g stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity="0.55">
          {Array.from({ length: rays }, (_, i) => {
            const a = Math.PI * (1.08 + (0.84 * i) / Math.max(1, rays - 1));
            return <line key={i} x1={20 + Math.cos(a) * 19} y1={19 + Math.sin(a) * 19} x2={20 + Math.cos(a) * 26} y2={19 + Math.sin(a) * 26} />;
          })}
        </g>
      )}
      {feathers > 0 && (
        <g fill={c} stroke={ink} strokeWidth="0.8" strokeLinejoin="round">
          {Array.from({ length: feathers }, (_, i) => (
            <g key={i}>
              <path d={wing(i)} />
              <path d={wing(i)} transform="matrix(-1 0 0 1 40 0)" />
            </g>
          ))}
        </g>
      )}
      <path d={SHIELD} fill={`url(#${gid})`} stroke={c} strokeWidth={g >= 3 ? 2.6 : 1.5} />
      {g >= 1 && <path d={INNER} fill="none" stroke={ink} strokeOpacity="0.4" strokeWidth="1.1" />}
      {g >= 2 && (
        <g fill={ink} opacity="0.55">
          <circle cx="10" cy="10.2" r="1.3" />
          <circle cx="30" cy="10.2" r="1.3" />
        </g>
      )}
      {g >= 4 && g < 9 && (
        <path d={g >= 5 ? 'M15.6 3.8 L20 -3 L24.4 3.8 Z' : 'M17 3.6 L20 -0.8 L23 3.6 Z'} fill={c} stroke={ink} strokeWidth="0.8" strokeLinejoin="round" />
      )}
      {g >= 9 && t.id !== 'master' && (
        <path d={`M20 ${-4 - dv} L${24 + dv * 0.5} 1.5 L20 7 L${16 - dv * 0.5} 1.5 Z`} fill={c} stroke={ink} strokeWidth="0.9" strokeLinejoin="round" />
      )}
      {t.id === 'master' && placed && (
        <path d="M10.5 4 L12 -5 L16.2 -0.6 L20 -7 L23.8 -0.6 L28 -5 L29.5 4 Z" fill={c} stroke={ink} strokeWidth="0.9" strokeLinejoin="round" />
      )}
      <path d="M11 24 L17 18 L21 22 L29 13" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {Array.from({ length: pips }, (_, i) => (
        <path key={i} d={`M${20 - (pips - 1) * 3 + i * 6} 29.3 l1.9 1.9 l-1.9 1.9 l-1.9 -1.9 Z`} fill={ink} />
      ))}
      {!placed && (
        <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill={ink}>
          ?
        </text>
      )}
    </svg>
  );
}

/** "골드 II · 23점" 또는 "배치 1/2" */
export function tierText(rating: number, rankedGames: number | null | undefined) {
  if (!isPlaced(rankedGames)) return `배치 ${rankedGames ?? 0}/${PLACEMENT_GAMES}`;
  const t = tierOf(rating);
  return t.division ? `${t.label} · ${t.points}점` : `${t.label} · ${t.points}점`;
}

export function TierBadge({ rating, rankedGames, size = 28, showPoints = true }: { rating: number; rankedGames: number | null | undefined; size?: number; showPoints?: boolean }) {
  const placed = isPlaced(rankedGames);
  const t = tierOf(rating);
  return (
    <span className={'tier-badge' + (placed ? ' t-' + t.id : ' t-unplaced')}>
      <TierEmblem rating={rating} placed={placed} size={size} />
      <span className="tb-txt">
        <b style={placed ? { color: t.color } : undefined}>{placed ? t.label : '배치 중'}</b>
        {showPoints && <small>{placed ? `${t.points}점` : `${rankedGames ?? 0}/${PLACEMENT_GAMES}판`}</small>}
      </span>
    </span>
  );
}

/** 짧게: "골드 II" 또는 "배치 중" (친구·파티 목록용) */
export function tierShort(rating: number, rankedGames: number | null | undefined) {
  return isPlaced(rankedGames) ? tierOf(rating).label : '배치 중';
}

/**
 * 티어표: 마스터 → 브론즈, 티어마다 단계 III · II · I 그림 (오를수록 장식이 늘어남).
 * mine 을 주면 내 티어·단계를 표시
 */
export function TierLadder({ mine }: { mine?: { rating: number; rankedGames: number | null | undefined } }) {
  const my = mine && isPlaced(mine.rankedGames) ? tierOf(mine.rating) : null;
  return (
    <section className="panel pad tier-ladder" aria-label="랭킹 티어">
      <h3>
        <Icon name="crown" size={18} /> 랭킹 티어
      </h3>
      <p className="muted small">처음 2판은 배치 경기예요. 그 뒤 점수에 따라 티어가 정해지고, 티어마다 III → II → I 단계(50점씩)가 있어요.</p>
      <ol>
        {[...TIERS].reverse().map((t) => {
          const base = t.id === 'bronze' ? 850 : t.min;
          const here = my?.id === t.id;
          return (
            <li key={t.id} className={here ? 'me' : undefined}>
              <TierEmblem rating={t.id === 'master' ? 1600 : base + 100} size={32} />
              <span className="tl-name">
                <b style={{ color: t.color }}>{t.name}</b>
                <small className="muted">{here ? '지금 내 티어' : t.id === 'bronze' ? '시작' : t.min.toLocaleString() + '점부터'}</small>
              </span>
              {t.id !== 'master' && (
                <span className="tl-divs" aria-label={`${t.name} III, II, I`}>
                  {(['III', 'II', 'I'] as const).map((dv, i) => (
                    <span key={dv} className={'tl-div' + (here && my?.division === dv ? ' me' : '')}>
                      <TierEmblem rating={base + i * 50} size={22} />
                      <small>{dv}</small>
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
