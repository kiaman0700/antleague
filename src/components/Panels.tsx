import { josa } from '../engine/engine';
import { useState } from 'react';
import { CardIcon, Icon, SectorIcon } from './Icon';
import { CardGuide } from './CardGuide';
import { ITEM_MAP, ITEMS, canBuy, canUse, HOLD_LIMIT, USE_LIMIT, GRANT_EVERY, type ItemKind, type PlayerItems } from '../game/items';
import { KR_INDEX_BASE, US_INDEX_BASE, type Market, type NewsEvent } from '../game/market';
import { START_CASH, type Holding, type PortfolioState } from '../game/portfolio';
import { COMPANIES, SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, won, wonShort } from '../lib/format';
import type { UiMode } from '../session';
import { Term } from './Term';

/* ------------------------------ 뉴스 ------------------------------ */

interface NewsProps {
  ui: UiMode;
  day: number;
  news: NewsEvent[];
  tomorrow: NewsEvent[] | null;
  rumorCheck: boolean;
  bestSector: string | null;
  spy: { nickname: string; cash: number; holdings: Record<string, Holding> } | null;
  scout?: { symbol: string; up: boolean } | null;
  blackout?: boolean;
  prices: Record<string, number>;
  change: (symbol: string) => number;
  onSelect: (symbol: string) => void;
  onSelectSector: (sector: string) => void;
  /** 방금 새로 들어온 기사 (일+제목) — 강조 표시 */
  fresh?: Set<string>;
}

const KIND_LABEL = { macro: '시장', sector: '업종', company: '기업' } as const;

function RelatedChips({ symbols, change, onSelect }: { symbols: string[]; change: (s: string) => number; onSelect: (s: string) => void }) {
  if (!symbols.length) return null;
  return (
    <div className="related">
      <span className="related-label">관련</span>
      {symbols.map((sym) => {
        const ch = change(sym);
        return (
          <button
            key={sym}
            className="rel-chip"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(sym);
            }}
          >
            {STOCK_MAP[sym].name}
            <i className={tone(ch)}>{pct(ch, 1)}</i>
          </button>
        );
      })}
    </div>
  );
}

