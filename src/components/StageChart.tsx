/**
 * 로비 플레이 무대 뒤 차트 — '이 게임은 차트를 읽는 게임'을 보여 주는 살아 있는 시세.
 * 정해진 난수로 만든 연습용 흐름이라 실제 판 가격과는 상관없음. 1.6초마다 봉 하나가 새로 생기며 왼쪽으로 밀리고,
 * 새 봉만 잠깐 진하게. 마지막 값에 가격 줄. 움직임 줄이기면 멈춘 그림, 창이 뒤에 있으면 쉼.
 */
import { useEffect, useState } from 'react';

const N = 26;
type Bar = { o: number; c: number; h: number; l: number };

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const r = rng(7);
let last = 100;
let k = 0;
/** 완만히 오르다 꺾이고 다시 오르는 물결 — 끝없이 이어지게 */
function nextBar(): Bar {
  k++;
  const drift = Math.sin(k / 6) * 1.1 + 0.25;
  const o = last;
  const c = o + drift + (r() - 0.5) * 5;
  const h = Math.max(o, c) + r() * 2.6;
  const l = Math.min(o, c) - r() * 2.6;
  last = c;
  return { o, c, h, l };
}
const START = Array.from({ length: N }, nextBar);

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function StageChart() {
  const [data, setData] = useState<Bar[]>(START);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setData((d) => [...d.slice(1), nextBar()]);
      setTick((x) => x + 1);
    }, 1600);
    return () => clearInterval(t);
  }, []);
  const W = 620;
  const H = 300;
  const lo = Math.min(...data.map((b) => b.l));
  const hi = Math.max(...data.map((b) => b.h));
  const y = (v: number) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 36);
  const step = W / N;
  const bw = step * 0.56;
  const ma = data.map((_, i) => {
    const xs = data.slice(Math.max(0, i - 4), i + 1);
    return xs.reduce((s, b) => s + b.c, 0) / xs.length;
  });
  const end = data[N - 1];
  const up = end.c >= end.o;
  return (
    <svg className="stage-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <linearGradient id="sc-fade-x" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="sc-fade-y" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="1" />
        </linearGradient>
        <mask id="sc-mask">
          <rect width={W} height={H} fill="url(#sc-fade-x)" />
          <rect width={W} height={H} fill="url(#sc-fade-y)" />
        </mask>
      </defs>
      <g mask="url(#sc-mask)">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="sc-grid" />
        ))}
        {data.map((b, i) => {
          const x = i * step + step / 2;
          const isUp = b.c >= b.o;
          const top = y(Math.max(b.o, b.c));
          const bot = y(Math.min(b.o, b.c));
          return (
            <g key={tick + i} className={(isUp ? 'sc-up' : 'sc-down') + (i === N - 1 ? ' sc-new' : '')}>
              <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
              <rect x={x - bw / 2} y={top} width={bw} height={Math.max(2, bot - top)} rx={2} />
            </g>
          );
        })}
        <polyline className="sc-ma" points={ma.map((v, i) => `${i * step + step / 2},${y(v)}`).join(' ')} />
        {/* 지금 값 가로줄 (오르면 빨강·내리면 파랑) */}
        <line className={'sc-now ' + (up ? 'is-up' : 'is-down')} x1={0} x2={W} y1={y(end.c)} y2={y(end.c)} />
      </g>
    </svg>
  );
}
