/**
 * 실제 증권앱처럼 조작하는 차트 (토스 스타일)
 * - 차트 종류: 라인 / 캔들 / 바(OHLC)
 * - 확대·축소: 휠, 두 손가락 · 이동: 드래그 · 초기화: 더블클릭
 * - 십자선: 마우스 올리기 / 터치로 탭
 * - 보조지표: 이동평균 5·10·20, 볼린저밴드
 * - 그리기: 수평선, 추세선, 지우기 (종목별로 이 기기에 저장)
 */
import { readStored } from "../lib/stored";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { getEffective } from "../prefs";
import type { Bar } from "../game/market";
import { pct } from "../lib/format";
import type { UiMode } from "../session";

export type ChartType = "line" | "candle" | "ohlc";
type Indicator = "ma5" | "ma10" | "ma20" | "bb";
type Tool = "none" | "hline" | "trend" | "erase";
type Drawing =
  | { id: string; kind: "h"; price: number }
  | { id: string; kind: "t"; i1: number; p1: number; i2: number; p2: number };

const IND_META: Record<Indicator, { label: string; color: string }> = {
  ma5: { label: "이평 5", color: "#f7c548" },
  ma10: { label: "이평 10", color: "#a78bfa" },
  ma20: { label: "이평 20", color: "#34d399" },
  bb: { label: "볼린저", color: "#60a5fa" },
};

const load = readStored;
const okType = (v: { type: ChartType }) => v.type === "line" || v.type === "candle" || v.type === "ohlc";
const okInds = (v: Indicator[]) => v.every((x) => typeof x === "string" && x in IND_META);
const okDrawings = (v: Drawing[]) =>
  v.every((d) => d && typeof d === "object" && typeof d.id === "string" && (d.kind === "h" ? Number.isFinite(d.price) : d.kind === "t" && [d.i1, d.p1, d.i2, d.p2].every(Number.isFinite)));
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
  /** 선 색(빨강·파랑)을 정하는 기준 값 — 없으면 보이는 첫 값. 위 가격 표시와 같은 기준(전날 종가)을 넘겨 색이 엇갈리지 않게 */
  colorBase?: number;
  markers?: { day: number; tone: "good" | "bad" | "day" }[];
  fmt?: (v: number) => string;
  /** 전체 화면용 */
  tall?: boolean;
  onExpand?: () => void;
  /** 장중(오늘 5초 가격을 묶은 봉)처럼 '날'이 아닌 칸일 때: 가로축·툴팁 글자, 기간 버튼, 선 저장 칸 */
  unit?: {
    axis: (i: number) => string;
    tip: (i: number) => string;
    /** 최고·최저 표시에 쓸 시각 (예: '2일 0:45') — 없으면 axis */
    when?: (i: number) => string;
    /** 기간 버튼: 봉 수(최근 n개) · null(전체) · 'today'(offset 부터 끝까지 = 오늘 하루) */
    ranges?: [number | null | "today", string][];
    /** 여러 날을 이은 장중 차트에서 '오늘'(또는 마지막 날)이 시작하는 칸 — 처음 화면과 '지금' 줄 위치 기준 */
    offset?: number;
    drawKey: string;
    /** 장중: 지금 칸(5초 단위)과 봉 하나에 든 칸 수 — 아래 '지금' 줄의 표시가 시간에 맞춰 부드럽게 움직임 */
    now?: { tick: number; perBar: number; startAt?: number; n?: number; tickSec?: number };
  };
}

const W = 680;
/** 처음 화면의 봉 칸 수 (간격과 상관없이 같은 굵기) */
const SLOTS = 36;

/** 차트에 그은 선은 판마다 따로 저장 (지난 판의 선이 새 판에 나타나지 않게). 게임 화면이 판이 바뀔 때 정함 */
let drawScope = 'x';
export const drawKeyFor = (symbol: string, day?: number) => `stockduel.draw.${drawScope}.${symbol}` + (day === undefined ? '' : `.d${day}`);
/** 지금 판을 가리키는 짧은 이름 (차트에 그은 선·지난 날 장중 흐름 저장 칸) */
export const getDrawScope = () => drawScope;
export function setDrawScope(scope: string) {
  drawScope = scope.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
  // 다른 판에서 그은 선은 지움 (이 기기 저장 공간이 계속 쌓이지 않게)
  try {
    const keep = `stockduel.draw.${drawScope}.`;
    for (const k of Object.keys(localStorage)) if (k.startsWith('stockduel.draw.') && !k.startsWith(keep)) localStorage.removeItem(k);
  } catch {
    /* 저장소를 못 쓰면 그냥 둠 */
  }
}

