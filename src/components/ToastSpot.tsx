/**
 * 속보·알림 띄우는 곳. 편집 중엔 견본 알림을 잡고 끌어서 화면 어디든 놓을 수 있다.
 * 위치는 화면 비율(0~1)로 저장 → 창 크기가 바뀌어도 화면 밖으로 나가지 않음
 * (x=0 이면 왼쪽 끝에 붙고 x=1 이면 오른쪽 끝에 붙도록 자기 크기만큼 당겨 둠)
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
    const calc = (ev: PointerEvent): XY => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      // 왼쪽 위 좌표 → 비율 (화면 가장자리 12px 여백, toastStyle 과 같은 식)
      const sw = W - r.width - 24;
      const sh = H - r.height - 24;
      return { x: sw > 0 ? clamp01((ev.clientX - gx - 12) / sw) : 0.5, y: sh > 0 ? clamp01((ev.clientY - gy - 12) / sh) : 0 };
    };
    const mv = (ev: PointerEvent) => {
      const p = calc(ev);
      Object.assign(el.style, toastStyle(p));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      const p = calc(ev);
      onMove({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <div ref={ref} className={'toast warn sample movable' + cls} style={toastStyle(xy)} onPointerDown={down} title="잡고 끌어서 알림이 뜰 곳에 놓으세요">
      <Icon name="move" size={14} /> 속보·알림은 여기에 떠요
    </div>
  );
}
