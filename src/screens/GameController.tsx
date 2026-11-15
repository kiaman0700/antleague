import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { applyMoneyUnit, isCustom, setPrefs, usePrefs } from '../prefs';
import { loadPins, MarketGridPinnable, MarketTicker, EndStatus, RankList, rankRows, RankStrip, savePins, ScheduleStrip, TargetPicker } from '../components/Board';
import { AssetSummary, CardTray, Drawer, Timeline } from '../components/Desk';
import { BottomSheet, Calendar, dDay, nextEvent, OrdersAndDividends, useIsMobile } from '../components/Extras';
import { AssetsPanel, CardsPanel, DayCloseOverlay, FakeNewsModal, NewsPanel, Tutorial } from '../components/Panels';
import { ReactionBubbles, ReactionButton } from '../components/Reactions';
import { StockBrowser, type BrowserFilter } from '../components/StockBrowser';
import { StockDetail, TradePanel } from '../components/StockDetail';
import { Term } from '../components/Term';
import type { View } from '../engine/engine';
import { loadSolo, soloAct, soloSync, soloView, type SoloSave } from '../engine/local';
import { withLive } from '../game/live';
import { BONUS_AMOUNT, FEE_BOMB_RATE, ITEM_MAP, spendsFromRows, type ItemKind, type ItemRow } from '../game/items';
import { barNow, KR_INDEX_BASE, pricesAt, US_INDEX_BASE, type Market } from '../game/market';
import { buyCost, computePortfolio, equityWith, FEE_RATE, START_CASH } from '../game/portfolio';
import { quote } from '../game/quote';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { num, pct, tone, wonShort } from '../lib/format';
import { isMuted, play, setMuted } from '../lib/sound';
import { api, useLiveView, useReactions, type Reaction } from '../net/api';
import { loadWatch, markTutorialSeen, saveUi, saveWatch, tutorialSeen, type Session, type UiMode } from '../session';
import { ResultScreen } from './ResultScreen';

interface Props {
  session: Session;
  onExit: () => void;
}

type Tab = 'list' | 'detail' | 'news' | 'assets' | 'cards';
const TABS: Tab[] = ['list', 'detail', 'news', 'assets', 'cards'];

/** 둘이서: 서버(/api/game) · 혼자: 브라우저 안의 같은 엔진 */
function useGameSource(session: Session) {
  const multi = session.mode === 'multi';
  const live = useLiveView(multi ? session.roomId : null);
  const [solo, setSolo] = useState<SoloSave | null>(() => (multi ? null : loadSolo()));
  const [soloNow, setSoloNow] = useState(() => Date.now());
  useEffect(() => {
    if (multi) return;
    const id = setInterval(() => {
      const t = Date.now();
      setSoloNow(t);
      setSolo((s) => (s ? soloSync(s, t) : s));
    }, 1000);
    return () => clearInterval(id);
  }, [multi]);
  const soloV = useMemo(() => (solo ? soloView(solo, soloNow) : null), [solo, soloNow]);
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        if (multi) {
          await api(action, { roomId: session.roomId, ...payload });
          await live.refresh();
        } else if (solo) {
          setSolo(soloAct(solo, action, payload));
        }
      } finally {
        setBusy(false);
      }
    },
    [multi, session.roomId, live, solo],
  );

  if (multi) return { view: live.view, market: live.market, offset: live.offset, error: live.error, act, busy };
  return { view: soloV, market: soloV?.market ?? null, offset: 0, error: solo ? null : '연습 게임을 찾을 수 없어요.', act, busy };
}

/** 모바일: 탭 = 페이지. 주소(#news 등)와 연결해서 뒤로 가기로 이전 탭으로 */
function useMobileTab(mobile: boolean) {
  const fromHash = (): Tab => {
    const h = location.hash.slice(1) as Tab;
    return TABS.includes(h) ? h : 'news';
  };
  const [tab, setTabState] = useState<Tab>(fromHash);
  useEffect(() => {
    const on = () => setTabState(fromHash());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      if (!mobile) return;
      if (location.hash.slice(1) !== t) history.pushState(history.state, '', `${location.pathname}${location.search}#${t}`);
      window.scrollTo(0, 0);
    },
    [mobile],
  );
  return [tab, setTab] as const;
}

