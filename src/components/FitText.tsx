/**
 * 한 줄 글자: 칸보다 길면 천천히 옆으로 지나가며 끝까지 보여 줌 (안 길면 그대로).
 * 움직임 줄이기 설정이면 움직이지 않고 … 로 줄이고, 마우스를 올리면 전체 글자가 뜸
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FitText({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const d = Math.ceil(i.scrollWidth - o.clientWidth);
      setDist((p) => (p === (d > 1 ? d : 0) ? p : d > 1 ? d : 0));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [children]);

  const text = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <span
      ref={outer}
      className={'fit-text' + (dist ? ' sliding' : '') + (className ? ' ' + className : '')}
      title={dist ? text : undefined}
      // 이동 거리와 속도(초당 약 30px, 최소 3초)
      style={dist ? ({ '--ft-d': `-${dist}px`, '--ft-t': `${Math.max(3, dist / 30 + 2)}s` } as React.CSSProperties) : undefined}
    >
      <span ref={inner} className="ft-in">
        {children}
      </span>
    </span>
  );
}