export function NewsPanel({ ui, day, news, tomorrow, rumorCheck, bestSector, spy, scout, blackout, prices, change, onSelect, onSelectSector, fresh }: NewsProps) {
  const isFresh = (n: NewsEvent) => !!fresh?.has(n.day + ':' + n.headline);
  const [showOld, setShowOld] = useState(false);
  const today = news.filter((n) => n.day === day);
  const old = news.filter((n) => n.day < day).sort((a, b) => b.day - a.day);

  return (
    <div className="news-panel">
      {tomorrow && (
        <div className="reveal paper">
          <div className="reveal-title"><CardIcon kind="paper" size={15} /> 내일 신문 (나만 보여요)</div>
          {tomorrow.map((n, i) => (
            <div key={i} className="reveal-item">
              <div className={'reveal-line ' + n.tone}>{n.headline}</div>
              <RelatedChips symbols={n.related.slice(0, 4)} change={change} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
      {bestSector && (
        <div className="reveal analyst">
          <div className="reveal-title"><CardIcon kind="analyst" size={15} /> 애널리스트 콜</div>
          <div className="reveal-line">
            오늘 장에서 가장 강할 업종은{' '}
            <button className="linkish" onClick={() => onSelectSector(bestSector)}>
              <SectorIcon id={bestSector} /> {SECTOR_MAP[bestSector].name}
            </button>{' '}
            입니다.
          </div>
          <RelatedChips symbols={COMPANIES.filter((c) => c.sector === bestSector).map((c) => c.symbol)} change={change} onSelect={onSelect} />
        </div>
      )}
      {blackout && <div className="effect-banner"><CardIcon kind="blackout" size={15} /> 정보 차단 카드를 맞아서 오늘 아침 뉴스가 보이지 않아요</div>}
      {scout && (
        <div className="reveal scout">
          <div className="reveal-title"><CardIcon kind="scout" size={15} /> 차트 분석 (정확도 약 70%)</div>
          <div className="reveal-line">
            <button className="linkish" onClick={() => onSelect(scout.symbol)}>
              {STOCK_MAP[scout.symbol].name}
            </button>
            {josa(STOCK_MAP[scout.symbol].name, '은', '는').slice(STOCK_MAP[scout.symbol].name.length)} 오늘 마감 때 <b className={scout.up ? 'up' : 'down'}>{scout.up ? '▲ 오를' : '▼ 내릴'}</b> 것 같아요.
          </div>
        </div>
      )}
      {spy && (
        <div className="reveal spy">
          <div className="reveal-title"><CardIcon kind="spy" size={15} /> {spy.nickname}의 계좌</div>
          <div className="reveal-line">
            현금 <b>{wonShort(spy.cash)}</b>
          </div>
          {Object.keys(spy.holdings).length === 0 && <div className="reveal-line">주식 없이 전부 현금이에요</div>}
          {Object.entries(spy.holdings).map(([sym, h]) => (
            <button key={sym} className="spy-row" onClick={() => onSelect(sym)}>
              <span>{STOCK_MAP[sym].name}</span>
              <span>{num(h.qty)}주</span>
              <b>{wonShort(h.qty * prices[sym])}</b>
            </button>
          ))}
        </div>
      )}

      <h4 className="sec-title">
        {day + 1}일차 아침 뉴스 <span className="count-badge">{today.length}</span>
      </h4>
      {rumorCheck && !blackout && today.length > 0 && (
        <div className="detector-sum">
          <CardIcon kind="detector" size={15} /> 루머 감별기: 오늘 뉴스 {today.length}개 중 <b className="up">가짜 {today.filter((n) => n.verdict === 'false').length}개</b>, 사실 {today.filter((n) => n.verdict === 'true').length}개
        </div>
      )}
      {/* 새로 들어온 기사를 맨 위로 */}
      {[...today].sort((a, b) => Number(isFresh(b)) - Number(isFresh(a))).map((n, i) => (
        <div key={n.day + n.headline} className={'news-card ' + n.tone + (isFresh(n) ? ' fresh' : '')}>
          <div className="news-meta">
            {isFresh(n) && <span className="new-badge">NEW</span>}
            <span className={'kind k-' + n.kind}>{KIND_LABEL[n.kind]}</span>
            {n.sector && (
              <button className="muted linkish-soft" onClick={() => onSelectSector(n.sector!)}>
                <SectorIcon id={n.sector} /> {SECTOR_MAP[n.sector].name}
              </button>
            )}
            {n.rumor && (
              <span className="rumor">
                <Term k="루머" />
              </span>
            )}
            {n.verdict && <span className={'verdict ' + n.verdict}><Icon name={n.verdict === 'true' ? 'check' : 'x'} size={12} /> {n.verdict === 'true' ? '사실' : '가짜'}</span>}
          </div>
          <div className="news-headline">
            <span className="arrow">{n.tone === 'good' ? '▲' : '▼'}</span>
            {n.label && <span className={'nlabel l-' + n.label}>[{n.label}]</span>}
            {n.headline.replace('[루머] ', '')}
          </div>
          <RelatedChips symbols={n.related} change={change} onSelect={onSelect} />
          {ui === 'easy' && i === 0 && <div className="news-go">관련 종목을 누르면 바로 차트로 이동해요</div>}
        </div>
      ))}

      {old.length > 0 && (
        <>
          <button className="old-toggle" onClick={() => setShowOld((v) => !v)}>
            지난 뉴스 {old.length}개 {showOld ? '접기 ▴' : '펼치기 ▾'}
          </button>
          {showOld && (
            <ul className="old-news">
              {old.map((n, i) => (
                <li key={i} className={n.tone}>
                  <span className="d">{n.day + 1}일</span>
                  <span className="old-body">
                    {n.label && <span className={'nlabel l-' + n.label}>[{n.label}]</span>}
                    {n.headline}
                    {n.verdict === 'false' && <em className="old-verdict false">가짜로 밝혀짐</em>}
                    {n.verdict === 'true' && n.rumor && <em className="old-verdict true">사실로 확인</em>}
                    <RelatedChips symbols={n.related.slice(0, 3)} change={change} onSelect={onSelect} />
                  </span>
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
  busy?: boolean;
}

export function CardsPanel({ solo, day, totalDays, mine, cash, usedToday, canAct, onBuy, onUse, effectsOnMe, busy }: CardsProps) {
  const [shop, setShop] = useState(false);
  const [guide, setGuide] = useState(false);
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
        <span className="row">
          <button className="btn sm ghost" onClick={() => setGuide(true)}>
            <Icon name="book" /> 카드 도감
          </button>
          <button className="btn sm" onClick={() => setShop((v) => !v)}>
            {shop ? '닫기' : <><Icon name="cart" /> 상점</>}
          </button>
        </span>
      </div>
      {guide && <CardGuide onClose={() => setGuide(false)} />}
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
              <div className="ci-emoji"><CardIcon kind={d.kind} size={22} /></div>
              <div className="ci-body">
                <b>
                  {d.name} {n > 1 && <span className="muted">×{n}</span>}
                </b>
                <small>{d.desc}</small>
              </div>
              {!ITEM_MAP[k].passive ? (
                <button className="btn sm primary" disabled={!!why || busy} title={why ?? ''} onClick={() => onUse(k)}>
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
          {ITEMS.filter((i) => (!solo || !i.multiOnly) && !i.shopless).map((d) => {
            const why = canAct ? canBuy(mine, d.kind, cash) : '지금은 살 수 없어요';
            return (
              <div key={d.kind} className={'card-item t-' + d.type}>
                <div className="ci-emoji"><CardIcon kind={d.kind} size={22} /></div>
                <div className="ci-body">
                  <b>
                    {d.name} <span className={'type-tag ' + d.type}>{{ info: '정보', attack: '방해', defense: '방어', bonus: '보너스' }[d.type]}</span>
                  </b>
                  <small>{d.desc}</small>
                </div>
                <button className="btn sm" disabled={!!why || busy} title={why ?? ''} onClick={() => onBuy(d.kind)}>
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
  const [symbol, setSymbol] = useState(COMPANIES[0].symbol);
  const [t, setT] = useState<'good' | 'bad'>('good');
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3><CardIcon kind="fake" /> 가짜 뉴스 만들기</h3>
        <p className="muted small">내일 아침 상대 화면에만 진짜 뉴스처럼 떠요. 상대가 속으면 성공!</p>
        <label className="field">
          <span>어느 회사?</span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {COMPANIES.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                <SectorIcon id={s.sector} /> {s.name}
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

/* ------------------------------ 하루 결산 ------------------------------ */

interface DayCloseProps {
  market: Market;
  day: number;
  myDelta: number;
  myEquity: number;
  dividendToday?: number;
  filledToday?: number;
  last: boolean;
  onNext: () => void;
}

export function DayCloseOverlay({ market, day, myDelta, myEquity, dividendToday = 0, filledToday = 0, last, onNext }: DayCloseProps) {
  const movers = STOCKS.map((s) => {
    const prev = day === 0 ? market.base[s.symbol] : market.bars[s.symbol][day - 1].close;
    return { s, r: market.bars[s.symbol][day].close / prev - 1 };
  }).sort((a, b) => b.r - a.r);
  const idx = market.index[day];
  const idxPrev = day === 0 ? KR_INDEX_BASE : market.index[day - 1].close;
  const us = market.usIndex[day];
  const usPrev = day === 0 ? US_INDEX_BASE : market.usIndex[day - 1].close;
  const ur = us.close / usPrev - 1;
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
        {(dividendToday > 0 || filledToday > 0) && (
          <div className="close-extra">
            {dividendToday > 0 && <span><Icon name="coins" size={13} /> 배당 +{wonShort(dividendToday)}</span>}
            {filledToday > 0 && <span><Icon name="hourglass" size={13} /> 예약 주문 {filledToday}건 체결</span>}
          </div>
        )}
        <div className="close-index">
          <Term k="지수">국내 종합</Term> <b>{idx.close.toFixed(2)}</b> <span className={tone(ir)}>{pct(ir)}</span> · 미국500 <b>{us.close.toFixed(2)}</b>{' '}
          <span className={tone(ur)}>{pct(ur)}</span>
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
  { t: '주식 대결에 온 걸 환영해요', d: '1,000만원으로 시작해서, 정해진 날이 끝났을 때 재산이 더 많은 사람이 이겨요.' },
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
