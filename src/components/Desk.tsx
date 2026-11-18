/** PC 전용 조각: 재산 요약, 일정 타임라인, 카드 트레이, 오른쪽 서랍 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GameCard } from './GameCard';
import { Icon, type IconName } from './Icon';
import { canUse, holdLimit, infoLimitReason, ITEM_MAP, type ItemKind, type PlayerItems } from '../game/items';
import type { EventKind, Market } from '../game/market';
import { STOCK_MAP } from '../game/stocks';
import { pct, tone, wonShort } from '../lib/format';
import type { UiMode } from '../session';
import { Term } from './Term';
import { useEscape } from './ui';

/* ---------------- 재산 요약 (상단 고정) ---------------- */

export function AssetSummary({
  ui,
  cash,
  stock,
  todayPnl,
  todayBase,
  dividends,
  openOrders,
  onOpen,
}: {
  ui: UiMode;
  cash: number;
  stock: number;
  todayPnl: number;
  todayBase: number;
  dividends: number;
  openOrders: number;
  onOpen: () => void;
}) {
  const easy = ui === 'easy';
  const total = cash + stock;
  const stockShare = total > 0 ? stock / total : 0;
  return (
    <button className="asum" onClick={onOpen} title="내 재산 자세히 보기">
      <div className="asum-item">
        <small>현금</small>
        <b>{wonShort(cash)}</b>
      </div>
      <div className="asum-item">
        <small>{easy ? '주식' : '평가금액'}</small>
        <b>{wonShort(stock)}</b>
        <div className="asum-bar">
          <i style={{ width: `${stockShare * 100}%` }} />
        </div>
      </div>
      <div className="asum-item">
        <small>오늘 손익</small>
        <b className={tone(todayPnl)}>
          {todayPnl >= 0 ? '+' : ''}
          {wonShort(todayPnl)}
        </b>
        <em className={tone(todayPnl)}>{pct(todayBase ? todayPnl / todayBase : 0)}</em>
      </div>
      {dividends > 0 && (
        <div className="asum-item">
          <small><Icon name="coins" size={12} /> 배당</small>
          <b className="up">+{wonShort(dividends)}</b>
        </div>
      )}
      {openOrders > 0 && (
        <div className="asum-item">
          <small><Icon name="hourglass" size={12} /> 예약</small>
          <b>{openOrders}건</b>
        </div>
      )}
      <span className="asum-more">자세히 ›</span>
    </button>
  );
}

/* ---------------- 일정 타임라인 (가로 띠) ---------------- */

const EV_ICON: Record<EventKind, IconName> = { story: 'megaphone', fomc: 'dollar', bok: 'bank', earnings: 'bars', expiry: 'warn', dividend: 'coins' };
const EV_LABEL: Record<EventKind, string> = { story: '사건 발표', fomc: '미 연준', bok: '한은', earnings: '실적', expiry: '옵션 만기', dividend: '배당' };

