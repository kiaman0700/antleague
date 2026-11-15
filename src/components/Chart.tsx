import { TICKS_PER_DAY } from '../game/market';

interface Series {
  values: number[];
  color: string;
  label?: string;
}

interface Props {
  series: Series[];
  /** x축 전체 길이(틱 수) — 아직 안 온 미래 구간을 비워 둠 */
  length: number;
  height?: number;
  refLine?: { value: number; label: string } | null;
  markers?: { index: number; tone: 'good' | 'bad' }[];
  formatY?: (v: number) => string;
  showDays?: boolean;
}

/** 의존성 없는 SVG 라인 차트 */
export function Chart({ series, length, height = 220, refLine, markers = [], formatY = (v) => Math.round(v).toLocaleString('ko-KR'), showDays = true }: Props) {
  const W = 600;
  const H = height;
  const padL = 8;
  const padR = 64;
  const padT = 12;
  const padB = 18;
  const all = series.flatMap((s) => s.values);
  if (refLine) all.push(refLine.value);
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min *= 0.98;
    max *= 1.02;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const x = (i: number) => padL + (i / Math.max(1, length)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
  const days = Math.floor(length / TICKS_PER_DAY);
  const dayStep = days > 30 ? 10 : 5;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="grid" />
          <text x={W - padR + 6} y={y(v) + 4} className="axis">
            {formatY(v)}
          </text>
        </g>
      ))}
      {showDays &&
        Array.from({ length: Math.ceil(days / dayStep) }, (_, k) => k * dayStep).map((d) => (
          <text key={d} x={x(d * TICKS_PER_DAY)} y={H - 4} className="axis" textAnchor="middle">
            {d + 1}일
          </text>
        ))}
      {refLine && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} className="ref" />
          <text x={padL + 4} y={y(refLine.value) - 4} className="ref-label">
            {refLine.label}
          </text>
        </g>
      )}
      {markers.map((m, i) => (
        <line key={i} x1={x(m.index)} x2={x(m.index)} y1={padT} y2={H - padB} className={'marker ' + m.tone} />
      ))}
      {series.map((s, si) => {
        if (s.values.length < 1) return null;
        const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const last = s.values.length - 1;
        return (
          <g key={si}>
            {series.length === 1 && (
              <path d={`${d} L${x(last)},${H - padB} L${x(0)},${H - padB} Z`} fill={s.color} opacity={0.12} />
            )}
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <circle cx={x(last)} cy={y(s.values[last])} r={3.5} fill={s.color} />
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  const W = 60;
  const H = 22;
  if (values.length < 2) return <svg width={W} height={H} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / (max - min || 1)) * (H - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={W} height={H} className="spark">
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.5} />
    </svg>
  );
}
