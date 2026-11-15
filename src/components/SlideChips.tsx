/**
 * 칩 줄: 좌우로 밀어서 보는 슬라이드 (펼치지 않아서 아래 정보가 그대로 보임)
 * - 넘치는 쪽에 흐림 + ◀ ▶ 버튼, PC 는 휠·마우스 끌기로도 이동, 고른 칩은 저절로 보이게
 * - 화면 편집 중(reorder 있음)에는 칩을 끌어서 순서를 바꿈
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface SlideItem {
  id: string;
  node: ReactNode;
  /** 순서를 바꿀 수 없는 칩 (예: '모두') */
  fixed?: boolean;
  active?: boolean;
}

interface Props {
  items: SlideItem[];
  /** 편집 중이면 끌어서 순서 바꾸기 → 새 순서(고정 칩 제외 id 들) */
  onReorder?: (ids: string[]) => void;
  label?: string;
  className?: string;
}

export function SlideChips({ items, onReorder, label, className }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const [dragId, setDragId] = useState<string | null>(null);
  // 끌고 있는 칩은 바로 기억 (화면 상태 반영을 기다리면 첫 움직임을 놓침)
  const dragRef = useRef<string | null>(null);
  const editing = !!onReorder;

  const update = () => {
    const el = track.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdge((p) => (p.l === l && p.r === r ? p : { l, r }));
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // 세로 휠 → 가로 이동 (넘칠 때만)
    const onWheel = (e: WheelEvent) => {
      if (
        Math.abs(e.deltaY) > Math.abs(e.deltaX) &&
        el.scrollWidth > el.clientWidth
      ) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // 고른 칩이 보이게
  const activeId = items.find((i) => i.active)?.id;
  useEffect(() => {
    const el = track.current?.querySelector<HTMLElement>(
      `[data-chip="${activeId}"]`,
    );
    el?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeId]);

  const by = (dx: number) =>
    track.current?.scrollBy({ left: dx, behavior: "smooth" });

  // ---- PC 마우스로 끌어서 넘기기 (편집 중이 아닐 때) ----
  const pan = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onTrackDown = (e: React.PointerEvent) => {
    if (editing || e.pointerType !== "mouse" || !track.current) return;
    pan.current = {
      x: e.clientX,
      left: track.current.scrollLeft,
      moved: false,
    };
  };
  const onTrackMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (!p || !track.current) return;
    const dx = e.clientX - p.x;
    if (Math.abs(dx) > 4) p.moved = true;
    track.current.scrollLeft = p.left - dx;
  };
  const onTrackUp = () => {
    // 끌었으면 칩 클릭으로 처리되지 않게 잠깐 막음
    if (pan.current?.moved) {
      const stop = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      track.current?.addEventListener("click", stop, {
        capture: true,
        once: true,
      });
    }
    pan.current = null;
  };

  // ---- 편집 중: 칩을 끌어서 순서 바꾸기 ----
  const order = items.filter((i) => !i.fixed).map((i) => i.id);
  const onChipDown = (id: string) => (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* 포인터를 잡을 수 없는 환경이면 그냥 진행 */
    }
    dragRef.current = id;
    setDragId(id);
  };
  const onChipMove = (e: React.PointerEvent) => {
    const dragging = dragRef.current;
    if (!dragging || !track.current) return;
    // 가장자리에 가까우면 줄을 같이 넘김
    const r = track.current.getBoundingClientRect();
    if (e.clientX < r.left + 28) track.current.scrollLeft -= 10;
    else if (e.clientX > r.right - 28) track.current.scrollLeft += 10;
    const over = (
      document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    )?.closest<HTMLElement>("[data-chip]");
    const target = over?.dataset.chip;
    if (!target || target === dragging || !order.includes(target)) return;
    const next = order.filter((x) => x !== dragging);
    next.splice(order.indexOf(target), 0, dragging);
    onReorder?.(next);
  };
  const onChipUp = () => {
    dragRef.current = null;
    setDragId(null);
  };

  // 맨 앞의 고정 칩('전체'·'모두')은 줄 밖에 붙여 둬서 넘겨도 늘 보이고 바로 누를 수 있게
  let lead = 0;
  while (lead < items.length && items[lead].fixed) lead++;
  const pinned = items.slice(0, lead);
  const sliding = items.slice(lead);

  return (
    <div
      className={
        "slide-chips" +
        (pinned.length ? " has-pin" : "") +
        (edge.l ? " fade-l" : "") +
        (edge.r ? " fade-r" : "") +
        (editing ? " editing" : "") +
        (className ? " " + className : "")
      }
      aria-label={label}
    >
      {pinned.length > 0 && (
        <div className="sl-pin">
          {pinned.map((it) => (
            <span key={it.id} data-chip={it.id} className="sl-item">
              {it.node}
            </span>
          ))}
        </div>
      )}
      <div className="sl-wrap">
        {edge.l && (
          <button
            className="sl-arrow l"
            onClick={() => by(-180)}
            aria-label="왼쪽으로 넘기기"
          >
            <Icon name="left" size={16} />
          </button>
        )}
        <div
          className="sl-track"
          ref={track}
          onScroll={update}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerLeave={onTrackUp}
        >
          {sliding.map((it) => (
            <span
              key={it.id}
              data-chip={it.id}
              className={
                "sl-item" +
                (dragId === it.id ? " dragging" : "") +
                (editing && !it.fixed ? " movable" : "")
              }
              onPointerDown={it.fixed ? undefined : onChipDown(it.id)}
              onPointerMove={onChipMove}
              onPointerUp={onChipUp}
              onPointerCancel={onChipUp}
            >
              {it.node}
            </span>
          ))}
        </div>
        {edge.r && (
          <button
            className="sl-arrow r"
            onClick={() => by(180)}
            aria-label="오른쪽으로 넘기기"
          >
            <Icon name="right" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 일부(지금 보이는 칩들)만 새 순서로 바꿨을 때 전체 순서에 반영:
 * 전체 순서에서 그 칩들이 있던 자리에 새 순서대로 채움
 */
export function reorderSubset(all: string[], subsetNew: string[]): string[] {
  const set = new Set(subsetNew);
  const out = [...all];
  let k = 0;
  for (let i = 0; i < out.length; i++)
    if (set.has(out[i])) out[i] = subsetNew[k++];
  return out;
}
