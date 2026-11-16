/** 내 화면 설정: 금액 단위 · 차트 기본 보기 · 자주 쓰는 업종(순서). 이 기기에 저장되어 다음 게임에도 그대로 */
import { useEffect, type ReactNode } from 'react';
import { isCustom, resetPrefs, setPrefs, usePrefs } from '../prefs';
import { manExact } from '../lib/format';
import { STOCK_SECTORS } from '../game/stocks';
import type { UiMode } from '../session';
import { Icon, SectorIcon } from './Icon';

export function Sheet({ title, onClose, children, wide, guard }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; guard?: () => boolean }) {
  // guard: 닫기 전에 확인 (예: 쓰던 글이 있으면 물어봄). 닫기 버튼(X)은 그대로 닫힘
  const soft = () => (!guard || guard()) && onClose();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && soft();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={soft}>
      <div className={'modal sheet-modal' + (wide ? ' wide' : '')} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; sub?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function PrefsPanel({ ui }: { ui: UiMode }) {
  const p = usePrefs();
  const pins = p.sectorPins ?? [];
  const move = (i: number, d: number) => {
    const next = [...pins];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPrefs({ sectorPins: next });
  };
  const toggle = (id: string) => setPrefs({ sectorPins: pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id] });

  return (
    <div className="prefs">
      <p className="muted small">
        {isCustom(p) ? '커스텀 모드를 쓰고 있어요. ' : `지금은 ${ui === 'easy' ? '초보' : '일반'} 모드예요. 여기서 바꾼 설정은 커스텀 모드를 고르면 적용돼요. `}
        이 기기에 저장돼서 다음 게임에도 그대로예요.
      </p>

      <div className="field">
        <span>금액 표시</span>
        <Seg
          value={p.money}
          onChange={(money) => setPrefs({ money })}
          options={[
            { v: 'auto', label: '모드 기본', sub: '초보 만원 · 일반 원' },
            { v: 'man', label: '만원', sub: manExact(1_250_300) },
            { v: 'won', label: '원', sub: '1,250,300원' },
          ]}
        />
      </div>

      <div className="field">
        <span>차트 기본 보기</span>
        <Seg
          value={p.chart}
          onChange={(chart) => setPrefs({ chart })}
          options={[
            { v: 'live', label: '오늘 장중' },
            { v: 'daily', label: '일별' },
          ]}
        />
      </div>

      <div className="field">
        <span>일별 차트 모양</span>
        <Seg
          value={p.chartType}
          onChange={(chartType) => setPrefs({ chartType })}
          options={[
            { v: 'auto', label: '모드 기본', sub: '초보 라인 · 일반 캔들' },
            { v: 'line', label: '라인' },
            { v: 'candle', label: '캔들' },
            { v: 'ohlc', label: '바' },
          ]}
        />
      </div>

      <div className="field">
        <span>자주 보는 업종 (종목 목록 위에 이 순서로 나와요)</span>
        {pins.length > 0 && (
          <ol className="pin-order">
            {pins.map((id, i) => {
              const s = STOCK_SECTORS.find((x) => x.id === id);
              if (!s) return null;
              return (
                <li key={id}>
                  <SectorIcon id={id} />
                  <span className="grow">{s.name}</span>
                  <button className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${s.name} 위로`}>
                    <Icon name="up" />
                  </button>
                  <button className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === pins.length - 1} aria-label={`${s.name} 아래로`}>
                    <Icon name="down" />
                  </button>
                  <button className="icon-btn sm" onClick={() => toggle(id)} aria-label={`${s.name} 빼기`}>
                    <Icon name="x" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="pin-pick">
          {STOCK_SECTORS.filter((s) => !pins.includes(s.id)).map((s) => (
            <button key={s.id} className="chip" onClick={() => toggle(s.id)}>
              <SectorIcon id={s.id} /> {s.name} <Icon name="plus" />
            </button>
          ))}
        </div>
      </div>

      <button className="btn ghost full" onClick={resetPrefs}>
        설정 내용 처음으로 되돌리기
      </button>
    </div>
  );
}
