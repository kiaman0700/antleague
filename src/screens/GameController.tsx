import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssetsPanel, CardsPanel, DayCloseOverlay, FakeNewsModal, NewsPanel, SpyModal, Tutorial, type ShownNews } from '../components/Panels';
import { ReactionBubbles, ReactionButton } from '../components/Reactions';
import { StockBrowser } from '../components/StockBrowser';
import { StockDetail } from '../components/StockDetail';
import { Term } from '../components/Term';
import { activeEffects, canBuy, canUse, deriveItems, FEE_BOMB_RATE, ITEM_MAP, type ItemKind, type ItemRow, type PlayerItems } from '../game/items';
import { generateMarket, newsFor, pricesAt } from '../game/market';
import { COMPANY_BAD, COMPANY_GOOD } from '../game/news';
import { buyCost, computePortfolio, equityWith, FEE_RATE, START_CASH, type PortfolioState, type Trade } from '../game/portfolio';
import { SECTORS, STOCK_MAP, STOCKS } from '../game/stocks';
import { pct, tone, wonShort } from '../lib/format';
import { isMuted, play, setMuted } from '../lib/sound';
import { advanceDay, fetchTrades, insertItem, insertTrade, updateMyStats, updatePlayer, useReactions, useRoomLive, type Reaction } from '../net/room';
import { loadSolo, loadWatch, markTutorialSeen, saveMulti, saveSolo, saveUi, saveWatch, tutorialSeen, type Session, type UiMode } from '../session';
import { ResultScreen } from './ResultScreen';

interface Props {
  session: Session;
  offset: number;
  onExit: () => void;
}

type Tab = 'list' | 'detail' | 'news' | 'assets' | 'cards';
const EMPTY_ITEMS: PlayerItems = { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 };

function mergeById(a: ItemRow[], b: ItemRow[]) {
  const ids = new Set(a.map((x) => x.id));
  return [...a, ...b.filter((x) => !ids.has(x.id))];
}

function fakeHeadline(symbol: string, t: 'good' | 'bad', salt: number) {
  const pool = t === 'good' ? COMPANY_GOOD : COMPANY_BAD;
  return pool[salt % pool.length].replace('{name}', STOCK_MAP[symbol].name);
}

