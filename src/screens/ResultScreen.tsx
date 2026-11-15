import { useEffect, useMemo, useState } from 'react';
import { Chart } from '../components/Chart';
import type { Market } from '../game/market';
import { computePortfolio, equityHistory, START_CASH, Trade } from '../game/portfolio';
import { STOCK_MAP } from '../game/stocks';
import { pct, tone, won, wonShort } from '../lib/format';
import { fetchTrades, finishRoom, Player } from '../net/room';
import type { Session } from '../session';

interface Props {
  session: Session;
  market: Market;
  myTrades: Trade[];
  players: Player[];
  onExit: () => void;
}

const COLORS = ['var(--me)', 'var(--opp)'];

export function ResultScreen({ session, market, myTrades, players, onExit }: Props) {
  const [allTrades, setAllTrades] = useState<Trade[] | null>(session.mode === 'solo' ? myTrades : null);
  const [err, setErr] = useState('');

  const load = () => {
    if (!session.roomId) return;
    setErr('');
    fetchTrades(session.roomId)
      .then(setAllTrades)
      .catch((e) => setErr(String(e.message ?? e)));
  };

  // 상대의 마지막 거래가 저장될 시간을 조금 기다렸다가 불러옴
  useEffect(() => {
    if (session.mode !== 'multi') return;
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const final = market.totalTicks;

  const results = useMemo(() => {
    if (!allTrades) return null;
    const people =
      session.mode === 'solo'
        ? [{ id: session.playerId, nickname: session.nickname }]
        : [...players].sort((a, b) => (a.id === session.playerId ? -1 : b.id === session.playerId ? 1 : 0));
    return people.map((p) => {
      const trades = allTrades.filter((t) => t.player_id === p.id);
      const pf = computePortfolio(trades);
      const hist = equityHistory(trades, market.prices, final);
      const equity = hist[final];
      // 게임 종료 시점 보유분은 종가에 판 것으로 보고 손익 계산
      const closed = [
        ...pf.closed,
        ...Object.entries(pf.holdings).map(([symbol, h]) => {
          const pnl = h.qty * market.prices[symbol][final] - h.avgCost * h.qty;
          return { symbol, tick: final, qty: h.qty, pnl, pnlPct: pnl / (h.avgCost * h.qty) };
        }),
      ];
      const best = closed.reduce<(typeof closed)[number] | null>((a, c) => (!a || c.pnl > a.pnl ? c : a), null);
      const worst = closed.reduce<(typeof closed)[number] | null>((a, c) => (!a || c.pnl < a.pnl ? c : a), null);
      return { id: p.id, nickname: p.nickname, equity, ret: equity / START_CASH - 1, hist, trades: trades.length, pf, best, worst };
    });
  }, [allTrades, players, session, market, final]);

  const winner =
    results && results.length === 2
      ? results[0].equity === results[1].equity
        ? null
        : results[0].equity > results[1].equity
          ? results[0]
          : results[1]
      : null;

  useEffect(() => {
    if (!results || session.mode !== 'multi' || results.length !== 2 || !session.roomId) return;
    finishRoom(
      session.roomId,
      results.map((r) => ({ nickname: r.nickname, equity: Math.round(r.equity), ret: r.ret })),
      winner?.nickname ?? null,
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  // 시장 전체 성적 (가장 많이 오른/내린 종목)
  const stockRank = useMemo(
    () =>
      Object.entries(market.prices)
        .map(([sym, p]) => ({ sym, r: p[final] / p[0] - 1 }))
        .sort((a, b) => b.r - a.r),
    [market, final],
  );

  if (!results) {
    return (
      <div className="center-msg">
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
      <div className={'banner ' + (session.mode === 'solo' ? '' : winner ? (iWon ? 'win' : 'lose') : 'draw')}>
        {session.mode === 'solo' ? (
          <>
            <h1>장 마감!</h1>
            <p>
              최종 수익률 <b className={tone(me.ret)}>{pct(me.ret)}</b>
            </p>
          </>
        ) : results.length < 2 ? (
          <h1>상대 기록을 불러오지 못했어요</h1>
        ) : winner ? (
          <>
            <div className="crown">👑</div>
            <h1>{winner.nickname} 승리!</h1>
            <p>{iWon ? '축하해요! 오늘의 투자왕' : '다음 판엔 꼭 이겨봐요'}</p>
          </>
        ) : (
          <h1>무승부!</h1>
        )}
      </div>

      <div className="score-cards">
        {results.map((r, i) => (
          <div key={r.id} className={'card score' + (winner?.id === r.id ? ' champ' : '')} style={{ borderColor: COLORS[i] }}>
            <small style={{ color: COLORS[i] }}>{r.nickname}</small>
            <b>{won(r.equity)}</b>
            <span className={tone(r.ret)}>{pct(r.ret)}</span>
            <dl>
              <dt>거래 횟수</dt>
              <dd>{r.trades}회</dd>
              <dt>최고의 한 수</dt>
              <dd>
                {r.best && r.best.pnl > 0 ? (
                  <>
                    {STOCK_MAP[r.best.symbol].name} <span className="up">{wonShort(r.best.pnl)}</span>
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
              <dt>마감 보유</dt>
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

      <div className="card">
        <h3>자산 추이</h3>
        <div className="legend">
          {results.map((r, i) => (
            <span key={r.id}>
              <i style={{ background: COLORS[i] }} /> {r.nickname}
            </span>
          ))}
        </div>
        <Chart
          series={results.map((r, i) => ({ values: r.hist, color: COLORS[i] }))}
          length={final}
          height={240}
          refLine={{ value: START_CASH, label: '시작 1,000만원' }}
          formatY={(v) => wonShort(v)}
        />
      </div>

      <div className="card">
        <h3>이번 시장 종목 성적</h3>
        <div className="stock-rank">
          {stockRank.map(({ sym, r }) => (
            <div key={sym}>
              <span>
                {STOCK_MAP[sym].emoji} {STOCK_MAP[sym].name}
              </span>
              <b className={tone(r)}>{pct(r, 1)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="actions center">
        <button className="btn primary big" onClick={onExit}>
          로비로 (한 판 더!)
        </button>
      </div>
    </div>
  );
}
