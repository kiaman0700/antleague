/**
 * 속보·알림 띄우는 곳. 편집 중엔 견본 알림을 잡고 끌어서 화면 어디든 놓을 수 있다.
 * 위치는 화면 비율(0~1)로 저장 → 창 크기가 바뀌어도 화면 밖으로 나가지 않음
 * (x=0 이면 왼쪽 끝에 붙고 x=1 이면 오른쪽 끝에 붙도록 자기 크기만큼 당겨 둠)
 * 끌 때 왼쪽·가운데·오른쪽 / 위·가운데·아래 근처에 오면 보조선을 보여 주고 그 자리에 딱 붙음 (발표 프로그램의 맞춤 기능처럼)
 */
import { useRef, type CSSProperties } from 'react';
import { Icon } from './Icon';

export type XY = { x: number; y: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function toastStyle(xy: XY | null): CSSProperties | undefined {
  if (!xy) return undefined;
  return {
    left: `calc(${xy.x * 100}% + ${(0.5 - xy.x) * 24}px)`,
    top: `calc(${xy.y * 100}% + ${(0.5 - xy.y) * 24}px)`,
    bottom: 'auto',
    right: 'auto',
    transform: `translate(${-xy.x * 100}%, ${-xy.y * 100}%)`,
  };
}

/** 알림 한 개: 보통 알림(확인·오류·주의) 또는 장중 속보(호재·악재, 누르면 그 종목으로) */
export type ToastMsg = { text: string; kind: 'ok' | 'err' | 'warn' | 'news'; tone?: 'good' | 'bad'; sub?: string; symbol?: string };

interface Props {
  /** 이 자리가 맡는 것: 장중 속보 / 보통 알림 (따로 옮길 수 있음) */
  slot: 'news' | 'alert';
  toast: ToastMsg | null;
  /** 속보 알림을 누르면 그 종목 보기 */
  onPick?: (symbol: string) => void;
  editing: boolean;
  pos: 'top' | 'bottom';
  xy: XY | null;
  onMove: (xy: XY) => void;
  /** 보통 알림을 누르면 바로 닫기 (가리는 걸 기다리지 않게) */
  onDismiss?: () => void;
}

export function ToastSpot({ slot, toast, editing, pos, xy, onMove, onPick, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLElement>(null);
  const hRef = useRef<HTMLElement>(null);
  const cls = (xy ? ' free' : pos === 'bottom' ? ' at-bottom' : '');
  if (toast?.kind === 'news')
    return (
      <button type="button" className={'toast news ' + (toast.tone ?? 'good') + cls} style={toastStyle(xy)} role="status" onClick={() => toast.symbol && onPick?.(toast.symbol)}>
        <span className="tn-badge">속보</span>
        <span className="tn-body">
          <b>{toast.text}</b>
          {toast.sub && <small>{toast.sub}</small>}
        </span>
      </button>
    );
  if (toast)
    return (
      <div className={'toast ' + toast.kind + cls + (onDismiss ? ' dismiss' : '')} style={toastStyle(xy)} role="status" title={onDismiss ? '누르면 닫혀요' : undefined} onClick={onDismiss}>
        <Icon name={toast.kind === 'err' ? 'warn' : toast.kind === 'warn' ? 'bell' : 'check'} size={16} />
        <span>{toast.text}</span>
      </div>
    );
  if (!editing) return null;

  // 견본 잡고 끌기: 잡은 지점을 유지하며 이동, 놓는 순간 저장
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gx = e.clientX - r.left;
    const gy = e.clientY - r.top;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sw = W - r.width - 24;
    const sh = H - r.height - 24;
    const SNAP = 10; // 이만큼(px) 가까우면 붙음
    const w = r.width;
    const h = r.height;
    // 맞춤 기준선 (발표 프로그램의 스마트 가이드처럼):
    //  - 화면: 양 끝(여백 12px)·¼·½·¾ 선 — 알림의 가장자리 또는 가운데가 그 선에 맞음
    //  - 다른 칸(종목 목록·차트·뉴스·카드·점수줄 등): 그 칸의 왼쪽·가운데·오른쪽 / 위·가운데·아래
    type Line = { pos: number; edge: 'start' | 'center' | 'end' };
    const xs: Line[] = [
      { pos: 12, edge: 'start' },
      { pos: W - 12, edge: 'end' },
      ...[0.25, 0.5, 0.75].map((f) => ({ pos: W * f, edge: 'center' as const })),
    ];
    const ys: Line[] = [
      { pos: 12, edge: 'start' },
      { pos: H - 12, edge: 'end' },
      ...[0.25, 0.5, 0.75].map((f) => ({ pos: H * f, edge: 'center' as const })),
    ];
    for (const n of document.querySelectorAll<HTMLElement>('.dock-panel, .desk-score, .hud, .m-top, .m-page, .bottom-nav, .edit-slot')) {
      const b = n.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      xs.push({ pos: b.left, edge: 'start' }, { pos: b.left + b.width / 2, edge: 'center' }, { pos: b.right, edge: 'end' });
      ys.push({ pos: b.top, edge: 'start' }, { pos: b.top + b.height / 2, edge: 'center' }, { pos: b.bottom, edge: 'end' });
    }
    // 기준선에 알림의 어느 부분을 맞출지: 시작 선엔 알림의 시작, 끝 선엔 알림의 끝, 가운데 선엔 가운데 (+ 칸 가장자리는 알림 시작·끝 모두 후보)
    const fit = (raw: number, size: number, lines: Line[]) => {
      let best: { at: number; line: number; d: number } | null = null;
      for (const l of lines) {
        const cands = l.edge === 'center' ? [l.pos - size / 2] : [l.pos, l.pos - size];
        for (const at of cands) {
          const d = Math.abs(at - raw);
          if (d < SNAP && (!best || d < best.d)) best = { at, line: l.pos, d };
        }
      }
      return best;
    };
    const calc = (ev: PointerEvent) => {
      // 알림 왼쪽 위 좌표(px) → 기준선에 붙이기 → 비율 (toastStyle 과 같은 식: 왼쪽 = 12 + x × (W - 24 - 폭))
      let L = Math.min(W - 12 - w, Math.max(12, ev.clientX - gx));
      let T = Math.min(H - 12 - h, Math.max(12, ev.clientY - gy));
      const fx = fit(L, w, xs);
      const fy = fit(T, h, ys);
      if (fx) L = fx.at;
      if (fy) T = fy.at;
      return { p: { x: sw > 0 ? clamp01((L - 12) / sw) : 0.5, y: sh > 0 ? clamp01((T - 12) / sh) : 0 }, hx: fx?.line ?? null, hy: fy?.line ?? null };
    };
    // 보조선: 붙은 기준선 위치에 선을 그음
    const lineAt = (axis: 'x' | 'y', pos: number | null) => {
      const g = axis === 'x' ? vRef.current : hRef.current;
      if (!g) return;
      if (pos === null) return void (g.style.display = 'none');
      g.style.display = 'block';
      if (axis === 'x') g.style.left = pos + 'px';
      else g.style.top = pos + 'px';
    };
    const mv = (ev: PointerEvent) => {
      const { p, hx, hy } = calc(ev);
      Object.assign(el.style, toastStyle(p));
      lineAt('x', hx);
      lineAt('y', hy);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      lineAt('x', null);
      lineAt('y', null);
      const { p } = calc(ev);
      onMove({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <>
      <div ref={ref} className={'toast sample movable ' + (slot === 'news' ? 'news-sample' : 'ok alert-sample') + cls} style={toastStyle(xy)} onPointerDown={down} title={slot === 'news' ? '잡고 끌어서 장중 속보가 뜰 곳에 놓으세요' : '잡고 끌어서 알림이 뜰 곳에 놓으세요'}>
        <Icon name="move" size={14} /> {slot === 'news' ? '속보는 여기에 떠요' : '알림(샀어요·오류 등)은 여기에 떠요'} · 끌어서 옮기기
      </div>
      <i ref={vRef} className="snap-guide v" aria-hidden />
      <i ref={hRef} className="snap-guide h" aria-hidden />
    </>
  );
}
