import type { Bar } from '../game/market';

const W = 640;

interface Frame {
  min: number;
  max: number;
  x: (i: number) => number;
  y: (v: number) => number;
  H: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

function frame(values: number[], count: number, H: number, extra: number[] = []): Frame {
  const padL = 6;
  const padR = 62;
  const padT = 14;
  const padB = 22;
  let min = Math.min(...values, ...extra);
  let max = Math.max(...values, ...extra);
  if (min === max) {
    min *= 0.98;
    max *= 1.02;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const slot = (W - padL - padR) / Math.max(1, count);
  return {
    min,
    max,
    H,
    padL,
    padR,
    padT,
    padB,
    x: (i) => padL + slot * (i + 0.5),
    y: (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB),
  };
}

function Axes({ f, count, fmt }: { f: Frame; count: number; fmt: (v: number) => string }) {
  const ticks = [0.15, 0.5, 0.85].map((t) => f.min + (f.max - f.min) * t);
  const step = count > 20 ? 10 : 5;
  const days: number[] = [];
  for (let d = 0; d < count; d += step) days.push(d);
  return (
    <g>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={f.padL} x2={W - f.padR} y1={f.y(v)} y2={f.y(v)} className="grid" />
          <text x={W - f.padR + 8} y={f.y(v) + 4} className="axis">
            {fmt(v)}
          </text>
        </g>
      ))}
      {days.map((d) => (
        <text key={d} x={f.x(d)} y={f.H - 6} className="axis" textAnchor="middle">
          {d + 1}일
        </text>
      ))}
    </g>
  );
}

interface Common {
  /** 전체 일수: 남은 날은 빈칸으로 */
  totalDays: number;
  height?: number;
  refLine?: { value: number; label: string } | null;
  markers?: { day: number; tone: 'good' | 'bad' }[];
  fmt?: (v: number) => string;
}

const defaultFmt = (v: number) => Math.round(v).toLocaleString('ko-KR');

/** 일봉 캔들 차트. 마지막 봉이 '진행 중'이면 시가만 표시 */
export function CandleChart({ bars, totalDays, height = 260, refLine, markers = [], fmt = defaultFmt, liveOpenOnly }: Common & { bars: Bar[]; liveOpenOnly: boolean }) {
  const vals = bars.flatMap((b, i) => (liveOpenOnly && i === bars.length - 1 ? [b.open] : [b.high, b.low]));
  const f = frame(vals, totalDays, height, refLine ? [refLine.value] : []);
  const slot = (W - f.padL - f.padR) / totalDays;
  const bw = Math.max(3, Math.min(14, slot * 0.6));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="가격 차트">
      <Axes f={f} count={totalDays} fmt={fmt} />
      {markers.map((m, i) => (
        <line key={i} x1={f.x(m.day)} x2={f.x(m.day)} y1={f.padT} y2={height - f.padB} className={'marker ' + m.tone} />
      ))}
      {refLine && <RefLine f={f} {...refLine} />}
      {bars.map((b, i) => {
        const live = liveOpenOnly && i === bars.length - 1;
        if (live) {
          return (
            <g key={i}>
              <line x1={f.x(i) - bw / 2 - 2} x2={f.x(i) + bw / 2 + 2} y1={f.y(b.open)} y2={f.y(b.open)} className="live-open" />
              <circle cx={f.x(i)} cy={f.y(b.open)} r={4} className="live-dot" />
            </g>
          );
        }
        const up = b.close >= b.open;
        const top = f.y(Math.max(b.open, b.close));
        const bot = f.y(Math.min(b.open, b.close));
        return (
          <g key={i} className={up ? 'c-up' : 'c-down'}>
            <line x1={f.x(i)} x2={f.x(i)} y1={f.y(b.high)} y2={f.y(b.low)} strokeWidth={1.2} />
            <rect x={f.x(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, bot - top)} rx={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

/** 초보용 라인 차트: 매일 종가를 잇고 오늘은 시가 */
export function LineChart({
  series,
  totalDays,
  height = 240,
  refLine,
  markers = [],
  fmt = defaultFmt,
  fill = true,
}: Common & { series: { values: number[]; color: string }[]; fill?: boolean }) {
  const all = series.flatMap((s) => s.values);
  const f = frame(all, totalDays, height, refLine ? [refLine.value] : []);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="가격 차트">
      <Axes f={f} count={totalDays} fmt={fmt} />
      {markers.map((m, i) => (
        <line key={i} x1={f.x(m.day)} x2={f.x(m.day)} y1={f.padT} y2={height - f.padB} className={'marker ' + m.tone} />
      ))}
      {refLine && <RefLine f={f} {...refLine} />}
      {series.map((s, si) => {
        if (!s.values.length) return null;
        const pts = s.values.map((v, i) => [f.x(i), f.y(v)] as const);
        const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        const [lx, ly] = pts[pts.length - 1];
        const gid = `g${si}${s.color.replace(/[^a-z]/gi, '')}`;
        return (
          <g key={si}>
            {fill && series.length === 1 && pts.length > 1 && (
              <>
                <defs>
                  <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path d={`${d} L${lx},${height - f.padB} L${pts[0][0]},${height - f.padB} Z`} fill={`url(#${gid})`} />
              </>
            )}
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={4.5} fill={s.color} className="pulse" />
          </g>
        );
      })}
    </svg>
  );
}

function RefLine({ f, value, label }: { f: Frame; value: number; label: string }) {
  return (
    <g>
      <line x1={f.padL} x2={W - f.padR} y1={f.y(value)} y2={f.y(value)} className="ref" />
      <text x={f.padL + 4} y={f.y(value) - 5} className="ref-label">
        {label}
      </text>
    </g>
  );
}

export function Sparkline({ values, up, width = 56, height = 20 }: { values: number[]; up: boolean; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} className="spark" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / (max - min || 1)) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="spark" aria-hidden>
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
