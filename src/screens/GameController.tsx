import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssetsPanel, CardsPanel, DayCloseOverlay, FakeNewsModal, NewsPanel, Tutorial } from '../components/Panels';
import { ReactionBubbles, ReactionButton } from '../components/Reactions';
import { StockBrowser, type BrowserFilter } from '../components/StockBrowser';
import { StockDetail } from '../components/StockDetail';
import { Term } from '../components/Term';
import type { View } from '../engine/engine';
import { loadSolo, soloAct, soloView, type SoloSave } from '../engine/local';
import { FEE_BOMB_RATE, ITEM_MAP, type ItemKind, type ItemRow } from '../game/items';
import { KR_INDEX_BASE, pricesAt, US_INDEX_BASE, type Market } from '../game/market';
import { computePortfolio, equityWith, FEE_RATE, START_CASH } from '../game/portfolio';
import { quote } from '../game/quote';
import { SECTOR_MAP, STOCKS } from '../game/stocks';
import { pct, tone, wonShort } from '../lib/format';
import { isMuted, play, setMuted } from '../lib/sound';
import { api, useLiveView, useReactions, type Reaction } from '../net/api';
import { loadWatch, markTutorialSeen, saveUi, saveWatch, tutorialSeen, type Session, type UiMode } from '../session';
import { ResultScreen } from './ResultScreen';

interface Props {
  session: Session;
  onExit: () => void;
}

type Tab = 'list' | 'detail' | 'info';