export function GameController({ session, onExit }: Props) {
  const solo = session.mode === 'solo';
  const me = session.playerId;
  const mobile = useIsMobile();
  const { view, market: rawMarket, offset, error, act, busy } = useGameSource(session);
  // 서버가 보낸 '지금 칸까지의 장중 가격'을 오늘 막대에 합침 → 현재가·차트가 5초마다 움직임
  const market = useMemo(() => (rawMarket ? withLive(rawMarket, view?.live) : null), [rawMarket, view?.live]);

  const [viewDay, setViewDay] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [ui, setUiState] = useState<UiMode>(session.ui);
  const prefs = usePrefs();
  const [prefsOpen, setPrefsOpen] = useState(false);
  // 모든 금액 표시 단위 (초보 만원 · 일반 원 · 내 설정)
  applyMoneyUnit(prefs, ui);
  const [selected, setSelected] = useState(STOCKS[0].symbol);
  const [tab, setTab] = useMobileTab(mobile);
  const [filter, setFilter] = useState<BrowserFilter>({ region: 'all', sub: null });
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' | 'warn' } | null>(null);
  const [tutorial, setTutorial] = useState(() => session.ui === 'easy' && !tutorialSeen());
  const [fakeModal, setFakeModal] = useState(false);
  const [sheet, setSheet] = useState<null | 'buy' | 'sell'>(null);
  const [menu, setMenu] = useState(false);
  const [rankSheet, setRankSheet] = useState(false);
  const [marketSheet, setMarketSheet] = useState(false);
  const [schedSheet, setSchedSheet] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [pins, setPins] = useState<string[]>(loadPins);
  const togglePin = (k: string) =>
    setPins((p) => {
      const next = p.includes(k) ? p.filter((x) => x !== k) : [...p, k].slice(0, 3);
      savePins(next);
      return next;
    });
  const [targetPick, setTargetPick] = useState<ItemKind | null>(null);
  const [fakeTarget, setFakeTarget] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | 'assets' | 'cards'>(null);
  const [bubbles, setBubbles] = useState<(Reaction & { mine?: boolean })[]>([]);
  const [muted, setMutedState] = useState(isMuted());
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<number>();
  const searchRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const room = view?.room;
  const total = room?.totalDays ?? 1;
  const serverDay = room ? room.day : null;
  const finished = room?.status === 'finished';

  // ---------- 날짜 진행 / 하루 결산 ----------
  useEffect(() => {
    if (serverDay === null || !market) return;
    if (viewDay === null) {
      if (finished) {
        setViewDay(total - 1);
        setShowResult(true);
      } else setViewDay(serverDay);
      return;
    }
    if (closing === null && !showResult && serverDay > viewDay) {
      setClosing(viewDay);
      setSheet(null);
      play('close');
    }
  }, [serverDay, viewDay, closing, showResult, market, finished, total]);

  const day = viewDay ?? 0;
  const displayDay = closing ?? day;
  const displayClosed = closing !== null;
  const prices = useMemo(() => (market ? pricesAt(market, displayDay, displayClosed) : {}), [market, displayDay, displayClosed]);

  // ---------- 내 상태 ----------
  const myItemRows: ItemRow[] = view?.myItemRows ?? [];
  const spends = useMemo(() => spendsFromRows(myItemRows), [myItemRows]);
  const paidDivs = useMemo(() => (market?.dividends ?? []).filter((d) => d.perShare > 0), [market]);
  const portfolio = useMemo(() => computePortfolio(view?.myTrades ?? [], spends, Infinity, paidDivs), [view?.myTrades, spends, paidDivs]);
  const equity = market ? equityWith(portfolio, prices) : START_CASH;
  const myRet = equity / START_CASH - 1;
  const myOrders = view?.myOrders ?? [];
  const fxNow = market ? (market.macro[displayDay] ?? market.macro0).fx : 1;
  const reservedCash = myOrders
    .filter((o) => o.status === 'open' && o.day === day && o.side === 'buy')
    .reduce((a, o) => a + buyCost(o.qty, STOCK_MAP[o.symbol].currency === 'USD' ? Math.round(o.limit_price * fxNow) : o.limit_price, o.fee), 0);

  const players = view?.players ?? [];
  const opponent = players.find((p) => p.id !== me) ?? null;
  const meRow = players.find((p) => p.id === me);
  const endedToday = !solo && (meRow?.endedDay ?? -1) >= day;
  const effects = view?.effectsToday ?? [];
  const frozen = effects.includes('freeze');
  const feeRate = effects.includes('fee') ? FEE_BOMB_RATE : FEE_RATE;
  const canAct = !!view && room?.status === 'playing' && closing === null && viewDay === serverDay && !endedToday && !showResult;
  const deadline = room?.deadline ?? null;
  const remaining = deadline !== null ? Math.max(0, Math.ceil((deadline - (now + offset)) / 1000)) : null;

  const tradeState = {
    allowed: canAct && !frozen && remaining !== 0,
    reason: frozen
      ? '상대의 거래 정지 카드! 오늘은 사고팔 수 없어요'
      : closing !== null
        ? '장이 마감됐어요'
        : endedToday
          ? '장 마감을 눌렀어요. 더 거래하려면 마감을 취소하세요'
          : remaining === 0
            ? '시간이 다 됐어요. 곧 장이 마감돼요'
            : null,
    fee: feeRate,
    busy,
  };

  const news = market?.news ?? [];
  const newsSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const n of news.filter((x) => x.day === day)) n.related.forEach((s) => set.add(s));
    return set;
  }, [news, day]);
  const change = useCallback((sym: string) => (market ? quote(market, sym, displayDay, displayClosed).ch : 0), [market, displayDay, displayClosed]);

  // ---------- 알림 ----------
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!view) return;
    if (seen.current === null) {
      seen.current = new Set(view.notices.map((n) => n.key));
      return;
    }
    for (const n of view.notices) {
      if (seen.current.has(n.key)) continue;
      seen.current.add(n.key);
      showToast(n.text, n.kind === 'ok' ? 'ok' : 'warn');
      play(n.text.includes('방패') ? 'blocked' : 'attack');
    }
  }, [view, showToast]);

  // 장중 속보 알림 — 처음 화면을 열 때 이미 떠 있던 건 알리지 않음
  const seenBreaking = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!market) return;
    const breaking = market.news.filter((n) => n.at != null);
    const key = (n: { day: number; headline: string }) => n.day + ':' + n.headline;
    if (seenBreaking.current === null) {
      seenBreaking.current = new Set(breaking.map(key));
      return;
    }
    for (const n of breaking) {
      if (seenBreaking.current.has(key(n))) continue;
      seenBreaking.current.add(key(n));
      showToast(`속보 · ${n.headline.replace('[루머] ', '')}`, 'warn');
      play('news');
    }
  }, [market, showToast]);

  // 예약 주문 체결 알림
  const seenOrders = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!view) return;
    const cur = new Map(view.myOrders.map((o) => [o.id!, o.status]));
    if (seenOrders.current) {
      for (const o of view.myOrders) {
        const before = seenOrders.current.get(o.id!);
        if (before === 'open' && o.status === 'filled') showToast(`예약 체결! ${STOCK_MAP[o.symbol].name} ${num(o.qty)}주 ${o.side === 'buy' ? '샀어요' : '팔았어요'}`);
      }
    }
    seenOrders.current = cur;
  }, [view, showToast]);

  // ---------- 행동 ----------
  const run = async (action: string, payload: Record<string, unknown>, ok: () => void) => {
    try {
      await act(action, payload);
      ok();
    } catch (e) {
      play('error');
      showToast(e instanceof Error ? e.message : '실패했어요', 'err');
    }
  };

  const trade = (symbol: string, side: 'buy' | 'sell', qty: number) =>
    run('trade', { symbol, side, qty }, () => {
      play(side);
      setSheet(null);
      showToast(`${STOCK_MAP[symbol].name} ${qty.toLocaleString()}주 ${ui === 'easy' ? (side === 'buy' ? '샀어요' : '팔았어요') : side === 'buy' ? '매수 체결' : '매도 체결'}`);
    });
  const placeOrder = (symbol: string, side: 'buy' | 'sell', qty: number, limit: number) =>
    run('placeOrder', { symbol, side, qty, limit }, () => {
      play('tap');
      setSheet(null);
      showToast(`예약 완료 · 장중에 가격이 닿으면 체결돼요`);
    });
  const cancelOrder = (orderId: string) => run('cancelOrder', { orderId }, () => showToast('예약 주문을 취소했어요'));

  const buyItem = (kind: ItemKind) =>
    run('buyItem', { kind }, () => {
      play('item');
      showToast(`${ITEM_MAP[kind].name} 카드를 샀어요`);
    });
  const useCard = (kind: ItemKind, given?: ItemRow['payload']) => {
    let payload: NonNullable<ItemRow['payload']> = { ...(given ?? {}) };
    const needsTarget = !solo && (ITEM_MAP[kind].type === 'attack' || kind === 'spy');
    if (needsTarget && !payload.target) {
      const others = players.filter((p) => p.id !== me);
      if (others.length === 1) payload = { ...payload, target: others[0].id };
      else return setTargetPick(kind);
    }
    // 차트 분석은 지금 보고 있는 종목
    if (kind === 'scout' && !payload.symbol) payload = { ...payload, symbol: selected };
    if (kind === 'fake' && !payload.symbol) {
      setFakeTarget(payload.target ?? null);
      return setFakeModal(true);
    }
    run('useItem', { kind, payload }, () => {
      play('item');
      const d = ITEM_MAP[kind];
      showToast(
        kind === 'bonus'
          ? `용돈 봉투! 현금 ${wonShort(BONUS_AMOUNT)}이 들어왔어요`
          : d.type === 'info'
            ? `${d.name} 결과가 뉴스에 나왔어요`
            : `${d.name} 발동! 내일 상대에게 적용돼요`,
      );
      if (d.type === 'info') {
        setTab('news');
        setDrawer(null);
      }
    });
  };
  const endTurn = () => {
    if (!canAct) return;
    play('tap');
    run('endTurn', {}, () => {});
  };
  // 장 마감 취소: 다음 날로 넘어가기 전(시간이 남아 있을 때)이면 언제든
  const canCancelEnd = !solo && endedToday && room?.status === 'playing' && closing === null && viewDay === serverDay && remaining !== 0 && !showResult;
  const cancelEnd = () => {
    if (!canCancelEnd) return;
    play('tap');
    run('cancelEnd', {}, () => showToast('장 마감을 취소했어요. 다시 거래할 수 있어요'));
  };
  const nextDay = () => {
    if (serverDay === null) return;
    setClosing(null);
    if (finished || serverDay >= total) {
      setShowResult(true);
      return;
    }
    setViewDay(serverDay);
    play('news');
    // 혼자 연습: 다음 날 장은 이 버튼을 눌러야 열림 (결산 보는 동안 시간이 흐르지 않게)
    if (solo) act('startDay', {}).catch(() => {});
  };

  const pushBubble = (r: Reaction & { mine?: boolean }) => {
    setBubbles((b) => [...b.slice(-3), r]);
    setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== r.id)), 3500);
  };
  const sendReaction = useReactions(solo ? null : session.roomId, me, (r) => {
    play('react');
    pushBubble(r);
  });

  const toggleWatch = (sym: string) =>
    setWatch((w) => {
      const next = w.includes(sym) ? w.filter((x) => x !== sym) : [...w, sym];
      saveWatch(next);
      return next;
    });
  const selectStock = (sym: string) => {
    setSelected(sym);
    if (mobile) setTab('detail');
    else document.querySelector('.p-detail')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectSector = (sec: string) => {
    const region = SECTOR_MAP[sec]?.region ?? 'all';
    setFilter({ region: region === 'ETF' ? 'ETF' : region, sub: sec });
    if (mobile) setTab('list');
  };
  const setUi = (m: UiMode) => {
    setUiState(m);
    saveUi(m);
    if (!solo) api('mode', { roomId: session.roomId, mode: m }).catch(() => {});
  };

  // ---------- 모바일: 아래로 스크롤하면 상단을 접고, 위로 올리면 다시 펼침 ----------
  useEffect(() => {
    if (!mobile) return;
    let last = window.scrollY;
    let lockUntil = 0;
    let collapsed = false;
    const set = (v: boolean) => {
      if (v === collapsed) return;
      collapsed = v;
      setHeaderCollapsed(v);
      // 접히고 펴지면서 페이지 높이가 바뀌어 생기는 가짜 스크롤은 잠깐 무시
      lockUntil = Date.now() + 400;
    };
    const on = () => {
      const yy = window.scrollY;
      if (Date.now() < lockUntil) {
        last = yy;
        return;
      }
      if (yy < 40) set(false);
      else if (yy > last + 6) set(true);
      else if (yy < last - 30) set(false);
      if (Math.abs(yy - last) > 6 || yy < 40) last = yy;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [mobile]);

  // ---------- PC 단축키 ----------
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.querySelector('input')?.focus();
      }
      if (typing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const rows = [...document.querySelectorAll<HTMLElement>('.stock-list .srow')];
        const i = rows.findIndex((r) => r.classList.contains('sel'));
        const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (next) {
          e.preventDefault();
          next.click();
          next.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile]);

  // ---------- 화면 ----------
  if (!view || !market || viewDay === null) {
    return (
      <div className="center-msg">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="btn" onClick={onExit}>
              로비로
            </button>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="muted">게임 불러오는 중…</p>
          </>
        )}
      </div>
    );
  }
  if (showResult) {
    if (!view.final)
      return (
        <div className="center-msg">
          <div className="spinner" />
          <p className="muted">결과 집계 중…</p>
        </div>
      );
    return <ResultScreen session={session} market={market} final={view.final} onExit={onExit} />;
  }

  const m: Market = market;
  const macro = m.macro[displayDay] ?? m.macro0;
  const prevMacro = displayDay > 0 ? m.macro[displayDay - 1] : m.macro0;
  const idx = m.index[displayDay];
  const idxNow = barNow(m, idx, displayDay, displayClosed);
  const idxPrev = displayDay === 0 ? KR_INDEX_BASE : m.index[displayDay - 1].close;
  const us = m.usIndex[displayDay];
  const usNow = barNow(m, us, displayDay, displayClosed);
  const usPrev = displayDay === 0 ? US_INDEX_BASE : m.usIndex[displayDay - 1].close;
  const oppRet = opponent ? opponent.equity / START_CASH - 1 : 0;
  const share = opponent ? equity / (equity + opponent.equity) : 0.5;
  const oppEnded = opponent ? opponent.endedDay >= day : false;
  const easy = ui === 'easy';
  const usedToday = new Set(myItemRows.filter((r) => r.action === 'use' && r.day === day).map((r) => r.kind));
  const effectsOnMe = effects.map((k) => (k === 'freeze' ? '오늘은 상대의 거래 정지 카드 때문에 거래할 수 없어요' : k === 'fee' ? '수수료 폭탄! 오늘은 수수료가 1%예요' : k === 'blackout' ? '📵 정보 차단 카드 때문에 오늘 아침 뉴스를 볼 수 없어요' : '')).filter(Boolean);
  const ev = nextEvent(m, day);
  const timerText = remaining !== null && closing === null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : null;
  const endLabel = endedToday ? '마감 취소' : day + 1 >= total ? '마지막 장 마감' : '장 마감';

  const macroChip = (label: string, k: 'rate' | 'usRate' | 'fx' | 'oil', fmt: (v: number) => string, term = label) => {
    const d = macro[k] - prevMacro[k];
    return (
      <span className="mchip" key={k}>
        <Term k={term}>{label}</Term>
        <b>{fmt(macro[k])}</b>
        {Math.abs(d) > 1e-9 && <i className={tone(d)}>{d > 0 ? '▲' : '▼'}</i>}
      </span>
    );
  };
  const macroChips = (
    <>
      <span className="mchip idx">
        <Term k="지수">국내</Term>
        <b>{idxNow.toFixed(2)}</b>
        <i className={tone(idxNow / idxPrev - 1)}>{pct(idxNow / idxPrev - 1)}</i>
      </span>
      <span className="mchip idx">
        미국500
        <b>{usNow.toFixed(2)}</b>
        <i className={tone(usNow / usPrev - 1)}>{pct(usNow / usPrev - 1)}</i>
      </span>
      {macroChip('금리', 'rate', (v) => v.toFixed(2) + '%')}
      {macroChip('미 금리', 'usRate', (v) => v.toFixed(2) + '%', '금리')}
      {macroChip('환율', 'fx', (v) => v.toLocaleString() + '원')}
      {macroChip('유가', 'oil', (v) => '$' + v.toFixed(1))}
    </>
  );

  // 공통 조각
  const browser = (
    <div ref={searchRef} className="browser-wrap">
      <StockBrowser
        market={m}
        day={displayDay}
        closed={displayClosed}
        portfolio={portfolio}
        watch={watch}
        onToggleWatch={toggleWatch}
        selected={selected}
        onSelect={selectStock}
        newsSymbols={newsSymbols}
        filter={filter}
        onFilter={setFilter}
      />
    </div>
  );
  const detail = (
    <StockDetail
      ui={ui}
      market={m}
      symbol={selected}
      day={displayDay}
      closed={displayClosed}
      cash={portfolio.cash}
      holding={portfolio.holdings[selected]}
      news={news}
      watched={watch.includes(selected)}
      onToggleWatch={() => toggleWatch(selected)}
      onSelect={selectStock}
      onSelectSector={selectSector}
      trade={tradeState}
      onTrade={trade}
      orders={myOrders}
      reservedCash={reservedCash}
      onOrder={placeOrder}
      onCancel={cancelOrder}
      inlineTrade={!mobile}
    />
  );
  const newsPanel = (
    <NewsPanel
      ui={ui}
      day={day}
      news={news}
      tomorrow={view.reveals.tomorrow}
      rumorCheck={view.reveals.rumorCheck}
      bestSector={view.reveals.bestSector}
      spy={view.reveals.spy}
      scout={view.reveals.scout}
      blackout={view.reveals.blackout}
      prices={prices}
      change={change}
      onSelect={selectStock}
      onSelectSector={selectSector}
    />
  );
  const assets = (
    <>
      <AssetsPanel ui={ui} portfolio={portfolio} prices={prices} equity={equity} onSelect={selectStock} />
      <OrdersAndDividends orders={myOrders} day={day} portfolio={portfolio} canAct={canAct} onCancel={cancelOrder} onSelect={selectStock} />
    </>
  );
  const cards = (
    <CardsPanel
      solo={solo}
      day={day}
      totalDays={total}
      mine={view.myItems}
      cash={portfolio.cash}
      usedToday={usedToday}
      canAct={canAct}
      onBuy={buyItem}
      onUse={(k) => useCard(k)}
      effectsOnMe={effectsOnMe}
      busy={busy}
    />
  );
  const overlays = (
    <>
      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}
      {closing !== null && (
        <DayCloseOverlay
          market={m}
          day={closing}
          myEquity={equity}
          myDelta={equity - (closing === 0 ? START_CASH : equityWith(computePortfolio(view.myTrades, spends, closing - 1, paidDivs), pricesAt(m, closing - 1, true)))}
          dividendToday={portfolio.dividendLog.filter((d) => d.day === closing).reduce((a, d) => a + d.amount, 0)}
          filledToday={myOrders.filter((o) => o.day === closing && o.status === 'filled').length}
          last={closing + 1 >= total}
          onNext={nextDay}
        />
      )}
      {targetPick && (
        <TargetPicker
          kind={targetPick}
          rows={rankRows(players, me, equity, day)}
          onCancel={() => setTargetPick(null)}
          onPick={(id) => {
            const k = targetPick;
            setTargetPick(null);
            useCard(k, { target: id });
          }}
        />
      )}
      {fakeModal && (
        <FakeNewsModal
          onCancel={() => setFakeModal(false)}
          onSubmit={(symbol, t) => {
            setFakeModal(false);
            useCard('fake', { symbol, tone: t, target: fakeTarget ?? undefined });
          }}
        />
      )}
      {tutorial && (
        <Tutorial
          onDone={() => {
            markTutorialSeen();
            setTutorial(false);
          }}
        />
      )}
      {!solo && (
        <>
          <ReactionButton
            onSend={(r) => {
              sendReaction(r);
              pushBubble({ ...r, id: Date.now(), from: me, mine: true });
            }}
          />
          <ReactionBubbles items={bubbles.map((b) => ({ ...b, nickname: players.find((p) => p.id === b.from)?.nickname ?? '' }))} />
        </>
      )}
    </>
  );
  const settings = (
    <>
      <div className="mode-toggle" role="group" aria-label="화면 모드">
        <button className={!prefs.enabled && easy ? 'on' : ''} onClick={() => (setPrefs({ enabled: false }), setUi('easy'))}>
          초보
        </button>
        <button className={!prefs.enabled && !easy ? 'on' : ''} onClick={() => (setPrefs({ enabled: false }), setUi('pro'))}>
          일반
        </button>
        <button className={prefs.enabled ? 'on' : ''} onClick={() => setPrefs({ enabled: true })} title="내가 설정한 화면">
          커스텀
        </button>
      </div>
      <button className="icon-btn" onClick={() => setTutorial(true)} aria-label="도움말" title="도움말">
        <Icon name="help" size={18} />
      </button>
      <button className={'icon-btn' + (isCustom(prefs) ? ' on' : '')} onClick={() => setPrefsOpen(true)} aria-label="내 화면 설정" title="내 화면 설정">
        <Icon name="sliders" size={18} />
      </button>
      <button
        className="icon-btn"
        onClick={() => {
          setMuted(!muted);
          setMutedState(!muted);
        }}
        aria-label="소리"
        title="소리"
      >
        <Icon name={muted ? 'mute' : 'sound'} size={18} />
      </button>
      <button className="icon-btn" onClick={onExit} aria-label="로비로" title="로비로">
        <Icon name="exit" size={18} />
      </button>
    </>
  );

  const prevCloseEquity =
    displayDay === 0 ? START_CASH : equityWith(computePortfolio(view.myTrades, spends, displayDay - 1, paidDivs), pricesAt(m, displayDay - 1, true));
  const todayPnl = equity - prevCloseEquity;
  const rows = rankRows(players, me, equity, day);
  const myRank = rows.findIndex((r) => r.me) + 1;
  const openOrderCount = myOrders.filter((o) => o.status === 'open' && o.day === day).length;

  /* ================= 모바일 ================= */
  if (mobile) {
    const q = quote(m, selected, displayDay, displayClosed);
    const held = portfolio.holdings[selected]?.qty ?? 0;
    return (
      <div className={'m-game ui-' + ui}>
        {/* 차트 탭은 화면을 차트에 양보하려고 위쪽 시장·일정·재산 줄을 접어 둠 */}
        <header className={'m-top' + (headerCollapsed || tab === 'detail' ? ' collapsed' : '')}>
          {/* ② 내 재산 · 비교 · 장 마감 (+ 아래 얇은 진행 막대) */}
          <div className="m-hero">
            <div className="mh-left">
              <b className="mh-eq">
                {wonShort(equity)} <em className={tone(myRet)}>{pct(myRet, 1)}</em>
              </b>
              {solo ? (
                <span className={'mh-cmp ' + tone(myRet - (idxNow / KR_INDEX_BASE - 1))}>
                  시장보다 {pct(myRet - (idxNow / KR_INDEX_BASE - 1), 1)}
                </span>
              ) : players.length > 2 ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <strong>
                    {myRank}위
                  </strong>
                  <span className="muted">/ {rows.length}명</span>
                  <span className={myRank === 1 ? 'up' : 'down'}>
                    · {myRank === 1 ? `2위와 +${wonShort(rows[0].equity - (rows[1]?.equity ?? rows[0].equity))}` : `1위와 −${wonShort(rows[0].equity - equity)}`}
                  </span>
                  <i>›</i>
                </button>
              ) : opponent ? (
                <button className="mh-cmp btnlike" onClick={() => setRankSheet(true)}>
                  <span className={tone(equity - opponent.equity)}>
                    {opponent.nickname}보다 {equity >= opponent.equity ? '+' : '−'}
                    {wonShort(Math.abs(equity - opponent.equity))}
                  </span>
                  <span className={'mh-st' + (oppEnded ? ' ok' : '')}>{oppEnded ? <><Icon name="check" size={12} /> 마감</> : '고민 중'}</span>
                </button>
              ) : (
                <span className="mh-cmp muted">상대를 기다리는 중</span>
              )}
            </div>
            <button
              className={'m-end2' + (endedToday ? ' waiting' : '') + (remaining !== null && remaining <= 10 && !endedToday ? ' hurry' : '')}
              disabled={endedToday ? !canCancelEnd || busy : !canAct || busy}
              onClick={endedToday ? cancelEnd : endTurn}
            >
              <b>{endedToday ? '마감 취소' : day + 1 >= total ? '마지막 마감' : '장 마감'}</b>
              <small>
                {endedToday
                  ? `마감 ${rows.filter((r) => r.ended).length}/${rows.length}${timerText ? ' · ' + timerText : ''}`
                  : `${day + 1}일차${timerText ? ' · ' + timerText : ''}`}
              </small>
            </button>
          </div>
          {!solo && room?.status === 'playing' && closing === null && <EndStatus rows={rows} countdown={!!room.countdown} compact />}
          <div className="m-progress-row" aria-label={`${total}일 중 ${day + 1}일차`}>
            <span className="mp-now">
              <b>{day + 1}일차</b>
              <small> / {total}일</small>
            </span>
            <div className="m-progress">
              <i style={{ width: `${((day + (displayClosed ? 1 : 0.5)) / total) * 100}%` }} />
            </div>
            <span className="mp-left">{total - day - 1 > 0 ? `${total - day - 1}일 남음` : '마지막 날'}</span>
          </div>
          <div className="m-top-more">
          {/* ① 오늘 시장: 그룹별로 돌아가며, 고정한 건 그대로 */}
          <div className="m-row">
            <MarketTicker market={m} day={displayDay} closed={displayClosed} pins={pins} onOpen={() => setMarketSheet(true)} />
            <button className="m-menu" onClick={() => setMenu(true)} aria-label="설정">
              <span><Icon name="settings" size={18} /></span>
              <small>설정</small>
            </button>
          </div>
          {/* ③ 일정 전용 영역 */}
          <ScheduleStrip market={m} day={day} onOpen={() => setSchedSheet(true)} />
          {/* ④ 내 재산 */}
          <button className="m-asum" onClick={() => setTab('assets')} aria-label="내 재산 보기">
            <span>
              <small>현금</small>
              <b>{wonShort(portfolio.cash)}</b>
            </span>
            <span>
              <small>주식</small>
              <b>{wonShort(equity - portfolio.cash)}</b>
            </span>
            <span>
              <small>오늘</small>
              <b className={tone(todayPnl)}>
                {todayPnl >= 0 ? '+' : ''}
                {wonShort(todayPnl)}
              </b>
            </span>
            {portfolio.dividendIncome > 0 && (
              <span>
                <small>배당</small>
                <b className="up">+{wonShort(portfolio.dividendIncome)}</b>
              </span>
            )}
            {openOrderCount > 0 && (
              <span>
                <small>예약</small>
                <b>{openOrderCount}건</b>
              </span>
            )}
            <i>›</i>
          </button>
          </div>
        </header>

        <main className={'m-page p-' + tab}>
          {tab === 'list' && browser}
          {tab === 'detail' && detail}
          {tab === 'news' && (
            <>
              {effectsOnMe.map((t, i) => (
                <div key={i} className="effect-banner">
                  {t}
                </div>
              ))}
              {newsPanel}
              <CardTray mine={view.myItems} day={day} totalDays={total} usedToday={usedToday} canAct={canAct} busy={busy} onUse={(k) => useCard(k)} onOpen={() => setTab('cards')} />
            </>
          )}
          {tab === 'assets' && (
            <>
              {assets}
            </>
          )}
          {tab === 'cards' && cards}
        </main>

        {tab === 'detail' && (
          <div className="m-tradebar">
            <div className="mt-price">
              <b className={tone(q.ch)}>{q.usd !== null ? '$' + q.usd.toFixed(2) : num(q.krw) + '원'}</b>
              <small className={tone(q.ch)}>{pct(q.ch)}</small>
            </div>
            <button className="btn sell" disabled={!tradeState.allowed || held === 0} onClick={() => setSheet('sell')}>
              {easy ? '팔기' : '매도'}
            </button>
            <button className="btn buy" disabled={!tradeState.allowed} onClick={() => setSheet('buy')}>
              {easy ? '사기' : '매수'}
            </button>
          </div>
        )}

        <nav className="bottom-nav five">
          {(
            [
              ['list', 'list', '종목'],
              ['detail', 'chart', '차트'],
              ['news', 'news', '뉴스'],
              ['assets', 'wallet', easy ? '내 재산' : '자산'],
              ['cards', 'cards', '카드'],
            ] as [Tab, IconName, string][]
          ).map(([t, i, l]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              <span>
                <Icon name={i} size={22} />
              </span>
              {l}
              {t === 'news' && newsSymbols.size > 0 && tab !== 'news' && <i className="nav-dot" />}
              {t === 'cards' && view.myItems.total > 0 && <i className="nav-count">{view.myItems.total}</i>}
              {t === 'assets' && myOrders.some((o) => o.status === 'open' && o.day === day) && <i className="nav-dot gold" />}
            </button>
          ))}
        </nav>

        <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} title={`${STOCK_MAP[selected].name} ${sheet === 'sell' ? (easy ? '팔기' : '매도') : easy ? '사기' : '매수'}`}>
          {sheet && (
            <TradePanel
              key={selected + sheet}
              ui={ui}
              symbol={selected}
              price={q.krw}
              usd={q.usd}
              fx={fxNow}
              cash={portfolio.cash}
              held={held}
              avgCost={portfolio.holdings[selected]?.avgCost ?? 0}
              trade={tradeState}
              onTrade={trade}
              orders={myOrders.filter((o) => o.symbol === selected && o.day === day)}
              reservedCash={reservedCash}
              onOrder={placeOrder}
              onCancel={cancelOrder}
              initialSide={sheet}
            />
          )}
        </BottomSheet>

        <BottomSheet open={marketSheet} onClose={() => setMarketSheet(false)} title="오늘의 시장">
          <MarketGridPinnable market={m} day={displayDay} closed={displayClosed} pins={pins} onTogglePin={togglePin} />
          <p className="muted small sheet-note">핀을 누르면 상단에 계속 고정돼요 (최대 3개). 고정하지 않은 칸은 지수 → 지수, 금리 → 금리처럼 같은 종류끼리 4초마다 바뀌어요.</p>
        </BottomSheet>

        <BottomSheet open={schedSheet} onClose={() => setSchedSheet(false)} title="다가오는 일정">
          <Calendar market={m} day={day} hideTitle onSelect={(sym) => (setSchedSheet(false), selectStock(sym))} />
        </BottomSheet>

        <BottomSheet open={rankSheet} onClose={() => setRankSheet(false)} title="실시간 순위">
          <RankList rows={rows} />
        </BottomSheet>

        <BottomSheet open={menu} onClose={() => setMenu(false)} title="설정">
          <div className="m-settings">
            <div className="row">{settings}</div>
          </div>
        </BottomSheet>

        {overlays}
        {prefsOpen && (
          <Sheet title="커스텀 모드 설정" onClose={() => setPrefsOpen(false)}>
            <PrefsPanel ui={ui} />
            {!prefs.enabled && (
              <button className="btn primary full" onClick={() => (setPrefs({ enabled: true }), setPrefsOpen(false))}>
                커스텀 모드로 쓰기
              </button>
            )}
          </Sheet>
        )}
      </div>
    );
  }

  /* ================= PC ================= */
  return (
    <div className={'game desk ui-' + ui}>
      <header className="hud">
        <div className="hud-left">
          <div className="brand-sm">주식 대결</div>
          <div className="daypill">
            <b>{day + 1}일차</b>
            <span>/ {total}</span>
          </div>
          {timerText && <div className={'timer' + (remaining! <= 10 ? ' hurry' : '')}><Icon name="timer" size={14} /> {timerText}</div>}
        </div>
        <div className="hud-macro">{macroChips}</div>
        <div className="hud-right">{settings}</div>
      </header>

      <section className="score desk-score">
        {!solo && players.length > 2 ? (
          <RankStrip rows={rows} />
        ) : (
        <div className="vs-box">
          <div className="score-me">
            <small>{session.nickname} (나)</small>
            <b>{wonShort(equity)}</b>
            <span className={tone(myRet)}>{pct(myRet)}</span>
          </div>
          {!solo ? (
            <>
              <div className="tug" aria-hidden>
                <div className="tug-me" style={{ width: `${share * 100}%` }} />
                <div className="tug-mid" />
              </div>
              <div className="score-opp">
                <small>
                  {opponent?.nickname ?? '상대'} {opponent && <em className={oppEnded ? 'ok' : ''}>{oppEnded ? <><Icon name="check" size={12} /> 마감</> : '고민 중…'}</em>}
                </small>
                <b>{opponent ? wonShort(opponent.equity) : '-'}</b>
                <span className={tone(oppRet)}>{opponent ? pct(oppRet) : ''}</span>
              </div>
            </>
          ) : (
            <div className="score-solo muted">연습 모드</div>
          )}
        </div>
        )}
        {!solo && room?.status === 'playing' && closing === null && <EndStatus rows={rows} countdown={!!room.countdown} />}
        <AssetSummary
          ui={ui}
          cash={portfolio.cash}
          stock={equity - portfolio.cash}
          todayPnl={todayPnl}
          todayBase={prevCloseEquity}
          dividends={portfolio.dividendIncome}
          openOrders={openOrderCount}
          onOpen={() => setDrawer('assets')}
        />
        <button className={'btn end-turn' + (endedToday ? ' waiting' : '')} disabled={endedToday ? !canCancelEnd || busy : !canAct || busy} onClick={endedToday ? cancelEnd : endTurn}>
          {endLabel}
          {easy && !endedToday && <small>다 정했으면 눌러요</small>}
          {endedToday && <small>다른 사람 기다리는 중 · 넘어가기 전까지 취소 가능</small>}
        </button>
      </section>

      <Timeline market={m} day={day} onSelect={selectStock} />

      <main className="board">
        <section className="pane p-list">{browser}</section>
        <section className="pane p-detail">{detail}</section>
        <section className="pane p-news">
          <div className="news-scroll">
            {effectsOnMe.map((t, i) => (
              <div key={i} className="effect-banner">
                {t}
              </div>
            ))}
            {newsPanel}
          </div>
          <CardTray mine={view.myItems} day={day} totalDays={total} usedToday={usedToday} canAct={canAct} busy={busy} onUse={(k) => useCard(k)} onOpen={() => setDrawer('cards')} />
        </section>
      </main>
      <div className="kbd-hint muted">
        <kbd>/</kbd> 검색 · <kbd>↑</kbd>
        <kbd>↓</kbd> 종목 이동 · <kbd>Enter</kbd> 주문 · <kbd>Esc</kbd> 닫기
      </div>

      <Drawer open={drawer === 'assets'} title={easy ? '내 재산' : '자산'} onClose={() => setDrawer(null)}>
        {assets}
      </Drawer>
      <Drawer open={drawer === 'cards'} title="🃏 찬스 카드 · 상점" onClose={() => setDrawer(null)}>
        {cards}
      </Drawer>
      {overlays}
    </div>
  );
}

export type { View };
