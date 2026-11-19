import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Device } from '../lib/device';
import { Icon } from './Icon';
import { DialogBox, EmptyState, useEscape } from './ui';
import type { OrderRow } from '../engine/engine';
import type { Market } from '../game/market';
import type { PortfolioState } from '../game/portfolio';
import { fmtUsd } from '../game/fmtUsd';
import { STOCK_MAP } from '../game/stocks';
import { num, wonShort } from '../lib/format';

/* ---------------- 일정 ---------------- */

export function dDay(eventDay: number, day: number) {
  return eventDay === day ? '오늘' : `D-${eventDay - day}`;
}

export function Calendar({ market, day, onSelect, compact = false, hideTitle = false }: { market: Market; day: number; onSelect: (s: string) => void; compact?: boolean; hideTitle?: boolean }) {
  const upcoming = market.events.filter((e) => e.day >= day);
  const shown = compact ? upcoming.slice(0, 3) : upcoming;
  if (!shown.length) return null;
  return (
    <div className="calendar">
      {!hideTitle && <h4 className="sec-head">다가오는 일정</h4>}
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
              {e.kind === 'story' && e.symbol && STOCK_MAP[e.symbol] && (
                <div className="related">
                  <button className="rel-chip" onClick={() => onSelect(e.symbol!)}>
                    {STOCK_MAP[e.symbol].name}
                  </button>
                </div>
              )}
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
      <h4 className="sec-title">예약 주문</h4>
      {open.length === 0 && recent.length === 0 && <EmptyState compact icon="hourglass" title="예약 주문이 없어요" desc="종목 화면의 사기·팔기에서 걸 수 있어요." />}
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
          <h4 className="sec-title">받은 배당 {wonShort(portfolio.dividendIncome)}</h4>
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
  useEscape(onClose, open, true);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  const bgRef = useRef<HTMLDivElement>(null);
  useKeyboardFit(bgRef, open);
  if (!open) return null;
  return (
    <div className="sheet-bg" ref={bgRef} onClick={onClose}>
      <DialogBox className="sheet" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </DialogBox>
    </div>
  );
}

/**
 * 휴대폰 키보드가 뜨면 레이아웃은 그대로고 보이는 영역만 줄어듦 → 시트를 보이는 영역 바닥에 붙여
 * 주문 버튼이 키보드에 가리지 않게. iOS 는 키보드를 닫은 뒤 offsetTop 을 늦게 되돌려 focusout 때도 다시 잼
 */
function useKeyboardFit(ref: RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv || document.documentElement.dataset.device === 'pc') return;
    let t = 0;
    const upd = () => {
      const el = ref.current;
      if (!el) return;
      el.style.setProperty('--vv-top', vv.offsetTop + 'px');
      el.style.setProperty('--vv-h', vv.height + 'px');
    };
    const later = () => {
      window.clearTimeout(t);
      t = window.setTimeout(upd, 120);
    };
    upd();
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    window.addEventListener('focusout', later);
    return () => {
      window.clearTimeout(t);
      vv.removeEventListener('resize', upd);
      vv.removeEventListener('scroll', upd);
      window.removeEventListener('focusout', later);
    };
  }, [ref, on]);
}

/** 화면 폭으로 모바일/PC 구분 */
/** 지금 기기 (설정·?device= 로 바뀌면 다시 그림) */
export function useDevice(): Device {
  const [d, setD] = useState<Device>(() => (typeof document !== 'undefined' && (document.documentElement.dataset.device as Device)) || 'pc');
  useEffect(() => {
    const on = () => setD((document.documentElement.dataset.device as Device) || 'pc');
    window.addEventListener('stockduel:device', on);
    on();
    return () => window.removeEventListener('stockduel:device', on);
  }, []);
  return d;
}
/**
 * 게임을 휴대폰 화면(아래 탭)으로 그릴지: 휴대폰은 늘, PC 는 창이 좁아도 안 함, 태블릿은 세로(좁을 때)만
 * (창 폭만으로 정하면 PC 창을 줄였을 때 휴대폰 화면이 나오므로 기기로 판단)
 */
export function useMobileLayout(): boolean {
  const device = useDevice();
  const narrow = useIsMobile('(max-width: 960px)');
  // 펼친 폴더블은 태블릿이지만 화면이 작아 늘 아래 탭 화면 (로비와 같게)
  const foldOpen = typeof document !== 'undefined' && document.documentElement.dataset.fold === 'open';
  return device === 'phone' || foldOpen ? true : device === 'pc' ? false : narrow;
}

export function useIsMobile(query = '(max-width: 960px)') {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    // 태블릿을 돌리거나 창 크기를 바꿀 때 change 가 늦거나 빠지는 경우가 있어 크기 변경·회전도 함께 확인
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => {
      mq.removeEventListener('change', on);
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, [query]);
  return m;
}
