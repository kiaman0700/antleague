/**
 * PC 화면 배치: 큰 틀(위 줄 + 왼쪽·가운데·오른쪽 칸)은 고정, 조각(종목 목록·차트·뉴스·카드·날짜 줄)은
 * 편집 중에 손잡이를 잡고 끌면 — 놓기 전에도 — 그 자리에 놓았을 때의 배치로 화면이 바로 바뀌어 보인다.
 * 손을 떼면 그대로 확정. 칸 사이·조각 사이 막대를 끌어 크기도 조절(최소·최대 안에서).
 * 날짜 줄처럼 가로로 긴 조각은 위 줄에만 있으므로 움직이는 손잡이가 없다(보이기/숨기기만).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PcPanel, PcZone } from '../prefs';
import { Icon } from './Icon';

export const PANEL_LABEL: Record<PcPanel, string> = { timeline: '날짜 줄', list: '종목 목록', detail: '차트·주문', news: '뉴스', cards: '찬스 카드' };
const ZONE_LABEL: Record<PcZone, string> = { top: '위 줄', left: '왼쪽 칸', center: '가운데 칸', right: '오른쪽 칸' };
/** 칸 너비: 넓은 조각(차트)이 있는 칸은 넓게 */
const WIDE: PcPanel[] = ['detail'];
/** 내용만큼만 높이를 쓰는 조각 (크기를 정하면 그 높이로) */
const COMPACT: PcPanel[] = ['cards', 'timeline'];
const COLS: PcZone[] = ['left', 'center', 'right'];
/** 좁은 칸 너비 범위 */
export const COL_MIN = 240;
export const COL_MAX = 480;
const COL_DEFAULT = 310;
/** 조각 최소 높이 */
const PANEL_MIN = 130;

const canDrop = (p: PcPanel, z: PcZone) => (p === 'timeline' ? z === 'top' : z !== 'top');
/** 움직일 수 있는 조각 (놓을 곳이 둘 이상) */
const movable = (p: PcPanel) => p !== 'timeline';

/** 조각 하나를 다른 자리(순서)로 옮긴 새 배치 */
export function moveTo(zones: Record<PcZone, PcPanel[]>, id: PcPanel, zone: PcZone, index: number): Record<PcZone, PcPanel[]> {
  const next = Object.fromEntries((Object.keys(zones) as PcZone[]).map((z) => [z, zones[z].filter((p) => p !== id)])) as Record<PcZone, PcPanel[]>;
  next[zone].splice(Math.max(0, Math.min(index, next[zone].length)), 0, id);
  return next;
}

/** 칸 너비 템플릿: 넓은 칸은 남는 폭 전부, 좁은 칸은 내가 정한 너비(작은 화면에선 줄어듦) */
export function columnTemplate(cols: PcZone[], zones: Record<PcZone, PcPanel[]>, visible: (p: PcPanel) => boolean, colW: Partial<Record<PcZone, number>>): string[] {
  const template = cols.map((z) => {
    const shown = zones[z].filter(visible);
    if (!shown.length) return '120px';
    if (shown.some((p) => WIDE.includes(p))) return 'minmax(0, 1fr)';
    const w = Math.max(COL_MIN, Math.min(COL_MAX, colW[z] ?? COL_DEFAULT));
    // 화면이 좁으면(작은 노트북·태블릿 가로) 옆 칸이 같이 줄어서 가운데(차트)가 너무 좁아지지 않게
    return `minmax(220px, min(${w}px, ${colW[z] ? 34 : 24}vw))`;
  });
  // 넓은 칸이 없으면 가운데(없으면 첫 내용 있는 칸)를 넓게
  if (!template.includes('minmax(0, 1fr)') && template.length) {
    const c = cols.indexOf('center');
    const j = c >= 0 && zones.center.some(visible) ? c : template.findIndex((t) => t !== '120px');
    template[j >= 0 ? j : template.length - 1] = 'minmax(0, 1fr)';
  }
  return template;
}

interface Drag {
  id: PcPanel;
  x: number;
  y: number;
  over: { zone: PcZone; index: number } | null;
}

export interface DockSizes {
  colW: Partial<Record<PcZone, number>>;
  flex: Partial<Record<PcPanel, number>>;
}

interface Props {
  zones: Record<PcZone, PcPanel[]>;
  hidden: PcPanel[];
  editing: boolean;
  sizes: DockSizes;
  render: (id: PcPanel) => ReactNode;
  onChange: (zones: Record<PcZone, PcPanel[]>, sizes: DockSizes) => void;
  onResize: (sizes: DockSizes) => void;
  onToggle: (id: PcPanel) => void;
}

