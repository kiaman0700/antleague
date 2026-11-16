import { LEVERAGE_CAP } from "../engine/engine";
import { useState } from "react";
import { getEffective } from "../prefs";
import { Icon, SectorIcon } from "./Icon";
import type { Market, NewsEvent } from "../game/market";
import { releaseTick } from "../game/intraday";
import { roundPrice, roundUsd } from "../game/market";
import {
  buyCost,
  maxBuyQty,
  sellProceeds,
  type Holding,
} from "../game/portfolio";
import { fmtUsd, quote } from "../game/quote";
import {
  etfMembers,
  riskOf,
  RISK_LABEL,
  SECTOR_MAP,
  STOCK_MAP,
} from "../game/stocks";
import { num, pct, tone, won, wonShort } from "../lib/format";
import type { OrderRow } from "../engine/engine";
import type { UiMode } from "../session";
import { useIsMobile } from "./Extras";
import { drawKeyFor, ProChart } from "./ProChart";
import { Term } from "./Term";

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
  trade: {
    allowed: boolean;
    reason: string | null;
    fee: number;
    busy: boolean;
    capFor?: (symbol: string) => number | null;
    /** (v7) 장 전: 지금 가격 거래는 안 되고 예약 주문만 */
    limitOnly?: boolean;
  };
  onTrade: (symbol: string, side: "buy" | "sell", qty: number) => void;
  orders: OrderRow[];
  reservedCash: number;
  onOrder: (
    symbol: string,
    side: "buy" | "sell",
    qty: number,
    limit: number,
  ) => void;
  onCancel: (orderId: string) => void;
  /** 모바일은 주문창을 아래 시트로 따로 띄움 */
  inlineTrade: boolean;
}

