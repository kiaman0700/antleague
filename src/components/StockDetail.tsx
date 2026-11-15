import { useState } from 'react';
import type { Market, NewsEvent } from '../game/market';
import { buyCost, maxBuyQty, sellProceeds, type Holding } from '../game/portfolio';
import { fmtUsd, quote } from '../game/quote';
import { etfMembers, riskOf, RISK_LABEL, SECTOR_MAP, STOCK_MAP } from '../game/stocks';
import { num, pct, tone, won, wonShort } from '../lib/format';
import type { UiMode } from '../session';
import { CandleChart, LineChart } from './Chart';
import { Term } from './Term';

interface Props {
  ui: UiMode;
  market: Market;
  symbol: string;
  day: number;
  /** 마감 화면(종가) 보는 중인지 */
  closed: boolean;
  cash: number;
  holding: Holding | undefined;
  news: NewsEvent[];
  watched: boolean;
  onToggleWatch: () => void;
  onSelect: (symbol: string) => void;
  onSelectSector: (sectorId: string) => void;
  trade: { allowed: boolean; reason: string | null; fee: number; busy: boolean };
  onTrade: (symbol: string, side: 'buy' | 'sell', qty: number) => void;
}

export function StockDetail({ ui, market, symbol, day, closed, cash, holding, news, watched, onToggleWatch, onSelect, onSelectSector, trade, onTrade }: Props) {
  const s = STOCK_MAP[symbol];
  const sec = SECTOR_MAP[s.sector];
  const isUS = s.currency === 'USD';
  const etf = s.etf;
  const q = quote(market, symbol, day, closed);
  const price = q.krw;
  const fx = market.macro[day]?.fx ?? market.macro0.fx;
  const r = riskOf(s);

  // 차트: 미국 주식은 달러, 나머지는 원화
  const series = isUS ? market.usd[symbol] : market.bars[symbol];
  const bars = series.slice(0, day + 1);
  const nativeNow = q.usd ?? price;
  const prevNative = day === 0 ? (isUS ? market.baseUsd[symbol] : market.base[symbol]) : series[day - 1].close;
  const diff = nativeNow - prevNative;
  const baseNative = isUS ? market.baseUsd[symbol] : market.base[symbol];
  const fmtN = (v: number) => (isUS ? fmtUsd(v) : num(v));

  const relevant = news.filter((n) => n.day <= day && (n.related.includes(symbol) || n.symbol === symbol || n.sector === s.sector));
  const markers = relevant.map((n) => ({ day: n.day, tone: n.tone }));
  const linked = Object.entries(sec.links).filter(([, w]) => w > 0).map(([id]) => SECTOR_MAP[id]);
  const inverse = Object.entries(sec.links).filter(([, w]) => w < 0).map(([id]) => SECTOR_MAP[id]);
  const sens = etf
    ? []
    : ([
        sec.rate <= -0.08 ? `${isUS ? '미국 ' : ''}금리 내리면 ↑` : sec.rate >= 0.08 ? '금리 오르면 ↑' : null,
        isUS ? '환율 오르면 원화 가치 ↑' : sec.fx >= 0.4 ? '환율 오르면 ↑' : sec.fx <= -0.3 ? '환율 오르면 ↓' : null,
        sec.oil >= 0.3 ? '유가 오르면 ↑' : sec.oil <= -0.3 ? '유가 오르면 ↓' : null,
      ].filter(Boolean) as string[]);

  const holdingRet = holding ? price / holding.avgCost - 1 : 0;
  const refVal = holding ? (isUS ? holding.avgCost / fx : holding.avgCost) : 0;
  const ref = holding ? { value: refVal, label: `${ui === 'easy' ? '평균 산 가격' : '평단'} ${isUS ? '≈ ' + fmtUsd(refVal) : num(refVal)}` } : null;
  const lineValues = series.slice(0, day).map((b) => b.close);
  lineValues.push(nativeNow);
  const members = etf ? etfMembers(etf) : [];

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="title-line">
          <h2>{s.name}</h2>
          <button className={'star big' + (watched ? ' on' : '')} onClick={onToggleWatch} aria-label="관심 종목">
            {watched ? '★' : '☆'}
          </button>
        </div>
        <div className="tags">
          {etf ? (
            <span className="tag">🧺 ETF · {etf.group}</span>
          ) : (
            <button className="tag" onClick={() => onSelectSector(s.sector)}>
              {isUS ? '🇺🇸 ' : ''}
              {sec.emoji} {sec.name}
            </button>
          )}
          {etf && etf.lev !== 1 && <span className="tag warn-tag">{etf.lev > 0 ? `${etf.lev}배 레버리지` : '인버스(반대)'}</span>}
          <span className={'tag risk r' + r}>
            <Term k="위험도">{RISK_LABEL[r]}</Term>
          </span>
          {ui === 'pro' && <span className="tag mono">{s.symbol}</span>}
        </div>
        <div className="price-line">
          <span className={'price ' + tone(diff)}>{isUS ? fmtUsd(nativeNow) : `${num(price)}원`}</span>
          <span className={'chg ' + tone(diff)}>
            {diff >= 0 ? '▲' : '▼'} {fmtN(Math.abs(diff))} ({pct(q.ch)})
          </span>
        </div>
        <div className="sub-price muted small">
          {isUS && (
            <>
              ≈ {num(price)}원 · <Term k="환율" /> {num(fx)}원 ·{' '}
            </>
          )}
          <Term k={closed ? '종가' : '시가'}>{closed ? '오늘 종가' : '오늘 시가'}</Term> · <Term k="전일대비" />
        </div>
        {!isUS && q.ch >= 0.295 && <span className="limit up">상한가</span>}
        {!isUS && q.ch <= -0.295 && <span className="limit down">하한가</span>}
      </div>

      <div className="chart-wrap">
        {ui === 'pro' ? (
          <CandleChart bars={bars} totalDays={market.totalDays} liveOpenOnly={!closed} refLine={ref} markers={markers} fmt={isUS ? (v) => '$' + v.toFixed(v < 100 ? 1 : 0) : undefined} />
        ) : (
          <LineChart
            series={[{ values: lineValues, color: diff >= 0 ? 'var(--up)' : 'var(--down)' }]}
            totalDays={market.totalDays}
            refLine={ref}
            markers={markers}
            fmt={isUS ? (v) => '$' + v.toFixed(v < 100 ? 1 : 0) : undefined}
          />
        )}
        {ui === 'pro' && (
          <div className="ohlc">
            <span>
              전일 <b>{fmtN(prevNative)}</b>
            </span>
            <span>
              시가 <b>{fmtN(bars[day].open)}</b>
            </span>
            {closed && (
              <>
                <span>
                  고가 <b className="up">{fmtN(bars[day].high)}</b>
                </span>
                <span>
                  저가 <b className="down">{fmtN(bars[day].low)}</b>
                </span>
              </>
            )}
            <span>
              누적 <b className={tone(nativeNow / baseNative - 1)}>{pct(nativeNow / baseNative - 1, 1)}</b>
            </span>
          </div>
        )}
      </div>

      {holding && (
        <div className="my-holding">
          <div>
            <small>{ui === 'easy' ? '내가 가진 주식' : '보유'}</small>
            <b>{num(holding.qty)}주</b>
          </div>
          <div>
            <small>
              <Term k="평단가">{ui === 'easy' ? '평균 산 가격' : '평단가'}</Term>
            </small>
            <b>{num(holding.avgCost)}원</b>
          </div>
          <div>
            <small>
              <Term k="평가금액" />
            </small>
            <b>{wonShort(holding.qty * price)}</b>
          </div>
          <div>
            <small>
              <Term k="수익률" />
            </small>
            <b className={tone(holdingRet)}>
              {pct(holdingRet)}
              <em> {wonShort(holding.qty * (price - holding.avgCost))}</em>
            </b>
          </div>
        </div>
      )}

      <TradePanel
        key={symbol + day + (closed ? 'c' : '')}
        ui={ui}
        symbol={symbol}
        price={price}
        usd={q.usd}
        cash={cash}
        held={holding?.qty ?? 0}
        avgCost={holding?.avgCost ?? 0}
        trade={trade}
        onTrade={onTrade}
      />

      <div className="company">
        <h4>{etf ? '어떤 ETF인가요?' : '어떤 회사인가요?'}</h4>
        <p>{s.desc}</p>
        {etf && (
          <p className="muted small etf-note">
            ETF는 여러 종목을 한 번에 담은 바구니예요.{' '}
            {etf.lev > 1 ? '레버리지는 매일 수익률을 배로 키워서 오래 들고 있으면 생각과 다르게 움직일 수 있어요.' : etf.lev < 0 ? '인버스는 시장이 떨어질 때 돈을 벌어요.' : '한 종목이 망해도 덜 흔들려요.'}
          </p>
        )}
        <div className="relations">
          {members.length > 0 && (
            <div>
              <small>담고 있는 종목 ({members.length})</small>
              {members.slice(0, 12).map((m) => (
                <button key={m} className="pill link" onClick={() => onSelect(m)}>
                  {STOCK_MAP[m].name}
                </button>
              ))}
              {members.length > 12 && <span className="pill">+{members.length - 12}</span>}
            </div>
          )}
          {sens.length > 0 && (
            <div>
              <small>거시 변수</small>
              {sens.map((t) => (
                <span key={t} className="pill">
                  {t}
                </span>
              ))}
            </div>
          )}
          {linked.length > 0 && (
            <div>
              <small>
                함께 움직이는 <Term k="업종" />
              </small>
              {linked.map((l) => (
                <button key={l.id} className="pill link" onClick={() => onSelectSector(l.id)}>
                  {l.emoji} {l.name}
                </button>
              ))}
            </div>
          )}
          {inverse.length > 0 && (
            <div>
              <small>반대로 움직이는 업종</small>
              {inverse.map((l) => (
                <button key={l.id} className="pill link" onClick={() => onSelectSector(l.id)}>
                  {l.emoji} {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {relevant.length > 0 && (
          <>
            <h4>관련 뉴스</h4>
            <ul className="mini-news">
              {[...relevant]
                .reverse()
                .slice(0, 6)
                .map((n, i) => (
                  <li key={i} className={n.tone}>
                    <span>{n.day + 1}일</span> {n.headline}
                  </li>
                ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface TradeProps {
  ui: UiMode;
  symbol: string;
  price: number;
  usd: number | null;
  cash: number;
  held: number;
  avgCost: number;
  trade: Props['trade'];
  onTrade: (symbol: string, side: 'buy' | 'sell', qty: number) => void;
}

function TradePanel({ ui, symbol, price, usd, cash, held, avgCost, trade, onTrade }: TradeProps) {
  const easy = ui === 'easy';
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qtyText, setQtyText] = useState('');
  const fee = trade.fee;
  const maxQty = side === 'buy' ? maxBuyQty(cash, price, fee) : held;
  const qty = Math.min(Math.floor(Number(qtyText) || 0), 1_000_000);
  const amount = side === 'buy' ? buyCost(qty, price, fee) : sellProceeds(qty, price, fee);
  const valid = trade.allowed && !trade.busy && qty > 0 && qty <= maxQty;

  const addMoney = (w: number) => setQtyText(String(Math.min(maxQty, Math.floor((qty * price + w) / price))));
  const setFrac = (f: number) => setQtyText(String(Math.max(0, Math.floor(maxQty * f))));
  const submit = () => {
    if (!valid) return;
    onTrade(symbol, side, qty);
    setQtyText('');
  };

  const buyLabel = easy ? '사기' : '매수';
  const sellLabel = easy ? '팔기' : '매도';

  return (
    <div className={'trade ' + side}>
      <div className="seg2">
        <button className={side === 'buy' ? 'on buy' : ''} onClick={() => (setSide('buy'), setQtyText(''))}>
          {buyLabel}
        </button>
        <button className={side === 'sell' ? 'on sell' : ''} onClick={() => (setSide('sell'), setQtyText(''))} disabled={held === 0}>
          {sellLabel}
          {held > 0 && <small> {num(held)}주</small>}
        </button>
      </div>

      {!trade.allowed && trade.reason && <div className="trade-block">{trade.reason}</div>}

      <div className="qty-row">
        <div className="qty-box">
          <input
            inputMode="numeric"
            placeholder="0"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={!trade.allowed}
            aria-label="수량"
          />
          <span>주</span>
        </div>
        <div className="qty-meta">
          <small className="muted">
            최대 {num(maxQty)}주 · 1주 {usd !== null ? `${fmtUsd(usd)} ≈ ` : ''}
            {num(price)}원
          </small>
          <div className="steppers">
            <button onClick={() => setQtyText(String(Math.max(0, qty - 1)))} disabled={!trade.allowed} aria-label="1주 빼기">
              −
            </button>
            <button onClick={() => setQtyText(String(Math.min(maxQty, qty + 1)))} disabled={!trade.allowed} aria-label="1주 더하기">
              +
            </button>
          </div>
        </div>
      </div>

      <div className="quick">
        {easy && side === 'buy'
          ? (
              [
                [100_000, '+10만원'],
                [500_000, '+50만원'],
                [1_000_000, '+100만원'],
              ] as const
            ).map(([w, l]) => (
              <button key={l} onClick={() => addMoney(w)} disabled={!trade.allowed || maxQty === 0}>
                {l}
              </button>
            ))
          : [0.1, 0.25, 0.5].map((f) => (
              <button key={f} onClick={() => setFrac(f)} disabled={!trade.allowed || maxQty === 0}>
                {easy ? (f === 0.5 ? '절반' : f === 0.25 ? '1/4' : '10%') : `${f * 100}%`}
              </button>
            ))}
        <button onClick={() => setFrac(1)} disabled={!trade.allowed || maxQty === 0}>
          {easy ? (side === 'buy' ? '살 수 있는 만큼' : '전부') : '최대'}
        </button>
      </div>

      <div className="sum">
        <div>
          <span className="muted">
            {side === 'buy' ? (easy ? '내야 할 돈' : '결제 금액') : easy ? '받을 돈' : '정산 금액'}
            <small>
              {' '}
              (<Term k="수수료" /> {(fee * 100).toFixed(1)}%)
            </small>
          </span>
          <b>{won(qty > 0 ? amount : 0)}</b>
        </div>
        {side === 'sell' && qty > 0 && (
          <div>
            <span className="muted">{easy ? '이번에 버는 돈' : '실현 손익'}</span>
            <b className={tone(amount - avgCost * qty)}>{won(amount - avgCost * qty)}</b>
          </div>
        )}
        {side === 'buy' && (
          <div>
            <span className="muted">{easy ? '남는 현금' : '주문 후 현금'}</span>
            <b>{won(cash - (qty > 0 ? amount : 0))}</b>
          </div>
        )}
      </div>

      <button className={'btn xl ' + side} disabled={!valid} onClick={submit}>
        {trade.busy ? '처리 중…' : qty > 0 ? `${num(qty)}주 ${side === 'buy' ? buyLabel : sellLabel}` : side === 'buy' ? buyLabel : sellLabel}
      </button>
    </div>
  );
}
