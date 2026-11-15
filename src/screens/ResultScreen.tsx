import { useEffect, useMemo, useState } from 'react';
import { LineChart } from '../components/Chart';
import { deriveItems, ITEM_MAP, type ItemKind, type ItemRow } from '../game/items';
import type { Market } from '../game/market';
import { computePortfolio, equityHistory, START_CASH, type Trade } from '../game/portfolio';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { pct, tone, won, wonShort } from '../lib/format';
import { play } from '../lib/sound';
import { fetchTrades, saveResult, type Player } from '../net/room';
import type { Session } from '../session';

interface Props {
  session: Session;
  market: Market;
  myTrades: Trade[];
  players: Player[];
  itemRows: ItemRow[];
  onExit: () => void;
}

const COLORS = ['var(--me)', 'var(--opp)'];

export function ResultScreen({ session, market, myTrades, players, itemRows, onExit }: Props) {
  const solo = session.mode === 'solo';
  const [allTrades, setAllTrades] = useState<Trade[] | null>(solo ? myTrades : null);
  const [err, setErr] = useState('');
  const last = market.totalDays - 1;

  const load = () => {
    if (!session.roomId) return;
    setErr('');
    fetchTrades(session.roomId)
      .then(setAllTrades)
      .catch((e) => setErr(String(e.message ?? e)));
  };
  useEffect(() => {
    if (solo) return;
    const t = setTimeout(load, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    if (!allTrades) return null;
    const people = solo
      ? [{ id: session.playerId, nickname: session.nickname }]
      : [...players].sort((a, b) => (a.id === session.playerId ? -1 : b.id === session.playerId ? 1 : 0));
    const items = deriveItems(session.seed, people.map((p) => p.id), itemRows, last, market.totalDays, solo);
    return people.map((p) => {
      const trades = allTrades.filter((t) => t.player_id === p.id);
      const spends = itemRows.filter((r) => r.player_id === p.id && r.action === 'buy').map((r) => ({ day: r.day, cost: r.cost }));
      const pf = computePortfolio(trades, spends);
      const hist = equityHistory(trades, spends, market);
      const equity = hist[hist.length - 1];
      const closed = [
        ...pf.closed,
        ...Object.entries(pf.holdings).map(([symbol, h]) => {
          const pnl = h.qty * market.bars[symbol][last].close - h.avgCost * h.qty;
          return { symbol, day: last, qty: h.qty, pnl, pnlPct: pnl / (h.avgCost * h.qty) };
        }),
      ];
      const best = closed.reduce<(typeof closed)[number] | null>((a, c) => (!a || c.pnl > a.pnl ? c : a), null);
      const worst = closed.reduce<(typeof closed)[number] | null>((a, c) => (!a || c.pnl < a.pnl ? c : a), null);
      const used = (Object.entries(items.players[p.id]?.used ?? {}) as [ItemKind, number][]).filter(([, n]) => n > 0);
      const fakesReceived = items.effects.filter((e) => e.to === p.id && e.kind === 'fake' && !e.blocked).length;
      return { id: p.id, nickname: p.nickname, equity, ret: equity / START_CASH - 1, hist, trades: trades.length, pf, best, worst, used, fakesReceived };
    });
  }, [allTrades, players, session, market, itemRows, solo, last]);

  const winner =
    results && results.length === 2 ? (results[0].equity === results[1].equity ? null : results[0].equity > results[1].equity ? results[0] : results[1]) : null;

  const saved = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (!results || solo || results.length !== 2 || !session.roomId || saved.done) return;
    saved.done = true;
    saveResult(
      session.roomId,
      results.map((r) => ({ nickname: r.nickname, equity: Math.round(r.equity), ret: r.ret })),
      winner?.nickname ?? null,
    ).catch(() => {});
    play(winner?.id === session.playerId ? 'win' : 'lose');
  }, [results, solo, session, winner, saved]);

  const indexRet = market.index[last].close / 2500 - 1;
  const stockRank = useMemo(
    () => STOCKS.map((s) => ({ s, r: market.bars[s.symbol][last].close / market.base[s.symbol] - 1 })).sort((a, b) => b.r - a.r),
    [market, last],
  );

  if (!results) {
    return (
      <div className="center-msg">
        <div className="spinner" />
        <p>결과 집계 중…</p>
        {err && (
          <>
            <p className="error">{err}</p>
            <button className="btn" onClick={load}>
              다시 시도
            </button>
          </>
        )}
      </div>
    );
  }

  const me = results.find((r) => r.id === session.playerId)!;
  const iWon = winner?.id === session.playerId;

  return (
    <div className="result">
      <div className={'banner ' + (solo ? (me.ret > indexRet ? 'win' : '') : winner ? (iWon ? 'win' : 'lose') : 'draw')}>
        {solo ? (
          <>
            <div className="crown">{me.ret > indexRet ? '🏆' : '📉'}</div>
            <h1>장 마감!</h1>
            <p>
              내 수익률 <b className={tone(me.ret)}>{pct(me.ret)}</b> · 시장(지수) <b className={tone(indexRet)}>{pct(indexRet)}</b>
            </p>
            <p>{me.ret > indexRet ? '시장보다 잘했어요!' : '이번엔 시장이 이겼네요. 다시 도전!'}</p>
          </>
        ) : results.length < 2 ? (
          <h1>상대 기록을 불러오지 못했어요</h1>
        ) : winner ? (
          <>
            <div className="crown">👑</div>
            <h1>{winner.nickname} 승리!</h1>
            <p>
              {wonShort(Math.abs(results[0].equity - results[1].equity))} 차이 · {iWon ? '오늘의 투자왕!' : '다음 판엔 꼭 이겨봐요'}
            </p>
          </>
        ) : (
          <h1>무승부!</h1>
        )}
      </div>

      <div className="score-cards">
        {results.map((r, i) => (
          <div key={r.id} className={'panel score-card' + (winner?.id === r.id ? ' champ' : '')} style={{ borderTopColor: COLORS[i] }}>
            <small style={{ color: COLORS[i] }}>{r.nickname}</small>
            <b className="big-num">{won(r.equity)}</b>
            <span className={tone(r.ret)}>{pct(r.ret)}</span>
            <dl>
              <dt>거래 횟수</dt>
              <dd>{r.trades}회</dd>
              <dt>최고의 한 수</dt>
              <dd>
                {r.best && r.best.pnl > 0 ? (
                  <>
                    {STOCK_MAP[r.best.symbol].name} <span className="up">+{wonShort(r.best.pnl)}</span>
                  </>
                ) : (
                  '-'
                )}
              </dd>
              <dt>최악의 한 수</dt>
              <dd>
                {r.worst && r.worst.pnl < 0 ? (
                  <>
                    {STOCK_MAP[r.worst.symbol].name} <span className="down">{wonShort(r.worst.pnl)}</span>
                  </>
                ) : (
                  '-'
                )}
              </dd>
              <dt>쓴 카드</dt>
              <dd>{r.used.length ? r.used.map(([k, n]) => `${ITEM_MAP[k].emoji}${n > 1 ? '×' + n : ''}`).join(' ') : '-'}</dd>
              {r.pf.itemSpend > 0 && (
                <>
                  <dt>카드 구입비</dt>
                  <dd>{wonShort(r.pf.itemSpend)}</dd>
                </>
              )}
              {r.fakesReceived > 0 && (
                <>
                  <dt>받은 가짜 뉴스</dt>
                  <dd>📢 {r.fakesReceived}개</dd>
                </>
              )}
              <dt>마감 때 보유</dt>
              <dd>
                {Object.keys(r.pf.holdings).length === 0
                  ? '전부 현금'
                  : Object.entries(r.pf.holdings)
                      .map(([s, h]) => `${STOCK_MAP[s].name} ${h.qty}주`)
                      .join(', ')}
              </dd>
            </dl>
          </div>
        ))}
      </div>

      <div className="panel pad">
        <h3>자산 추이</h3>
        <div className="legend">
          {results.map((r, i) => (
            <span key={r.id}>
              <i style={{ background: COLORS[i] }} /> {r.nickname}
            </span>
          ))}
        </div>
        <LineChart
          series={results.map((r, i) => ({ values: r.hist.slice(1), color: COLORS[i] }))}
          totalDays={market.totalDays}
          refLine={{ value: START_CASH, label: '시작 1,000만원' }}
          fmt={(v) => wonShort(v)}
          fill={false}
        />
      </div>

      <div className="panel pad">
        <h3>
          이번 시장 성적 <span className="muted small">종합지수 {pct(indexRet)}</span>
        </h3>
        <div className="stock-rank">
          {stockRank.map(({ s, r }) => (
            <div key={s.symbol}>
              <span>
                {SECTOR_MAP[s.sector].emoji} {s.name}
              </span>
              <b className={tone(r)}>{pct(r, 1)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="center-actions">
        <button className="btn primary xl" onClick={onExit}>
          한 판 더!
        </button>
      </div>
    </div>
  );
}
