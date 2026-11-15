/** 오늘 장중 차트: 5초 칸마다 선이 이어지고, 남은 시간은 빈칸. 전일 종가 점선 기준으로 빨강(상승)/파랑(하락) */
const W = 680;

interface Props {
  /** 0~지금 칸 가격 */
  ticks: number[];
  /** 하루 전체 칸 수 */
  n: number;
  prevClose: number;
  fmt: (v: number) => string;
  /** 이 종목 관련 속보가 뜬 칸 */
  newsTicks?: { tick: number; tone: 'good' | 'bad' }[];
  tall?: boolean;
}

export function IntradayChart({ ticks, n, prevClose, fmt, newsTicks = [], tall = false }: Props) {
  const H = tall ? 300 : 220;
  const padL = 8;
  const padR = 76;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = [...ticks, prevClose];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < prevClose * 0.004) {
    const mid = (hi + lo) / 2;
    lo = mid - prevClose * 0.002;
    hi = mid + prevClose * 0.002;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const x = (i: number) => padL + (i / Math.max(1, n)) * plotW;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const last = ticks[ticks.length - 1] ?? prevClose;
  const cls = last > prevClose ? 'up' : last < prevClose ? 'down' : 'flat';
  const line = ticks.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = ticks.length > 1 ? `${line} L${x(ticks.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z` : '';
  const nowX = x(ticks.length - 1);
  const pctLeft = Math.round(((n - (ticks.length - 1)) / n) * 100);

  return (
    <svg className={'chart intraday ' + cls} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`오늘 장중 차트, 지금 ${fmt(last)}`}>
      {/* 남은 시간 */}
      {ticks.length - 1 < n && <rect x={nowX} y={padT} width={Math.max(0, padL + plotW - nowX)} height={plotH} className="future" />}
      {/* 전일 종가 */}
      <line x1={padL} x2={padL + plotW} y1={y(prevClose)} y2={y(prevClose)} className="ref" />
      <text x={W - padR + 6} y={y(prevClose) + 4} className="axis">
        전일 {fmt(prevClose)}
      </text>
      {area && <path d={area} className="area" />}
      <path d={line} className="line" />
      {newsTicks
        .filter((t) => t.tick < ticks.length)
        .map((t, i) => (
          <g key={i} className={'news-mark ' + t.tone}>
            <line x1={x(t.tick)} x2={x(t.tick)} y1={padT} y2={padT + plotH} />
            <circle cx={x(t.tick)} cy={padT + 6} r={4} />
          </g>
        ))}
      <circle cx={nowX} cy={y(last)} r={9} className="now-pulse" />
      <circle cx={nowX} cy={y(last)} r={4.5} className="now-dot" />
      <g className="now-tag">
        <rect x={W - padR + 2} y={y(last) - 10} width={padR - 4} height={20} rx={5} />
        <text x={W - padR + padR / 2} y={y(last) + 4} textAnchor="middle">
          {fmt(last)}
        </text>
      </g>
      <text x={padL} y={H - 6} className="axis">
        장 시작
      </text>
      <text x={padL + plotW} y={H - 6} textAnchor="end" className="axis">
        {pctLeft > 0 ? `마감까지 ${pctLeft}%` : '마감'}
      </text>
    </svg>
  );
}
