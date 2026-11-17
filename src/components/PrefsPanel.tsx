/** 내 화면 설정: 금액 단위 · 차트 기본 보기 · 자주 쓰는 업종(순서). 이 기기에 저장되어 다음 게임에도 그대로 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useDialogFocus } from './ui';
import { isCustom, resetPrefs, setPrefs, usePrefs } from '../prefs';
import { manExact } from '../lib/format';
import type { UiMode } from '../session';
import { Icon } from './Icon';

/** 열려 있는 창 순서 (Esc 는 맨 위 창만) */
const sheetStack: number[] = [];
let sheetSeq = 0;

export function Sheet({ title, onClose, children, wide, guard }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; guard?: () => boolean | Promise<boolean> }) {
  // guard: 닫기 전에 확인 (예: 쓰던 글이 있으면 물어봄). 닫기 버튼(X)은 그대로 닫힘
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const soft = async () => (!guardRef.current || (await guardRef.current())) && closeRef.current();
  const boxRef = useDialogFocus<HTMLDivElement>();
  useEffect(() => {
    // 창이 겹쳐 있으면 맨 위 창만 Esc 로 닫힘
    const id = ++sheetSeq;
    sheetStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || sheetStack[sheetStack.length - 1] !== id) return;
      e.preventDefault();
      soft();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = sheetStack.indexOf(id);
      if (i >= 0) sheetStack.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="modal-bg" onClick={soft}>
      <div ref={boxRef} tabIndex={-1} className={'modal sheet-modal' + (wide ? ' wide' : '')} role="dialog" aria-modal aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
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

/** 차트 모양 견본 (라인·캔들·바) — 고를 때 어떤 모양인지 바로 보이게 */
function ChartSample({ kind }: { kind: 'line' | 'candle' | 'ohlc' }) {
  // 같은 가격 흐름을 세 모양으로: [시가, 고가, 저가, 종가]
  const bars = [
    [14, 8, 17, 10],
    [10, 6, 13, 12],
    [12, 9, 18, 16],
    [16, 4, 17, 6],
    [6, 2, 9, 4],
  ];
  return (
    <svg className={'chart-sample k-' + kind} viewBox="0 0 60 22" aria-hidden>
      {kind === 'line' ? (
        <polyline points={bars.map((b, i) => `${6 + i * 12},${b[3]}`).join(' ')} />
      ) : (
        bars.map(([o, h, l, c], i) => {
          const x = 6 + i * 12;
          const up = c < o; // 위쪽이 작은 값(화면 좌표)
          return (
            <g key={i} className={up ? 'up' : 'down'}>
              <line x1={x} x2={x} y1={h} y2={l} />
              {kind === 'candle' ? (
                <rect x={x - 3} y={Math.min(o, c)} width={6} height={Math.max(1, Math.abs(c - o))} />
              ) : (
                <>
                  <line x1={x - 3.5} x2={x} y1={o} y2={o} />
                  <line x1={x} x2={x + 3.5} y1={c} y2={c} />
                </>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; sub?: string; sample?: 'line' | 'candle' | 'ohlc' }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.sample && <ChartSample kind={o.sample} />}
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function PrefsPanel({ ui }: { ui: UiMode }) {
  const p = usePrefs();

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
        <span>차트 봉 간격</span>
        <Seg
          value={p.chart}
          onChange={(chart) => {
            setPrefs({ chart });
            // 차트 위 간격 버튼으로 고른 값보다 이 설정이 바로 보이게
            try {
              localStorage.setItem('stockduel.chartIv', chart === 'daily' ? '0' : '5');
            } catch {
              /* 무시 */
            }
          }}
          options={[
            { v: 'live', label: '5초', sub: '지난 날까지 이어서' },
            { v: 'daily', label: '일', sub: '하루에 봉 하나' },
          ]}
        />
      </div>

      <div className="field">
        <span>일봉 차트 모양</span>
        <Seg
          value={p.chartType}
          onChange={(chartType) => setPrefs({ chartType })}
          options={[
            { v: 'auto', label: '모드 기본', sub: '초보 라인 · 일반 캔들' },
            { v: 'line', label: '라인', sample: 'line' },
            { v: 'candle', label: '캔들', sample: 'candle' },
            { v: 'ohlc', label: '바', sample: 'ohlc' },
          ]}
        />
      </div>

      <div className="field">
        <span>초 단위 차트 모양</span>
        <Seg
          value={p.liveChartType ?? 'same'}
          onChange={(liveChartType) => setPrefs({ liveChartType })}
          options={[
            { v: 'same', label: '일봉과 같게', sub: '한쪽을 바꾸면 같이' },
            { v: 'line', label: '라인', sample: 'line' },
            { v: 'candle', label: '캔들', sample: 'candle' },
            { v: 'ohlc', label: '바', sample: 'ohlc' },
          ]}
        />
      </div>

      <button className="btn ghost full" onClick={resetPrefs}>
        설정 내용 처음으로 되돌리기
      </button>
    </div>
  );
}
