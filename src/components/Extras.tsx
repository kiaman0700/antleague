import { useEffect, useState, type ReactNode } from 'react';
import type { OrderRow } from '../engine/engine';
import type { Market } from '../game/market';
import type { PortfolioState } from '../game/portfolio';
import { fmtUsd } from '../game/quote';
import { STOCK_MAP } from '../game/stocks';
import { num, wonShort } from '../lib/format';

/* ---------------- 일정 ---------------- */

export function dDay(eventDay: number, day: number) {
  return eventDay === day ? '오늘' : `D-${eventDay - day}`;
}

export function nextEvent(m: Market, day: number) {
  return m.events.find((e) => e.day >= day) ?? null;
}

export function Calendar({ market, day, onSelect, compact = false, hideTitle = false }: { market: Market; day: number; onSelect: (s: string) => void; compact?: boolean; hideTitle?: boolean }) {
  const upcoming = market.events.filter((e) => e.day >= day);
  const shown = compact ? upcoming.slice(0, 3) : upcoming;
  if (!shown.length) return null;
  return (
    <div className="calendar">
      {!hideTitle && <h4 className="sec-head">📅 다가오는 일정</h4>}
      {shown.map((e, i) => {
        const payers = e.kind === 'dividend' ? market.dividends.filter((d) => d.day === e.day) : [];
        return (
          <div key={i} className={'cal-row' + (e.day === day ? ' today' : '') + ' k-' + e.kind}>
            <div className="cal-d">
              <b>{dDay(e.day, day)}</b>
              <small>{e.day + 1}일차</small>
            </div>
            <div className="cal-body">
              <b>{e.title}</b>
              <small>{e.desc}</small>
              {payers.length > 0 && (
                <div className="related">
                  {payers.map((p) => (
                    <button key={p.symbol} className="rel-chip" onClick={() => onSelect(p.symbol)}>
                      {STOCK_MAP[p.symbol].name}
                      <i className="up">{p.yieldPct}%</i>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {compact && upcoming.length > shown.length && <p className="muted small">외 {upcoming.length - shown.length}개 일정</p>}
    </div>
  );
}

/* ---------------- 예약 주문 · 배당 ---------------- */

export function OrdersAndDividends({
  orders,
  day,
  portfolio,
  canAct,
  onCancel,
  onSelect,
}: {
  orders: OrderRow[];
  day: number;
  portfolio: PortfolioState;
  canAct: boolean;
  onCancel: (id: string) => void;
  onSelect: (s: string) => void;
}) {
  const open = orders.filter((o) => o.status === 'open' && o.day === day);
  const recent = orders.filter((o) => o.status !== 'open').slice(-6).reverse();
  const label: Record<OrderRow['status'], string> = { open: '대기', filled: '체결', cancelled: '취소', expired: '만료' };
  const price = (o: OrderRow) => (STOCK_MAP[o.symbol].currency === 'USD' ? fmtUsd(o.limit_price) : num(o.limit_price) + '원');
  return (
    <div className="orders-div">
      <h4 className="sec-title">⏳ 예약 주문</h4>
      {open.length === 0 && recent.length === 0 && <p className="empty small">예약 주문이 없어요. 종목 화면에서 걸 수 있어요.</p>}
      {open.map((o) => (
        <div key={o.id} className={'oo-row ' + o.side}>
          <button className="linkish-soft" onClick={() => onSelect(o.symbol)}>
            <b>{STOCK_MAP[o.symbol].name}</b> {o.side === 'buy' ? '사기' : '팔기'} {num(o.qty)}주 @ {price(o)}
          </button>
          <button className="btn sm ghost" disabled={!canAct} onClick={() => onCancel(o.id!)}>
            취소
          </button>
        </div>
      ))}
      {recent.map((o) => (
        <div key={o.id} className={'oo-row done s-' + o.status}>
          <span>
            {o.day + 1}일 · {STOCK_MAP[o.symbol].name} {o.side === 'buy' ? '사기' : '팔기'} {num(o.qty)}주 @ {price(o)}
          </span>
          <em>{label[o.status]}</em>
        </div>
      ))}
      {portfolio.dividendLog.length > 0 && (
        <>
          <h4 className="sec-title">💰 받은 배당 {wonShort(portfolio.dividendIncome)}</h4>
          {portfolio.dividendLog.map((d, i) => (
            <div key={i} className="oo-row done">
              <span>
                {d.day + 1}일 · {STOCK_MAP[d.symbol].name} {num(d.qty)}주
              </span>
              <b className="up">+{num(d.amount)}원</b>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- 모바일 바텀시트 ---------------- */

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** 화면 폭으로 모바일/PC 구분 */
export function useIsMobile(query = '(max-width: 960px)') {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