export function ProChart({
  ui,
  symbol,
  bars,
  totalDays,
  liveOpenOnly,
  refLine,
  colorBase,
  markers = [],
  fmt = (v) => Math.round(v).toLocaleString("ko-KR"),
  tall = false,
  onExpand,
  unit,
}: Props) {
  // 차트 높이: 화면이 높을수록 크게 (작은 노트북에서도 너무 납작하지 않게 기본 2:1 이상)
  const H = tall
    ? 420
    : typeof window !== "undefined" && window.innerHeight >= 1000
      ? 380
      : 330;
  const padL = 8;
  const padR = 68;
  const padT = 14;
  // 장중 차트는 아래에 '지금' 줄을 하나 더 둠 (시간 눈금은 그대로 보이게)
  const padB = unit?.now ? 50 : 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // 설정: 초보=라인, 일반=캔들이 기본. 바꾼 건 모드별로 기억
  // 차트가 하나로 합쳐져서(5·10·20·30초·일) 모양 설정도 하나 — '초 단위 차트 모양' 설정은 쓰지 않음
  const eff = getEffective();
  const prefKey = `stockduel.chart.${ui}`;
  // 내 화면 설정에서 차트 모양을 정했으면 그걸 기본으로
  const pickFixed = () => getEffective().chartType;
  const fixedType = pickFixed();
  const [type, setTypeRaw] = useState<ChartType>(() =>
    fixedType !== "auto"
      ? fixedType
      : load<{ type: ChartType }>(prefKey, {
          type: ui === "easy" ? "line" : "candle",
        }, okType).type,
  );
  // 같은 값을 쓰는 다른 차트(일별↔장중)도 바로 같이 바뀌게
  const setType = (t: ChartType) => {
    setTypeRaw(t);
    save(prefKey, { type: t });
    window.dispatchEvent(new CustomEvent("stockduel:chartType", { detail: { key: prefKey, type: t } }));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; type: ChartType }>).detail;
      if (d?.key === prefKey) setTypeRaw(d.type);
    };
    window.addEventListener("stockduel:chartType", on);
    return () => window.removeEventListener("stockduel:chartType", on);
  }, [prefKey]);
  const [inds, setInds] = useState<Indicator[]>(() =>
    load<Indicator[]>(`stockduel.ind.${ui}`, ui === "pro" ? ["ma5"] : [], okInds),
  );
  useEffect(() => save(`stockduel.ind.${ui}`, inds), [ui, inds]);
  useEffect(() => {
    const fixed = pickFixed();
    setTypeRaw(
      fixed !== "auto"
        ? fixed
        : load<{ type: ChartType }>(prefKey, {
            type: ui === "easy" ? "line" : "candle",
          }, okType).type,
    );
    setInds(load<Indicator[]>(`stockduel.ind.${ui}`, ui === "pro" ? ["ma5"] : [], okInds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui, prefKey, eff.chartType]);

  const drawKey = unit?.drawKey ?? drawKeyFor(symbol);
  const [drawings, setDrawings] = useState<Drawing[]>(() => load<Drawing[]>(drawKey, [], okDrawings));
  useEffect(() => setDrawings(load<Drawing[]>(drawKey, [], okDrawings)), [drawKey]);
  useEffect(() => save(drawKey, drawings), [drawKey, drawings]);
  const [tool, setTool] = useState<Tool>("none");
  const [pending, setPending] = useState<{ i: number; p: number } | null>(null);
  const [indOpen, setIndOpen] = useState(false);

  // 보이는 구간 [v0, v1] (날짜 인덱스, 실수)
  const lastIdx = bars.length - 1;
  // 기본 화면: 지나온 날 + 약간의 여유 (초반에 빈 미래 칸이 대부분이 되지 않게)
  const offset = unit?.offset;
  const defaultView = useCallback(
    (): [number, number] => {
      // 처음 화면은 늘 봉 SLOTS 칸 — 5·10·20·30초·일 어느 간격이든 봉 굵기·사이가 같게.
      // 봉이 적으면 늘리지 않고 빈칸으로 둠. 장중은 오늘 끝(지금 이후 칸 포함)에, 일봉은 지난날+2칸에 오른쪽 끝을 맞춤
      const anchor = offset != null ? totalDays - 1 : Math.min(totalDays - 1, lastIdx + 2);
      const end = Math.max(SLOTS - 1, anchor);
      return [end - SLOTS + 1, end];
    },
    [totalDays, lastIdx, offset],
  );
  const [view, setViewRaw] = useState<[number, number]>(defaultView);
  // 끌거나 확대했으면 새 봉이 생겨도 화면을 처음 자리로 되돌리지 않음 (지난 날을 보는 중에 1초마다 튀어 돌아가지 않게)
  const moved = useRef(false);
  const setView: typeof setViewRaw = (v) => {
    moved.current = true;
    setViewRaw(v);
  };
  useEffect(() => {
    moved.current = false;
    setViewRaw(defaultView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, totalDays, offset]);
  useEffect(() => {
    if (!moved.current) setViewRaw(defaultView());
  }, [lastIdx, defaultView]);
  const span = view[1] - view[0] + 1;
  const slot = plotW / span;

  const closes = useMemo(
    () =>
      bars.map((b, i) => (liveOpenOnly && i === lastIdx ? b.open : b.close)),
    [bars, liveOpenOnly, lastIdx],
  );
  const ma = useCallback(
    (n: number) =>
      closes.map((_, i) =>
        i + 1 < n
          ? null
          : closes.slice(i + 1 - n, i + 1).reduce((a, v) => a + v, 0) / n,
      ),
    [closes],
  );
  const series = useMemo(() => {
    const out: {
      key: Indicator;
      vals: (number | null)[];
      lo?: (number | null)[];
      hi?: (number | null)[];
    }[] = [];
    if (inds.includes("ma5")) out.push({ key: "ma5", vals: ma(5) });
    if (inds.includes("ma10")) out.push({ key: "ma10", vals: ma(10) });
    if (inds.includes("ma20")) out.push({ key: "ma20", vals: ma(20) });
    if (inds.includes("bb")) {
      const n = 10;
      const mid = ma(n);
      const sd = closes.map((_, i) => {
        if (i + 1 < n) return null;
        const w = closes.slice(i + 1 - n, i + 1);
        const m = mid[i]!;
        return Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / n);
      });
      out.push({
        key: "bb",
        vals: mid,
        lo: mid.map((m, i) => (m === null ? null : m - 2 * sd[i]!)),
        hi: mid.map((m, i) => (m === null ? null : m + 2 * sd[i]!)),
      });
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
        for (const arr of [s.vals, s.lo, s.hi])
          if (arr?.[i] != null) vals.push(arr[i]!);
      }
    }
    if (!vals.length) vals.push(refLine?.value ?? 1);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    // 기준선(어제 종가·내 평균 단가)은 가까이 있을 때만 범위에 넣음 — 멀면 봉이 납작해지니 선은 위/아래 끝에 붙여 표시
    if (refLine) {
      const span = Math.max(hi - lo, hi * 0.01);
      if (refLine.value >= lo - span * 0.6 && refLine.value <= hi + span * 0.6) {
        lo = Math.min(lo, refLine.value);
        hi = Math.max(hi, refLine.value);
      }
    }
    // 세로 범위는 최소 가격의 0.6% — 100원(한 호가)만 움직여도 칸 끝까지 튀어 보이지 않게. 작은 움직임은 가운데서 작게
    const minSpan = ((lo + hi) / 2) * 0.006;
    if (hi - lo < minSpan) {
      const mid = (lo + hi) / 2;
      lo = mid - minSpan / 2;
      hi = mid + minSpan / 2;
    }
    // 실제 주식 차트처럼 위·아래에 여백을 넉넉히 (그래프가 칸을 꽉 채우지 않고 가운데서 오르내리게)
    const pad = (hi - lo) * 0.22;
    return [lo - pad, hi + pad];
  }, [i0, i1, bars, liveOpenOnly, lastIdx, series, refLine]);

  const x = (i: number) => padL + (i - view[0] + 0.5) * slot;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const idxAt = (px: number) => (px - padL) / slot - 0.5 + view[0];
  const priceAt = (py: number) =>
    yMin + (1 - (py - padT) / plotH) * (yMax - yMin);

  // ---------- 포인터 조작 ----------
  // SVG id 는 차트마다 따로 — 작은 차트와 크게 보기가 같은 id(clip-종목)를 쓰면 큰 차트가 작은 차트 크기로 잘림
  const uid = useId().replace(/:/g, "");
  const clipId = `clip-${uid}`;
  const fillId = `fill-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  // 화면에 그려진 폭 대비 SVG 단위 (휴대폰은 차트가 줄어들어 글자가 작아지므로, 최고·최저 글자는 화면 기준 크기로)
  const [unitPerPx, setUnitPerPx] = useState(1);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setUnitPerPx(W / w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{
    startX: number;
    startView: [number, number];
    moved: boolean;
    pinch?: { dist: number; view: [number, number]; cx: number };
  } | null>(null);
  const [cross, setCross] = useState<{ i: number; py: number } | null>(null);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * W) / r.width,
      y: ((e.clientY - r.top) * H) / r.height,
    };
  };
  const clampView = useCallback(
    (a: number, b: number): [number, number] => {
      // 봉이 SLOTS 칸보다 적어도 화면 폭은 SLOTS 칸 (빈칸으로 둠)
      const room = Math.max(totalDays, SLOTS);
      const minSpan = Math.min(5, room);
      let s = Math.max(minSpan, Math.min(room, b - a));
      let start = a;
      if (start < -0.5) start = -0.5;
      if (start + s > room - 0.5) start = room - 0.5 - s;
      if (start < -0.5) {
        start = -0.5;
        s = room;
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
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const nearDrawing = (px: number, py: number) =>
    drawings.find((d) => {
      if (d.kind === "h") return Math.abs(y(d.price) - py) < 9;
      const ax = x(d.i1),
        ay = y(d.p1),
        bx = x(d.i2),
        by = y(d.p2);
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(
        0,
        Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2),
      );
      return (
        Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))) < 9
      );
    });

  const onDown = (e: React.PointerEvent) => {
    const p = toSvg(e);
    pointers.current.set(e.pointerId, p);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      drag.current = {
        startX: 0,
        startView: view,
        moved: true,
        pinch: {
          dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
          view,
          cx: idxAt((p1.x + p2.x) / 2),
        },
      };
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
      const t =
        (d.pinch.cx - d.pinch.view[0] + 0.5) /
        (d.pinch.view[1] - d.pinch.view[0] + 1);
      const na = d.pinch.cx + 0.5 - t * s;
      setView(clampView(na - 0.5, na - 0.5 + s));
      return;
    }
    if (d && tool === "none" && Math.abs(p.x - d.startX) > 4) {
      d.moved = true;
      const shift = (p.x - d.startX) / slot;
      setView(
        clampView(d.startView[0] - shift - 0.5, d.startView[1] - shift + 0.5),
      );
      setCross(null);
      return;
    }
    if (e.pointerType === "mouse" || tool !== "none") {
      const i = Math.round(idxAt(p.x));
      if (i >= 0 && i <= lastIdx && p.y >= padT && p.y <= H - padB)
        setCross({ i, py: p.y });
      else if (e.pointerType === "mouse") setCross(null);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const p = toSvg(e);
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (d?.pinch) {
      // 두 손가락 중 하나만 떼면 남은 손가락으로 이어서 끌기 (예전 시작점으로 끌면 확대가 풀리며 화면이 튐)
      const rest = [...pointers.current.values()][0];
      drag.current = rest ? { startX: rest.x, startView: view, moved: true } : null;
      return;
    }
    drag.current = null;
    if (d?.moved) return;
    // 탭/클릭
    if (p.y < padT || p.y > H - padB || p.x > W - padR) return;
    if (tool === "hline") {
      setDrawings((ds) => [
        ...ds,
        { id: String(Date.now()), kind: "h", price: priceAt(p.y) },
      ]);
      setTool("none");
    } else if (tool === "trend") {
      const pt = { i: idxAt(p.x), p: priceAt(p.y) };
      if (!pending) setPending(pt);
      else {
        setDrawings((ds) => [
          ...ds,
          {
            id: String(Date.now()),
            kind: "t",
            i1: pending.i,
            p1: pending.p,
            i2: pt.i,
            p2: pt.p,
          },
        ]);
        setPending(null);
        setTool("none");
      }
    } else if (tool === "erase") {
      const hit = nearDrawing(p.x, p.y);
      if (hit) setDrawings((ds) => ds.filter((x) => x.id !== hit.id));
    } else if (e.pointerType !== "mouse") {
      // 터치: 탭하면 십자선 켜기/끄기
      const i = Math.round(idxAt(p.x));
      setCross((c) =>
        c && c.i === i ? null : i >= 0 && i <= lastIdx ? { i, py: p.y } : null,
      );
    }
  };


  // ---------- 그리기 ----------
  // 가격 눈금: 실제 증권 앱처럼 딱 떨어지는 값(1·2·2.5·5 × 10ⁿ 간격)
  const gridVals = (() => {
    const span = yMax - yMin;
    if (!(span > 0)) return [yMin];
    // 눈금은 6칸 안팎 (4칸이면 가격 눈금이 2~3개뿐)
    const raw = span / 6;
    const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((s) => s >= raw) ?? 10 * p10;
    const out: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax && out.length < 10; v += step) out.push(v);
    return out;
  })();
  const lastPrice = closes[lastIdx];
  const visible = (i: number) => i >= view[0] - 1 && i <= view[1] + 1;
  // 봉 굵기: 칸의 72% — 봉이 적을 때도 사이가 너무 벌어져 보이지 않게 최대 굵기를 넉넉히
  const bw = Math.max(2, Math.min(34, slot * 0.72));
  const up = colorBase !== undefined && colorBase > 0 ? lastPrice >= colorBase : lastIdx > 0 ? lastPrice >= closes[0] : true;
  const lineColor = up ? "var(--up)" : "var(--down)";
  const pathOf = (vals: (number | null)[]) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v === null || !visible(i)) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  // 보이는 구간 최고·최저 (선 차트는 종가, 봉 차트는 고가·저가 / 아직 시가만 보이는 오늘 봉은 뺌). 봉이 3개 미만이거나 같으면 안 그림
  const hiLo = (() => {
    let hi = -1, lo = -1, hiV = -Infinity, loV = Infinity, n = 0;
    for (let i = i0; i <= i1; i++) {
      const b = bars[i];
      if (!b || (liveOpenOnly && i === lastIdx)) continue;
      n++;
      const h = type === "line" ? closes[i] : b.high;
      const l = type === "line" ? closes[i] : b.low;
      if (h > hiV) (hiV = h), (hi = i);
      if (l < loV) (loV = l), (lo = i);
    }
    return n >= 3 && hiV > loV ? { hi, lo, hiV, loV } : null;
  })();
  const dayStep = span > 60 ? 12 : span > 20 ? 5 : span > 10 ? 2 : 1;
  const ci = cross ? bars[cross.i] : null;
  const prevC = cross ? (cross.i > 0 ? closes[cross.i - 1] : null) : null;
  const crossLive = cross ? liveOpenOnly && cross.i === lastIdx : false;

  return (
    <div className={"pchart" + (tall ? " tall" : "")}>
      <div className="pc-bar">
        <div className="pc-seg" role="group" aria-label="차트 종류">
          {(
            [
              ["line", "라인"],
              ["candle", "캔들"],
              ["ohlc", "바"],
            ] as [ChartType, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              className={type === k ? "on" : ""}
              onClick={() => setType(k)}
            >
              {l}
            </button>
          ))}
        </div>
        {/* 기간 버튼 없이 확대·끌기로 보고, 두 번 눌러 처음 화면 */}
        <div className="pc-tools">
          <button
            className={"pc-ic" + (indOpen || inds.length ? " on" : "")}
            onClick={() => setIndOpen((o) => !o)}
            title="보조지표"
          >
            ƒx{inds.length ? ` ${inds.length}` : ""}
          </button>
          <button
            className={"pc-ic" + (tool === "hline" ? " on" : "")}
            onClick={() => (
              setTool(tool === "hline" ? "none" : "hline"),
              setPending(null)
            )}
            title="수평선 긋기"
          >
            ─
          </button>
          <button
            className={"pc-ic" + (tool === "trend" ? " on" : "")}
            onClick={() => (
              setTool(tool === "trend" ? "none" : "trend"),
              setPending(null)
            )}
            title="추세선 긋기 (두 점 클릭)"
          >
            ╱
          </button>
          <button
            className={"pc-ic" + (tool === "erase" ? " on" : "")}
            onClick={() => (
              setTool(tool === "erase" ? "none" : "erase"),
              setPending(null)
            )}
            title="선 지우기"
            disabled={!drawings.length}
          >
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
            <button
              key={k}
              className={inds.includes(k) ? "on" : ""}
              onClick={() =>
                setInds((s) =>
                  s.includes(k) ? s.filter((x) => x !== k) : [...s, k],
                )
              }
            >
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

      {tool !== "none" && (
        <div className="pc-hint">
          {tool === "hline" && "차트를 눌러 그 가격에 수평선을 그어요"}
          {tool === "trend" &&
            (pending ? "끝점을 눌러 주세요" : "추세선의 시작점을 눌러 주세요")}
          {tool === "erase" && "지울 선을 눌러 주세요"}
          <button onClick={() => (setTool("none"), setPending(null))}>
            취소
          </button>
        </div>
      )}

      <div className="pc-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: IND_META[s.key].color }} />
            {IND_META[s.key].label}
            {s.vals[cross?.i ?? lastIdx] != null && (
              <b>{fmt(s.vals[cross?.i ?? lastIdx]!)}</b>
            )}
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        className={"chart pc-svg" + (tool !== "none" ? " drawing" : "")}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={(e) => e.pointerType === "mouse" && setCross(null)}
        onDoubleClick={() => {
          setView(defaultView());
          moved.current = false;
        }}
        role="img"
        aria-label={`가격 차트. 지금 ${((v: number) => { const t = fmt(v); return t.startsWith("$") ? t : t + "원"; })(lastPrice)}${hiLo ? `, 보이는 구간 최고 ${((v: number) => { const t = fmt(v); return t.startsWith("$") ? t : t + "원"; })(hiLo.hiV)}·최저 ${((v: number) => { const t = fmt(v); return t.startsWith("$") ? t : t + "원"; })(hiLo.loV)}` : ""}. 드래그로 이동, 휠이나 두 손가락으로 확대`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={up ? "#f2495c" : "#3b82f6"}
              stopOpacity={0.22}
            />
            <stop
              offset="100%"
              stopColor={up ? "#f2495c" : "#3b82f6"}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              className="grid"
            />
            {/* 지금 가격 표와 겹치는 눈금 글자는 숨김 (차트 앱들처럼) */}
            {Math.abs(y(v) - y(lastPrice)) >= 14 && (
              <text x={W - padR + 8} y={y(v) + 4} className="axis">
                {fmt(v)}
              </text>
            )}
          </g>
        ))}
        {Array.from({ length: totalDays }, (_, d) => d)
          .filter(
            (d) =>
              d % dayStep === 0 && visible(d) && x(d) > padL && x(d) < W - padR,
          )
          .map((d) => (
            <text
              key={d}
              x={x(d)}
              y={unit?.now ? H - padB + 16 : H - 6}
              className="axis"
              textAnchor="middle"
            >
              {unit ? unit.axis(d) : `${d + 1}일`}
            </text>
          ))}

        {unit?.now && <NowRow now={unit.now} x={(i) => x(i + (offset ?? 0))} padL={padL} right={W - padR} top={padT} plotBottom={H - padB} H={H} />}
        <g clipPath={`url(#${clipId})`}>
          {/* 아직 오지 않은 날 */}
          {lastIdx < totalDays - 1 && (
            <rect
              x={x(lastIdx + 0.5)}
              y={padT}
              width={Math.max(0, W - padR - x(lastIdx + 0.5))}
              height={plotH}
              className="future"
            />
          )}
          {markers
            .filter((mk) => visible(mk.day))
            .map((mk, i) => (
              <line
                key={i}
                x1={x(mk.day)}
                x2={x(mk.day)}
                y1={padT}
                y2={H - padB}
                className={"marker " + mk.tone}
              />
            ))}
          {/* 기준선(어제 종가·평균 단가): 선은 봉 아래, 글자는 봉 위에 (봉에 가려지지 않게 — 아래 refText) */}
          {refLine && y(refLine.value) >= padT && y(refLine.value) <= H - padB && (
            <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} className="ref" />
          )}

          {/* 볼린저 밴드 */}
          {series
            .filter((s) => s.key === "bb")
            .map((s) => {
              const hi = s
                .hi!.map((v, i) => [i, v] as const)
                .filter(([i, v]) => v !== null && visible(i));
              const lo = s
                .lo!.map((v, i) => [i, v] as const)
                .filter(([i, v]) => v !== null && visible(i));
              if (hi.length < 2) return null;
              const area =
                hi
                  .map(([i, v], k) => `${k ? "L" : "M"}${x(i)},${y(v!)}`)
                  .join("") +
                [...lo]
                  .reverse()
                  .map(([i, v]) => `L${x(i)},${y(v!)}`)
                  .join("") +
                "Z";
              return (
                <g key="bb">
                  <path d={area} fill={IND_META.bb.color} opacity={0.08} />
                  <path
                    d={pathOf(s.hi!)}
                    fill="none"
                    stroke={IND_META.bb.color}
                    strokeWidth={1}
                    opacity={0.6}
                  />
                  <path
                    d={pathOf(s.lo!)}
                    fill="none"
                    stroke={IND_META.bb.color}
                    strokeWidth={1}
                    opacity={0.6}
                  />
                </g>
              );
            })}

          {/* 가격 */}
          {type === "line" && closes.length > 0 && (
            <g>
              {closes.length > 1 && (
                <path
                  d={`${pathOf(closes)} L${x(Math.min(lastIdx, view[1] + 1))},${H - padB} L${x(Math.max(0, Math.floor(view[0]) - 1))},${H - padB} Z`}
                  fill={`url(#${fillId})`}
                />
              )}
              <path
                d={pathOf(closes)}
                fill="none"
                stroke={lineColor}
                strokeWidth={2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          )}
          {type !== "line" &&
            bars.map((b, i) => {
              if (!visible(i)) return null;
              const live = liveOpenOnly && i === lastIdx;
              if (live)
                return (
                  <g key={i}>
                    <line
                      x1={x(i) - bw / 2 - 2}
                      x2={x(i) + bw / 2 + 2}
                      y1={y(b.open)}
                      y2={y(b.open)}
                      className="live-open"
                    />
                  </g>
                );
              const upBar = b.close >= b.open;
              const cls = upBar ? "c-up" : "c-down";
              if (type === "ohlc")
                return (
                  <g key={i} className={cls} strokeWidth={1.4} shapeRendering="crispEdges">
                    <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} />
                    <line
                      x1={x(i) - bw / 2}
                      x2={x(i)}
                      y1={y(b.open)}
                      y2={y(b.open)}
                    />
                    <line
                      x1={x(i)}
                      x2={x(i) + bw / 2}
                      y1={y(b.close)}
                      y2={y(b.close)}
                    />
                  </g>
                );
              const top = y(Math.max(b.open, b.close));
              const bot = y(Math.min(b.open, b.close));
              return (
                <g key={i} className={cls}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(b.high)}
                    y2={y(b.low)}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <rect
                    x={x(i) - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(1, bot - top)}
                    shapeRendering="crispEdges"
                  />
                </g>
              );
            })}

          {/* 이동평균 */}
          {series
            .filter((s) => s.key !== "bb")
            .map((s) => (
              <path
                key={s.key}
                d={pathOf(s.vals)}
                fill="none"
                stroke={IND_META[s.key].color}
                strokeWidth={1.5}
                opacity={0.95}
              />
            ))}

          {/* 보이는 구간의 최고가·최저가 표시 (증권 앱처럼) */}
          {hiLo && (
            <g className="hl-mark" aria-hidden>
              {[
                { i: hiLo.hi, v: hiLo.hiV, top: true },
                { i: hiLo.lo, v: hiLo.loV, top: false },
              ].map(({ i, v, top }) => {
                // 토스증권처럼: 최고점 위·최저점 아래에 짧은 선 + '가격원 (지금 대비 %, 시각)'. 글자는 그림 칸 안에 들어오게 좌우·위아래를 맞춤
                const px = x(i);
                const vy = y(v);
                const diff = lastPrice ? (v - lastPrice) / lastPrice : 0;
                const when = unit ? (unit.when ?? unit.axis)(i) : `${i + 1}일`;
                const shown = fmt(v);
                // 처음 하는 사람도 바로 알게 '최고'·'최저' 글자를 앞에
                const label = `${top ? "최고" : "최저"} ${shown}${shown.startsWith("$") ? "" : "원"} (${diff > 0 ? "+" : ""}${(diff * 100).toFixed(2)}%, ${when})`;
                // 휴대폰처럼 차트가 줄어들면 화면 기준 11.5px, 커지면 다른 눈금 글자처럼 함께 커짐
                const fz = Math.max(12, 11.5 * unitPerPx);
                const tw = [...label].reduce((a, c) => a + (/[가-힣]/.test(c) ? 1 : 0.58), 0) * fz;
                const tx = Math.min(W - padR - 4 - tw / 2, Math.max(padL + 2 + tw / 2, px));
                const ty = top ? Math.max(padT + fz * 0.8, vy - 8 - fz * 0.35) : Math.min(H - padB - 3, vy + 8 + fz * 0.95);
                const ly = top ? vy - 3 : vy + 3;
                const ly2 = top ? vy - 7 : vy + 7;
                return (
                  <g key={top ? "h" : "l"} className={top ? "hl-hi" : "hl-lo"}>
                    <line x1={px} x2={px} y1={ly} y2={ly2} />
                    <text x={tx} y={ty} textAnchor="middle" fontSize={fz} strokeWidth={fz / 4}>
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {refLine &&
            (() => {
              const ry = y(refLine.value);
              // 화면 밖이면 선 대신 위/아래 끝에 화살표 글자로
              if (ry < padT)
                return (
                  <text x={padL + 4} y={padT + 4} dominantBaseline="hanging" className="ref-label">
                    ▲ {refLine.label}
                  </text>
                );
              if (ry > H - padB)
                return (
                  <text x={padL + 4} y={H - padB - 6} className="ref-label">
                    ▼ {refLine.label}
                  </text>
                );
              return (
                <g>
                  <text x={padL + 4} y={ry - 5} className="ref-label">
                    {refLine.label}
                  </text>
                </g>
              );
            })()}

          {/* 내가 그린 선 */}
          {drawings.map((d) =>
            d.kind === "h" ? (
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
          {pending && (
            <circle
              cx={x(pending.i)}
              cy={y(pending.p)}
              r={4}
              className="pending-pt"
            />
          )}

          {/* 현재가 점선 */}
          <line
            x1={padL}
            x2={W - padR}
            y1={y(lastPrice)}
            y2={y(lastPrice)}
            className="now-line"
          />
          {type === "line" && visible(lastIdx) && (
            <circle
              cx={x(lastIdx)}
              cy={y(lastPrice)}
              r={4.5}
              fill={lineColor}
              className="pulse"
            />
          )}

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
          .filter((d): d is Extract<Drawing, { kind: "h" }> => d.kind === "h")
          .map((d) => (
            <g key={"l" + d.id} className="drawn-tag">
              <rect
                x={W - padR + 2}
                y={y(d.price) - 9}
                width={padR - 4}
                height={18}
                rx={4}
              />
              <text x={W - padR + 8} y={y(d.price) + 4}>
                {fmt(d.price)}
              </text>
            </g>
          ))}
        {/* 현재가 가격표 */}
        <g className={"now-tag " + (up ? "up" : "down")}>
          <rect
            x={W - padR + 2}
            y={y(lastPrice) - 10}
            width={padR - 4}
            height={20}
            rx={5}
          />
          <text x={W - padR + 8} y={y(lastPrice) + 4}>
            {fmt(lastPrice)}
          </text>
        </g>
        {cross && (
          <g className="cross-tag">
            <rect
              x={W - padR + 2}
              y={cross.py - 9}
              width={padR - 4}
              height={18}
              rx={4}
            />
            <text x={W - padR + 8} y={cross.py + 4}>
              {fmt(priceAt(cross.py))}
            </text>
          </g>
        )}
      </svg>

      {cross && ci && (
        <div className="pc-tip">
          <b>{unit ? unit.tip(cross.i) : `${cross.i + 1}일차`}</b>
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
              {prevC !== null && (
                <span className={ci.close >= prevC ? "up" : "down"}>
                  {pct(ci.close / prevC - 1)}
                </span>
              )}
            </>
          )}
        </div>
      )}
      {!cross && (
        <div className="pc-help muted">
          {/* 터치 기기엔 '휠'이 없으니 손가락 말만, PC 엔 휠 말만 */}
          {document.documentElement.dataset.device === "pc"
            ? tall
              ? "드래그로 이동 · 휠로 확대 · 두 번 눌러 원래대로"
              : "드래그 이동 · 휠로 확대 · 누르면 상세"
            : tall
              ? "끌어서 이동 · 두 손가락으로 확대 · 두 번 눌러 원래대로"
              : "끌어서 이동 · 두 손가락으로 확대 · 누르면 상세"}
        </div>
      )}
    </div>
  );
}

/**
 * 장중 차트 아래 '지금' 줄: 지금 시각 표시가 시간에 맞춰 계속 부드럽게 움직임.
 * 서버가 알려 준 칸(5초)에서 시작해 화면 시계로 다음 칸까지 이어서 흘러감 (다음 칸을 넘어가지는 않음)
 */
function NowRow({ now, x, padL, right, top, plotBottom, H }: { now: { tick: number; perBar: number; startAt?: number; n?: number; tickSec?: number }; x: (i: number) => number; padL: number; right: number; top: number; plotBottom: number; H: number }) {
  const [base, setBase] = useState(() => ({ tick: now.tick, at: Date.now() }));
  const [, setT] = useState(0);
  useEffect(() => setBase({ tick: now.tick, at: Date.now() }), [now.tick]);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);
  // 장 시작 시각이 있으면 시계로 바로 계산 (서버·기기 시계 차이를 감안해 받은 칸 근처로만), 없으면 받은 칸에서 이어 흘림
  const ts = now.tickSec ?? 5;
  const wall = now.startAt ? (Date.now() - now.startAt) / 1000 : base.tick * ts + (Date.now() - base.at) / 1000;
  const sec = Math.max(0, Math.min((now.n ?? Infinity) * ts, Math.max(base.tick * ts, Math.min(base.tick * ts + 10, wall))));
  // 봉 i 는 [i-0.5, i+0.5] 칸을 차지 → 시각 sec 의 위치 = sec / (봉 하나 길이) - 0.5
  const nx = Math.min(right - 1, Math.max(padL + 1, x(sec / (now.perBar * ts) - 0.5)));
  const s = Math.floor(sec);
  const label = `지금 ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const tw = label.length * 7.4 + 18;
  const lx = Math.min(right - tw / 2, Math.max(padL + tw / 2, nx));
  return (
    <g className="now-mark" aria-hidden>
      <line className="now-line" x1={nx} x2={nx} y1={top} y2={plotBottom} />
      <rect x={lx - tw / 2} y={H - 23} width={tw} height={21} rx={10.5} />
      <text x={lx} y={H - 8} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
