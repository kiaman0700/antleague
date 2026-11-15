import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, Sparkline } from '../components/Chart';
import type { ClockState } from '../game/clock';
import { Market, TICKS_PER_DAY } from '../game/market';
import { buyCost, maxBuyQty, PortfolioState, sellProceeds, START_CASH } from '../game/portfolio';
import { STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, won, wonShort } from '../lib/format';
import type { Player } from '../net/room';
import type { Session } from '../session';

interface Props {
  session: Session;
  market: Market;
  clock: ClockState;
  portfolio: PortfolioState;
  equity: number;
  opponent: Player | null;
  onTrade: (symbol: string, side: 'buy' | 'sell', qty: number) => void;
  toast: { text: string; kind: 'ok' | 'err' } | null;
  onQuit: () => void;
}

export function GameScreen({ session, market, clock, portfolio, equity, opponent, onTrade, toast, onQuit }: Props) {
  const [selected, setSelected] = useState(STOCKS[0].symbol);
  const { tick, day } = clock;
  const dayOpenTick = day * TICKS_PER_DAY;
  const myRet = equity / START_CASH - 1;

  const visibleNews = useMemo(
    () => market.news.filter((n) => n.day <= day).sort((a, b) => b.day - a.day),
    [market.news, day],
  );
  const todayNews = visibleNews.filter((n) => n.day === day);

  if (!clock.started) {
    return (
      <div className="countdown">
        <p>시장 개장까지</p>
        <div className="count">{clock.countdown}</div>
        <p className="muted">{session.mode === 'multi' ? '두 사람 모두 같은 시장을 봅니다' : '연습 모드'}</p>
      </div>
    );
  }

  const stock = STOCK_MAP[selected];
  const path = market.prices[selected];
  const price = path[tick];
  const holding = portfolio.holdings[selected];

  return (
    <div className="game">
      <header className="topbar">
        <div className="day">
          <div className="day-label">
            <b>{day + 1}일차</b>
            <span className="muted"> / {market.totalDays}일</span>
          </div>
          <div className="progress">
            <div style={{ width: `${clock.dayProgress * 100}%` }} />
          </div>
        </div>
        <div className="me-equity">
          <small>{session.nickname} 총자산</small>
          <b>{wonShort(equity)}</b>
          <span className={tone(myRet)}>{pct(myRet)}</span>
        </div>
        {session.mode === 'multi' && <OpponentCard opponent={opponent} myEquity={equity} />}
        <button className="btn ghost small quit" onClick={onQuit}>
          나가기
        </button>
      </header>

      {todayNews.length > 0 && (
        <div className="breaking" key={day}>
          <span className="tag">속보</span>
          <div className="breaking-items">
            {todayNews.map((n, i) => (
              <button key={i} className={'breaking-item ' + n.tone} onClick={() => n.symbol && setSelected(n.symbol)}>
                {n.headline}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="layout">
        <section className="panel list">
          <h4>종목</h4>
          {STOCKS.map((s) => {
            const p = market.prices[s.symbol][tick];
            const open = market.prices[s.symbol][Math.max(0, dayOpenTick)];
            const start = market.prices[s.symbol][0];
            const ch = p / open - 1;
            const h = portfolio.holdings[s.symbol];
            return (
              <button key={s.symbol} className={'stock-row' + (s.symbol === selected ? ' sel' : '')} onClick={() => setSelected(s.symbol)}>
                <span className="emoji">{s.emoji}</span>
                <span className="names">
                  <b>{s.name}</b>
                  <small>
                    {s.sector}
                    {h && <em className="held"> · {num(h.qty)}주</em>}
                  </small>
                </span>
                <Sparkline values={market.prices[s.symbol].slice(Math.max(0, tick - 25), tick + 1)} up={p >= start} />
                <span className="px">
                  <PriceFlash value={p} />
                  <small className={tone(ch)}>{pct(ch)}</small>
                </span>
              </button>
            );
          })}
        </section>

        <section className="panel main">
          <div className="stock-head">
            <div>
              <h2>
                {stock.emoji} {stock.name} <small className="muted">{stock.symbol}</small>
              </h2>
              <div className="price-big">
                <PriceFlash value={price} suffix="원" />
                <span className={tone(price / path[0] - 1)}>시작가 대비 {pct(price / path[0] - 1)}</span>
              </div>
            </div>
          </div>
          <Chart
            series={[{ values: path.slice(0, tick + 1), color: price >= path[0] ? 'var(--up)' : 'var(--down)' }]}
            length={market.totalTicks}
            refLine={holding ? { value: holding.avgCost, label: '내 평단 ' + num(holding.avgCost) } : null}
            markers={market.news
              .filter((n) => n.day <= day && (n.symbol === selected || n.symbol === null))
              .map((n) => ({ index: n.day * TICKS_PER_DAY, tone: n.tone }))}
          />
          <TradePanel
            key={selected}
            symbol={selected}
            price={price}
            cash={portfolio.cash}
            held={holding?.qty ?? 0}
            avgCost={holding?.avgCost ?? 0}
            onTrade={onTrade}
          />
        </section>

        <section className="panel side">
          <h4>내 포트폴리오</h4>
          <div className="cash-row">
            <span>현금</span>
            <b>{won(portfolio.cash)}</b>
          </div>
          {Object.keys(portfolio.holdings).length === 0 && <p className="muted small">보유 종목이 없어요</p>}
          {Object.entries(portfolio.holdings).map(([sym, h]) => {
            const p = market.prices[sym][tick];
            const r = p / h.avgCost - 1;
            return (
              <button key={sym} className="hold-row" onClick={() => setSelected(sym)}>
                <span>
                  {STOCK_MAP[sym].emoji} {STOCK_MAP[sym].name}
                  <small> {num(h.qty)}주</small>
                </span>
                <span className="r">
                  <b>{wonShort(h.qty * p)}</b>
                  <small className={tone(r)}>
                    {pct(r)} ({wonShort(h.qty * (p - h.avgCost))})
                  </small>
                </span>
              </button>
            );
          })}

          <h4>뉴스</h4>
          <div className="news">
            {visibleNews.length === 0 && <p className="muted small">내일 아침부터 뉴스가 나와요</p>}
            {visibleNews.map((n, i) => (
              <button key={i} className={'news-item ' + n.tone + (n.day === day ? ' fresh' : '')} onClick={() => n.symbol && setSelected(n.symbol)}>
                <span className="news-day">{n.day + 1}일</span>
                <span>{n.headline}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}
    </div>
  );
}

function OpponentCard({ opponent, myEquity }: { opponent: Player | null; myEquity: number }) {
  if (!opponent) return <div className="opp muted">상대 접속 대기…</div>;
  const r = opponent.equity / START_CASH - 1;
  const total = myEquity + opponent.equity;
  const share = total > 0 ? myEquity / total : 0.5;
  const lead = myEquity - opponent.equity;
  return (
    <div className="opp">
      <div className="opp-top">
        <small>{opponent.nickname}</small>
        <b>{wonShort(opponent.equity)}</b>
        <span className={tone(r)}>{pct(r)}</span>
      </div>
      <div className="tug">
        <div className="tug-me" style={{ width: `${share * 100}%` }} />
      </div>
      <small className={lead >= 0 ? 'up' : 'down'}>
        {lead >= 0 ? `${wonShort(lead)} 앞서는 중` : `${wonShort(-lead)} 뒤처지는 중`} · 거래 {opponent.trade_count}회
      </small>
    </div>
  );
}

function PriceFlash({ value, suffix = '' }: { value: number; suffix?: string }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(value > prev.current ? 'up' : 'down');
      prev.current = value;
      const t = setTimeout(() => setFlash(''), 600);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <b className={'flash ' + flash}>
      {num(value)}
      {suffix}
    </b>
  );
}

interface TradeProps {
  symbol: string;
  price: number;
  cash: number;
  held: number;
  avgCost: number;
  onTrade: (symbol: string, side: 'buy' | 'sell', qty: number) => void;
}

function TradePanel({ symbol, price, cash, held, avgCost, onTrade }: TradeProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qtyText, setQtyText] = useState('');
  const maxQty = side === 'buy' ? maxBuyQty(cash, price) : held;
  const qty = Math.floor(Number(qtyText) || 0);
  const amount = side === 'buy' ? buyCost(qty, price) : sellProceeds(qty, price);
  const valid = qty > 0 && qty <= maxQty;

  const setFrac = (f: number) => setQtyText(String(Math.max(0, Math.floor(maxQty * f))));

  const submit = () => {
    if (!valid) return;
    onTrade(symbol, side, qty);
    setQtyText('');
  };

  return (
    <div className="trade">
      <div className="tabs">
        <button className={side === 'buy' ? 'on buy' : ''} onClick={() => setSide('buy')}>
          매수
        </button>
        <button className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>
          매도 {held > 0 && <small>({num(held)})</small>}
        </button>
      </div>
      <div className="trade-body">
        <div className="qty-line">
          <input
            inputMode="numeric"
            placeholder="수량"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <span className="muted">주 / 최대 {num(maxQty)}주</span>
        </div>
        <div className="fracs">
          {[0.1, 0.25, 0.5, 1].map((f) => (
            <button key={f} onClick={() => setFrac(f)} disabled={maxQty === 0}>
              {f === 1 ? '최대' : `${f * 100}%`}
            </button>
          ))}
        </div>
        <div className="trade-sum">
          <span className="muted">{side === 'buy' ? '예상 결제금액' : '예상 수령금액'} (수수료 0.1%)</span>
          <b>{won(qty > 0 ? amount : 0)}</b>
        </div>
        {side === 'sell' && held > 0 && qty > 0 && (
          <div className="trade-sum">
            <span className="muted">예상 손익</span>
            <b className={tone(amount - (avgCost * qty))}>{won(amount - avgCost * qty)}</b>
          </div>
        )}
        <button className={'btn big ' + (side === 'buy' ? 'buy' : 'sell')} disabled={!valid} onClick={submit}>
          {side === 'buy' ? '매수하기' : '매도하기'}
        </button>
      </div>
    </div>
  );
}