/** 둘이서: 서버(/api/game) · 혼자: 브라우저 안의 같은 엔진 */
function useGameSource(session: Session) {
  const multi = session.mode === 'multi';
  const live = useLiveView(multi ? session.roomId : null);
  const [solo, setSolo] = useState<SoloSave | null>(() => (multi ? null : loadSolo()));
  const soloV = useMemo(() => (solo ? soloView(solo) : null), [solo]);
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

export function GameController({ session, onExit }: Props) {
  const solo = session.mode === 'solo';
  const me = session.playerId;
  const { view, market, offset, error, act, busy } = useGameSource(session);

  const [viewDay, setViewDay] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  const [closeMarket, setCloseMarket] = useState<Market | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [ui, setUiState] = useState<UiMode>(session.ui);
  const [selected, setSelected] = useState(STOCKS[0].symbol);
  const [tab, setTab] = useState<Tab>('info');
  const [filter, setFilter] = useState<BrowserFilter>({ region: 'all', sub: null });
  const [watch, setWatch] = useState<string[]>(loadWatch);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' | 'warn' } | null>(null);
  const [tutorial, setTutorial] = useState(() => session.ui === 'easy' && !tutorialSeen());
  const [fakeModal, setFakeModal] = useState(false);
  const [bubbles, setBubbles] = useState<(Reaction & { mine?: boolean })[]>([]);
  const [muted, setMutedState] = useState(isMuted());
  const [now, setNow] = useState(Date.now());
  const toastTimer = useRef<number>();
  const sideRef = useRef<HTMLDivElement>(null);

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
  const prevMarket = useRef<Market | null>(null);
  useEffect(() => {
    if (serverDay === null || !market) return;
    if (viewDay === null) {
      if (finished) {
        setViewDay(total - 1);
        setShowResult(true);
      } else setViewDay(serverDay);
      prevMarket.current = market;
      return;
    }
    if (closing === null && !showResult && serverDay > viewDay) {
      // 새 시장 데이터에는 어제 종가가 들어 있음
      setCloseMarket(market);
      setClosing(viewDay);
      play('close');
    }
    prevMarket.current = market;
  }, [serverDay, viewDay, closing, showResult, market, finished, total]);

  const day = viewDay ?? 0;
  const displayDay = closing ?? day;
  const displayClosed = closing !== null;
  // 결산 중에는 결산용 시장, 아니면 화면 날짜와 맞는 시장
  const mkt = (closing !== null ? closeMarket : market) ?? market;

  const prices = useMemo(() => (mkt ? pricesAt(mkt, displayDay, displayClosed) : {}), [mkt, displayDay, displayClosed]);

  // ---------- 내 상태 ----------
  const myItemRows: ItemRow[] = view?.myItemRows ?? [];
  const spends = useMemo(() => myItemRows.filter((r) => r.action === 'buy').map((r) => ({ day: r.day, cost: r.cost })), [myItemRows]);
  const portfolio = useMemo(() => computePortfolio(view?.myTrades ?? [], spends), [view?.myTrades, spends]);
  const equity = mkt ? equityWith(portfolio, prices) : START_CASH;
  const myRet = equity / START_CASH - 1;

  const players = view?.players ?? [];
  const meRow = players.find((p) => p.id === me);
  const opponent = players.find((p) => p.id !== me) ?? null;
  const endedToday = !solo && (meRow?.endedDay ?? -1) >= day;
  const effects = view?.effectsToday ?? [];
  const frozen = effects.includes('freeze');
  const feeRate = effects.includes('fee') ? FEE_BOMB_RATE : FEE_RATE;
  const canAct = !!view && room?.status === 'playing' && closing === null && viewDay === serverDay && !endedToday && !showResult;
  const deadline = room?.deadline ?? null;
  const remaining = deadline !== null && !solo ? Math.max(0, Math.ceil((deadline - (now + offset)) / 1000)) : null;

  const tradeState = {
    allowed: canAct && !frozen && remaining !== 0,
    reason: frozen
      ? '🧊 상대의 거래 정지 카드! 오늘은 사고팔 수 없어요'
      : closing !== null
        ? '장이 마감됐어요'
        : endedToday
          ? '오늘은 장 마감을 눌렀어요. 상대를 기다리는 중…'
          : remaining === 0
            ? '시간이 다 됐어요. 곧 장이 마감돼요'
            : null,
    fee: feeRate,
    busy,
  };

  const news = mkt?.news ?? [];
  const newsSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const n of news.filter((x) => x.day === day)) n.related.forEach((s) => set.add(s));
    return set;
  }, [news, day]);

  const change = useCallback((sym: string) => (mkt ? quote(mkt, sym, displayDay, displayClosed).ch : 0), [mkt, displayDay, displayClosed]);

  // ---------- 알림 (상대의 방해 등) ----------
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
      const name = STOCKS.find((s) => s.symbol === symbol)!.name;
      showToast(`${name} ${qty.toLocaleString()}주 ${ui === 'easy' ? (side === 'buy' ? '샀어요' : '팔았어요') : side === 'buy' ? '매수 체결' : '매도 체결'}`);
    });

  const buyItem = (kind: ItemKind) =>
    run('buyItem', { kind }, () => {
      play('item');
      showToast(`${ITEM_MAP[kind].emoji} ${ITEM_MAP[kind].name} 카드를 샀어요`);
    });

  const useCard = (kind: ItemKind, payload?: ItemRow['payload']) => {
    if (kind === 'fake' && !payload) return setFakeModal(true);
    run('useItem', { kind, payload }, () => {
      play('item');
      const d = ITEM_MAP[kind];
      showToast(d.type === 'info' ? `${d.emoji} ${d.name} 결과가 뉴스 위에 나왔어요` : `${d.emoji} ${d.name} 발동! 내일 상대에게 적용돼요`);
      if (d.type === 'info') {
        setTab('info');
        sideRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  };

  const endTurn = () => {
    if (!canAct) return;
    play('tap');
    run('endTurn', {}, () => {});
  };

  const nextDay = () => {
    if (serverDay === null) return;
    setClosing(null);
    setCloseMarket(null);
    if (finished || serverDay >= total) {
      setShowResult(true);
      return;
    }
    setViewDay(serverDay);
    play('news');
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
    setTab('detail');
    document.querySelector('.p-detail')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectSector = (sec: string) => {
    const region = SECTOR_MAP[sec]?.region ?? 'all';
    setFilter({ region: region === 'ETF' ? 'ETF' : region, sub: sec });
    setTab('list');
  };
  const setUi = (m: UiMode) => {
    setUiState(m);
    saveUi(m);
    if (!solo) api('mode', { roomId: session.roomId, mode: m }).catch(() => {});
  };
  const jump = (id: string) => sideRef.current?.querySelector('#' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    if (!view.final) return <div className="center-msg"><div className="spinner" /><p className="muted">결과 집계 중…</p></div>;
    return <ResultScreen session={session} market={market} final={view.final} onExit={onExit} />;
  }

  const m = mkt!;
  const macro = m.macro[displayDay] ?? m.macro0;
  const prevMacro = displayDay > 0 ? m.macro[displayDay - 1] : m.macro0;
  const idx = m.index[displayDay];
  const idxNow = displayClosed ? idx.close : idx.open;
  const idxPrev = displayDay === 0 ? KR_INDEX_BASE : m.index[displayDay - 1].close;
  const us = m.usIndex[displayDay];
  const usNow = displayClosed ? us.close : us.open;
  const usPrev = displayDay === 0 ? US_INDEX_BASE : m.usIndex[displayDay - 1].close;
  const oppRet = opponent ? opponent.equity / START_CASH - 1 : 0;
  const share = opponent ? equity / (equity + opponent.equity) : 0.5;
  const oppEnded = opponent ? opponent.endedDay >= day : false;
  const easy = ui === 'easy';
  const usedToday = new Set(myItemRows.filter((r) => r.action === 'use' && r.day === day).map((r) => r.kind));
  const effectsOnMe = effects.map((k) => (k === 'freeze' ? '🧊 오늘은 상대의 거래 정지 카드 때문에 거래할 수 없어요' : k === 'fee' ? '💸 수수료 폭탄! 오늘은 수수료가 1%예요' : '')).filter(Boolean);

  const macroChip = (label: string, k: 'rate' | 'usRate' | 'fx' | 'oil', fmt: (v: number) => string, term = label) => {
    const d = macro[k] - prevMacro[k];
    return (
      <span className="mchip">
        <Term k={term}>{label}</Term>
        <b>{fmt(macro[k])}</b>
        {Math.abs(d) > 1e-9 && <i className={tone(d)}>{d > 0 ? '▲' : '▼'}</i>}
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
          <button className="icon-btn" onClick={onExit} aria-label="로비로">
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
        {!solo ? (
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
        ) : (
          <div className="score-solo muted">연습 모드 · 목표: 시장보다 많이 벌기</div>
        )}
        <button className={'btn end-turn' + (endedToday ? ' waiting' : '')} disabled={!canAct || busy} onClick={endTurn}>
          {endedToday ? '상대 기다리는 중…' : day + 1 >= total ? '마지막 장 마감 🏁' : '장 마감 →'}
          {easy && !endedToday && <small>다 정했으면 눌러요</small>}
        </button>
      </section>

      <main className="board">
        <section className={'pane p-list' + (tab === 'list' ? ' active' : '')}>
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
        </section>
        <section className={'pane p-detail' + (tab === 'detail' ? ' active' : '')}>
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
          />
        </section>
        <section className={'pane p-side' + (tab === 'info' ? ' active' : '')}>
          <nav className="side-anchors">
            <button onClick={() => jump('sec-news')}>📰 뉴스</button>
            <button onClick={() => jump('sec-assets')}>💰 {easy ? '내 재산' : '자산'}</button>
            <button onClick={() => jump('sec-cards')}>🃏 카드 {view.myItems.total}</button>
          </nav>
          <div className="side-body" ref={sideRef}>
            <section id="sec-news" className="side-sec">
              <NewsPanel
                ui={ui}
                day={day}
                news={news}
                tomorrow={view.reveals.tomorrow}
                rumorCheck={view.reveals.rumorCheck}
                bestSector={view.reveals.bestSector}
                spy={view.reveals.spy}
                prices={prices}
                change={change}
                onSelect={selectStock}
                onSelectSector={selectSector}
              />
            </section>
            <section id="sec-assets" className="side-sec">
              <h4 className="sec-head">💰 {easy ? '내 재산' : '자산'}</h4>
              <AssetsPanel ui={ui} portfolio={portfolio} prices={prices} equity={equity} onSelect={selectStock} />
            </section>
            <section id="sec-cards" className="side-sec">
              <h4 className="sec-head">🃏 찬스 카드</h4>
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
            </section>
          </div>
        </section>
      </main>

      <nav className="bottom-nav">
        {(
          [
            ['list', '📋', '종목'],
            ['detail', '📈', '차트·거래'],
            ['info', '📰', '뉴스·자산·카드'],
          ] as [Tab, string, string][]
        ).map(([t, i, l]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span>{i}</span>
            {l}
            {t === 'info' && newsSymbols.size > 0 && tab !== 'info' && <i className="nav-dot" />}
          </button>
        ))}
      </nav>

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

      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}

      {closing !== null && (
        <DayCloseOverlay
          market={m}
          day={closing}
          myEquity={equity}
          myDelta={equity - (closing === 0 ? START_CASH : equityWith(computePortfolio(view.myTrades, spends, closing - 1), pricesAt(m, closing - 1, true)))}
          last={closing + 1 >= total}
          onNext={nextDay}
        />
      )}
      {fakeModal && (
        <FakeNewsModal
          onCancel={() => setFakeModal(false)}
          onSubmit={(symbol, t) => {
            setFakeModal(false);
            useCard('fake', { symbol, tone: t });
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
    </div>
  );
}

export type { View };