export function DockBoard({ zones, hidden, editing, sizes, render, onChange, onResize, onToggle }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  /** 끌기 시작할 때의 칸 위치 — 미리보기로 칸 너비가 바뀌어도 '어느 칸 위인지'는 이걸로 정해서 화면이 떨리지 않게 */
  const colRects = useRef<{ zone: PcZone; left: number; right: number }[]>([]);
  const topRect = useRef<DOMRect | null>(null);
  const boardRef = useRef<HTMLElement>(null);
  const [live, setLive] = useState<DockSizes | null>(null);
  const cur = live ?? sizes;

  // 끄는 중: 마우스 위치의 자리와 순서를 계산
  useEffect(() => {
    if (!drag) return;
    const where = (x: number, y: number): Drag['over'] => {
      const id = dragRef.current!.id;
      let zone: PcZone | undefined;
      const t = topRect.current;
      if (id === 'timeline') zone = t && y < t.bottom + 20 ? 'top' : undefined;
      else zone = colRects.current.find((c) => x >= c.left && x < c.right)?.zone;
      if (!zone || !canDrop(id, zone)) return null;
      const el = document.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
      if (!el) return null;
      // 다른 조각들의 지금 위치(끌고 있는 조각 빼고) 중간선 기준으로 순서
      const items = [...el.querySelectorAll<HTMLElement>(':scope > [data-panel]')].filter((p) => p.dataset.panel !== id);
      let index = items.length;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        const mid = zone === 'top' ? r.left + r.width / 2 : r.top + r.height / 2;
        if ((zone === 'top' ? x : y) < mid) {
          index = i;
          break;
        }
      }
      return { zone, index };
    };
    const move = (e: PointerEvent) =>
      setDrag((d) => {
        if (!d) return d;
        const over = where(e.clientX, e.clientY);
        const same = over && d.over && over.zone === d.over.zone && over.index === d.over.index;
        return { ...d, x: e.clientX, y: e.clientY, over: same ? d.over : over };
      });
    const up = () => {
      const d = dragRef.current;
      if (d?.over) {
        const next = moveTo(zones, d.id, d.over.zone, d.over.index);
        // 옮긴 칸들의 높이 비율은 새로 (섞이면 이상해지므로)
        const flex = { ...sizes.flex };
        const from = (Object.keys(zones) as PcZone[]).find((z) => zones[z].includes(d.id));
        for (const p of [...(from ? zones[from] : []), ...next[d.over.zone]]) delete flex[p];
        onChange(next, { ...sizes, flex });
      }
      setDrag(null);
    };
    const cancel = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  const start = (id: PcPanel) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    colRects.current = COLS.map((zone) => {
      const r = document.querySelector<HTMLElement>(`[data-zone="${zone}"]`)?.getBoundingClientRect();
      return r ? { zone, left: r.left - 6, right: r.right + 6 } : null;
    }).filter((x): x is { zone: PcZone; left: number; right: number } => !!x);
    topRect.current = document.querySelector<HTMLElement>('[data-zone="top"]')?.getBoundingClientRect() ?? null;
    setDrag({ id, x: e.clientX, y: e.clientY, over: null });
  };

  // ---- 크기 조절 ----
  /** 칸 사이 막대: 왼쪽 칸 오른쪽 끝. 좁은 쪽 칸 너비를 바꿈 */
  const startColResize = (left: PcZone, right: PcZone) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const lEl = document.querySelector<HTMLElement>(`[data-zone="${left}"]`);
    const rEl = document.querySelector<HTMLElement>(`[data-zone="${right}"]`);
    if (!lEl || !rEl) return;
    const lWide = zones[left].filter(visible).some((p) => WIDE.includes(p)) || !zones[left].some(visible);
    const target = lWide ? right : left;
    const sign = lWide ? -1 : 1;
    const w0 = (target === left ? lEl : rEl).getBoundingClientRect().width;
    const x0 = e.clientX;
    let last: DockSizes = sizes;
    const mv = (ev: PointerEvent) => {
      const w = Math.round(Math.max(COL_MIN, Math.min(COL_MAX, w0 + sign * (ev.clientX - x0))));
      last = { ...sizes, colW: { ...sizes.colW, [target]: w } };
      setLive(last);
    };
    const upH = () => {
      window.removeEventListener('pointermove', mv);
      setLive(null);
      onResize(last);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', upH, { once: true });
  };
  /** 조각 사이 막대: 위·아래 조각 높이를 나눔. 칸 안 모든 조각의 높이를 그때 px 로 비율 저장 */
  const startRowResize = (zone: PcZone, above: PcPanel, below: PcPanel) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.querySelector<HTMLElement>(`[data-zone="${zone}"]`);
    if (!el) return;
    const hs: Partial<Record<PcPanel, number>> = {};
    el.querySelectorAll<HTMLElement>(':scope > [data-panel]').forEach((p) => (hs[p.dataset.panel as PcPanel] = p.getBoundingClientRect().height));
    const a0 = hs[above] ?? 200;
    const b0 = hs[below] ?? 200;
    const y0 = e.clientY;
    let last: DockSizes = sizes;
    const mv = (ev: PointerEvent) => {
      const dy = Math.max(PANEL_MIN - a0, Math.min(b0 - PANEL_MIN, ev.clientY - y0));
      last = { ...sizes, flex: { ...sizes.flex, ...hs, [above]: Math.round(a0 + dy), [below]: Math.round(b0 - dy) } };
      setLive(last);
    };
    const upH = () => {
      window.removeEventListener('pointermove', mv);
      setLive(null);
      onResize(last);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', upH, { once: true });
  };

  // 끄는 중엔 '놓으면 바뀔 배치'를 그대로 보여 줌
  const shown: Record<PcZone, PcPanel[]> = drag?.over ? moveTo(zones, drag.id, drag.over.zone, drag.over.index) : zones;
  const previewFlex = drag?.over ? {} : cur.flex;
  const visible = (id: PcPanel) => editing || !hidden.includes(id);

  const panel = (id: PcPanel, zone: PcZone) => {
    const off = hidden.includes(id);
    if (!editing && off) return null;
    const w = zone === 'top' ? undefined : previewFlex[id];
    const sized = w !== undefined;
    const cls =
      'dock-panel p-' + id + (COMPACT.includes(id) && !sized ? ' compact' : '') + (sized ? ' sized' : '') + (editing ? ' editing' : '') + (off ? ' off' : '') + (drag?.id === id ? ' dragging' : '');
    const style = sized ? { flex: `${w} 1 0px`, minHeight: PANEL_MIN } : undefined;
    if (!editing)
      return (
        <div key={id} data-panel={id} className={cls} style={style}>
          {render(id)}
        </div>
      );
    const canMove = movable(id);
    return (
      <div key={id} data-panel={id} className={cls} style={style}>
        <div
          className={'es-bar' + (canMove ? ' dock-handle' : ' fixed')}
          onPointerDown={canMove ? start(id) : undefined}
          title={canMove ? '잡고 끌어서 다른 자리에 놓으세요' : '이 조각은 위 줄에만 둘 수 있어요'}
        >
          {canMove && <Icon name="grip" size={14} />}
          <b>{PANEL_LABEL[id]}</b>
          {off && <span className="es-off">숨김</span>}
          {drag?.id === id && drag.over && <span className="es-off">여기에 놓여요</span>}
          <span className="es-tools">
            <button className="es-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggle(id)} aria-label={`${PANEL_LABEL[id]} ${off ? '보이기' : '숨기기'}`}>
              <Icon name={off ? 'eyeOff' : 'eye'} size={14} />
            </button>
          </span>
        </div>
        <div className="es-body">{render(id)}</div>
      </div>
    );
  };

  const zoneEl = (zone: PcZone, colIndex = -1) => {
    const items = shown[zone].filter(visible);
    const can = drag ? canDrop(drag.id, zone) : false;
    const nextCol = colIndex >= 0 ? cols[colIndex + 1] : undefined;
    return (
      <div key={zone} data-zone={zone} className={'dock-zone z-' + zone + (editing ? ' editing' : '') + (can ? ' can-drop' : '') + (drag?.over?.zone === zone ? ' over' : '')}>
        {editing && items.length === 0 && <div className="dock-empty">{ZONE_LABEL[zone]} · 여기에 놓을 수 있어요</div>}
        {items.flatMap((id, i) => {
          const out = [panel(id, zone)];
          // 조각 사이 높이 조절 막대 (편집 중, 세로 칸에서만)
          if (editing && !drag && zone !== 'top' && i < items.length - 1)
            out.push(
              <div key={'rs' + id} className="dock-rs row" onPointerDown={startRowResize(zone, id, items[i + 1])} title="끌어서 위아래 크기 조절" role="separator" aria-orientation="horizontal">
                <i />
              </div>,
            );
          return out;
        })}
        {editing && !drag && nextCol && (
          <div className="dock-rs col" onPointerDown={startColResize(zone, nextCol)} title="끌어서 칸 너비 조절" role="separator" aria-orientation="vertical">
            <i />
          </div>
        )}
      </div>
    );
  };

  // 칸: 평소엔 빈 칸을 빼고, 편집 중엔 빈 칸도 좁게 보여서 놓을 수 있게
  const cols = editing ? COLS : COLS.filter((z) => shown[z].some(visible));
  const template = columnTemplate(cols, shown, visible, cur.colW);

  return (
    <>
      {(editing || shown.top.some(visible)) && zoneEl('top')}
      <main ref={boardRef} className={'board dock' + (editing ? ' editing' : '') + (drag ? ' dragging' : '')} style={{ gridTemplateColumns: template.join(' ') }}>
        {cols.map((z, i) => zoneEl(z, i))}
      </main>
      {drag && (
        <div className="dock-ghost" style={{ left: Math.min(drag.x + 14, window.innerWidth - 200), top: Math.min(drag.y + 14, window.innerHeight - 60) }}>
          <span>
            <Icon name="grip" size={13} /> {PANEL_LABEL[drag.id]}
          </span>
          <small>{drag.over ? `${ZONE_LABEL[drag.over.zone]}에 놓기 · 손을 떼면 확정` : '놓을 칸 위로 가져가세요 · Esc 로 취소'}</small>
        </div>
      )}
    </>
  );
}
