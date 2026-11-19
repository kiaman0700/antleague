/**
 * 목록 순서가 바뀔 때 줄이 예전 자리에서 새 자리로 미끄러지게 (FLIP). transform 만 움직여 가볍고,
 * 움직임 줄이기 설정이면 바로 바뀜. 자식 요소에 data-flip="고유값" 을 붙여 쓰고, order 는 순서를 나타내는 글자(예: id 를 이어 붙인 것).
 * 자리는 목록 상자 기준으로 재서 스크롤·창 크기가 바뀌어도 엉뚱하게 움직이지 않음.
 */
import { useLayoutEffect, useRef } from 'react';

export function useFlip<T extends HTMLElement>(order: string) {
  const ref = useRef<T>(null);
  const prev = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const base = box.getBoundingClientRect();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of Array.from(box.children) as HTMLElement[]) {
      const k = el.dataset.flip;
      if (!k) continue;
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - base.left, y: r.top - base.top };
      next.set(k, pos);
      const p = prev.current.get(k);
      if (!p || reduce || typeof el.animate !== 'function') continue;
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 380, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    }
    prev.current = next;
  }, [order]);
  return ref;
}
