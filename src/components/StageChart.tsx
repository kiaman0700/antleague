/**
 * 로비 플레이 무대 뒤 차트 (장식이 아니라 '이 게임은 차트를 읽는 게임'이라는 걸 보여 주는 배경).
 * 진짜 차트처럼: 꼬리 있는 봉(오르면 빨강·내리면 파랑) + 5일 이동평균선 + 옅은 가로 눈금, 글자 쪽(왼쪽·아래)은 흐려짐
 */
const N = 26;
// 정해진 난수 (그릴 때마다 같은 모양)
function bars() {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { o: number; c: number; h: number; l: number }[] = [];
  let p = 100;
  for (let i = 0; i < N; i++) {
    // 완만히 오르다 중간에 한 번 꺾이고 다시 강하게 오르는 흐름
    const drift = i < 9 ? 0.6 : i < 14 ? -1.4 : 1.6;
    const o = p;
    const c = o + drift + (r() - 0.5) * 6;
    const h = Math.max(o, c) + r() * 3;
    const l = Math.min(o, c) - r() * 3;
    out.push({ o, c, h, l });
    p = c;
  }
  return out;
}
const DATA = bars();

export function StageChart() {
  const W = 620;
  const H = 300;
  const lo = Math.min(...DATA.map((b) => b.l));
  const hi = Math.max(...DATA.map((b) => b.h));
  const y = (v: number) => H - 18 - ((v - lo) / (hi - lo)) * (H - 36);
  const step = W / N;
  const bw = step * 0.56;
  const ma = DATA.map((_, i) => {
    const from = Math.max(0, i - 4);
    const xs = DATA.slice(from, i + 1);
    return xs.reduce((s, b) => s + b.c, 0) / xs.length;
  });
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
          {/* 아래쪽(고르기 칸 쪽)도 흐리게 */}
          <rect width={W} height={H} fill="url(#sc-fade-y)" />
        </mask>
      </defs>
      <g mask="url(#sc-mask)">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="sc-grid" />
        ))}
        {DATA.map((b, i) => {
          const x = i * step + step / 2;
          const up = b.c >= b.o;
          const top = y(Math.max(b.o, b.c));
          const bot = y(Math.min(b.o, b.c));
          return (
            <g key={i} className={up ? 'sc-up' : 'sc-down'}>
              <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
              <rect x={x - bw / 2} y={top} width={bw} height={Math.max(2, bot - top)} rx={2} />
            </g>
          );
        })}
        <polyline className="sc-ma" points={ma.map((v, i) => `${i * step + step / 2},${y(v)}`).join(' ')} />
      </g>
    </svg>
  );
}
