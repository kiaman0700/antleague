import { useState } from 'react';
import { ITEM_MAP, ITEMS, canBuy, canUse, HOLD_LIMIT, USE_LIMIT, GRANT_EVERY, type ItemKind, type PlayerItems } from '../game/items';
import type { Market, NewsEvent } from '../game/market';
import { START_CASH, type PortfolioState } from '../game/portfolio';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, won, wonShort } from '../lib/format';
import type { UiMode } from '../session';
import { Term } from './Term';

/* ------------------------------ 뉴스 ------------------------------ */

export interface ShownNews extends NewsEvent {
  fake?: boolean;
}

interface NewsProps {
  ui: UiMode;
  day: number;
  news: ShownNews[];
  tomorrow: NewsEvent[] | null;
  rumorCheck: boolean;
  bestSector: string | null;
  onSelect: (symbol: string) => void;
  onSelectSector: (sector: string) => void;
}

const KIND_LABEL = { macro: '시장', sector: '업종', company: '기업' } as const;

export function NewsPanel({ ui, day, news, tomorrow, rumorCheck, bestSector, onSelect, onSelectSector }: NewsProps) {
  const [showOld, setShowOld] = useState(false);
  const today = news.filter((n) => n.day === day);
  const old = news.filter((n) => n.day < day).sort((a, b) => b.day - a.day);

  const click = (n: NewsEvent) => {
    if (n.symbol) onSelect(n.symbol);
    else if (n.sector) onSelectSector(n.sector);
  };

  return (
    <div className="news-panel">
      {tomorrow && (
        <div className="reveal paper">
          <div className="reveal-title">📰 내일 신문 (나만 보여요)</div>
          {tomorrow.map((n, i) => (
            <div key={i} className={'reveal-line ' + n.tone}>
              {n.headline}
            </div>
          ))}
        </div>
      )}
      {bestSector && (
        <div className="reveal analyst">
          <div className="reveal-title">📈 애널리스트 콜</div>
          <div className="reveal-line">
            오늘 장에서 가장 강할 업종은{' '}
            <button className="linkish" onClick={() => onSelectSector(bestSector)}>
              {SECTOR_MAP[bestSector].emoji} {SECTOR_MAP[bestSector].name}
            </button>{' '}
            입니다.
          </div>
        </div>
      )}

      <h4 className="sec-title">
        {day + 1}일차 아침 뉴스 <span className="count-badge">{today.length}</span>
      </h4>
      {today.map((n, i) => (
        <button key={i} className={'news-card ' + n.tone} onClick={() => click(n)}>
          <div className="news-meta">
            <span className={'kind k-' + n.kind}>{KIND_LABEL[n.kind]}</span>
            {n.sector && (
              <span className="muted">
                {SECTOR_MAP[n.sector].emoji} {SECTOR_MAP[n.sector].name}
              </span>
            )}
            {n.rumor && (
              <span className="rumor">
                <Term k="루머" />
              </span>
            )}
            {n.rumor && rumorCheck && !n.fake && (
              <span className={'verdict ' + (n.tone === n.realTone ? 'true' : 'false')}>🔍 {n.tone === n.realTone ? '진짜' : '가짜'}</span>
            )}
          </div>
          <div className="news-headline">
            <span className="arrow">{n.tone === 'good' ? '▲' : '▼'}</span>
            {n.headline.replace('[루머] ', '')}
          </div>
          {ui === 'easy' && n.kind !== 'macro' && <div className="news-go">눌러서 {n.symbol ? '종목' : '업종'} 보기 →</div>}
        </button>
      ))}

      {old.length > 0 && (
        <>
          <button className="old-toggle" onClick={() => setShowOld((v) => !v)}>
            지난 뉴스 {old.length}개 {showOld ? '접기 ▴' : '펼치기 ▾'}
          </button>
          {showOld && (
            <ul className="old-news">
              {old.map((n, i) => (
                <li key={i} className={n.tone} onClick={() => click(n)}>
                  <span className="d">{n.day + 1}일</span>
                  <span>{n.headline}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ 내 자산 ------------------------------ */

interface AssetsProps {
  ui: UiMode;
  portfolio: PortfolioState;
  prices: Record<string, number>;
  equity: number;
  onSelect: (s: string) => void;
}

export function AssetsPanel({ ui, portfolio, prices, equity, onSelect }: AssetsProps) {
  const easy = ui === 'easy';
  const entries = Object.entries(portfolio.holdings);
  const stockValue = equity - portfolio.cash;
  const ret = equity / START_CASH - 1;
  const cashShare = equity > 0 ? portfolio.cash / equity : 1;
  return (
    <div className="assets">
      <div className="asset-hero">
        <small>{easy ? '내 전체 재산' : '총자산'}</small>
        <b>{won(equity)}</b>
        <span className={tone(ret)}>
          <Term k="수익률" /> {pct(ret)} ({wonShort(equity - START_CASH)})
        </span>
        <div className="alloc" aria-label="자산 구성">
          <div style={{ width: `${(1 - cashShare) * 100}%` }} className="alloc-stock" />
        </div>
        <div className="alloc-legend">
          <span>
            <i className="alloc-stock" /> {easy ? '주식' : '주식'} {wonShort(stockValue)}
          </span>
          <span>
            <i /> 현금 {wonShort(portfolio.cash)}
          </span>
        </div>
        {portfolio.itemSpend > 0 && <small className="muted">카드 구입에 쓴 돈 {wonShort(portfolio.itemSpend)}</small>}
      </div>
      <h4 className="sec-title">{easy ? '가진 주식' : '보유 종목'}</h4>
      {entries.length === 0 && <p className="empty">{easy ? '아직 산 주식이 없어요. 종목을 골라 사 보세요!' : '보유 종목 없음'}</p>}
      {entries
        .sort((a, b) => b[1].qty * prices[b[0]] - a[1].qty * prices[a[0]])
        .map(([sym, h]) => {
          const p = prices[sym];
          const r = p / h.avgCost - 1;
          return (
            <button key={sym} className="hold" onClick={() => onSelect(sym)}>
              <div>
                <b>{STOCK_MAP[sym].name}</b>
                <small>
                  {num(h.qty)}주 · {easy ? '평균' : '평단'} {num(h.avgCost)}
                </small>
              </div>
              <div className="r">
                <b>{wonShort(h.qty * p)}</b>
                <small className={tone(r)}>
                  {pct(r)} · {wonShort(h.qty * (p - h.avgCost))}
                </small>
              </div>
            </button>
          );
        })}
    </div>
  );
}

/* ------------------------------ 찬스 카드 ------------------------------ */

interface CardsProps {
  solo: boolean;
  day: number;
  totalDays: number;
  mine: PlayerItems;
  cash: number;
  usedToday: Set<ItemKind>;
  canAct: boolean;
  onBuy: (k: ItemKind) => void;
  onUse: (k: ItemKind) => void;
  effectsOnMe: string[];
}

export function CardsPanel({ solo, day, totalDays, mine, cash, usedToday, canAct, onBuy, onUse, effectsOnMe }: CardsProps) {
  const [shop, setShop] = useState(false);
  const owned = (Object.entries(mine.inventory) as [ItemKind, number][]).filter(([, n]) => n > 0);
  const nextGrant = Math.ceil((day + 1) / GRANT_EVERY) * GRANT_EVERY;
  return (
    <div className="cards">
      {effectsOnMe.map((t, i) => (
        <div key={i} className="effect-banner">
          {t}
        </div>
      ))}
      <div className="cards-head">
        <h4 className="sec-title">
          내 카드 <span className="count-badge">{mine.total}/{HOLD_LIMIT}</span>
        </h4>
        <button className="btn sm" onClick={() => setShop((v) => !v)}>
          {shop ? '닫기' : '🛒 상점'}
        </button>
      </div>
      <p className="muted small">
        시작할 때 2장, {GRANT_EVERY}일마다 1장을 무료로 받아요{nextGrant < totalDays ? ` (다음: ${nextGrant + 1}일차)` : ''}. 같은 카드는 한 판에 {USE_LIMIT}번까지.
      </p>

      {!shop && owned.length === 0 && <p className="empty">카드가 없어요. 상점에서 살 수 있어요.</p>}
      {!shop &&
        owned.map(([k, n]) => {
          const d = ITEM_MAP[k];
          const why = canAct ? canUse(mine, k, day, totalDays, usedToday.has(k)) : '지금은 쓸 수 없어요';
          return (
            <div key={k} className={'card-item t-' + d.type}>
              <div className="ci-emoji">{d.emoji}</div>
              <div className="ci-body">
                <b>
                  {d.name} {n > 1 && <span className="muted">×{n}</span>}
                </b>
                <small>{d.desc}</small>
              </div>
              {k !== 'shield' ? (
                <button className="btn sm primary" disabled={!!why} title={why ?? ''} onClick={() => onUse(k)}>
                  사용
                </button>
              ) : (
                <span className="muted small">자동</span>
              )}
            </div>
          );
        })}

      {shop && (
        <div className="shop">
          {ITEMS.filter((i) => !solo || !i.multiOnly).map((d) => {
            const why = canAct ? canBuy(mine, d.kind, cash) : '지금은 살 수 없어요';
            return (
              <div key={d.kind} className={'card-item t-' + d.type}>
                <div className="ci-emoji">{d.emoji}</div>
                <div className="ci-body">
                  <b>
                    {d.name} <span className={'type-tag ' + d.type}>{{ info: '정보', attack: '방해', defense: '방어' }[d.type]}</span>
                  </b>
                  <small>{d.desc}</small>
                </div>
                <button className="btn sm" disabled={!!why} title={why ?? ''} onClick={() => onBuy(d.kind)}>
                  {wonShort(d.cost)}
                </button>
              </div>
            );
          })}
          {solo && <p className="muted small">방해·방어 카드는 둘이서 할 때만 나와요.</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ 가짜 뉴스 만들기 ------------------------------ */

export function FakeNewsModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (symbol: string, tone: 'good' | 'bad') => void }) {
  const [symbol, setSymbol] = useState(STOCKS[0].symbol);
  const [t, setT] = useState<'good' | 'bad'>('good');
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📢 가짜 뉴스 만들기</h3>
        <p className="muted small">내일 아침 상대 화면에만 진짜 뉴스처럼 떠요. 상대가 속으면 성공!</p>
        <label className="field">
          <span>어느 회사?</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {STOCKS.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {SECTOR_MAP[s.sector].emoji} {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="seg2">
          <button className={t === 'good' ? 'on buy' : ''} onClick={() => setT('good')}>
            ▲ 호재로 속이기
          </button>
          <button className={t === 'bad' ? 'on sell' : ''} onClick={() => setT('bad')}>
            ▼ 악재로 속이기
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
          <button className="btn primary" onClick={() => onSubmit(symbol, t)}>
            보내기
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 염탐 결과 ------------------------------ */

export function SpyModal({ nickname, portfolio, prices, onClose }: { nickname: string; portfolio: PortfolioState | null; prices: Record<string, number>; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>👀 {nickname}의 계좌</h3>
        {!portfolio ? (
          <p className="muted">불러오는 중…</p>
        ) : (
          <>
            <div className="spy-cash">
              현금 <b>{won(portfolio.cash)}</b>
            </div>
            {Object.keys(portfolio.holdings).length === 0 && <p className="empty">주식이 하나도 없어요 (전부 현금)</p>}
            {Object.entries(portfolio.holdings).map(([s, h]) => (
              <div key={s} className="spy-row">
                <span>{STOCK_MAP[s].name}</span>
                <span>{num(h.qty)}주</span>
                <b>{wonShort(h.qty * prices[s])}</b>
              </div>
            ))}
          </>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 하루 결산 ------------------------------ */

interface DayCloseProps {
  market: Market;
  day: number;
  myDelta: number;
  myEquity: number;
  last: boolean;
  onNext: () => void;
}

export function DayCloseOverlay({ market, day, myDelta, myEquity, last, onNext }: DayCloseProps) {
  const movers = STOCKS.map((s) => {
    const prev = day === 0 ? market.base[s.symbol] : market.bars[s.symbol][day - 1].close;
    return { s, r: market.bars[s.symbol][day].close / prev - 1 };
  }).sort((a, b) => b.r - a.r);
  const idx = market.index[day];
  const idxPrev = day === 0 ? 2500 : market.index[day - 1].close;
  const ir = idx.close / idxPrev - 1;
  return (
    <div className="modal-bg strong">
      <div className="modal close-modal">
        <div className="close-day">{day + 1}일차 장 마감</div>
        <div className={'close-pnl ' + tone(myDelta)}>
          {myDelta >= 0 ? '+' : ''}
          {wonShort(myDelta)}
        </div>
        <div className="muted">오늘 내 손익 · 총자산 {wonShort(myEquity)}</div>
        <div className="close-index">
          <Term k="지수">종합지수</Term> <b>{idx.close.toFixed(2)}</b> <span className={tone(ir)}>{pct(ir)}</span>
        </div>
        <div className="movers">
          <div>
            <small>많이 오른 종목</small>
            {movers.slice(0, 3).map(({ s, r }) => (
              <div key={s.symbol} className="mv">
                <span>{s.name}</span>
                <b className="up">{pct(r, 1)}</b>
              </div>
            ))}
          </div>
          <div>
            <small>많이 내린 종목</small>
            {movers
              .slice(-3)
              .reverse()
              .map(({ s, r }) => (
                <div key={s.symbol} className="mv">
                  <span>{s.name}</span>
                  <b className="down">{pct(r, 1)}</b>
                </div>
              ))}
          </div>
        </div>
        <button className="btn primary xl" onClick={onNext} autoFocus>
          {last ? '최종 결과 보기' : `${day + 2}일차 시작 →`}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ 튜토리얼 ------------------------------ */

const STEPS = [
  { t: '주식 대결에 온 걸 환영해요 👋', d: '1,000만원으로 시작해서, 정해진 날이 끝났을 때 재산이 더 많은 사람이 이겨요.' },
  { t: '① 아침 뉴스를 읽어요', d: '매일 아침 뉴스가 나와요. 좋은 뉴스(▲)가 난 회사·업종은 오르는 경우가 많고, 같은 업종이나 연관 업종도 함께 움직여요. [루머]는 틀릴 수도 있어요!' },
  { t: '② 종목을 골라 사고팔아요', d: '종목 목록에서 회사를 누르면 설명과 차트가 나와요. 금액 버튼(+10만원 등)으로 쉽게 살 수 있어요. 오늘은 아침 가격(시가)으로 거래돼요.' },
  { t: '③ 장 마감을 눌러요', d: '다 골랐으면 "장 마감"을 눌러요. 둘 다 누르면(또는 시간이 다 되면) 하루가 흘러 가격이 움직여요.' },
  { t: '④ 찬스 카드로 승부를 뒤집어요', d: '카드로 내일 뉴스를 미리 보거나, 상대를 방해할 수 있어요. 상점에서 돈으로 살 수도 있어요. 점선 밑줄 단어를 누르면 뜻이 나와요.' },
];

export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="modal-bg strong">
      <div className="modal tutorial">
        <div className="dots">
          {STEPS.map((_, k) => (
            <i key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <h3>{s.t}</h3>
        <p>{s.d}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onDone}>
            건너뛰기
          </button>
          <button className="btn primary" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())}>
            {i < STEPS.length - 1 ? '다음' : '시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
