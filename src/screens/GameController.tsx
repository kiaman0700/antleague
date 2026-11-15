import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMarket } from '../game/market';
import { useGameClock } from '../game/clock';
import { buyCost, computePortfolio, equityAt, Trade } from '../game/portfolio';
import { fetchTrades, insertTrade, updateMyStats, useRoomLive } from '../net/room';
import { saveMulti, Session } from '../session';
import { GameScreen } from './GameScreen';
import { ResultScreen } from './ResultScreen';

interface Props {
  session: Session;
  offset: number;
  onExit: () => void;
}

export function GameController({ session, offset, onExit }: Props) {
  const market = useMemo(() => generateMarket(session.seed, session.totalDays), [session.seed, session.totalDays]);
  const clock = useGameClock(session.startedAt, session.dayMs, session.totalDays, offset);
  const { players } = useRoomLive(session.mode === 'multi' ? session.roomId : null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number>();

  // 이어하기: 내가 이미 한 거래 불러오기
  useEffect(() => {
    if (session.mode !== 'multi' || !session.roomId) return;
    fetchTrades(session.roomId)
      .then((all) => setTrades(all.filter((t) => t.player_id === session.playerId)))
      .catch(() => {});
  }, [session]);

  const portfolio = useMemo(() => computePortfolio(trades), [trades]);
  const equity = equityAt(portfolio, market.prices, clock.tick);

  // 내 자산을 상대에게 공유 (틱마다 + 거래마다)
  useEffect(() => {
    if (session.mode !== 'multi' || !clock.started) return;
    updateMyStats(session.playerId, portfolio.cash, equity, trades.length).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock.tick, trades.length, clock.started]);

  const showToast = (text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const trade = useCallback(
    (symbol: string, side: 'buy' | 'sell', qty: number) => {
      if (!clock.started || clock.over) return showToast('지금은 거래할 수 없어요', 'err');
      if (!Number.isInteger(qty) || qty <= 0) return showToast('수량을 확인해 주세요', 'err');
      const price = market.prices[symbol][clock.tick];
      if (side === 'buy' && buyCost(qty, price) > portfolio.cash) return showToast('현금이 부족해요', 'err');
      if (side === 'sell' && (portfolio.holdings[symbol]?.qty ?? 0) < qty) return showToast('보유 수량이 부족해요', 'err');
      const t: Trade = { id: crypto.randomUUID(), player_id: session.playerId, tick: clock.tick, symbol, side, qty, price };
      setTrades((prev) => [...prev, t]);
      showToast(`${side === 'buy' ? '매수' : '매도'} 체결 · ${qty}주 @ ${price.toLocaleString('ko-KR')}원`);
      if (session.mode === 'multi' && session.roomId) {
        insertTrade(session.roomId, t).catch(() => {
          setTrades((prev) => prev.filter((x) => x.id !== t.id));
          showToast('네트워크 오류로 거래가 취소됐어요', 'err');
        });
      }
    },
    [clock, market, portfolio, session],
  );

  useEffect(() => {
    if (clock.over && session.mode === 'multi') saveMulti(null);
  }, [clock.over, session.mode]);

  if (clock.over) {
    return <ResultScreen session={session} market={market} myTrades={trades} players={players} onExit={onExit} />;
  }

  const opponent = players.find((p) => p.id !== session.playerId) ?? null;

  return (
    <GameScreen
      session={session}
      market={market}
      clock={clock}
      portfolio={portfolio}
      equity={equity}
      opponent={opponent}
      onTrade={trade}
      toast={toast}
      onQuit={() => {
        if (confirm('게임을 나갈까요? (멀티 게임은 로비에서 이어할 수 있어요)')) onExit();
      }}
    />
  );
}
