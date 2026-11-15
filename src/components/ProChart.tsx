/**
 * 실제 증권앱처럼 조작하는 차트 (토스 스타일)
 * - 차트 종류: 라인 / 캔들 / 바(OHLC)
 * - 확대·축소: 휠, 두 손가락, 기간 버튼 · 이동: 드래그 · 초기화: 더블클릭
 * - 십자선: 마우스 올리기 / 터치로 탭
 * - 보조지표: 이동평균 5·10·20, 볼린저밴드
 * - 그리기: 수평선, 추세선, 지우기 (종목별로 이 기기에 저장)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { getEffective } from '../prefs';
import type { Bar } from '../game/market';
import { pct } from '../lib/format';
import type { UiMode } from '../session';

export type ChartType = 'line' | 'candle' | 'ohlc';
type Indicator = 'ma5' | 'ma10' | 'ma20' | 'bb';
type Tool = 'none' | 'hline' | 'trend' | 'erase';
type Drawing = { id: string; kind: 'h'; price: number } | { id: string; kind: 't'; i1: number; p1: number; i2: number; p2: number };

const IND_META: Record<Indicator, { label: string; color: string }> = {
  ma5: { label: '이평 5', color: '#f7c548' },
  ma10: { label: '이평 10', color: '#a78bfa' },
  ma20: { label: '이평 20', color: '#34d399' },
  bb: { label: '볼린저', color: '#60a5fa' },
};

function load<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장 못 해도 동작 */
  }
}

interface Props {
  ui: UiMode;
  symbol: string;
  bars: Bar[];
  totalDays: number;
  /** 오늘 봉이 진행 중이면 시가만 */
  liveOpenOnly: boolean;
  refLine?: { value: number; label: string } | null;
  markers?: { day: number; tone: 'good' | 'bad' }[];
  fmt?: (v: number) => string;
  /** 전체 화면용 */
  tall?: boolean;
  onExpand?: () => void;
}

const W = 680;

