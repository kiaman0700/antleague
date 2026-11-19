/**
 * 최근 판 모양 한눈에: 순위 칩 줄(1위는 보라 채움 · 2위는 테두리 · 그 밖 회색 · 판 순서는 왼쪽이 최근) + 평균 순위,
 * 랭킹전 점수 흐름 작은 선(내 기록만). 하루 60초 게임이라 '요즘 어떤지'가 숫자 합계보다 먼저 보이게
 */
import type { MatchRow } from '../net/account';
import { DIV_POINTS } from '../game/tier';

export function FormStrip({ rows }: { rows: MatchRow[] }) {
  const last = rows.slice(0, 10);
  if (!last.length) return null;
  const avg = last.reduce((s, r) => s + r.rank, 0) / last.length;
  return (
    <div className="form-strip">
      <ol className="fs-chips" aria-label={`최근 ${last.length}판 순위`}>
        {last.map((r) => (
          <li key={r.room_id} className={'fs-chip' + (r.rank === 1 ? ' p1' : r.rank === 2 ? ' p2' : '')} title={`${r.rank}위 / ${r.players}명`}>
            {r.rank}
          </li>
        ))}
      </ol>
      <span className="fs-avg">
        평균 <b>{avg.toFixed(1)}위</b>
        <small> · 최근 {last.length}판</small>
      </span>
    </div>
  );
}

/** 랭킹전 점수 흐름 (최근 판들의 판 뒤 점수를 이음, 단계 경계 옅은 줄) */
export function RatingSpark({ rows }: { rows: MatchRow[] }) {
  const pts = rows
    .filter((r) => r.rated && r.rating_after !== null)
    .slice(0, 20)
    .reverse()
    .map((r) => r.rating_after as number);
  if (pts.length < 2) return null;
  const W = 240;
  const H = 56;
  const lo = Math.min(...pts) - 20;
  const hi = Math.max(...pts) + 20;
  const x = (i: number) => (i / (pts.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8);
  const lines: number[] = [];
  for (let v = Math.ceil(lo / DIV_POINTS) * DIV_POINTS; v <= hi; v += DIV_POINTS) lines.push(v);
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg className={'rating-spark ' + (up ? 'is-up' : 'is-down')} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 랭킹전 점수 ${pts[0]}점에서 ${pts[pts.length - 1]}점`}>
      {lines.map((v) => (
        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className="rs-grid" />
      ))}
      <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="rs-line" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r={3.5} className="rs-dot" />
    </svg>
  );
}
