/**
 * PC 화면 배치: 큰 틀(위 줄 + 왼쪽·가운데·오른쪽 칸)은 고정, 조각(종목 목록·차트·뉴스·카드·날짜 줄)은
 * 편집 중에 손잡이를 잡고 끌어서 원하는 칸에 놓으면 그 자리에 맞춰 들어간다(위아래 순서도).
 * 날짜 줄처럼 가로로 긴 조각은 위 줄에만, 나머지는 세 칸 어디든.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PcPanel, PcZone } from '../prefs';
import { Icon } from './Icon';

export const PANEL_LABEL: Record<PcPanel, string> = { timeline: '날짜 줄', list: '종목 목록', detail: '차트·주문', news: '뉴스', cards: '찬스 카드' };
const ZONE_LABEL: Record<PcZone, string> = { top: '위 줄', left: '왼쪽 칸', center: '가운데 칸', right: '오른쪽 칸' };
/** 칸 너비: 넓은 조각(차트)이 있는 칸은 넓게 */
const WIDE: PcPanel[] = ['detail'];
/** 내용만큼만 높이를 쓰는 조각 */
const COMPACT: PcPanel[] = ['cards', 'timeline'];

const canDrop = (p: PcPanel, z: PcZone) => (p === 'timeline' ? z === 'top' : z !== 'top');

interface Drag {
  id: PcPanel;
  x: number;
  y: number;
  over: { zone: PcZone; index: number } | null;
}

interface Props {
  zones: Record<PcZone, PcPanel[]>;
  hidden: PcPanel[];
  editing: boolean;
  render: (id: PcPanel) => ReactNode;
  onChange: (zones: Record<PcZone, PcPanel[]>) => void;
  onToggle: (id: PcPanel) => void;
}

export function DockBoard({ zones, hidden, editing, render, onChange, onToggle }: Props) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // 끄는 중: 마우스 위치의 자리와 순서를 계산
  useEffect(() => {
    if (!drag) return;
    const where = (x: number, y: number): Drag['over'] => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-zone]');
      const zone = el?.dataset.zone as PcZone | undefined;
      if (!el || !zone || !canDrop(dragRef.current!.id, zone)) return null;
      const items = [...el.querySelectorAll<HTMLElement>(':scope > [data-panel]')].filter((p) => p.dataset.panel !== dragRef.current!.id);
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
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: where(e.clientX, e.clientY) } : d));
    const up = () => {
      const d = dragRef.current;
      if (d?.over) {
        const next = Object.fromEntries((Object.keys(zones) as PcZone[]).map((z) => [z, zones[z].filter((p) => p !== d.id)])) as Record<PcZone, PcPanel[]>;
        next[d.over.zone].splice(d.over.index, 0, d.id);
        onChange(next);
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  const start = (id: PcPanel) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDrag({ id, x: e.clientX, y: e.clientY, over: null });
  };

  const visible = (id: PcPanel) => editing || !hidden.includes(id);
  const panel = (id: PcPanel, zone: PcZone) => {
    const off = hidden.includes(id);
    if (!editing) return off ? null : (
      <div key={id} data-panel={id} className={'dock-panel p-' + id + (COMPACT.includes(id) ? ' compact' : '')}>
        {render(id)}
      </div>
    );
    return (
      <div key={id} data-panel={id} className={'dock-panel editing p-' + id + (COMPACT.includes(id) ? ' compact' : '') + (off ? ' off' : '') + (drag?.id === id ? ' dragging' : '')}>
        <div className="es-bar dock-handle" onPointerDown={start(id)} title="잡고 끌어서 다른 자리에 놓으세요">
          <Icon name="grid" size={13} />
          <b>{PANEL_LABEL[id]}</b>
          {off && <span className="es-off">숨김</span>}
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
  const line = (zone: PcZone, i: number) => (drag?.over && drag.over.zone === zone && drag.over.index === i ? <div key={'drop' + i} className={'drop-line' + (zone === 'top' ? ' v' : '')} /> : null);

  const zoneEl = (zone: PcZone) => {
    const items = zones[zone].filter((p) => drag?.id !== p || !drag.over);
    const can = drag ? canDrop(drag.id, zone) : false;
    return (
      <div key={zone} data-zone={zone} className={'dock-zone z-' + zone + (editing ? ' editing' : '') + (can ? ' can-drop' : '') + (drag?.over?.zone === zone ? ' over' : '')}>
        {editing && zones[zone].length === 0 && <div className="dock-empty">{ZONE_LABEL[zone]} · 여기에 놓을 수 있어요</div>}
        {items.flatMap((id, i) => [line(zone, i), panel(id, zone)])}
        {line(zone, items.length)}
      </div>
    );
  };

  // 칸: 평소엔 빈 칸을 빼고, 편집 중엔 빈 칸도 좁게 보여서 놓을 수 있게. 차트가 있는 칸은 넓게
  const allCols: PcZone[] = ['left', 'center', 'right'];
  const cols = editing ? allCols : allCols.filter((z) => zones[z].some(visible));
  const template = cols.map((z) => {
    const shown = zones[z].filter(visible);
    if (!shown.length) return '120px';
    return shown.some((p) => WIDE.includes(p)) ? 'minmax(0, 1fr)' : 'minmax(260px, 310px)';
  });
  // 넓은 칸이 없으면 가운데(없으면 마지막 칸)를 넓게
  if (!template.includes('minmax(0, 1fr)') && template.length) {
    const c = cols.indexOf('center');
    const j = c >= 0 && zones.center.some(visible) ? c : template.findIndex((t) => t !== '120px');
    template[j >= 0 ? j : template.length - 1] = 'minmax(0, 1fr)';
  }

  return (
    <>
      {(editing || zones.top.some(visible)) && zoneEl('top')}
      <main className={'board dock' + (editing ? ' editing' : '')} style={{ gridTemplateColumns: template.join(' ') }}>
        {cols.map(zoneEl)}
      </main>
      {drag && (
        <div className="dock-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          <Icon name="grid" size={13} /> {PANEL_LABEL[drag.id]}
          <small>{drag.over ? `${ZONE_LABEL[drag.over.zone]}에 놓기` : canDrop(drag.id, 'top') ? '위 줄에만 놓을 수 있어요' : '놓을 칸 위로 가져가세요'}</small>
        </div>
      )}
    </>
  );
}