export function StockDetail(props: Props) {
  const [full, setFull] = useState(false);
  const [view, setView] = useState<"live" | "daily">(
    () => getEffective().chart,
  );
  // 장중 봉 간격(5초 칸 몇 개를 한 봉으로): 5초·30초·1분 — 이 기기에 기억
  const [liveK, setLiveK] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("stockduel.liveSec")) || 0;
    } catch {
      return 0;
    }
  });
  // 세로 휴대폰은 화면이 길쭉하니 차트를 더 높게
  const tallChart = useIsMobile(
    "(max-width: 600px) and (orientation: portrait)",
  );
  const {
    ui,
    market,
    symbol,
    day,
    closed,
    cash,
    holding,
    news,
    watched,
    onToggleWatch,
    onSelect,
    onSelectSector,
    trade,
    onTrade,
    orders,
    reservedCash,
    onOrder,
    onCancel,
    inlineTrade,
  } = props;
  const s = STOCK_MAP[symbol];
  const sec = SECTOR_MAP[s.sector];
  const isUS = s.currency === "USD";
  const etf = s.etf;
  const q = quote(market, symbol, day, closed);
  const price = q.krw;
  const fx = market.macro[day]?.fx ?? market.macro0.fx;
  const r = riskOf(s);

  // 차트: 미국 주식은 달러, 나머지는 원화
  const series = isUS ? market.usd[symbol] : market.bars[symbol];
  const bars = series.slice(0, day + 1);
  const nativeNow = q.usd ?? price;
  const prevNative =
    day === 0
      ? isUS
        ? market.baseUsd[symbol]
        : market.base[symbol]
      : series[day - 1].close;
  const diff = nativeNow - prevNative;
  const baseNative = isUS ? market.baseUsd[symbol] : market.base[symbol];
  const fmtN = (v: number) => (isUS ? fmtUsd(v) : num(v));

  const relevant = news.filter(
    (n) =>
      n.day <= day &&
      (n.related.includes(symbol) ||
        n.symbol === symbol ||
        n.sector === s.sector),
  );
  const markers = relevant.map((n) => ({ day: n.day, tone: n.tone }));
  // 오늘 장이 열려 있으면 장중 차트 (5초 칸)
  const live = !closed && market.live?.day === day ? market.live : null;
  const liveDaily = !closed && !live;
  const newsTicks = live
    ? relevant
        .filter((n) => n.day === day && n.at != null)
        .map((n) => ({ tick: releaseTick(n.at!, live.n), tone: n.tone }))
    : [];
  const linked = Object.entries(sec.links)
    .filter(([, w]) => w > 0)
    .map(([id]) => SECTOR_MAP[id]);
  const inverse = Object.entries(sec.links)
    .filter(([, w]) => w < 0)
    .map(([id]) => SECTOR_MAP[id]);
  const sens = etf
    ? []
    : ([
        sec.rate <= -0.08
          ? `${isUS ? "미국 " : ""}금리 내리면 ↑`
          : sec.rate >= 0.08
            ? "금리 오르면 ↑"
            : null,
        isUS
          ? "환율 오르면 원화 가치 ↑"
          : sec.fx >= 0.4
            ? "환율 오르면 ↑"
            : sec.fx <= -0.3
              ? "환율 오르면 ↓"
              : null,
        sec.oil >= 0.3
          ? "유가 오르면 ↑"
          : sec.oil <= -0.3
            ? "유가 오르면 ↓"
            : null,
      ].filter(Boolean) as string[]);

  const holdingRet = holding ? price / holding.avgCost - 1 : 0;
  const refVal = holding ? (isUS ? holding.avgCost / fx : holding.avgCost) : 0;
  const ref = holding
    ? {
        value: refVal,
        label: `${ui === "easy" ? "평균 산 가격" : "평단"} ${isUS ? "≈ " + fmtUsd(refVal) : num(refVal)}`,
      }
    : null;
  const lineValues = series.slice(0, day).map((b) => b.close);
  lineValues.push(nativeNow);
  const members = etf ? etfMembers(etf) : [];
  const chartFmt = isUS
    ? (v: number) => "$" + v.toFixed(v < 100 ? 2 : 1)
    : (v: number) => Math.round(v).toLocaleString("ko-KR");

  const liveChart = (big: boolean) => {
    if (!live) return null;
    // 봉 간격(초)을 칸 수로: 칸 길이(v11 1초, 예전 5초)로 나눠떨어지는 간격만, 봉이 4개 이상 나오는 것만
    const tickSec = (live.tickMs ?? 5000) / 1000;
    const daySec = live.n * tickSec;
    const opts = LIVE_SEC.filter(([s]) => s % tickSec === 0 && Math.ceil(daySec / s) >= 4).map(([s, l]) => [s / tickSec, l, s] as const);
    const want = opts.find(([, , s]) => s === liveK);
    // 기본: 봉이 10개 이상 나오는 가장 넓은 간격
    const k = want ? want[0] : ([...opts].reverse().find(([kk]) => Math.ceil(live.n / kk) >= 10)?.[0] ?? opts[0]?.[0] ?? 1);
    return (
      <>
        {opts.length > 1 && (
          <div className="pc-seg live-k" role="group" aria-label="봉 간격">
            {opts.map(([v, l, s]) => (
              <button
                key={v}
                className={k === v ? "on" : ""}
                onClick={() => {
                  setLiveK(s);
                  try {
                    localStorage.setItem("stockduel.liveSec", String(s));
                  } catch {
                    /* 무시 */
                  }
                }}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <ProChart
          key={symbol + ":live:" + k}
          ui={ui}
          symbol={symbol + "-live"}
          bars={intradayBars(series[day].open, series[day].path, k, `${symbol}:${day}`, isUS ? roundUsd : roundPrice)}
          totalDays={Math.ceil(live.n / k)}
          liveOpenOnly={false}
          refLine={
            ref ?? {
              value: prevNative,
              label: `어제 종가 ${isUS ? fmtUsd(prevNative) : num(prevNative)}`,
            }
          }
          markers={newsTicks.map((t) => ({
            day: Math.min(Math.ceil(live.n / k) - 1, Math.floor(t.tick / k)),
            tone: t.tone,
          }))}
          fmt={chartFmt}
          tall={big || tallChart}
          onExpand={big ? undefined : () => setFull(true)}
          unit={{
            axis: (i) => clock(i * k * tickSec),
            tip: (i) =>
              `${clock(i * k * tickSec)} ~ ${clock((i + 1) * k * tickSec)} (장 시작 뒤)`,
            ranges: [
              // 최근 약 2분
              [Math.max(4, Math.round(120 / (k * tickSec))), "최근"],
              [null, "오늘 전체"],
            ],
            drawKey: drawKeyFor(symbol, day),
            now: { tick: live.tick, perBar: k, startAt: live.startAt, n: live.n, tickSec },
          }}
        />
      </>
    );
  };

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="title-line">
          <h2>{s.name}</h2>
          <button
            className={"star big" + (watched ? " on" : "")}
            onClick={onToggleWatch}
            aria-label="관심 종목"
          >
            <Icon name="star" size={18} className={watched ? "filled" : ""} />
          </button>
        </div>
        <div className="tags">
          {etf ? (
            <span className="tag">
              <Icon name="cards" size={12} /> ETF · {etf.group}
            </span>
          ) : (
            <button className="tag" onClick={() => onSelectSector(s.sector)}>
              {isUS ? "🇺🇸 " : ""}
              <SectorIcon id={sec.id} /> {sec.name}
            </button>
          )}
          {etf && etf.lev !== 1 && (
            <span className="tag warn-tag">
              {etf.lev > 0 ? `${etf.lev}배 레버리지` : "인버스(반대)"}
            </span>
          )}
          <span className={"tag risk r" + r}>
            <Term k="위험도">{RISK_LABEL[r]}</Term>
          </span>
          {ui === "pro" && <span className="tag mono">{s.symbol}</span>}
        </div>
        <div className="price-line">
          <span className={"price " + tone(diff)}>
            {isUS ? fmtUsd(nativeNow) : `${num(price)}원`}
          </span>
          <span className={"chg " + tone(diff)}>
            {diff >= 0 ? "▲" : "▼"} {fmtN(Math.abs(diff))} ({pct(q.ch)})
          </span>
        </div>
        <div className="sub-price muted small">
          {isUS && (
            <>
              ≈ {num(price)}원 · <Term k="환율" /> {num(fx)}원 ·{" "}
            </>
          )}
          {closed ? (
            <Term k="종가">오늘 종가</Term>
          ) : live ? (
            <span className="live-badge">● 지금 가격</span>
          ) : (
            <Term k="시가">오늘 시가</Term>
          )}{" "}
          · <Term k="전일대비" />
        </div>
        {(() => {
          const dv = market.dividends.filter((x) => x.symbol === symbol);
          const next = dv.find((x) => x.day >= day);
          const paid = dv.filter((x) => x.day < day && x.perShare > 0);
          if (!next && !paid.length) return null;
          return (
            <div className="div-info">
              <Icon name="coins" size={14} />{" "}
              {next ? (
                <>
                  배당 기준일 <b>{next.day + 1}일차</b> · 배당률 약{" "}
                  <b>{next.yieldPct}%</b>
                  {next.day === day
                    ? " (오늘 마감 때까지 들고 있으면 받아요)"
                    : ""}
                </>
              ) : null}
              {paid.map((x) => (
                <span key={x.day}>
                  {" "}
                  · {x.day + 1}일차 1주당 {num(x.perShare)}원 지급됨
                </span>
              ))}
            </div>
          );
        })()}
        {!isUS && q.ch >= 0.295 && <span className="limit up">상한가</span>}
        {!isUS && q.ch <= -0.295 && <span className="limit down">하한가</span>}
      </div>

      <div className="chart-wrap">
        {live && (
          <div
            className="pc-seg chart-view"
            role="tablist"
            aria-label="차트 보기"
          >
            <button
              role="tab"
              aria-selected={view === "live"}
              className={view === "live" ? "on" : ""}
              onClick={() => setView("live")}
            >
              오늘 장중
            </button>
            <button
              role="tab"
              aria-selected={view === "daily"}
              className={view === "daily" ? "on" : ""}
              onClick={() => setView("daily")}
            >
              일별
            </button>
          </div>
        )}
        {live && view === "live" ? (
          <>{liveChart(false)}</>
        ) : (
          <ProChart
            key={symbol}
            ui={ui}
            symbol={symbol}
            bars={bars}
            totalDays={market.totalDays}
            liveOpenOnly={liveDaily}
            refLine={ref}
            markers={markers}
            fmt={chartFmt}
            tall={tallChart}
            onExpand={() => setFull(true)}
          />
        )}
        {full && (
          <div className="chart-full" role="dialog" aria-label="차트 크게 보기">
            <div className="cf-head">
              <div>
                <b>{s.name}</b>
                <span className={"cf-price " + tone(diff)}>
                  {isUS ? fmtUsd(nativeNow) : num(price) + "원"}
                </span>
                <span className={tone(diff)}>{pct(q.ch)}</span>
              </div>
              <button
                className="icon-btn"
                onClick={() => setFull(false)}
                aria-label="닫기"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            {live && view === "live" ? (
              liveChart(true)
            ) : (
              <ProChart
                ui={ui}
                symbol={symbol}
                bars={bars}
                totalDays={market.totalDays}
                liveOpenOnly={liveDaily}
                refLine={ref}
                markers={markers}
                fmt={chartFmt}
                tall
              />
            )}
          </div>
        )}
        {ui === "pro" && (
          <div className="ohlc">
            <span>
              전일 <b>{fmtN(prevNative)}</b>
            </span>
            <span>
              시가 <b>{fmtN(bars[day].open)}</b>
            </span>
            {(closed || live) && (
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
              누적{" "}
              <b className={tone(nativeNow / baseNative - 1)}>
                {pct(nativeNow / baseNative - 1, 1)}
              </b>
            </span>
          </div>
        )}
      </div>

      {holding && (
        <div className="my-holding">
          <div>
            <small>{ui === "easy" ? "내가 가진 주식" : "보유"}</small>
            <b>{num(holding.qty)}주</b>
          </div>
          <div>
            <small>
              <Term k="평단가">
                {ui === "easy" ? "평균 산 가격" : "평단가"}
              </Term>
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

      {inlineTrade && (
        <TradePanel
          key={symbol + day + (closed ? "c" : "")}
          ui={ui}
          symbol={symbol}
          price={price}
          usd={q.usd}
          fx={fx}
          cash={cash}
          held={holding?.qty ?? 0}
          avgCost={holding?.avgCost ?? 0}
          trade={trade}
          onTrade={onTrade}
          orders={orders.filter((o) => o.symbol === symbol && o.day === day)}
          reservedCash={reservedCash}
          onOrder={onOrder}
          onCancel={onCancel}
        />
      )}

      <div className="company">
        <h4>{etf ? "어떤 ETF인가요?" : "어떤 회사인가요?"}</h4>
        <p>{s.desc}</p>
        {etf && (
          <p className="muted small etf-note">
            ETF는 여러 종목을 한 번에 담은 바구니예요.{" "}
            {etf.lev > 1
              ? "레버리지는 매일 수익률을 배로 키워서 오래 들고 있으면 생각과 다르게 움직일 수 있어요."
              : etf.lev < 0
                ? "인버스는 시장이 떨어질 때 돈을 벌어요."
                : "한 종목이 망해도 덜 흔들려요."}
          </p>
        )}
        <div className="relations">
          {members.length > 0 && (
            <div>
              <small>담고 있는 종목 ({members.length})</small>
              {members.slice(0, 12).map((m) => (
                <button
                  key={m}
                  className="pill link"
                  onClick={() => onSelect(m)}
                >
                  {STOCK_MAP[m].name}
                </button>
              ))}
              {members.length > 12 && (
                <span className="pill">+{members.length - 12}</span>
              )}
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
                <button
                  key={l.id}
                  className="pill link"
                  onClick={() => onSelectSector(l.id)}
                >
                  <SectorIcon id={l.id} /> {l.name}
                </button>
              ))}
            </div>
          )}
          {inverse.length > 0 && (
            <div>
              <small>반대로 움직이는 업종</small>
              {inverse.map((l) => (
                <button
                  key={l.id}
                  className="pill link"
                  onClick={() => onSelectSector(l.id)}
                >
                  <SectorIcon id={l.id} /> {l.name}
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

export interface TradeProps {
  /** 시작 돈 (빠른 금액 버튼 단위) */
  startCash?: number;
  ui: UiMode;
  symbol: string;
  price: number;
  usd: number | null;
  fx: number;
  cash: number;
  held: number;
  avgCost: number;
  trade: Props["trade"];
  onTrade: (symbol: string, side: "buy" | "sell", qty: number) => void;
  orders: OrderRow[];
  reservedCash: number;
  onOrder: (
    symbol: string,
    side: "buy" | "sell",
    qty: number,
    limit: number,
  ) => void;
  onCancel: (orderId: string) => void;
  initialSide?: "buy" | "sell";
}

export function TradePanel({
  ui,
  symbol,
  price,
  usd,
  fx,
  cash,
  held,
  avgCost,
  trade,
  onTrade,
  orders,
  reservedCash,
  onOrder,
  onCancel,
  initialSide = "buy",
  startCash = 10_000_000,
}: TradeProps) {
  const easy = ui === "easy";
  const isUS = usd !== null;
  const native = usd ?? price;
  const [side, setSide] = useState<"buy" | "sell">(initialSide);
  const [kind, setKind] = useState<"now" | "limit">(trade.limitOnly ? "limit" : "now");
  const [qtyText, setQtyRaw] = useState("");
  // 금액 버튼(+1만원 등)으로 모은 돈. 직접 수량을 바꾸면 지움
  const [budget, setBudget] = useState<number | null>(null);
  const setQtyText = (v: string) => {
    setBudget(null);
    setQtyRaw(v);
  };
  const [limitText, setLimitText] = useState("");
  const fee = trade.fee;

  const limitNative = Number(limitText) || 0;
  const limitKrw = isUS
    ? Math.round(limitNative * fx)
    : Math.round(limitNative);
  const unitKrw = kind === "limit" && limitKrw > 0 ? limitKrw : price;
  const reservedSell = orders
    .filter((o) => o.side === "sell" && o.status === "open")
    .reduce((a, o) => a + o.qty, 0);
  const availCash = kind === "limit" ? cash - reservedCash : cash;
  // 레버리지·인버스 ETF 는 합쳐서 총재산의 LEVERAGE_CAP(30%)까지만 (서버 규칙과 같게 미리 보여 줌)
  const cap = side === "buy" ? (trade.capFor?.(symbol) ?? null) : null;
  const maxQty =
    side === "buy"
      ? Math.min(
          maxBuyQty(Math.max(0, availCash), unitKrw, fee),
          cap ?? Infinity,
        )
      : Math.max(0, held - (kind === "limit" ? reservedSell : 0));
  const qty = Math.min(Math.floor(Number(qtyText) || 0), 1_000_000);
  const amount =
    side === "buy"
      ? buyCost(qty, unitKrw, fee)
      : sellProceeds(qty, unitKrw, fee);
  const limitOk =
    kind === "now" ||
    (side === "buy"
      ? limitNative > 0 && limitNative < native && limitNative >= native * 0.7
      : limitNative > native && limitNative <= native * 1.3);
  const valid =
    trade.allowed && !trade.busy && qty > 0 && qty <= maxQty && limitOk;

  const fmtN = (v: number) => (isUS ? fmtUsd(v) : num(v) + "원");
  const setLimitPct = (p: number) => {
    const v = native * (1 + p);
    setLimitText(
      isUS
        ? v.toFixed(2)
        : String(Math.round(v / (v >= 10000 ? 50 : 5)) * (v >= 10000 ? 50 : 5)),
    );
  };
  const switchKind = (k: "now" | "limit") => {
    setKind(k);
    setQtyText("");
    if (k === "limit" && !limitText) setLimitPct(side === "buy" ? -0.03 : 0.03);
  };
  const switchSide = (sd: "buy" | "sell") => {
    setSide(sd);
    setQtyText("");
    if (kind === "limit") setLimitPct(sd === "buy" ? -0.03 : 0.03);
  };
  // 1주가 버튼 금액보다 비싸도 최소 1주는 더해지게
  // 누른 금액을 모아서 그 돈으로 살 수 있는 만큼만 (한 번 누를 때마다 1주씩 늘던 문제 — 10만원을 눌러도 12만원짜리 1주가 담겼음)
  const addMoney = (w: number) => {
    const nb = (budget ?? qty * unitKrw) + w;
    setBudget(nb);
    setQtyRaw(String(Math.min(maxQty, Math.floor(nb / unitKrw))));
  };
  const setFrac = (f: number) =>
    setQtyText(String(Math.max(0, Math.floor(maxQty * f))));
  const submit = () => {
    if (!valid) return;
    if (kind === "now") onTrade(symbol, side, qty);
    else
      onOrder(
        symbol,
        side,
        qty,
        isUS ? Math.round(limitNative * 100) / 100 : Math.round(limitNative),
      );
    setQtyText("");
  };

  const buyLabel = easy ? "사기" : "매수";
  const sellLabel = easy ? "팔기" : "매도";
  const openOrders = orders.filter((o) => o.status === "open");

  return (
    <div className={"trade " + side}>
      <div className="seg2">
        <button
          className={side === "buy" ? "on buy" : ""}
          onClick={() => switchSide("buy")}
        >
          {buyLabel}
        </button>
        <button
          className={side === "sell" ? "on sell" : ""}
          onClick={() => switchSide("sell")}
          disabled={held === 0}
        >
          {sellLabel}
          {held > 0 && <small> {num(held)}주</small>}
        </button>
      </div>

      <div className="order-kind" role="tablist">
        <button
          className={kind === "now" ? "on" : ""}
          onClick={() => switchKind("now")}
          disabled={!!trade.limitOnly}
          title={trade.limitOnly ? "장이 열리면 지금 가격으로 살 수 있어요" : undefined}
        >
          {easy ? "지금 가격으로" : "시장가(현재가)"}
        </button>
        <button
          className={kind === "limit" ? "on" : ""}
          onClick={() => switchKind("limit")}
        >
          <Icon name="hourglass" size={14} /> {easy ? "예약 주문" : "지정가"}
        </button>
      </div>

      {trade.limitOnly && (
        <div className="trade-block pre">장 전이에요. 예약 주문만 걸 수 있고, 장이 열리면 가격이 닿을 때 체결돼요.</div>
      )}
      {!trade.allowed && trade.reason && (
        <div className="trade-block">{trade.reason}</div>
      )}
      {cap !== null && trade.allowed && (
        <div className="trade-note">
          레버리지·인버스 ETF는 합쳐서 총재산의 {Math.round(LEVERAGE_CAP * 100)}
          %까지만 살 수 있어요 (지금 최대 {num(cap)}주)
        </div>
      )}

      {kind === "limit" && (
        <div className="limit-box">
          <p className="limit-help">
            {side === "buy"
              ? "오늘 장중에 가격이 여기까지 내려오면 이 가격에 자동으로 사요."
              : "오늘 장중에 가격이 여기까지 오르면 이 가격에 자동으로 팔아요."}{" "}
            안 닿으면 장 마감 때 취소돼요.
          </p>
          <div className="qty-box">
            {isUS && <span>$</span>}
            <input
              inputMode="decimal"
              value={limitText}
              onChange={(e) =>
                setLimitText(
                  e.target.value.replace(/[^0-9.]/g, "").slice(0, 10),
                )
              }
              disabled={!trade.allowed}
              aria-label="예약 가격"
            />
            {!isUS && <span>원</span>}
          </div>
          <div className="quick">
            {(side === "buy"
              ? [-0.01, -0.03, -0.05, -0.1]
              : [0.01, 0.03, 0.05, 0.1]
            ).map((p) => (
              <button
                key={p}
                onClick={() => setLimitPct(p)}
                disabled={!trade.allowed}
              >
                {p > 0 ? "+" : ""}
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
          {!limitOk && limitText && (
            <small className="error-inline">
              {side === "buy"
                ? "지금 가격보다 낮게, 30% 이내로"
                : "지금 가격보다 높게, 30% 이내로"}
            </small>
          )}
        </div>
      )}

      <div className="qty-row">
        <div className="qty-box">
          <input
            inputMode="numeric"
            placeholder="0"
            value={qtyText}
            onChange={(e) =>
              setQtyText(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))
            }
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={!trade.allowed}
            aria-label="수량"
          />
          <span>주</span>
        </div>
        {qty > maxQty && (
          <small className="error-inline qty-over">
            {side === "buy"
              ? cap !== null && maxQty === cap
                ? `레버리지·인버스 제한으로 최대 ${num(maxQty)}주까지예요`
                : `현금으로 최대 ${num(maxQty)}주까지 살 수 있어요`
              : `갖고 있는 ${num(maxQty)}주까지 팔 수 있어요`}
          </small>
        )}
        <div className="qty-meta">
          <small className="muted">
            최대 {num(maxQty)}주 · 1주{" "}
            {kind === "limit" && limitNative > 0
              ? fmtN(limitNative)
              : isUS
                ? `${fmtUsd(native)} ≈ ${num(price)}원`
                : `${num(price)}원`}
          </small>
          <div className="steppers">
            <button
              onClick={() => setQtyText(String(Math.max(0, qty - 1)))}
              disabled={!trade.allowed}
              aria-label="1주 빼기"
            >
              −
            </button>
            <button
              onClick={() => setQtyText(String(Math.min(maxQty, qty + 1)))}
              disabled={!trade.allowed}
              aria-label="1주 더하기"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="quick">
        {easy && side === "buy"
          ? (
              (startCash >= 10_000_000
                ? ([
                    [100_000, "+10만원"],
                    [500_000, "+50만원"],
                    [1_000_000, "+100만원"],
                  ] as const)
                : ([
                    [10_000, "+1만원"],
                    [50_000, "+5만원"],
                    [100_000, "+10만원"],
                  ] as const))
            ).map(([w, l]) => (
              <button
                key={l}
                onClick={() => addMoney(w)}
                disabled={!trade.allowed || maxQty === 0}
              >
                {l}
              </button>
            ))
          : [0.1, 0.25, 0.5].map((f) => (
              <button
                key={f}
                onClick={() => setFrac(f)}
                disabled={!trade.allowed || maxQty === 0}
              >
                {easy
                  ? f === 0.5
                    ? "절반"
                    : f === 0.25
                      ? "1/4"
                      : "10%"
                  : `${f * 100}%`}
              </button>
            ))}
        <button
          onClick={() => setFrac(1)}
          disabled={!trade.allowed || maxQty === 0}
        >
          {easy ? (side === "buy" ? "살 수 있는 만큼" : "전부") : "최대"}
        </button>
      </div>
      {/* 자리는 늘 잡아 둠 (안내가 생길 때 창 높이가 바뀌어 버튼이 움직이지 않게) */}
      {easy && side === "buy" && (
        <p className="muted small quick-note">
          {budget === null
            ? " "
            : qty === 0
            ? `모은 돈 ${won(budget)} · 1주에 ${won(unitKrw)}이라 아직 1주도 못 사요`
            : `모은 돈 ${won(budget)} → ${qty}주 (남는 돈은 쓰지 않아요)`}
        </p>
      )}

      <div className="sum">
        <div>
          <span className="muted">
            {side === "buy"
              ? easy
                ? "내야 할 돈"
                : "결제 금액"
              : easy
                ? "받을 돈"
                : "정산 금액"}
            <small>
              {" "}
              (<Term k="수수료" /> {(fee * 100).toFixed(1)}%)
            </small>
          </span>
          <b>{won(qty > 0 ? amount : 0)}</b>
        </div>
        {side === "sell" && qty > 0 && (
          <div>
            <span className="muted">
              {easy ? "이번에 버는 돈" : "실현 손익"}
            </span>
            <b className={tone(amount - avgCost * qty)}>
              {won(amount - avgCost * qty)}
            </b>
          </div>
        )}
        {side === "buy" && (
          <div>
            <span className="muted">
              {kind === "limit"
                ? "예약 후 쓸 수 있는 현금"
                : easy
                  ? "남는 현금"
                  : "주문 후 현금"}
            </span>
            <b>{won(availCash - (qty > 0 ? amount : 0))}</b>
          </div>
        )}
      </div>

      <button className={"btn xl " + side} disabled={!valid} onClick={submit}>
        {trade.busy
          ? "처리 중…"
          : kind === "limit"
            ? `${qty > 0 ? num(qty) + "주 " : ""}예약 ${side === "buy" ? buyLabel : sellLabel}`
            : qty > 0
              ? `${num(qty)}주 ${side === "buy" ? buyLabel : sellLabel}`
              : side === "buy"
                ? buyLabel
                : sellLabel}
      </button>

      {openOrders.length > 0 && (
        <div className="open-orders">
          <small className="muted">예약 중인 주문</small>
          {openOrders.map((o) => (
            <div key={o.id} className={"oo-row " + o.side}>
              <span>
                {o.side === "buy" ? buyLabel : sellLabel} {num(o.qty)}주 @{" "}
                {isUS ? fmtUsd(o.limit_price) : num(o.limit_price) + "원"}
              </span>
              <button
                className="btn sm ghost"
                disabled={!trade.allowed || trade.busy}
                onClick={() => onCancel(o.id!)}
              >
                취소
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 장중 봉 간격 선택지: [초, 이름] — 칸 길이로 나눠떨어지는 것만 보여 줌 */
const LIVE_SEC: [number, string][] = [
  // 가격은 1초마다 바뀌지만, 봉은 5초부터 (1초 봉은 너무 잘게 쪼개져 보기 어려움)
  [5, "5초"],
  [15, "15초"],
  [30, "30초"],
  [60, "1분"],
];
/** 장 시작부터 지난 시간 → 0:30 */
function clock(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
/** 꾸밈용 0~1 난수 (화면에 이미 보이는 값으로만 정해짐 — 앞으로의 가격과 무관) */
function h01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}
/**
 * 오늘 5초 가격들을 k칸씩 묶어 봉으로 (첫 봉 시가 = 오늘 시가, 다음 봉 시가 = 앞 봉 종가).
 * 진짜 차트처럼 5초 안에서도 오르내린 흔적(꼬리)을 그림: 시가·종가 사이 움직임 크기에 맞춘 작은 꼬리.
 * 꼬리는 지금까지 보인 두 가격과 종목·칸 번호로만 정해져서, 다음 가격을 알려 주지 않음
 */
function intradayBars(open: number, ticks: number[], k: number, seed = "", round: (v: number) => number = (v) => v) {
  const out: {
    open: number;
    high: number;
    low: number;
    close: number;
    path: number[];
  }[] = [];
  let prev = open;
  const dayHi = Math.max(open, ...ticks);
  const dayLo = Math.min(open, ...ticks);
  for (let i = 0; i < ticks.length; i += k) {
    const g = ticks.slice(i, i + k);
    if (!g.length) break;
    const o = prev;
    let hi = Math.max(o, ...g);
    let lo = Math.min(o, ...g);
    let p0 = o;
    g.forEach((c, j) => {
      const move = Math.abs(c - p0);
      const base = Math.max(move * 0.55, c * 0.0006);
      const up = round(Math.max(p0, c) + base * h01(`${seed}:${i + j}:u`));
      const dn = round(Math.min(p0, c) - base * h01(`${seed}:${i + j}:d`));
      hi = Math.max(hi, Math.min(dayHi, up));
      lo = Math.min(lo, Math.max(dayLo, dn));
      p0 = c;
    });
    out.push({ open: o, high: hi, low: lo, close: g[g.length - 1], path: g });
    prev = g[g.length - 1];
  }
  return out.length
    ? out
    : [{ open, high: open, low: open, close: open, path: [open] }];
}