export function ProChart({ ui, symbol, bars, totalDays, liveOpenOnly, refLine, markers = [], fmt = (v) => Math.round(v).toLocaleString('ko-KR'), tall = false, onExpand }: Props) {
  // 차트 높이: 화면이 높을수록 크게 (작은 노트북에서도 너무 납작하지 않게 기본 2:1 이상)
  const H = tall ? 420 : typeof window !== 'undefined' && window.innerHeight >= 1000 ? 380 : 330;
  const padL = 8;
  const padR = 68;
  const padT = 14;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // 설정: 초보=라인, 일반=캔들이 기본. 바꾼 건 모드별로 기억
  const prefKey = `stockduel.chart.${ui}`;
  // 내 화면 설정에서 차트 모양을 정했으면 그걸 기본으로
  const fixedType = getEffective().chartType;
  const [type, setType] = useState<ChartType>(() => (fixedType !== 'auto' ? fixedType : load<{ type: ChartType }>(prefKey, { type: ui === 'easy' ? 'line' : 'candle' }).type));
  const [inds, setInds] = useState<Indicator[]>(() => load(`stockduel.ind.${ui}`, ui === 'pro' ? ['ma5'] : []));
  useEffect(() => save(prefKey, { type }), [prefKey, type]);
  useEffect(() => save(`stockduel.ind.${ui}`, inds), [ui, inds]);
  useEffect(() => {
    const fixed = getEffective().chartType;
    setType(fixed !== 'auto' ? fixed : load<{ type: ChartType }>(`stockduel.chart.${ui}`, { type: ui === 'easy' ? 'line' : 'candle' }).type);
    setInds(load(`stockduel.ind.${ui}`, ui === 'pro' ? ['ma5'] : []));
  }, [ui]);

  const drawKey = `stockduel.draw.${symbol}`;
  const [drawings, setDrawings] = useState<Drawing[]>(() => load(drawKey, []));
  useEffect(() => setDrawings(load(drawKey, [])), [drawKey]);
  useEffect(() => save(drawKey, drawings), [drawKey, drawings]);
  const [tool, setTool] = useState<Tool>('none');
  const [pending, setPending] = useState<{ i: number; p: number } | null>(null);
  const [indOpen, setIndOpen] = useState(false);

  // 보이는 구간 [v0, v1] (날짜 인덱스, 실수)
  const lastIdx = bars.length - 1;
  // 기본 화면: 지나온 날 + 약간의 여유 (초반에 빈 미래 칸이 대부분이 되지 않게)
  const defaultView = useCallback((): [number, number] => [0, Math.min(totalDays - 1, Math.max(lastIdx + 2, Math.min(totalDays - 1, 9)))], [totalDays, lastIdx]);
  const [view, setView] = useState<[number, number]>(defaultView);
  useEffect(() => setView(defaultView()), [symbol, totalDays, lastIdx, defaultView]);
  const span = view[1] - view[0] + 1;
  const slot = plotW / span;

  const closes = useMemo(() => bars.map((b, i) => (liveOpenOnly && i === lastIdx ? b.open : b.close)), [bars, liveOpenOnly, lastIdx]);
  const ma = useCallback(
    (n: number) => closes.map((_, i) => (i + 1 < n ? null : closes.slice(i + 1 - n, i + 1).reduce((a, v) => a + v, 0) / n)),
    [closes],
  );
  const series = useMemo(() => {
    const out: { key: Indicator; vals: (number | null)[]; lo?: (number | null)[]; hi?: (number | null)[] }[] = [];
    if (inds.includes('ma5')) out.push({ key: 'ma5', vals: ma(5) });
    if (inds.includes('ma10')) out.push({ key: 'ma10', vals: ma(10) });
    if (inds.includes('ma20')) out.push({ key: 'ma20', vals: ma(20) });
    if (inds.includes('bb')) {
      const n = 10;
      const mid = ma(n);
      const sd = closes.map((_, i) => {
        if (i + 1 < n) return null;
        const w = closes.slice(i + 1 - n, i + 1);
        const m = mid[i]!;
        return Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / n);
      });
      out.push({ key: 'bb', vals: mid, lo: mid.map((m, i) => (m === null ? null : m - 2 * sd[i]!)), hi: mid.map((m, i) => (m === null ? null : m + 2 * sd[i]!)) });
    }
    return out;
  }, [inds, ma, closes]);

  // 보이는 구간 기준 세로 범위
  const i0 = Math.max(0, Math.floor(view[0]));
  const i1 = Math.min(lastIdx, Math.ceil(view[1]));
  const [yMin, yMax] = useMemo(() => {
    const vals: number[] = [];
    for (let i = i0; i <= i1; i++) {
      const b = bars[i];
      if (!b) continue;
      if (liveOpenOnly && i === lastIdx) vals.push(b.open);
      else vals.push(b.high, b.low);
      for (const s of series) {
        for (const arr of [s.vals, s.lo, s.hi]) if (arr?.[i] != null) vals.push(arr[i]!);
      }
    }
    if (refLine) vals.push(refLine.value);
    if (!vals.length) vals.push(1);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (lo === hi) {
      lo *= 0.98;
      hi *= 1.02;
    }
    const pad = (hi - lo) * 0.1;
    return [lo - pad, hi + pad];
  }, [i0, i1, bars, liveOpenOnly, lastIdx, series, refLine]);

  const x = (i: number) => padL + (i - view[0] + 0.5) * slot;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const idxAt = (px: number) => (px - padL) / slot - 0.5 + view[0];
  const priceAt = (py: number) => yMin + (1 - (py - padT) / plotH) * (yMax - yMin);

  // ---------- 포인터 조작 ----------
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ startX: number; startView: [number, number]; moved: boolean; pinch?: { dist: number; view: [number, number]; cx: number } } | null>(null);
  const [cross, setCross] = useState<{ i: number; py: number } | null>(null);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  const clampView = useCallback(
    (a: number, b: number): [number, number] => {
      const minSpan = Math.min(5, totalDays);
      let s = Math.max(minSpan, Math.min(totalDays, b - a));
      let start = a;
      if (start < -0.5) start = -0.5;
      if (start + s > totalDays - 0.5) start = totalDays - 0.5 - s;
      if (start < -0.5) {
        start = -0.5;
        s = totalDays;
      }
      return [start + 0.5, start + s - 0.5];
    },
    [totalDays],
  );
  const zoom = useCallback(
    (factor: number, centerIdx: number) => {
      setView(([a, b]) => {
        const s = b - a + 1;
        const ns = s * factor;
        const t = (centerIdx - a + 0.5) / s;
        const na = centerIdx + 0.5 - t * ns;
        return clampView(na - 0.5, na - 0.5 + ns);
      });
    },
    [clampView],
  );

  // 휠 확대/축소 (페이지 스크롤 막기 위해 직접 등록)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e);
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, idxAt(p.x));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const nearDrawing = (px: number, py: number) =>
    drawings.find((d) => {
      if (d.kind === 'h') return Math.abs(y(d.price) - py) < 9;
      const ax = x(d.i1),
        ay = y(d.p1),
        bx = x(d.i2),
        by = y(d.p2);
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
      return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) < 9;
    });

  const onDown = (e: React.PointerEvent) => {
    const p = toSvg(e);
    pointers.current.set(e.pointerId, p);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      drag.current = { startX: 0, startView: view, moved: true, pinch: { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), view, cx: idxAt((p1.x + p2.x) / 2) } };
      return;
    }
    drag.current = { startX: p.x, startView: view, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toSvg(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    const d = drag.current;
    if (d?.pinch && pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const factor = d.pinch.dist / Math.max(10, dist);
      const s = (d.pinch.view[1] - d.pinch.view[0] + 1) * factor;
      const t = (d.pinch.cx - d.pinch.view[0] + 0.5) / (d.pinch.view[1] - d.pinch.view[0] + 1);
      const na = d.pinch.cx + 0.5 - t * s;
      setView(clampView(na - 0.5, na - 0.5 + s));
      return;
    }
    if (d && tool === 'none' && Math.abs(p.x - d.startX) > 4) {
      d.moved = true;
      const shift = (p.x - d.startX) / slot;
      setView(clampView(d.startView[0] - shift - 0.5, d.startView[1] - shift + 0.5));
      setCross(null);
      return;
    }
    if (e.pointerType === 'mouse' || tool !== 'none') {
      const i = Math.round(idxAt(p.x));
      if (i >= 0 && i <= lastIdx && p.y >= padT && p.y <= H - padB) setCross({ i, py: p.y });
      else if (e.pointerType === 'mouse') setCross(null);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const p = toSvg(e);
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (d?.pinch) {
      if (pointers.current.size === 0) drag.current = null;
      return;
    }
    drag.current = null;
    if (d?.moved) return;
    // 탭/클릭
    if (p.y < padT || p.y > H - padB || p.x > W - padR) return;
    if (tool === 'hline') {
      setDrawings((ds) => [...ds, { id: String(Date.now()), kind: 'h', price: priceAt(p.y) }]);
      setTool('none');
    } else if (tool === 'trend') {
      const pt = { i: idxAt(p.x), p: priceAt(p.y) };
      if (!pending) setPending(pt);
      else {
        setDrawings((ds) => [...ds, { id: String(Date.now()), kind: 't', i1: pending.i, p1: pending.p, i2: pt.i, p2: pt.p }]);
        setPending(null);
        setTool('none');
      }
    } else if (tool === 'erase') {
      const hit = nearDrawing(p.x, p.y);
      if (hit) setDrawings((ds) => ds.filter((x) => x.id !== hit.id));
    } else if (e.pointerType !== 'mouse') {
      // 터치: 탭하면 십자선 켜기/끄기
      const i = Math.round(idxAt(p.x));
      setCross((c) => (c && c.i === i ? null : i >= 0 && i <= lastIdx ? { i, py: p.y } : null));
    }
  };

  const setRange = (days: number | null) => {
    if (days === null) return setView([0, totalDays - 1]);
    const end = Math.min(totalDays - 1, lastIdx + 1);
    setView(clampView(end - days + 0.5, end + 0.5));
  };

  // ---------- 그리기 ----------
  const gridVals = [0.15, 0.38, 0.62, 0.85].map((t) => yMin + (yMax - yMin) * t);
  const lastPrice = closes[lastIdx];
  const visible = (i: number) => i >= view[0] - 1 && i <= view[1] + 1;
  const bw = Math.max(2, Math.min(16, slot * 0.62));
  const up = lastIdx > 0 ? lastPrice >= closes[0] : true;
  const lineColor = up ? 'var(--up)' : 'var(--down)';
  const pathOf = (vals: (number | null)[]) => {
    let d = '';
    vals.forEach((v, i) => {
      if (v === null || !visible(i)) return;
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  const dayStep = span > 20 ? 5 : span > 10 ? 2 : 1;
  const ci = cross ? bars[cross.i] : null;
  const prevC = cross ? (cross.i > 0 ? closes[cross.i - 1] : null) : null;
  const crossLive = cross ? liveOpenOnly && cross.i === lastIdx : false;

  return (
    <div className={'pchart' + (tall ? ' tall' : '')}>
      <div className="pc-bar">
        <div className="pc-seg" role="group" aria-label="차트 종류">
          {(
            [
              ['line', '라인'],
              ['candle', '캔들'],
              ['ohlc', '바'],
            ] as [ChartType, string][]
          ).map(([k, l]) => (
            <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="pc-seg" role="group" aria-label="기간">
          {(
            [
              [5, '5일'],
              [10, '10일'],
              [null, '전체'],
            ] as [number | null, string][]
          ).map(([d, l]) => (
            <button key={l} className={(d === null ? span >= totalDays - 0.01 : Math.round(span) === d) ? 'on' : ''} onClick={() => setRange(d)}>
              {l}
            </button>
          ))}
        </div>
        <div className="pc-tools">
          <button className={'pc-ic' + (indOpen || inds.length ? ' on' : '')} onClick={() => setIndOpen((o) => !o)} title="보조지표">
            ƒx{inds.length ? ` ${inds.length}` : ''}
          </button>
          <button className={'pc-ic' + (tool === 'hline' ? ' on' : '')} onClick={() => (setTool(tool === 'hline' ? 'none' : 'hline'), setPending(null))} title="수평선 긋기">
            ─
          </button>
          <button className={'pc-ic' + (tool === 'trend' ? ' on' : '')} onClick={() => (setTool(tool === 'trend' ? 'none' : 'trend'), setPending(null))} title="추세선 긋기 (두 점 클릭)">
            ╱
          </button>
          <button className={'pc-ic' + (tool === 'erase' ? ' on' : '')} onClick={() => (setTool(tool === 'erase' ? 'none' : 'erase'), setPending(null))} title="선 지우기" disabled={!drawings.length}>
            <Icon name="x" size={15} />
          </button>
          {onExpand && (
            <button className="pc-ic" onClick={onExpand} title="크게 보기">
              <Icon name="grid" size={15} />
            </button>
          )}
        </div>
      </div>

      {indOpen && (
        <div className="pc-inds">
          {(Object.keys(IND_META) as Indicator[]).map((k) => (
            <button key={k} className={inds.includes(k) ? 'on' : ''} onClick={() => setInds((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}>
              <i style={{ background: IND_META[k].color }} />
              {IND_META[k].label}
            </button>
          ))}
          {drawings.length > 0 && (
            <button className="pc-clear" onClick={() => setDrawings([])}>
              그린 선 모두 지우기
            </button>
          )}
        </div>
      )}

      {tool !== 'none' && (
        <div className="pc-hint">
          {tool === 'hline' && '차트를 눌러 그 가격에 수평선을 그어요'}
          {tool === 'trend' && (pending ? '끝점을 눌러 주세요' : '추세선의 시작점을 눌러 주세요')}
          {tool === 'erase' && '지울 선을 눌러 주세요'}
          <button onClick={() => (setTool('none'), setPending(null))}>취소</button>
        </div>
      )}

      <div className="pc-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: IND_META[s.key].color }} />
            {IND_META[s.key].label}
            {s.vals[cross?.i ?? lastIdx] != null && <b>{fmt(s.vals[cross?.i ?? lastIdx]!)}</b>}
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        className={'chart pc-svg' + (tool !== 'none' ? ' drawing' : '')}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setCross(null)}
        onDoubleClick={() => setView(defaultView())}
        role="img"
        aria-label="가격 차트. 드래그로 이동, 휠이나 두 손가락으로 확대"
      >
        <defs>
          <clipPath id={`clip-${symbol}`}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
          <linearGradient id={`fill-${symbol}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={up ? '#f2495c' : '#3b82f6'} stopOpacity={0.22} />
            <stop offset="100%" stopColor={up ? '#f2495c' : '#3b82f6'} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} className="grid" />
            <text x={W - padR + 8} y={y(v) + 4} className="axis">
              {fmt(v)}
            </text>
          </g>
        ))}
        {Array.from({ length: totalDays }, (_, d) => d)
          .filter((d) => d % dayStep === 0 && visible(d) && x(d) > padL && x(d) < W - padR)
          .map((d) => (
            <text key={d} x={x(d)} y={H - 6} className="axis" textAnchor="middle">
              {d + 1}일
            </text>
          ))}

        <g clipPath={`url(#clip-${symbol})`}>
          {/* 아직 오지 않은 날 */}
          {lastIdx < totalDays - 1 && <rect x={x(lastIdx + 0.5)} y={padT} width={Math.max(0, W - padR - x(lastIdx + 0.5))} height={plotH} className="future" />}
          {markers.filter((mk) => visible(mk.day)).map((mk, i) => (
            <line key={i} x1={x(mk.day)} x2={x(mk.day)} y1={padT} y2={H - padB} className={'marker ' + mk.tone} />
          ))}
          {refLine && (
            <g>
              <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} className="ref" />
              <text x={padL + 4} y={y(refLine.value) - 5} className="ref-label">
                {refLine.label}
              </text>
            </g>
          )}

          {/* 볼린저 밴드 */}
          {series
            .filter((s) => s.key === 'bb')
            .map((s) => {
              const hi = s.hi!.map((v, i) => [i, v] as const).filter(([i, v]) => v !== null && visible(i));
              const lo = s.lo!.map((v, i) => [i, v] as const).filter(([i, v]) => v !== null && visible(i));
              if (hi.length < 2) return null;
              const area = hi.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i)},${y(v!)}`).join('') + [...lo].reverse().map(([i, v]) => `L${x(i)},${y(v!)}`).join('') + 'Z';
              return (
                <g key="bb">
                  <path d={area} fill={IND_META.bb.color} opacity={0.08} />
                  <path d={pathOf(s.hi!)} fill="none" stroke={IND_META.bb.color} strokeWidth={1} opacity={0.6} />
                  <path d={pathOf(s.lo!)} fill="none" stroke={IND_META.bb.color} strokeWidth={1} opacity={0.6} />
                </g>
              );
            })}

          {/* 가격 */}
          {type === 'line' && closes.length > 0 && (
            <g>
              {closes.length > 1 && (
                <path d={`${pathOf(closes)} L${x(Math.min(lastIdx, view[1] + 1))},${H - padB} L${x(Math.max(0, Math.floor(view[0]) - 1))},${H - padB} Z`} fill={`url(#fill-${symbol})`} />
              )}
              <path d={pathOf(closes)} fill="none" stroke={lineColor} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )}
          {type !== 'line' &&
            bars.map((b, i) => {
              if (!visible(i)) return null;
              const live = liveOpenOnly && i === lastIdx;
              if (live)
                return (
                  <g key={i}>
                    <line x1={x(i) - bw / 2 - 2} x2={x(i) + bw / 2 + 2} y1={y(b.open)} y2={y(b.open)} className="live-open" />
                  </g>
                );
              const upBar = b.close >= b.open;
              const cls = upBar ? 'c-up' : 'c-down';
              if (type === 'ohlc')
                return (
                  <g key={i} className={cls} strokeWidth={1.6}>
                    <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} />
                    <line x1={x(i) - bw / 2} x2={x(i)} y1={y(b.open)} y2={y(b.open)} />
                    <line x1={x(i)} x2={x(i) + bw / 2} y1={y(b.close)} y2={y(b.close)} />
                  </g>
                );
              const top = y(Math.max(b.open, b.close));
              const bot = y(Math.min(b.open, b.close));
              return (
                <g key={i} className={cls}>
                  <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} strokeWidth={1.2} />
                  <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, bot - top)} rx={1.5} />
                </g>
              );
            })}

          {/* 이동평균 */}
          {series
            .filter((s) => s.key !== 'bb')
            .map((s) => (
              <path key={s.key} d={pathOf(s.vals)} fill="none" stroke={IND_META[s.key].color} strokeWidth={1.5} opacity={0.95} />
            ))}

          {/* 내가 그린 선 */}
          {drawings.map((d) =>
            d.kind === 'h' ? (
              <g key={d.id} className="drawn">
                <line x1={padL} x2={W - padR} y1={y(d.price)} y2={y(d.price)} />
              </g>
            ) : (
              <g key={d.id} className="drawn">
                <line x1={x(d.i1)} y1={y(d.p1)} x2={x(d.i2)} y2={y(d.p2)} />
                <circle cx={x(d.i1)} cy={y(d.p1)} r={3} />
                <circle cx={x(d.i2)} cy={y(d.p2)} r={3} />
              </g>
            ),
          )}
          {pending && <circle cx={x(pending.i)} cy={y(pending.p)} r={4} className="pending-pt" />}

          {/* 현재가 점선 */}
          <line x1={padL} x2={W - padR} y1={y(lastPrice)} y2={y(lastPrice)} className="now-line" />
          {type === 'line' && visible(lastIdx) && <circle cx={x(lastIdx)} cy={y(lastPrice)} r={4.5} fill={lineColor} className="pulse" />}

          {/* 십자선 */}
          {cross && (
            <g className="cross">
              <line x1={x(cross.i)} x2={x(cross.i)} y1={padT} y2={H - padB} />
              <line x1={padL} x2={W - padR} y1={cross.py} y2={cross.py} />
            </g>
          )}
        </g>

        {/* 그린 수평선 가격표 */}
        {drawings
          .filter((d): d is Extract<Drawing, { kind: 'h' }> => d.kind === 'h')
          .map((d) => (
            <g key={'l' + d.id} className="drawn-tag">
              <rect x={W - padR + 2} y={y(d.price) - 9} width={padR - 4} height={18} rx={4} />
              <text x={W - padR + 8} y={y(d.price) + 4}>
                {fmt(d.price)}
              </text>
            </g>
          ))}
        {/* 현재가 가격표 */}
        <g className={'now-tag ' + (up ? 'up' : 'down')}>
          <rect x={W - padR + 2} y={y(lastPrice) - 10} width={padR - 4} height={20} rx={5} />
          <text x={W - padR + 8} y={y(lastPrice) + 4}>
            {fmt(lastPrice)}
          </text>
        </g>
        {cross && (
          <g className="cross-tag">
            <rect x={W - padR + 2} y={cross.py - 9} width={padR - 4} height={18} rx={4} />
            <text x={W - padR + 8} y={cross.py + 4}>
              {fmt(priceAt(cross.py))}
            </text>
          </g>
        )}
      </svg>

      {cross && ci && (
        <div className="pc-tip">
          <b>{cross.i + 1}일차</b>
          {crossLive ? (
            <span>
              시가 <b>{fmt(ci.open)}</b> · 오늘 장 진행 중
            </span>
          ) : (
            <>
              <span>
                시 <b>{fmt(ci.open)}</b>
              </span>
              <span>
                고 <b className="up">{fmt(ci.high)}</b>
              </span>
              <span>
                저 <b className="down">{fmt(ci.low)}</b>
              </span>
              <span>
                종 <b>{fmt(ci.close)}</b>
              </span>
              {prevC !== null && <span className={ci.close >= prevC ? 'up' : 'down'}>{pct(ci.close / prevC - 1)}</span>}
            </>
          )}
        </div>
      )}
      {!cross && <div className="pc-help muted">{tall ? '드래그로 이동 · 두 손가락이나 휠로 확대 · 두 번 눌러 원래대로' : '드래그 이동 · 휠/두 손가락 확대 · 탭하면 상세'}</div>}
    </div>
  );
}
