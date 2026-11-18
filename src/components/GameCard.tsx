/**
 * 찬스 카드 한 장 (진짜 카드처럼): 세로 카드 · 종류별 테두리 색 · 종목 코드 같은 카드 코드 · 가운데 큰 그림 + 옅은 차트 무늬
 * 손패(내 카드)·상점·도감·PC 카드 칸이 모두 이 모양을 씀
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BONUS_TABLE, ITEM_MAP, itemDesc, type ItemKind, type ItemType } from '../game/items';
import { CardIcon } from './Icon';
import { DialogBox, useEscape } from './ui';

export const CARD_TYPE: Record<ItemType, string> = { info: '정보', attack: '방해', defense: '방어', bonus: '보너스' };
const TYPE_TIP: Record<ItemType, string> = {
  info: '나만 보는 정보를 줘요',
  attack: '상대를 골라 다음 날 불리하게 해요. 한 사람에게는 하루 한 번',
  defense: '갖고만 있으면 나를 노린 방해를 자동으로 막아요',
  bonus: '쓰면 바로 이득',
};
/** 마우스가 있는 기기(PC)인지 — 없으면 누를 때 자세히 보기 창 */
const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
/** 종목 코드처럼 보이는 카드 코드 (꾸밈용) */
const CODE: Record<string, string> = {
  paper: 'NEWS',
  analyst: 'CALL',
  scout: 'CHRT',
  detector: 'RUMR',
  spy: 'PEEK',
  freeze: 'HALT',
  blackout: 'MUTE',
  fake: 'FAKE',
  fee: 'FEE×',
  shield: 'GARD',
  mirror: 'RFLX',
  bonus: 'CASH',
};

