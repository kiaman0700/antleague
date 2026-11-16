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

interface Props {
  toast: { text: string; kind: 'ok' | 'err' | 'warn' } | null;
  editing: boolean;
  pos: 'top' | 'bottom';
  xy: XY | null;
  onMove: (xy: XY) => void;
}

export function ToastSpot({ toast, editing, pos, xy, onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const vRef = useRef<HTMLElement>(null);
  const hRef = useRef<HTMLElement>(null);
  const cls = (xy ? ' free' : pos === 'bottom' ? ' at-bottom' : '');
  if (toast)
    return (
      <div className={'toast ' + toast.kind + cls} style={toastStyle(xy)} role="status">
        {toast.text}
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
    const SNAP = 16; // 이만큼(px) 가까우면 붙음
    const snap = (v: number, span: number) => {
      for (const t of [0, 0.5, 1]) if (span > 0 && Math.abs(v - t) * span < SNAP) return { v: t, hit: t as number | null };
      return { v, hit: null as number | null };
    };
    const calc = (ev: PointerEvent) => {
      // 왼쪽 위 좌표 → 비율 (화면 가장자리 12px 여백, toastStyle 과 같은 식)
      const raw = { x: sw > 0 ? clamp01((ev.clientX - gx - 12) / sw) : 0.5, y: sh > 0 ? clamp01((ev.clientY - gy - 12) / sh) : 0 };
      const sx = snap(raw.x, sw);
      const sy = snap(raw.y, sh);
      return { p: { x: sx.v, y: sy.v }, hx: sx.hit, hy: sy.hit };
    };
    // 보조선: 붙은 기준(왼쪽 끝·가운데·오른쪽 끝 / 위·가운데·아래)에 선을 그음
    const lineAt = (axis: 'x' | 'y', t: number | null) => {
      const g = axis === 'x' ? vRef.current : hRef.current;
      if (!g) return;
      if (t === null) return void (g.style.display = 'none');
      const pos = axis === 'x' ? (t === 0 ? 12 : t === 1 ? W - 12 : W / 2) : t === 0 ? 12 : t === 1 ? H - 12 : H / 2;
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
      <div ref={ref} className={'toast warn sample movable' + cls} style={toastStyle(xy)} onPointerDown={down} title="잡고 끌어서 알림이 뜰 곳에 놓으세요">
        <Icon name="move" size={14} /> 속보·알림은 여기에 떠요 · 끌어서 옮기기
      </div>
      <i ref={vRef} className="snap-guide v" aria-hidden />
      <i ref={hRef} className="snap-guide h" aria-hidden />
    </>
  );
}