export function GameController({ session, offset, onExit }: Props) {
  const solo = session.mode === 'solo';
  const me = session.playerId;
  const total = session.totalDays;
  const market = useMemo(() => generateMarket(session.seed, total), [session.seed, total]);
  const live = useRoomLive(solo ? null : session.roomId);

  // 연습 모드: 저장된 진행 상황이 같은 게임이면 이어서
  const [restored] = useState(() => {
    const s = solo ? loadSolo() : null;
    return s && s.session.seed === session.seed ? s : null;
  });
  const [soloDay, setSoloDay] = useState(restored?.day ?? 0);
  const [soloItems, setSoloItems] = useState<ItemRow[]>(restored?.items ?? []);
  const [pending, setPending] = useState<ItemRow[]>([]);
  const [trades, setTrades] = useState<Trade[]>(restored?.trades ?? []);
  const [viewDay, setViewDay] = useState<number | null>(null);
  useEffect(() => {
    if (solo) saveSolo({ session, day: soloDay, trades, items: soloItems });
  }, [solo, session, soloDay, trades, soloItems]);
  const [closing, setClosing] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [localEnded, setLocalEnded] = useState(-1);
  const [ui, setUiState] = useState<UiMode>(session.ui);
  const [selected, setSelected] = useState(STOCKS[0].symbol);
  const [tab, setTab] = useState<Tab>('news');
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' | 'warn' } | null>(null);
  const [tutorial, setTutorial] = useState(() => session.ui === 'easy' && !tutorialSeen());
  const [fakeModal, setFakeModal] = useState(false);
  const [spy, setSpy] = useState<{ open: boolean; pf: PortfolioState | null }>({ open: false, pf: null });
  const [bubbles, setBubbles] = useState<(Reaction & { mine?: boolean })[]>([]);
  const [muted, setMutedState] = useState(isMuted());
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<number>();
  const browserJump = useRef<(sector: string) => void>();

  const room = live.room;
  const serverDay = solo ? soloDay : room ? room.day : null;

  // ---------- 진행 상태 ----------
  useEffect(() => {
    if (viewDay !== null || serverDay === null) return;
    if (serverDay >= total) {
      setViewDay(total - 1);
      setShowResult(true);
    } else setViewDay(serverDay);
  }, [serverDay, viewDay, total]);

  useEffect(() => {
    if (serverDay === null || viewDay === null || closing !== null || showResult) return;
    if (serverDay > viewDay) {
      setClosing(viewDay);
      play('close');
    }
  }, [serverDay, viewDay, closing, showResult]);

  // 이어하기: 내 거래 불러오기
  useEffect(() => {
    if (solo || !session.roomId) return;
    fetchTrades(session.roomId, me)
      .then(setTrades)
      .catch(() => {});
  }, [solo, session.roomId, me]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const showToast = useCallback((text: string, kind: 'ok' | 'err' | 'warn' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const day = viewDay ?? 0;
  const displayDay = closing ?? day;
  const displayClosed = closing !== null;
  const prices = useMemo(() => pricesAt(market, displayDay, displayClosed), [market, displayDay, displayClosed]);

  // ---------- 아이템 ----------
  const allRows = useMemo(() => (solo ? soloItems : mergeById(live.items, pending)), [solo, soloItems, live.items, pending]);
  const myRows = useMemo(() => allRows.filter((r) => r.player_id === me), [allRows, me]);
  const playerIds = useMemo(() => {
    if (solo) return [me];
    const ids = live.players.map((p) => p.id);
    return ids.includes(me) ? ids : [...ids, me];
  }, [solo, live.players, me]);
  const itemState = useMemo(() => deriveItems(session.seed, playerIds, allRows, day, total, solo), [session.seed, playerIds, allRows, day, total, solo]);
  const mine = itemState.players[me] ?? EMPTY_ITEMS;
  const spends = useMemo(() => myRows.filter((r) => r.action === 'buy').map((r) => ({ day: r.day, cost: r.cost })), [myRows]);

  // ---------- 포트폴리오 ----------
  const portfolio = useMemo(() => computePortfolio(trades, spends), [trades, spends]);
  const equity = equityWith(portfolio, prices);
  const myRet = equity / START_CASH - 1;

  const meRow = live.players.find((p) => p.id === me);
  const opponent = live.players.find((p) => p.id !== me) ?? null;
  const endedToday = !solo && ((meRow?.ended_day ?? -1) >= day || localEnded >= day);

  const effectsToday = activeEffects(itemState, me, day);
  const frozen = effectsToday.some((e) => e.kind === 'freeze');
  const feeRate = effectsToday.some((e) => e.kind === 'fee') ? FEE_BOMB_RATE : FEE_RATE;
  const canAct = viewDay !== null && closing === null && viewDay === serverDay && !endedToday && !showResult;

  const tradeState = {
    allowed: canAct && !frozen,
    reason: frozen
      ? '🧊 상대의 거래 정지 카드! 오늘은 사고팔 수 없어요'
      : closing !== null
        ? '장이 마감됐어요'
        : endedToday
          ? '오늘은 장 마감을 눌렀어요. 상대를 기다리는 중…'
          : null,
    fee: feeRate,
  };

  // 뉴스 (+ 나에게만 보이는 가짜 뉴스)
  const shownNews: ShownNews[] = useMemo(() => {
    const real: ShownNews[] = market.news.filter((n) => n.day <= day);
    const fakes: ShownNews[] = itemState.effects
      .filter((e) => e.to === me && !e.blocked && e.kind === 'fake' && e.days[0] <= day && e.payload?.symbol)
      .map((e, i) => {
        const sym = e.payload!.symbol!;
        const t = e.payload!.tone ?? 'good';
        return { day: e.days[0], kind: 'company', symbol: sym, sector: STOCK_MAP[sym].sector, headline: fakeHeadline(sym, t, e.usedDay + i), rumor: false, tone: t, realTone: t, fake: true };
      });
    return [...real, ...fakes];
  }, [market, day, itemState.effects, me]);

  const todayInfo = mine.infoUses.filter((u) => u.day === day).map((u) => u.kind);
  const tomorrow = todayInfo.includes('paper') && day + 1 < total ? newsFor(market, day + 1) : null;
  const bestSector = useMemo(() => {
    if (!todayInfo.includes('analyst')) return null;
    let best = SECTORS[0].id;
    let bestR = -Infinity;
    for (const sec of SECTORS) {
      const ss = STOCKS.filter((s) => s.sector === sec.id);
      const r = ss.reduce((a, s) => a + market.bars[s.symbol][day].close / market.bars[s.symbol][day].open - 1, 0) / ss.length;
      if (r > bestR) {
        bestR = r;
        best = sec.id;
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayInfo.join(), market, day]);

  const newsSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const n of shownNews.filter((x) => x.day === day)) {
      if (n.symbol) set.add(n.symbol);
      if (n.sector && !n.symbol) STOCKS.filter((s) => s.sector === n.sector).forEach((s) => set.add(s.symbol));
    }
    return set;
  }, [shownNews, day]);

  // ---------- 상대 방해 알림 ----------
  const seenEffects = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = itemState.effects.map((e, i) => `${e.from}-${e.kind}-${e.usedDay}-${i}`);
    if (seenEffects.current === null) {
      if (solo || live.players.length === 0) return;
      seenEffects.current = new Set(keys);
      return;
    }
    itemState.effects.forEach((e, i) => {
      const k = keys[i];
      if (seenEffects.current!.has(k)) return;
      seenEffects.current!.add(k);
      const name = `${ITEM_MAP[e.kind].emoji} ${ITEM_MAP[e.kind].name}`;
      if (e.to === me) {
        if (e.blocked) {
          showToast(`🛡️ 방패가 상대의 ${name}을(를) 막았어요!`, 'ok');
          play('blocked');
        } else if (e.kind !== 'fake') {
          showToast(`⚠️ 상대가 ${name} 카드를 썼어요! 내일부터 적용`, 'warn');
          play('attack');
        }
      } else if (e.from === me && e.blocked) {
        showToast(`상대의 🛡️ 방패에 ${name}이(가) 막혔어요`, 'warn');
        play('blocked');
      }
    });
  }, [itemState.effects, me, solo, live.players.length, showToast]);

  const effectsOnMe = effectsToday.map((e) =>
    e.kind === 'freeze' ? '🧊 오늘은 상대의 거래 정지 카드 때문에 거래할 수 없어요' : e.kind === 'fee' ? '💸 수수료 폭탄! 오늘은 수수료가 1%예요' : '',
  ).filter(Boolean);

  // ---------- 다음 날 진행 (멀티) ----------
  const lastAdvance = useRef('');
  useEffect(() => {
    if (solo || !room || room.status !== 'playing') return;
    const d = room.day;
    const allEnded = live.players.length > 0 && live.players.every((p) => p.ended_day >= d);
    const timeUp = room.turn_deadline ? now + offset >= new Date(room.turn_deadline).getTime() : false;
    const key = `${d}-${Math.floor(now / 2000)}`;
    if ((allEnded || timeUp) && lastAdvance.current !== key) {
      lastAdvance.current = key;
      advanceDay(room.id, d).catch(() => {});
    }
  }, [solo, room, live.players, now, offset]);

  const remaining = room?.turn_deadline && !solo ? Math.max(0, Math.ceil((new Date(room.turn_deadline).getTime() - (now + offset)) / 1000)) : null;

  // ---------- 내 상태 공유 ----------
  useEffect(() => {
    if (solo || viewDay === null) return;
    updateMyStats(me, portfolio.cash, equity, trades.length).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.length, spends.length, displayDay, displayClosed]);

  // ---------- 행동 ----------
  const trade = (symbol: string, side: 'buy' | 'sell', qty: number) => {
    if (!tradeState.allowed) return showToast(tradeState.reason ?? '지금은 거래할 수 없어요', 'err');
    const price = prices[symbol];
    if (side === 'buy' && buyCost(qty, price, feeRate) > portfolio.cash) return showToast('현금이 부족해요', 'err');
    if (side === 'sell' && (portfolio.holdings[symbol]?.qty ?? 0) < qty) return showToast('가진 수량이 부족해요', 'err');
    const t: Trade = { id: crypto.randomUUID(), player_id: me, day, symbol, side, qty, price, fee: feeRate, created_at: new Date().toISOString() };
    setTrades((prev) => [...prev, t]);
    play(side);
    const verb = ui === 'easy' ? (side === 'buy' ? '샀어요' : '팔았어요') : side === 'buy' ? '매수 체결' : '매도 체결';
    showToast(`${STOCK_MAP[symbol].name} ${qty.toLocaleString()}주 ${verb}`);
    if (!solo && session.roomId) {
      insertTrade(session.roomId, t).catch(() => {
        setTrades((prev) => prev.filter((x) => x.id !== t.id));
        showToast('네트워크 오류로 거래가 취소됐어요', 'err');
      });
    }
  };

  const addItemRow = (row: ItemRow) => {
    if (solo) return setSoloItems((p) => [...p, row]);
    setPending((p) => [...p, row]);
    insertItem(session.roomId!, row).catch(() => {
      setPending((p) => p.filter((x) => x.id !== row.id));
      showToast('네트워크 오류로 카드 사용이 취소됐어요', 'err');
    });
  };

  const buyItem = (kind: ItemKind) => {
    const why = canBuy(mine, kind, portfolio.cash);
    if (why || !canAct) return showToast(why ?? '지금은 살 수 없어요', 'err');
    addItemRow({ id: crypto.randomUUID(), player_id: me, day, kind, action: 'buy', cost: ITEM_MAP[kind].cost, created_at: new Date().toISOString() });
    play('item');
    showToast(`${ITEM_MAP[kind].emoji} ${ITEM_MAP[kind].name} 카드를 샀어요`);
  };

  const usedToday = new Set(myRows.filter((r) => r.action === 'use' && r.day === day).map((r) => r.kind));

  const applyItem = (kind: ItemKind, payload?: ItemRow['payload']) => {
    const why = canUse(mine, kind, day, total, usedToday.has(kind));
    if (why || !canAct) return showToast(why ?? '지금은 쓸 수 없어요', 'err');
    if (kind === 'fake' && !payload) return setFakeModal(true);
    addItemRow({ id: crypto.randomUUID(), player_id: me, day, kind, action: 'use', cost: 0, payload: payload ?? null, created_at: new Date().toISOString() });
    play('item');
    const d = ITEM_MAP[kind];
    if (kind === 'spy' && opponent && session.roomId) {
      setSpy({ open: true, pf: null });
      fetchTrades(session.roomId, opponent.id)
        .then((ts) => {
          const os = live.items.filter((r) => r.player_id === opponent.id && r.action === 'buy').map((r) => ({ day: r.day, cost: r.cost }));
          setSpy({ open: true, pf: computePortfolio(ts, os) });
        })
        .catch(() => setSpy({ open: false, pf: null }));
    } else if (d.type === 'info') {
      setTab('news');
      showToast(`${d.emoji} ${d.name} 결과가 뉴스 탭에 나왔어요`);
    } else {
      showToast(`${d.emoji} ${d.name} 발동! 내일 상대에게 적용돼요`);
    }
  };

  const endTurn = () => {
    if (!canAct) return;
    play('tap');
    if (solo) {
      setSoloDay(day + 1);
      return;
    }
    setLocalEnded(day);
    updatePlayer(me, { ended_day: day }).catch(() => {
      setLocalEnded(-1);
      showToast('네트워크 오류. 다시 눌러 주세요', 'err');
    });
  };

  const nextDay = () => {
    if (serverDay === null) return;
    setClosing(null);
    if (serverDay >= total) {
      setShowResult(true);
      if (!solo) saveMulti(null);
      return;
    }
    setViewDay(serverDay);
    play('news');
  };

  const sendReaction = useReactions(solo ? null : session.roomId, me, session.nickname, (r) => {
    play('react');
    pushBubble(r);
  });
  const pushBubble = (r: Reaction & { mine?: boolean }) => {
    setBubbles((b) => [...b.slice(-3), r]);
    setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== r.id)), 3500);
  };

  const toggleWatch = (sym: string) => {
    setWatch((w) => {
      const next = w.includes(sym) ? w.filter((x) => x !== sym) : [...w, sym];
      saveWatch(next);
      return next;
    });
  };
  const selectStock = (sym: string) => {
    setSelected(sym);
    setTab('detail');
  };
  const selectSector = (sec: string) => {
    browserJump.current?.(sec);
    setTab('list');
  };
  const setUi = (m: UiMode) => {
    setUiState(m);
    saveUi(m);
    if (!solo) updatePlayer(me, { mode: m }).catch(() => {});
  };

  // ---------- 화면 ----------
  if (showResult) {
    return <ResultScreen session={session} market={market} myTrades={trades} players={live.players} itemRows={allRows} onExit={onExit} />;
  }
  if (viewDay === null) return <div className="center-msg">게임 불러오는 중…</div>;

  const macro = market.macro[displayDay];
  const prevMacro = market.macro[Math.max(0, displayDay - 1)];
  const idx = market.index[displayDay];
  const idxNow = displayClosed ? idx.close : idx.open;
  const idxPrev = displayDay === 0 ? 2500 : market.index[displayDay - 1].close;
  const oppRet = opponent ? opponent.equity / START_CASH - 1 : 0;
  const share = opponent ? equity / (equity + opponent.equity) : 0.5;
  const oppEnded = opponent ? opponent.ended_day >= day : false;
  const holding = portfolio.holdings[selected];
  const easy = ui === 'easy';

  const macroChip = (label: string, key: 'rate' | 'fx' | 'oil', fmt: (v: number) => string) => {
    const d = macro[key] - prevMacro[key];
    return (
      <span className="mchip">
        <Term k={label} />
        <b>{fmt(macro[key])}</b>
        {d !== 0 && <i className={key === 'rate' ? (d > 0 ? 'up' : 'down') : tone(d)}>{d > 0 ? '▲' : '▼'}</i>}
      </span>
    );
  };

  return (
    <div className={'game ui-' + ui}>
      <header className="hud">
        <div className="hud-left">
          <div className="brand-sm">주식 대결</div>
          <div className="daypill">
            <b>{day + 1}일차</b>
            <span>/ {total}</span>
          </div>
          {remaining !== null && closing === null && (
            <div className={'timer' + (remaining <= 10 ? ' hurry' : '')}>
              ⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </div>
          )}
        </div>
        <div className="hud-macro">
          <span className="mchip idx">
            <Term k="지수">종합</Term>
            <b>{idxNow.toFixed(2)}</b>
            <i className={tone(idxNow / idxPrev - 1)}>{pct(idxNow / idxPrev - 1)}</i>
          </span>
          {macroChip('금리', 'rate', (v) => v.toFixed(2) + '%')}
          {macroChip('환율', 'fx', (v) => v.toLocaleString() + '원')}
          {macroChip('유가', 'oil', (v) => '$' + v.toFixed(1))}
        </div>
        <div className="hud-right">
          <div className="mode-toggle" role="group" aria-label="화면 모드">
            <button className={easy ? 'on' : ''} onClick={() => setUi('easy')}>
              초보
            </button>
            <button className={!easy ? 'on' : ''} onClick={() => setUi('pro')}>
              일반
            </button>
          </div>
          <button className="icon-btn" onClick={() => setTutorial(true)} aria-label="도움말">
            ?
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            aria-label="소리"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="icon-btn" onClick={() => confirm('로비로 나갈까요? (둘이서 하는 게임은 로비에서 이어할 수 있어요)') && onExit()} aria-label="나가기">
            ⎋
          </button>
        </div>
      </header>

      <section className="score">
        <div className="score-me">
          <small>{session.nickname} (나)</small>
          <b>{wonShort(equity)}</b>
          <span className={tone(myRet)}>{pct(myRet)}</span>
        </div>
        {!solo && (
          <>
            <div className="tug" aria-hidden>
              <div className="tug-me" style={{ width: `${share * 100}%` }} />
              <div className="tug-mid" />
            </div>
            <div className="score-opp">
              <small>
                {opponent?.nickname ?? '상대'} {opponent && <em className={oppEnded ? 'ok' : ''}>{oppEnded ? '✓ 마감' : '고민 중…'}</em>}
              </small>
              <b>{opponent ? wonShort(opponent.equity) : '-'}</b>
              <span className={tone(oppRet)}>{opponent ? pct(oppRet) : ''}</span>
            </div>
          </>
        )}
        {solo && <div className="score-solo muted">연습 모드 · 목표: 시장보다 많이 벌기</div>}
        <button className={'btn end-turn' + (endedToday ? ' waiting' : '')} disabled={!canAct} onClick={endTurn}>
          {endedToday ? '상대 기다리는 중…' : day + 1 >= total ? '마지막 장 마감 🏁' : '장 마감 →'}
          {easy && !endedToday && <small>다 정했으면 눌러요</small>}
        </button>
      </section>

      <main className="board">
        <section className={'pane p-list' + (tab === 'list' ? ' active' : '')}>
          <StockBrowserWithJump
            jumpRef={browserJump}
            market={market}
            day={displayDay}
            prices={prices}
            portfolio={portfolio}
            watch={watch}
            onToggleWatch={toggleWatch}
            selected={selected}
            onSelect={selectStock}
            newsSymbols={newsSymbols}
          />
        </section>
        <section className={'pane p-detail' + (tab === 'detail' ? ' active' : '')}>
          <StockDetail
            ui={ui}
            market={market}
            symbol={selected}
            day={displayDay}
            closed={displayClosed}
            price={prices[selected]}
            cash={portfolio.cash}
            holding={holding}
            news={shownNews}
            watched={watch.includes(selected)}
            onToggleWatch={() => toggleWatch(selected)}
            onSelectSector={selectSector}
            trade={tradeState}
            onTrade={trade}
          />
        </section>
        <section className={'pane p-side' + (['news', 'assets', 'cards'].includes(tab) ? ' active' : '')}>
          <div className="side-tabs">
            {(
              [
                ['news', '뉴스'],
                ['assets', easy ? '내 재산' : '자산'],
                ['cards', `카드 ${mine.total}`],
              ] as [Tab, string][]
            ).map(([t, l]) => (
              <button key={t} className={tab === t || (t === 'news' && !['news', 'assets', 'cards'].includes(tab)) ? 'on' : ''} onClick={() => setTab(t)}>
                {l}
              </button>
            ))}
          </div>
          <div className="side-body">
            {(tab === 'news' || !['assets', 'cards'].includes(tab)) && (
              <NewsPanel ui={ui} day={day} news={shownNews} tomorrow={tomorrow} rumorCheck={todayInfo.includes('detector')} bestSector={bestSector} onSelect={selectStock} onSelectSector={selectSector} />
            )}
            {tab === 'assets' && <AssetsPanel ui={ui} portfolio={portfolio} prices={prices} equity={equity} onSelect={selectStock} />}
            {tab === 'cards' && (
              <CardsPanel solo={solo} day={day} totalDays={total} mine={mine} cash={portfolio.cash} usedToday={usedToday} canAct={canAct} onBuy={buyItem} onUse={(k) => applyItem(k)} effectsOnMe={effectsOnMe} />
            )}
          </div>
        </section>
      </main>

      <nav className="bottom-nav">
        {(
          [
            ['list', '📋', '종목'],
            ['detail', '📈', '차트·거래'],
            ['news', '📰', '뉴스'],
            ['assets', '💰', easy ? '내 재산' : '자산'],
            ['cards', '🃏', '카드'],
          ] as [Tab, string, string][]
        ).map(([t, i, l]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span>{i}</span>
            {l}
            {t === 'news' && newsSymbols.size > 0 && tab !== 'news' && <i className="nav-dot" />}
            {t === 'cards' && mine.total > 0 && <i className="nav-count">{mine.total}</i>}
          </button>
        ))}
      </nav>

      {!solo && (
        <>
          <ReactionButton
            onSend={(r) => {
              sendReaction(r);
              pushBubble({ ...r, id: Date.now(), from: me, nickname: session.nickname, mine: true });
            }}
          />
          <ReactionBubbles items={bubbles} />
        </>
      )}

      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}

      {closing !== null && (
        <DayCloseOverlay
          market={market}
          day={closing}
          myEquity={equity}
          myDelta={
            equity -
            (closing === 0
              ? START_CASH
              : equityWith(
                  computePortfolio(trades, spends, closing - 1),
                  pricesAt(market, closing - 1, true),
                ))
          }
          last={closing + 1 >= total}
          onNext={nextDay}
        />
      )}
      {fakeModal && (
        <FakeNewsModal
          onCancel={() => setFakeModal(false)}
          onSubmit={(symbol, t) => {
            setFakeModal(false);
            applyItem('fake', { symbol, tone: t });
          }}
        />
      )}
      {spy.open && opponent && <SpyModal nickname={opponent.nickname} portfolio={spy.pf} prices={prices} onClose={() => setSpy({ open: false, pf: null })} />}
      {tutorial && (
        <Tutorial
          onDone={() => {
            markTutorialSeen();
            setTutorial(false);
          }}
        />
      )}
    </div>
  );
}

/** 업종 링크를 누르면 목록의 카테고리를 바꾸기 위한 래퍼 */
function StockBrowserWithJump(props: Parameters<typeof StockBrowser>[0] & { jumpRef: React.MutableRefObject<((s: string) => void) | undefined> }) {
  const { jumpRef, ...rest } = props;
  const [k, setK] = useState<{ sector: string; n: number } | null>(null);
  jumpRef.current = (sector) => setK((p) => ({ sector, n: (p?.n ?? 0) + 1 }));
  return <StockBrowser key={k ? k.sector + k.n : 'init'} initialCat={k?.sector} {...rest} />;
}