export function GameCard({
  kind,
  count = 1,
  size = 'md',
  corner,
  why,
  dim,
  footer,
  desc = size !== 'sm',
  version = 6,
  action,
}: {
  /** 방 규칙 버전 (용돈 봉투 설명이 다름) */
  version?: number;
  kind: ItemKind;
  count?: number;
  /** sm = PC 카드 칸(설명 없이), md = 손패·상점·도감 */
  size?: 'sm' | 'md';
  /** 오른쪽 위 (가격 등). 없으면 장수 */
  corner?: ReactNode;
  /** 지금 못 쓰는 이유 */
  why?: string | null;
  dim?: boolean;
  footer?: ReactNode;
  desc?: boolean;
  /**
   * 카드를 누르면 크게 보이고 그 안에 이 버튼(사용·사기)이 나옴 — 크게 보기가 곧 '쓸까요?' 확인.
   * 없으면 누를 때 설명만 크게
   */
  action?: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean };
}) {
  const d = { ...ITEM_MAP[kind], desc: itemDesc(kind, version) };
  // 용돈 봉투: 확률을 한 줄 글 대신 작은 표로 (창에서만)
  const odds = kind === 'bonus' && version >= 6;
  const detailDesc = odds ? d.desc.replace(/ \+30만[^.]*\./, '') : d.desc;
  const oddsEl = odds ? (
    <div className="gc-odds" aria-label="받는 돈과 확률">
      {BONUS_TABLE.map((b) => (
        <span key={b.amount} className={b.amount > 0 ? 'up' : 'down'}>
          <b>{(b.amount > 0 ? '+' : '−') + Math.abs(b.amount / 10000) + '만'}</b>
          <small>{Math.round(b.p * 100)}%</small>
        </span>
      ))}
    </div>
  ) : null;
  const [open, setOpen] = useState(false);
  // 카드 창은 다른 창처럼 Esc 로도 닫힘
  useEscape(() => setOpen(false), open);
  // PC: 마우스를 올리면 카드 위(자리가 없으면 아래)에 설명 — 화면 맨 위 층에 그려서 칸 가장자리에 잘리지 않게
  const [pop, setPop] = useState<{ x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    if (!pop) return;
    const hide = () => setPop(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pop]);
  const showPop = (el: HTMLElement) => {
    if (!canHover()) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 190;
    setPop({ x: Math.min(window.innerWidth - 125, Math.max(125, r.left + r.width / 2)), y: below ? r.bottom + 8 : r.top - 8, below });
  };
  // 카드를 누르면 크게 + 설명 전부 + 사용(사기) 버튼 — 잘못 눌러 바로 쓰이지 않게 이 창이 확인 역할. 쓸 게 없는 카드(도감)도 눌러서 설명 전부를 볼 수 있게
  const onFace = () => {
    setPop(null);
    setOpen(true);
  };
  return (
    <div className={`gcard gc-${size} t-${d.type}${dim ? ' dim' : ''}`}>
      {open &&
        createPortal(
          <div className="modal-bg gc-detail-bg" onClick={() => setOpen(false)}>
            <DialogBox className={`gc-detail t-${d.type}`} aria-label={d.name} onClick={(e) => e.stopPropagation()}>
              <GameCard kind={kind} count={count} corner={corner} desc={false} />
              <div className="gc-detail-txt">
                <b>{d.name}</b>
                <span className="gc-type-tip">{CARD_TYPE[d.type]} 카드 · {TYPE_TIP[d.type]}</span>
                <p>{detailDesc}</p>
                {oddsEl}
                {why && <small className="gc-why">{why}</small>}
                <div className="gc-detail-act">
                  {action ? (
                    <button
                      className={'btn ' + (action.primary === false ? '' : 'primary')}
                      disabled={action.disabled}
                      autoFocus
                      onClick={() => {
                        setOpen(false);
                        action.onClick();
                      }}
                    >
                      {action.label}
                    </button>
                  ) : (
                    <span className="muted small">{d.passive ? '갖고 있으면 자동으로 발동돼요' : ''}</span>
                  )}
                  <button className="btn ghost" onClick={() => setOpen(false)}>
                    닫기
                  </button>
                </div>
              </div>
            </DialogBox>
          </div>,
          document.body,
        )}
      {pop &&
        createPortal(
          <div className={`gc-pop t-${d.type}${pop.below ? ' below' : ''}`} role="tooltip" style={{ left: pop.x, top: pop.y }}>
            <b>{d.name}</b>
            <span className="gc-type-tip">{CARD_TYPE[d.type]} 카드 · {TYPE_TIP[d.type]}</span>
            <p>{detailDesc}</p>
            {oddsEl}
            {why && <small className="gc-why">{why}</small>}
          </div>,
          document.body,
        )}
      <div
        className="gc-face"
        onClick={onFace}
        onMouseEnter={(e) => showPop(e.currentTarget)}
        onMouseLeave={() => setPop(null)}
        onFocus={(e) => showPop(e.currentTarget)}
        onBlur={() => setPop(null)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFace())}
        aria-label={`${d.name}: ${d.desc}${action ? ` (누르면 ${action.label})` : ''}`}
      >
        <div className="gc-top">
          <span className="gc-type">{CARD_TYPE[d.type]}</span>
          {corner ?? (count > 1 ? <span className="gc-count">×{count}</span> : <span className="gc-code">{CODE[kind] ?? ''}</span>)}
        </div>
        <div className="gc-art" aria-hidden>
          <svg className="gc-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
            <polyline points="0,32 12,28 22,30 34,20 46,24 58,14 70,18 82,8 100,12" />
          </svg>
          <span className="gc-orb">
            <CardIcon kind={kind} size={size === 'sm' ? 22 : 30} />
          </span>
        </div>
        <div className="gc-name">{d.name}</div>
        {desc && <p className="gc-desc">{d.desc}</p>}
        {d.passive && <span className="gc-auto">갖고 있으면 자동</span>}
        {why && <small className="gc-why">{why}</small>}
      </div>
      {footer && <div className="gc-foot">{footer}</div>}
    </div>
  );
}