export function Timeline({ market, day, onSelect }: { market: Market; day: number; onSelect: (s: string) => void }) {
  const next = market.events.find((e) => e.day >= day) ?? null;
  const [pick, setPick] = useState<number | null>(null);
  useEffect(() => setPick(null), [day]);
  const trackRef = useRef<HTMLDivElement>(null);
  // 오늘 칸이 가운데 오도록 (페이지는 안 움직이고 띠만 스크롤)
  useEffect(() => {
    const t = trackRef.current;
    const cell = t?.querySelector<HTMLElement>('.tl-cell.today');
    if (t && cell) t.scrollLeft = cell.offsetLeft - t.clientWidth / 2 + cell.clientWidth / 2;
  }, [day]);
  const focusDay = pick ?? next?.day ?? null;
  const focus = focusDay === null ? [] : market.events.filter((e) => e.day === focusDay);
  const payers = focusDay === null ? [] : market.dividends.filter((d) => d.day === focusDay);

  return (
    <div className="tl">
      <div className="tl-track" role="list" aria-label="게임 일정" ref={trackRef}>
        {Array.from({ length: market.totalDays }, (_, d) => {
          const evs = market.events.filter((e) => e.day === d);
          const kinds = [...new Set(evs.map((e) => e.kind))];
          return (
            <button
              key={d}
              role="listitem"
              className={'tl-cell' + (d < day ? ' past' : '') + (d === day ? ' today' : '') + (d === focusDay ? ' focus' : '') + (evs.length ? ' has' : '')}
              onClick={() => setPick(d)}
              title={evs.map((e) => e.title).join(', ') || `${d + 1}일차`}
            >
              <small>{d + 1}</small>
              <span aria-hidden={kinds.length ? undefined : true}>{kinds.length ? kinds.slice(0, 2).map((k) => <Icon key={k} name={EV_ICON[k]} size={12} className={'ev ev-' + k} />) : '·'}</span>
            </button>
          );
        })}
      </div>
      <div className="tl-info">
        {focus.length === 0 ? (
          <span className="muted">{focusDay === null ? '남은 일정이 없어요' : `${focusDay + 1}일차: 특별한 일정 없음`}</span>
        ) : (
          <>
            <b className="tl-dday">{focusDay === day ? '오늘' : focusDay! > day ? `D-${focusDay! - day}` : '지난 일정'}</b>
            {focus.map((e, i) => (
              <span key={i} className="tl-ev" title={e.desc}>
                {e.title}
              </span>
            ))}
            <span className="tl-desc muted">{focus[0].desc}</span>
            {payers.map((p) => (
              <button key={p.symbol} className="rel-chip" onClick={() => onSelect(p.symbol)}>
                {STOCK_MAP[p.symbol].name}
                <i className="up">{p.yieldPct}%</i>
              </button>
            ))}
          </>
        )}
        {/* 아이콘 뜻 (자리가 넉넉할 때만 보임) */}
        <span className="tl-legend" aria-label="날짜 줄 아이콘 뜻">
          {(Object.keys(EV_ICON) as EventKind[]).map((k) => (
            <span key={k}>
              <Icon name={EV_ICON[k]} size={12} className={'ev ev-' + k} /> {EV_LABEL[k]}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/* ---------------- 카드 트레이 (뉴스 아래 고정) ---------------- */

export function CardTray({
  mine,
  day,
  totalDays,
  usedToday,
  canAct,
  busy,
  onUse,
  onOpen,
  version = 6,
  blockReason,
}: {
  version?: number;
  blockReason?: string | null;
  mine: PlayerItems;
  day: number;
  totalDays: number;
  usedToday: Set<ItemKind>;
  canAct: boolean;
  busy: boolean;
  onUse: (k: ItemKind) => void;
  onOpen: () => void;
}) {
  const owned = (Object.entries(mine.inventory) as [ItemKind, number][]).filter(([, n]) => n > 0);
  return (
    <div className="tray">
      <div className="tray-head">
        <b>
          🃏 찬스 카드 <span className="count-badge">{mine.total}/{Math.max(holdLimit(version), mine.total)}</span>
        </b>
        <button className="btn sm" onClick={onOpen}>
          <Icon name="cart" /> 상점 · 전체
        </button>
      </div>
      {/* 카드는 손에 쥔 것처럼 겹쳐 두고, 마우스를 올리면 부채꼴로 촤라락 펼쳐지며 올린 카드가 위로 (터치 기기는 나란히) */}
      <div className={'tray-cards gc-row fan' + (owned.length > 1 ? ' many' : '')} data-n={owned.length} style={{ ['--n' as string]: owned.length }}>
        {owned.length === 0 && <span className="muted small">카드가 없어요</span>}
        {owned.map(([k, n], i) => {
          const d = ITEM_MAP[k];
          const why = canAct ? canUse(mine, k, day, totalDays, usedToday.has(k)) ?? infoLimitReason(version, k, usedToday) : (blockReason ?? '지금은 쓸 수 없어요');
          return (
            <div key={k} className="fan-slot" style={{ ['--i' as string]: i - (owned.length - 1) / 2 }}>
            <GameCard
              kind={k}
              count={n}
              size="sm"
              version={version}
              why={d.passive ? null : why}
              dim={!d.passive && !!why}
              action={d.passive ? undefined : { label: `${d.name} 사용하기`, disabled: !!why || busy, onClick: () => onUse(k) }}
              footer={d.passive ? <span className="tc-auto">자동</span> : undefined}
            />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 오른쪽 서랍 ---------------- */

export function Drawer({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose, open, true);
  return (
    // 닫힌 서랍은 키보드(Tab)로도 들어가지 않게 inert
    <div className={'drawer-bg' + (open ? ' open' : '')} onClick={onClose} aria-hidden={!open} {...(!open ? { inert: '' } : {})}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="drawer-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">{open && children}</div>
      </aside>
    </div>
  );
}

export { Term };
