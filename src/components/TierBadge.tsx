/** 랭킹 티어 표시: 방패 모양 엠블럼(이 게임만의 그림) + 티어 이름 + 단계 점수. 배치 중이면 '배치 n/2' */
import { isPlaced, PLACEMENT_GAMES, tierOf } from '../game/tier';

export function TierEmblem({ rating, placed = true, size = 28 }: { rating: number; placed?: boolean; size?: number }) {
  const t = tierOf(rating);
  const c = placed ? t.color : '#6b7385';
  const pips = !placed ? 0 : t.division === 'I' ? 3 : t.division === 'II' ? 2 : t.division === 'III' ? 1 : 4;
  return (
    <svg className="tier-emblem" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`tg-${t.id}-${placed ? 1 : 0}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="1" />
          <stop offset="1" stopColor={c} stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path d="M20 2 L35 8 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V8 Z" fill={`url(#tg-${t.id}-${placed ? 1 : 0})`} stroke={c} strokeWidth="1.5" />
      <path d="M11 24 L17 18 L21 22 L29 13" fill="none" stroke="#111111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {Array.from({ length: pips }, (_, i) => (
        <circle key={i} cx={20 - (pips - 1) * 3 + i * 6} cy="31" r="1.7" fill="#111111" />
      ))}
      {!placed && (
        <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="900" fill="#111111">
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
