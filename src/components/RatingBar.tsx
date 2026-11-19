/**
 * 랭킹전 결과의 점수 막대: 판 전 점수에서 판 뒤 점수까지 막대가 차오르거나 줄어듦.
 * 단계(100점)를 넘으면 막대가 처음부터 다시 차고 엠블럼이 바뀜. 내려갈 땐 회색(진 사람 체면), 움직임 줄이기면 바로 끝 값.
 */
import { useEffect, useState } from 'react';
import { DIV_POINTS, tierOf } from '../game/tier';
import { TierEmblem } from './TierBadge';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function RatingBar({ before, after }: { before: number; after: number }) {
  const [v, setV] = useState(reduced() ? after : before);
  useEffect(() => {
    if (reduced()) return setV(after);
    let raf = 0;
    const t0 = performance.now() + 450;
    const dur = Math.min(1600, 500 + Math.abs(after - before) * 12);
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = 1 - (1 - k) ** 3;
      setV(before + (after - before) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [before, after]);
  const t = tierOf(v);
  const end = tierOf(after);
  const up = after >= before;
  const pct = t.division ? (t.points / DIV_POINTS) * 100 : Math.min(100, ((v - 2200) % 300) / 3);
  const toNext = end.division ? DIV_POINTS - end.points : null;
  const diff = Math.round(after - before);
  return (
    <div className={'rbar ' + (up ? 'is-up' : 'is-down')}>
      <span className="rbar-em" key={t.label}>
        <TierEmblem rating={Math.round(v)} size={46} />
      </span>
      <div className="rbar-body">
        <div className="rbar-top">
          <b>{t.label}</b>
          <em>
            {diff >= 0 ? '+' : ''}
            {diff}점
          </em>
          {end.label !== tierOf(before).label && <strong className="rbar-promo">{after > before ? '승급!' : '강등'}</strong>}
        </div>
        <div className="rbar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${end.label} 단계 진행`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <small>{toNext !== null ? `다음 단계까지 ${toNext}점 · 지금 ${Math.round(after).toLocaleString('ko-KR')}점` : `지금 ${Math.round(after).toLocaleString('ko-KR')}점`}</small>
      </div>
    </div>
  );
}
