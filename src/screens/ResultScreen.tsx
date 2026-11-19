import { ThemeCard } from '../components/ThemeCard';
import { copyText, shareOrCopy } from '../lib/copy';
import { api } from '../net/api';
import { setFlash } from '../lib/flash';
import { balancedCols } from '../components/ui';
import { TierBadge } from '../components/TierBadge';
import { isPlaced, PLACEMENT_GAMES, tierOf } from '../game/tier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeIcon, CardIcon, Icon, SectorIcon, type IconName } from '../components/Icon';
import { LineChart } from '../components/Chart';
import { BADGE_MAP, cutMarket, titleOf } from '../game/achievements';
import { PLAYER_COLORS } from '../components/Board';
import { josa, type View } from '../engine/engine';
import { AugReveal } from '../components/Augments';
import { deriveItems, ITEM_MAP, spendsFromRows, type ItemKind } from '../game/items';
import { KR_INDEX_BASE, type Market } from '../game/market';
import { computePortfolio, equityHistory, startCashFor } from '../game/portfolio';
import { STOCK_MAP, STOCKS } from '../game/stocks';
import { pct, tone, won, wonShort } from '../lib/format';
import { SPEED_PRESET } from '../engine/matching';
import { play } from '../lib/sound';
import type { Session } from '../session';
import { DailyResult, useDailyInfo } from '../components/Daily';
import { keyMoments } from '../game/keyMoments';
import { realLessons } from '../game/realWorld';
import { useIsMobile } from '../components/Extras';
import { MissionsPanel } from '../components/Missions';
import { useAccount } from '../net/account';
import type React from 'react';

interface Props {
  /** (v26) 오늘의 시장 테마 id */
  theme?: string;
  session: Session;
  market: Market;
  final: NonNullable<View['final']>;
  onExit: () => void;
  /** 한 판 더(같은 사람들과) — 누가 이미 만들었으면 nextCode 가 있음 */
  nextCode?: string | null;
  onRematch?: () => Promise<void>;
  /** 매칭으로 만든 방 (다시 찾기) · 랭킹전 */
  matchKind?: 'custom' | 'match' | 'friend' | 'bot' | 'daily';
  ranked?: boolean;
  onFindAgain?: () => void;
  /** 판 정보 (한 판 더 버튼에 모드·설정을 보여 주려고) */
  dayInfo?: { days: number; daySec: number };
  /** 파티로 한 판 했으면: 파티장인지·파티장이 다시 찾는 중인지 */
  party?: { isLeader: boolean; searching: boolean } | null;
  onBackToParty?: () => void;
  /** (연습) 같은 설정으로 한 판 더 */
  onReplay?: () => void;
}

const COLORS = PLAYER_COLORS;
const rankBadge = (i: number) => <span className={'rank-badge r' + (i + 1)}>{i + 1}</span>;

export function ResultScreen({ theme, session, market: fullMarket, final, onExit, nextCode, onRematch, matchKind, ranked: rankedGame, onFindAgain, onReplay, dayInfo, party, onBackToParty }: Props) {
  const wide = useIsMobile('(min-width: 900px)');
  // 상대가 모두 기권해 바로 끝난 판: 기권한 날까지만 (재산·수익률·그래프·리플레이 모두)
  const market = useMemo(() => (final.endDay != null && final.endDay < fullMarket.totalDays - 1 ? cutMarket(fullMarket, final.endDay) : fullMarket), [fullMarket, final.endDay]);
  // 랭킹전: 내 점수 변화 (회원만 — 서버가 반영한 값)
  const [rating, setRating] = useState<{ rated: boolean; rating_before: number | null; rating_after: number | null; ranked_games?: number } | null>(null);
  const [ratingGone, setRatingGone] = useState(false);
  useEffect(() => {
    if (session.mode !== 'multi' || !session.roomId) return;
    let n = 0;
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<typeof rating>('myMatch', { roomId: session.roomId })
        .then((r) => {
          if (!alive) return;
          if (r) setRating(r);
          else if (n++ < 5) t = setTimeout(load, 1500);
          else setRatingGone(true);
        })
        .catch(() => alive && setRatingGone(true));
    load();
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rematching, setRematching] = useState(false);
  const [rematchErr, setRematchErr] = useState('');
  const rematch = async () => {
    if (!onRematch) return;
    setRematching(true);
    setRematchErr('');
    try {
      await onRematch();
    } catch (e) {
      setRematchErr(e instanceof Error ? e.message : String(e));
      setRematching(false);
    }
  };
  // 혼자 한 판: 연습, 또는 오늘의 도전(서버 판이지만 혼자) — 봇전은 봇과 겨루므로 대결처럼
  const solo = (session.mode === 'solo' || matchKind === 'daily') && final.players.length < 2;
  const last = market.totalDays - 1;
  const START_CASH = startCashFor(market.version);

  const botIds = new Set(final.players.filter((p) => p.bot).map((p) => p.id));
  const results = useMemo(() => {
    const people = [...final.players].sort((a, b) => (a.id === session.playerId ? -1 : b.id === session.playerId ? 1 : 0));
    const items = deriveItems(final.seed, final.players.map((p) => p.id), final.items, last, market.totalDays, final.players.length < 2, market.version ?? 1);
    return people.map((p) => {
      const trades = final.trades.filter((t) => t.player_id === p.id);
      // (v27) 증강으로 받은 돈도 현금 변화로
      const spends = spendsFromRows(final.items.filter((r) => r.player_id === p.id)).concat((final.augIncome?.[p.id] ?? []).map((x) => ({ day: x.day, cost: -x.amount, aug: true })));
      const pf = computePortfolio(trades, spends, Infinity, [], START_CASH);
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
      // 날마다 용돈 봉투로 받거나 잃은 돈 (하이라이트에서 그날 변화의 이유로 씀)
      const bonusOn: Record<number, number> = {};
      for (const r of final.items) if (r.player_id === p.id && r.action === 'use' && r.kind === 'bonus' && typeof r.payload?.amount === 'number') bonusOn[r.day] = (bonusOn[r.day] ?? 0) + r.payload.amount;
      // 매칭(랭킹전·일반전)에서 거래 0회 = 기권처럼 순위 맨 뒤 (서버 finalResults 와 같은 규칙)
      const idle = matchKind === 'match' && !p.left && trades.length === 0;
      // 증강으로 받은 돈을 뺀 수익률 — 시장과 비교할 때 (증강 돈만으로 '시장보다 잘했어요'가 되지 않게)
      const augSum = (final.augIncome?.[p.id] ?? []).filter((x) => x.day <= last).reduce((a, x) => a + x.amount, 0);
      return { id: p.id, nickname: p.nickname, left: !!p.left, idle, bonusOn, equity, ret: equity / START_CASH - 1, tradeRet: (equity - augSum) / START_CASH - 1, augSum, hist, trades: trades.length, pf, best, worst, used, fakesReceived };
    });
  }, [final, session.playerId, market, last, START_CASH, matchKind]);

  // 기권한 사람 → 거래 0회(매칭)인 사람 순으로 재산과 상관없이 뒤로 — 상대가 기권하면 남은 사람이 이김
  const back = (r: { left: boolean; idle: boolean }) => (r.left ? 2 : r.idle ? 1 : 0);
  const ranked = [...results].sort((a, b) => back(a) - back(b) || b.equity - a.equity);
  const stay = ranked.filter((r) => back(r) === 0);
  const winner = ranked.length >= 2 && stay.length >= 1 && (stay.length === 1 || stay[0].equity !== stay[1].equity) ? stay[0] : null;
  // 같은 재산이면 같은 순위 (비기면 둘 다 1위). 뒤로 간 사람은 앞 무리 뒤에서 재산 순
  const rankOf = (id: string) => {
    const me = ranked.find((r) => r.id === id);
    if (!me) return 0;
    return ranked.filter((r) => back(r) < back(me) || (back(r) === back(me) && r.equity > me.equity)).length;
  };

  const played = useRef(false);
  useEffect(() => {
    if (played.current || solo) return;
    played.current = true;
    // 1위만 축하, 위쪽 절반은 담담하게, 아래쪽만 아쉬운 소리 (다인전 2위가 진 소리를 듣지 않게)
    const n = final.players.length;
    const r = rankOf(session.playerId);
    play(winner?.id === session.playerId ? 'win' : n > 2 && r < n / 2 ? 'close' : 'lose');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, winner, session.playerId]);

  const indexRet = market.index[last].close / KR_INDEX_BASE - 1;
  const stockRank = useMemo(
    () => STOCKS.map((s) => ({ s, r: market.bars[s.symbol][last].close / market.base[s.symbol] - 1 })).sort((a, b) => b.r - a.r),
    [market, last],
  );

  const [replayDay, setReplayDay] = useState<number | null>(null);
  const headline = (d: number) => market.news.find((n) => n.day === d && n.kind === 'macro')?.headline ?? market.news.find((n) => n.day === d)?.headline ?? '';
  const highlights = useMemo(() => {
    const out: { icon: string; title: string; text: string; day?: number; note?: string }[] = [];
    const days = market.totalDays;
    // 1위 흐름은 끝까지 하고 거래도 한 사람끼리만 (기권·거래 0번은 재산이 높아도 우승이 아니라 위 결과와 말이 어긋남)
    const pool = results.filter((r) => !r.left && !r.idle);
    if (results.length >= 2) {
      const base = pool.length >= 2 ? pool : results;
      // 날마다 1위가 누구였는지
      const leaderOn = (d: number) => base.reduce((a, r) => (r.hist[d + 1] > a.hist[d + 1] ? r : a), base[0]);
      const gapOn = (d: number) => {
        const v = base.map((r) => r.hist[d + 1]).sort((x, y) => y - x);
        return v[0] - v[1];
      };
      let changes = 0;
      for (let d = 1; d < days; d++) if (leaderOn(d).id !== leaderOn(d - 1).id) changes++;
      const champ = leaderOn(days - 1);
      let takeDay = -1;
      for (let d = 1; d < days; d++) if (leaderOn(d).id === champ.id && leaderOn(d - 1).id !== champ.id) takeDay = d;
      // 재산 1위가 실제 우승자가 아니면(재산 1위가 기권) '끝까지 지켰어요'는 틀린 말 → 이 하이라이트는 건너뜀
      const champLeft = pool.length < 2;
      if (champLeft) {
        /* 기권한 사람의 하이라이트는 넣지 않음 */
      } else if (takeDay >= 0) {
        out.push({ icon: 'flame', title: `${takeDay + 1}일차에 승부가 갈렸어요`, text: `${josa(champ.nickname, '이', '가')} 1위로 올라선 뒤 끝까지 지켰어요`, day: takeDay });
      } else {
        let best = 0;
        let bd = 0;
        for (let d = 1; d < days; d++) if (gapOn(d) - gapOn(d - 1) > best) [best, bd] = [gapOn(d) - gapOn(d - 1), d];
        // 차이가 없었으면(비김 등) 지어낸 문장 대신 넘어감
        if (best > 0) out.push({ icon: 'flame', title: `${bd + 1}일차에 차이가 벌어졌어요`, text: `${josa(champ.nickname, '이', '가')} 처음부터 1위를 지키며 하루에 ${wonShort(best)} 더 달아났어요`, day: bd });
      }
      const tieEnd = gapOn(days - 1) === 0;
      // 기권으로 끝난 판: 남은 사람이 한 명이면 재산이 같아도 비긴 게 아님
      const stayers = results.filter((r) => !r.left);
      const byForfeit = stayers.length === 1 && !stayers[0].idle;
      const noContest = stayers.length > 0 && stayers.every((r) => r.idle);
      // 끝까지 거래한 사람이 한 명뿐이면(나머지는 거래 0번) 위 결과 띠가 이미 말해 줌 → 이 카드는 건너뜀
      if (byForfeit || noContest || pool.length >= 2) out.push({
        icon: 'refresh',
        title: '1위 다툼',
        text: byForfeit
          ? `${josa(stayers[0].nickname, '이', '가')} 끝까지 남아 이겼어요 (${results.length > 2 ? '다른 사람들' : '상대'} 기권)`
          : noContest
            ? '거래한 사람이 없어서 승부가 나지 않았어요'
            : tieEnd
            ? '마지막 날까지 똑같아서 비겼어요'
            : changes
              ? `1위가 ${changes}번 바뀌었어요`
              : `${josa(champ.nickname, '이', '가')} 끝까지 1위였어요`,
      });
    }
    // 3명 이상이면 사람마다 최고·최악의 날을 다 보이면 카드가 10장 가까이 됨 → 1위와 나만 (나머지는 하루별 리플레이에)
    const who = results.length > 2 ? results.filter((r) => r.id === ranked[0]?.id || r.id === session.playerId) : results;
    for (const r of who) {
      let best = 0;
      let bd = 0;
      let worst = 0;
      let wd = 0;
      for (let d = 0; d < days; d++) {
        const dv = r.hist[d + 1] - r.hist[d];
        if (dv > best) [best, bd] = [dv, d];
        if (dv < worst) [worst, wd] = [dv, d];
      }
      // 그날 변화의 절반 넘게가 용돈 봉투 때문이면 뉴스 대신 그 이유를 보여 줌 (뉴스 덕분처럼 보이지 않게)
      const why = (d: number, dv: number) => {
        const b = r.bonusOn[d] ?? 0;
        // (v27) 증강으로 그날 들어온(나간) 돈
        const g = (final.augIncome?.[r.id] ?? []).filter((x) => x.day === d).reduce((sum, x) => sum + x.amount, 0);
        if (g !== 0 && Math.sign(g) === Math.sign(dv) && Math.abs(g) * 2 >= Math.abs(dv)) return `증강으로 ${g > 0 ? '+' : ''}${wonShort(g)}`;
        return b !== 0 && Math.sign(b) === Math.sign(dv) && Math.abs(b) * 2 >= Math.abs(dv) ? `용돈 봉투로 ${b > 0 ? '+' : ''}${wonShort(b)}` : undefined;
      };
      if (best > 0) out.push({ icon: 'trend', title: `${r.nickname}의 최고의 날`, text: `${bd + 1}일차 +${wonShort(best)}`, day: bd, note: why(bd, best) });
      if (worst < 0) out.push({ icon: 'warn', title: `${r.nickname}의 최악의 날`, text: `${wd + 1}일차 ${wonShort(worst)}`, day: wd, note: why(wd, worst) });
    }
    return out;
  }, [results, ranked, market, session.playerId, final.augIncome]);

  // 한 판 더 버튼 아래 작은 글: 판 설정 (예: 10일 · 하루 1분 / 신속 · 약 10~14분)
  const days = dayInfo?.days ?? market.totalDays;
  const sec = dayInfo?.daySec ?? 0;
  const secText = sec >= 60 ? `${Math.round(sec / 60)}분` : `${sec}초`;
  const setText = sec ? `${days}일 · 하루 ${secText}` : `${days}일`;
  const preset = Object.values(SPEED_PRESET).find((x) => x.days === days && x.turnSeconds === sec);
  const speedText = preset ? `${preset.label} · ${preset.minutes}` : setText;
  const me = results.find((r) => r.id === session.playerId)!;
  const myRank0 = rankOf(session.playerId);
  // 혼자 한 판: 한 번도 거래 안 했으면 시장이 내려도 '잘했어요'라고 하지 않음
  const soloWin = me.trades > 0 && me.tradeRet > indexRet;
  const iWon = winner?.id === session.playerId;
  // 이번 시장 성적: 처음엔 많이 오른 5개·많이 내린 5개만 (47종목을 다 펼치면 화면이 너무 길어짐)
  const [allStocks, setAllStocks] = useState(false);
  const shortRank = stockRank.length > 12 && !allStocks;
  const shownRank = shortRank ? [...stockRank.slice(0, 5), ...stockRank.slice(-5)] : stockRank;
  // 창(탭) 제목: 라우터는 '게임 중'으로 두므로 결과 화면에선 '결과'
  useEffect(() => {
    const prev = document.title;
    document.title = '결과 · 개미리그';
    // 같은 주소에서 한 판 더(연습) 하면 라우터가 제목을 안 바꾸므로 나갈 때 되돌림
    return () => {
      document.title = prev;
    };
  }, []);

  // 화면 조각 (PC 는 한 줄로, 휴대폰은 칩 + 좌우로 넘기는 5칸 — 설계서 design/v24-big-update.md B)
  const bannerEl = <>
      <div className={'banner ' + (solo ? (soloWin ? 'win' : '') : winner ? (iWon ? 'win' : 'lose') : 'draw')}>
        {solo ? (
          <>
            <div className="crown"><Icon name={soloWin ? 'trophy' : 'activity'} size={40} /></div>
            <h1>{matchKind === 'daily' ? '오늘의 도전 끝!' : '연습 끝!'}</h1>
            <p>{me.trades === 0 ? '한 번도 사고팔지 않았어요. 다음엔 종목을 사 보세요!' : soloWin ? '시장보다 잘했어요!' : '이번엔 시장보다 조금 아쉬웠어요'}</p>
          </>
        ) : results.length < 2 ? (
          <h1>상대 기록을 불러오지 못했어요</h1>
        ) : winner ? (
          <>
            <div className="crown"><Icon name="crown" size={40} /></div>
            <h1>{winner.nickname} 승리!</h1>
            <p>
              {/* 내가 기권했으면 '상대가 기권해서 이겼어요'가 아니라 내 기권을 알려 줌 */}
              {ranked.find((r) => r.id === session.playerId)?.left
                ? `기권해서 이 판은 마지막 순위예요 · 나는 ${rankOf(session.playerId) + 1}위`
                : ranked.find((r) => r.id === session.playerId)?.idle
                ? `거래를 한 번도 안 해서 순위 맨 뒤예요 · 나는 ${rankOf(session.playerId) + 1}위`
                : <>
                    {ranked.slice(1).every((r) => back(r) > 0)
                      ? ranked.length > 2
                        ? ranked.slice(1).every((r) => r.left) ? '다른 사람들이 모두 기권해서 이겼어요' : '다른 사람들이 기권했거나 거래를 안 해서 이겼어요'
                        : ranked[1].idle ? '상대가 거래를 한 번도 안 해서 이겼어요' : '상대가 기권해서 이겼어요'
                      : `2위와 ${wonShort(Math.abs(ranked[0].equity - ranked[1].equity))} 차이`}{' '}
                    · {iWon ? '이번 판 1등이에요' : `나는 ${rankOf(session.playerId) + 1}위 · 다음 판에 다시 도전해 봐요`}
                  </>}
            </p>
          </>
        ) : stay.length === 0 ? (
          // 남은 사람이 모두 기권했거나 거래가 없음(매칭) — '재산이 같아서 무승부'가 아니라 승부가 없는 판
          <>
            <div className="crown"><Icon name="users" size={40} /></div>
            <h1>승부가 나지 않았어요</h1>
            <p>
              {ranked.find((r) => r.id === session.playerId)?.idle && ranked.some((r) => r.left && r.id !== session.playerId)
                ? `${results.length > 2 ? '다른 사람들이' : '상대가'} 기권했지만 나도 거래를 한 번도 안 해서 승리로 치지 않아요`
                : '거래한 사람이 없어서 이번 판은 승부가 없어요'}
            </p>
          </>
        ) : (
          <>
            <div className="crown"><Icon name="users" size={40} /></div>
            <h1>무승부!</h1>
            <p>{results.length > 2 ? '재산이 똑같아서 1위가 여러 명이에요' : '두 사람 재산이 똑같아요'} · 다음 판에서 승부를 가려 봐요</p>
          </>
        )}
      </div>
    </>;
  // 가장 크게: 내 수익률 하나 + 시장·상대와 나란히 비교 (결과 화면 사례 공통)
  const rival = solo ? null : ranked.find((r) => r.id !== session.playerId && (myRank0 === 0 || rankOf(r.id) === 0)) ?? null;
  const gain = me.equity - me.equity / (1 + me.ret);
  const vsMarket = (me.tradeRet - indexRet) * 100;
  // 공유 카드의 날마다 오름·내림 칸: 증강으로 들어온 돈은 빼고 (투자로 번 날만 빨강)
  const myAug = final.augIncome?.[me.id] ?? [];
  const tradeDeltas = me.hist.slice(1).map((v, d) => v - me.hist[d] - myAug.filter((x) => x.day === d).reduce((sum, x) => sum + x.amount, 0));
  const heroEl = (
    <div className="panel rs-hero">
      <span className="rh-rank">{solo ? (matchKind === 'daily' ? '오늘의 도전' : '연습') + ' · 내 수익률' : `${myRank0 + 1}위 · ${results.length}명 중`}</span>
      <b className={'rh-ret ' + tone(me.ret)}>{pct(me.ret)}</b>
      <span className="rh-won">
        {won(me.equity)} <em className={tone(gain)}>({gain >= 0 ? '+' : '−'}{wonShort(Math.abs(gain))})</em>
      </span>
      <div className="rh-cmp">
        <span>
          종합지수 <b className={tone(indexRet)}>{pct(indexRet)}</b>
        </span>
        {rival && (
          <span>
            {rankOf(rival.id) === 0 ? '1위 ' : ''}
            {rival.nickname} <b className={tone(rival.ret)}>{pct(rival.ret)}</b>
          </span>
        )}
      </div>
      {/* 한 번도 안 샀으면 시장이 내려 '앞섰다'고 해도 잘한 게 아님 */}
      {me.trades > 0 && <small className="rh-note">
        시장보다 <b className={tone(vsMarket)}>{vsMarket >= 0 ? '+' : ''}{vsMarket.toFixed(1)}%p</b> {vsMarket >= 0 ? '앞섰어요' : '뒤졌어요'}{me.augSum !== 0 && <span className="muted small"> (증강으로 받은 돈 빼고)</span>}
      </small>}
    </div>
  );
  const cardsEl = <>
      <div className="score-cards">
        {ranked.map((r) => {
          const i = results.indexOf(r);
          return (
          <div key={r.id} className={'panel score-card' + (winner?.id === r.id ? ' champ' : '')} style={{ borderTopColor: COLORS[i] }}>
            <small style={{ color: COLORS[i] }}>
              {!solo && <span className="medal">{rankBadge(rankOf(r.id))}</span>}
              {r.left && <span className="left-tag">기권</span>}
              {r.nickname}
              {titleOf(final.badges[r.id] ?? []) && <span className="title-tag"><BadgeIcon id={titleOf(final.badges[r.id] ?? [])!.id} size={13} /> {titleOf(final.badges[r.id] ?? [])!.name}</span>}
            </small>
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
              {!final.augs && (
                <>
                  <dt>쓴 카드</dt>
                  <dd>{r.used.length ? r.used.map(([k, n]) => `${ITEM_MAP[k]?.name ?? k}${n > 1 ? '×' + n : ''}`).join(', ') : '-'}</dd>
                </>
              )}
              {r.pf.itemSpend > 0 && (
                <>
                  <dt>카드 구입비</dt>
                  <dd>{wonShort(r.pf.itemSpend)}</dd>
                </>
              )}
              {r.fakesReceived > 0 && (
                <>
                  <dt>받은 가짜 뉴스</dt>
                  <dd>{r.fakesReceived}개</dd>
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
          );
        })}
      </div>
    </>;
  const augEl = final.augs ? <AugReveal players={final.players} augs={final.augs} income={final.augIncome} /> : null;
  const badgesEl = <>{augEl}
      <div className="panel pad">
        <h3>이번 판 업적</h3>
        {/* 봇은 업적을 모으지 않으니 사람 것만 (봇 업적에 내 업적이 묻히지 않게) */}
        <div className="badge-cols" style={{ ['--cols' as string]: balancedCols(results.filter((r) => !botIds.has(r.id)).length) }}>
          {results.map((r, i) => botIds.has(r.id) ? null : (
            <div key={r.id}>
              {results.length - botIds.size > 1 && <small style={{ color: COLORS[i] }}>{r.nickname}</small>}
              <div className="badges">
                {(final.badges[r.id] ?? []).length === 0 && <span className="muted small">이번엔 없어요</span>}
                {(final.badges[r.id] ?? []).map((id, k) => {
                  const b = BADGE_MAP[id];
                  // 배포 중에 열어 둔 창이면 새 업적 id 를 모를 수 있음 → 그 칸만 건너뜀
                  if (!b) return null;
                  return (
                    <span key={id} className={'badge r' + b.rarity} title={b.desc} style={{ ['--k' as string]: k }}>
                      <i><BadgeIcon id={b.id} /></i>
                      <b>{b.name}</b>
                      <small>{b.desc}</small>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* 혼자 연습(브라우저 판)은 기록·업적·경험치가 서버에 남지 않음 — 어디서 모이는지 알려 줌 */}
        {session.mode === 'solo' && !session.tutorial && <p className="muted small rw-note">연습 판은 업적·경험치가 기록에 남지 않아요. 봇전이나 대결에서 쌓여요.</p>}
      </div>
    </>;
  // 나의 결정적 순간 — 판이 끝나 공개된 뉴스 진위·내 거래만으로 (잡은·피한·속은·놓친)
  const moments = useMemo(() => keyMoments(market, final.trades.filter((t) => t.player_id === session.playerId), last), [market, final.trades, session.playerId, last]);
  const MOMENT_ICON: Record<string, IconName> = { caught: 'trend', dodged: 'shield', fooled: 'warn', missed: 'target' };
  const momentsEl = moments.length > 0 && (
    <div className="panel pad km-panel">
      <h3>나의 결정적 순간</h3>
      <div className="km-list">
        {moments.map((k, i) => (
          <button key={i} className={'km-card km-' + k.kind} style={{ ['--k' as string]: i }} onClick={() => setReplayDay(k.day)}>
            <span className="km-icon"><Icon name={MOMENT_ICON[k.kind]} size={18} /></span>
            <b>{k.title}</b>
            <span>{k.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
  // 실제 시장에서는? — 그 판에 있었던 사건을 실제 시장 지식으로 (끝난 판의 공개 뉴스 제목만)
  // 테마 카드가 이미 설명하는 사건은 빼고 (같은 이야기 두 번 안 함)
  const lessons = useMemo(() => realLessons(market.news, last, 3).filter((l) => l.kind !== theme).slice(0, 2), [market.news, last, theme]);
  const lessonsEl = (lessons.length > 0 || !!theme) && (
    <div className="panel pad rw-panel">
      <h3>실제 시장에서는?</h3>
      <ThemeCard id={theme} lesson />
      <div className="km-list">
        {lessons.map((l, i) => (
          <button key={l.kind} className="km-card rw-card" style={{ ['--k' as string]: i + moments.length }} onClick={() => setReplayDay(l.day)}>
            <b>{l.title}</b>
            <span>{l.text}</span>
            <small className="muted">{l.day + 1}일차 소식 다시 보기</small>
          </button>
        ))}
      </div>
    </div>
  );
  const highlightsEl = <>
      {highlights.length > 0 && (
      <div className="panel pad">
        <h3>하이라이트</h3>
        <div className="hl-grid" style={{ ['--cols' as string]: balancedCols(highlights.length) }}>
          {highlights.map((h, i) => (
            <button key={i} className="hl-card" onClick={() => h.day !== undefined && setReplayDay(h.day)}>
              <span className="hl-icon"><Icon name={h.icon as IconName} size={18} /></span>
              <b>{h.title}</b>
              <span>{h.text}</span>
              {h.note ? <small className="muted"><CardIcon kind="bonus" size={12} /> {h.note}</small> : h.day !== undefined && <small className="muted"><Icon name="news" size={12} /> {headline(h.day)}</small>}
            </button>
          ))}
        </div>
      </div>
      )}
    </>;
  const replayEl = <>
      <div className="panel pad">
        <h3>하루별 리플레이</h3>
        <div className="replay">
          {Array.from({ length: market.totalDays }, (_, d) => {
            const deltas = results.map((r) => r.hist[d + 1] - r.hist[d]);
            const leader = results.reduce((a, r, i) => (r.hist[d + 1] > results[a].hist[d + 1] ? i : a), 0);
            return (
              <button key={d} className={'rp-day' + (replayDay === d ? ' on' : '')} onClick={() => setReplayDay(d)}>
                <b>{d + 1}일</b>
                {deltas.map((v, i) => (
                  <span key={i} className={tone(v)} style={{ borderColor: COLORS[i] }}>
                    {v >= 0 ? '+' : ''}
                    {wonShort(v)}
                  </span>
                ))}
                {results.length >= 2 && <i className="rp-lead" style={{ background: COLORS[leader] }} />}
              </button>
            );
          })}
        </div>
        {replayDay !== null && (
          <div className="rp-detail">
            <b>{replayDay + 1}일차</b>
            <ul>
              {market.news
                .filter((n) => n.day === replayDay)
                .map((n, i) => (
                  <li key={i} className={n.tone}>
                    {n.headline}
                  </li>
                ))}
            </ul>
            <div className="rp-eq">
              {results.map((r, i) => (
                <span key={r.id}>
                  <i style={{ background: COLORS[i] }} /> {r.nickname} {wonShort(r.hist[replayDay + 1])}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>;
  const chartEl = <>
      <div className="panel pad">
        <h3>자산 추이</h3>
        {/* 혼자 한 판이면 '나' 하나뿐이라 범례를 숨김 */}
        {results.length > 1 && (
        <div className="legend">
          {results.map((r, i) => (
            <span key={r.id}>
              <i style={{ background: COLORS[i] }} /> {r.nickname}
            </span>
          ))}
        </div>
        )}
        <LineChart
          series={results.map((r, i) => ({ values: r.hist.slice(1), color: COLORS[i] }))}
          totalDays={market.totalDays}
          // 넓은 화면에선 납작하게 (가로 비율 그대로 커지면 PC 에서 세로 800px 가까이 됐음)
          height={wide ? 170 : 240}
          refLine={{ value: START_CASH, label: `시작 ${START_CASH >= 10_000_000 ? '1,000만원' : '100만원'}` }}
          fmt={(v) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e7 ? `${Math.round(v / 1e4).toLocaleString('ko-KR')}만` : `${(Math.round(v / 1e3) / 10).toLocaleString('ko-KR')}만`)}
          fill={false}
        />
      </div>
    </>;
  const marketEl = <>
      <div className="panel pad">
        <h3>
          이번 시장 성적 <span className="muted small">종합지수 {pct(indexRet)}</span>
        </h3>
        <div className={"stock-rank" + (shortRank ? " split" : "")}>
          {shownRank.map(({ s, r }) => (
            <div key={s.symbol}>
              <span>
                <SectorIcon id={s.sector} /> {s.name}
              </span>
              <b className={tone(r)}>{pct(r, 1)}</b>
            </div>
          ))}
        </div>
        {stockRank.length > 12 && (
          <button className="btn ghost sm stock-rank-more" onClick={() => setAllStocks((v) => !v)} aria-expanded={allStocks}>
            {allStocks ? '많이 오르고 내린 5개씩만 보기' : `전체 ${stockRank.length}개 종목 보기`}
          </button>
        )}
      </div>
    </>;
  const ratingEl = <>
      {rankedGame && (
        <div className="rating-change">
          {rating?.rated && rating.rating_before !== null && rating.rating_after !== null ? (
            !isPlaced(rating.ranked_games) ? (
              // 배치 중: 점수는 숨김
              <span>
                배치 <b>{rating.ranked_games ?? 0}/{PLACEMENT_GAMES}</b> 완료 · 한 판 더 하면 티어가 정해져요
              </span>
            ) : (rating.ranked_games ?? 0) === PLACEMENT_GAMES ? (
              <>
                <span>배치 완료!</span>
                <TierBadge rating={rating.rating_after} rankedGames={PLACEMENT_GAMES} size={40} />
              </>
            ) : (
              <>
                <TierBadge rating={rating.rating_after} rankedGames={PLACEMENT_GAMES} size={34} />
                <em className={rating.rating_after >= rating.rating_before ? 'up' : 'down'}>
                  {rating.rating_after >= rating.rating_before ? '+' : ''}
                  {rating.rating_after - rating.rating_before}점
                </em>
                {tierOf(rating.rating_after).label !== tierOf(rating.rating_before).label && (
                  <b className={rating.rating_after > rating.rating_before ? 'up' : 'down'}>{rating.rating_after > rating.rating_before ? '승급!' : '강등'}</b>
                )}
              </>
            )
          ) : rating ? (
            <span className="muted">이번 판은 랭킹 점수에 반영되지 않았어요</span>
          ) : ratingGone ? (
            <span className="muted">점수는 마이프로필에서 확인할 수 있어요</span>
          ) : (
            <span className="muted">랭킹 점수를 계산하고 있어요…</span>
          )}
        </div>
      )}
    </>;
  const dailyEl = matchKind === 'daily' ? <DailyResult room={session.roomId ?? undefined} /> : null;
  const restEl = <>
      {/* 서버 판이 끝나면 미션이 확인됨 (연습은 이 기기 판이라 안 셈) */}
      {session.mode === 'multi' && <MissionsPanel retry={2} room={session.roomId ?? undefined} />}
      {session.mode === 'multi' && <IdleExit onExit={onExit} />}
    </>;
  const actionsEl = <>
      <div className="center-actions">
        {matchKind === 'match' && party && onBackToParty ? (
          // 파티로 한 판: 롤처럼 파티로 돌아가서, 모두 돌아오면 파티장이 다시 찾기
          <>
            {!party.isLeader && party.searching && <p className="rematch-note">파티장이 다시 찾고 있어요. 파티로 가면 같이 찾아요</p>}
            <button className="btn primary xl again-btn" onClick={onBackToParty}>
              <b>파티로 돌아가기</b>
              <small>{party.isLeader ? '모두 돌아오면 다시 찾을 수 있어요' : '파티장이 다시 찾기를 눌러요'}</small>
            </button>
            <button className="btn ghost" onClick={onExit}>
              홈으로
            </button>
          </>
        ) : matchKind === 'match' && onFindAgain ? (
          <>
            <button className="btn primary xl again-btn" onClick={onFindAgain}>
              <b>{(rankedGame ? '랭킹전' : '일반전') + ' ' + (final.players.length > 2 ? '다인전' : '1대1')} 다시 찾기</b>
              <small>{speedText}</small>
            </button>
            <button className="btn ghost" onClick={onExit}>
              홈으로
            </button>
          </>
        ) : onRematch ? (
          <>
            {nextCode && <p className="rematch-note">다시 하기 방이 열렸어요! 같은 설정으로 바로 붙어요</p>}
            <button className="btn primary xl again-btn" onClick={rematch} disabled={rematching}>
              {rematching ? '방으로 가는 중…' : <><b>{matchKind === 'bot' ? '같은 봇과 한 판 더' : nextCode ? '다시 하기 방으로' : '이 사람들과 한 판 더'}</b><small>{final.players.length}명 · {setText}</small></>}
            </button>
            <button className="btn ghost" onClick={onExit}>
              홈으로
            </button>
            {rematchErr && <p className="error">{rematchErr}</p>}
          </>
        ) : (
          <>
            {onReplay && (
              <button className="btn primary xl again-btn" onClick={onReplay}>
                <b>연습 한 판 더</b>
                <small>{setText}</small>
              </button>
            )}
            <button className={'btn xl' + (onReplay ? ' ghost' : ' primary')} onClick={onExit}>
              홈으로
            </button>
          </>
        )}
      </div>
    </>;
  const myRank = rankOf(session.playerId);

  // PC: 넓으면 두 칸 — 왼쪽 '무슨 일이 있었나', 오른쪽 '무엇을 얻었나' (좁으면 CSS 가 한 줄로 쌓음)
  if (wide)
    return (
      <div className="result rs-wide">
        {bannerEl}
        <div className="rs-cols">
          <div className="rs-main">
            {heroEl}
            {momentsEl}
            {chartEl}
            {lessonsEl}
            {highlightsEl}
            {replayEl}
            {marketEl}
          </div>
          <aside className="rs-side">
            {!solo && cardsEl}
            {ratingEl}
            {badgesEl}
            {session.mode !== 'solo' && <GuestSave won={iWon} badges={(final.badges[session.playerId] ?? []).length} />}
            {dailyEl}
            {restEl}
            {matchKind === 'daily' && <ShareCard kind="오늘의 도전" rank={null} players={1} ret={me.ret} days={market.totalDays} daily={tradeDeltas} isDaily room={session.roomId ?? undefined} />}
          </aside>
        </div>
        {actionsEl}
      </div>
    );

  return (
    <div className="result slides">
      <ResultSlides
        slides={[
          { key: 'sum', label: '요약', body: <>{bannerEl}{heroEl}{ratingEl}{momentsEl}</> },
          { key: 'review', label: '복기', body: <>{lessonsEl}{highlightsEl}{replayEl}</> },
          // 혼자 한 판은 순위 대신 '시장'(나 대 종합지수), 오늘의 도전은 점수표(순위·연속 기록)
          solo && matchKind !== 'daily'
            ? { key: 'rank', label: '시장', body: <>{chartEl}{marketEl}</> }
            : { key: 'rank', label: '순위', body: <>{dailyEl}{!solo && cardsEl}{chartEl}{marketEl}</> },
          { key: 'reward', label: '보상', body: <>{badgesEl}{session.mode !== 'solo' && <GuestSave won={iWon} badges={(final.badges[session.playerId] ?? []).length} />}{restEl}</> },
          {
            key: 'share',
            label: '공유',
            body: (
              <ShareCard
                kind={matchKind === 'daily' ? '오늘의 도전' : matchKind === 'bot' ? '봇전' : solo ? '연습' : rankedGame ? '랭킹전' : '대결'}
                rank={solo ? null : myRank + 1}
                players={results.length}
                ret={me.ret}
                days={market.totalDays}
                daily={tradeDeltas}
                isDaily={matchKind === 'daily'}
              />
            ),
          },
        ]}
      />
      {actionsEl}
    </div>
  );
}

/**
 * 결과 화면에서 한동안(3분) 아무것도 안 하면 홈으로.
 * 결과 화면도 8초마다 서버에 '한 판 더' 방을 묻고 있어서, 켜 둔 채 자리를 비우면 요청이 계속 나감.
 * 누르기·스크롤·키 입력이 있으면 처음부터 다시 셈. 마지막 20초는 아래에 안내 + '더 보기'
 */
const IDLE_MS = 180_000;
const WARN_MS = 20_000;
function IdleExit({ onExit }: { onExit: () => void }) {
  const last = useRef(Date.now());
  const [left, setLeft] = useState(IDLE_MS);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useEffect(() => {
    const bump = () => (last.current = Date.now());
    const evs = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const t = setInterval(() => {
      const l = IDLE_MS - (Date.now() - last.current);
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        setFlash('결과 화면에 오래 머물러 홈으로 돌아왔어요. 전적은 업적 화면에 남아 있어요');
        exitRef.current();
      }
    }, 1000);
    return () => {
      clearInterval(t);
      evs.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
    };
  }, []);
  if (left > WARN_MS) return null;
  return (
    <div className="idle-exit" role="status">
      <span>{Math.max(1, Math.ceil(left / 1000))}초 뒤 홈으로 돌아가요</span>
      <button className="btn sm" onClick={() => ((last.current = Date.now()), setLeft(IDLE_MS))}>
        더 보기
      </button>
    </div>
  );
}

/**
 * (휴대폰) 결과를 칸으로 나눠 위 칩으로 바로 가거나 좌우로 넘김 (설계서 v24 B — 넘기기만으로는 칸을 잘 못 찾으므로 칩이 기본).
 * 브라우저의 가로 스크롤 맞춤(scroll-snap)을 써서 손가락으로 넘기기·키보드 모두 됨. 칸 안 가로 목록은 끝에서 칸이 넘어가지 않게(overscroll contain)
 */
function ResultSlides({ slides }: { slides: { key: string; label: string; body: React.ReactNode }[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const go = (i: number) => {
    const t = track.current;
    if (!t) return;
    t.scrollTo({ left: i * t.clientWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setAt(i);
    window.scrollTo({ top: 0 });
  };
  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
    if (i !== at) setAt(i);
  };
  return (
    <>
      <div className="rs-chips" role="tablist" aria-label="결과 보기">
        {slides.map((s, i) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={at === i}
            aria-controls={'rs-' + s.key}
            className={'rs-chip' + (at === i ? ' on' : '')}
            onClick={() => go(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(Math.min(slides.length - 1, i + 1));
              if (e.key === 'ArrowLeft') go(Math.max(0, i - 1));
            }}
          >
            {s.label}
          </button>
        ))}
        <span className="rs-pos" aria-hidden>
          {at + 1}/{slides.length}
        </span>
      </div>
      <div className="rs-track" ref={track} onScroll={onScroll}>
        {slides.map((s, i) => (
          <section key={s.key} id={'rs-' + s.key} role="tabpanel" aria-label={s.label} className={"rs-slide" + (at === i ? " on" : "")}>
            {s.body}
          </section>
        ))}
      </div>
    </>
  );
}

/** 공유 카드: 결과만 (종목·보유는 안 나옴 — 다른 사람에게 판 내용이 새지 않게). 날마다 오르면 🟥 내리면 🟦 */
/**
 * 결과 나누기 카드 (워들처럼 — 종목·가격 없이 날마다 오름 빨강·내림 파랑 칸만).
 * 오늘의 도전은 모두 같은 시장이라 '상위 n%'·연속 기록을 함께 (서버가 준 내 순위·전체 수만)
 */
function ShareCard({ kind, rank, players, ret, days, daily, isDaily = false, room }: { kind: string; rank: number | null; players: number; ret: number; days: number; daily: number[]; isDaily?: boolean; room?: string }) {
  const { info } = useDailyInfo(isDaily, room);
  const top = isDaily && info?.myRank && info.total ? Math.max(1, Math.ceil((info.myRank / info.total) * 100)) : null;
  const streak = isDaily && info?.streak && info.streak.streak > 1 ? info.streak.streak : 0;
  // 자정을 넘겨 끝낸 판은 시작한 날짜로 (그날 시장 기록)
  const md = isDaily && info?.past && /^\d{4}-\d{2}-\d{2}$/.test(info.day) ? `${+info.day.slice(5, 7)}/${+info.day.slice(8, 10)}` : new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).replace(/\.\s?/g, '/').replace(/\/$/, '');
  const bar = daily.map((v) => (v > 0 ? '🟥' : v < 0 ? '🟦' : '⬜')).join('');
  const slang = ret >= 0.2 ? '떡상' : ret >= 0.05 ? '익절' : ret > -0.05 ? '존버' : ret > -0.2 ? '물림' : '손절각';
  const head = isDaily ? `개미리그 오늘의 도전 ${md}${top ? ` · 상위 ${top}%` : ''}${streak ? ` · ${streak}일 연속` : ''}` : `개미리그 ${kind}${rank ? ` ${rank}위/${players}명` : ''} · ${days}일`;
  // 오늘의 도전은 모두 같은 시장이라 비교가 됨 → 한마디 붙이고 연습 메뉴(도전이 있는 곳) 주소로
  const body = [head, `수익률 ${pct(ret)} (${slang})`, bar, ...(isDaily ? ['너는 몇 %?'] : [])];
  const text = [...body, location.origin + (isDaily ? '/learn' : '')].join('\n');
  const [done, setDone] = useState('');
  const share = async () => {
    const r = await shareOrCopy({ text });
    if (r === 'copied') setDone('결과를 복사했어요. 원하는 곳에 붙여 넣으세요.');
    else if (r === 'fail') setDone('복사하지 못했어요. 이 브라우저에서는 공유가 막혀 있어요.');
  };
  return (
    <div className="panel pad share-card">
      <h3>결과 공유</h3>
      <div className="sc-card">
        <b className="sc-kind">개미리그 · {kind}</b>
        {top ? <strong className="sc-rank">상위 {top}%<small> · 오늘 {info?.total}명</small></strong> : rank ? <strong className="sc-rank">{rank}위<small> / {players}명</small></strong> : null}
        {streak ? <span className="sc-slang">{streak}일 연속 도전 중</span> : null}
        <span className={'sc-ret ' + tone(ret)}>{pct(ret)}</span>
        <span className="sc-slang">{slang}</span>
        <span className="sc-bar" aria-label="날마다 재산이 오르면 빨강, 내리면 파랑">{bar}</span>
        <small className="muted">어떤 종목을 샀는지는 나오지 않아요</small>
      </div>
      <button className="btn" onClick={share}>
        공유하기
      </button>
      {/* 단체방에 링크 미리보기가 매번 뜨는 게 싫은 사람용 */}
      <button className="btn text small" onClick={async () => setDone((await copyText(body.join('\n'))) ? '글자만 복사했어요 (링크 없이).' : '복사하지 못했어요.')}>
        링크 빼고 글자만 복사
      </button>
      {done && <p className="muted small" role="status">{done}</p>}
    </div>
  );
}

/**
 * 게스트에게 좋은 순간(이겼거나 업적을 땄을 때)에만 가입 권유 (막지 않기, 한 번에 한 번, 두 번 닫으면 그만).
 * 게스트 기록은 이 기기에만 있어서 기기를 바꾸거나 지우면 사라짐 — 사실 그대로 알림
 */
function GuestSave({ won, badges }: { won: boolean; badges: number }) {
  const acc = useAccount();
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem('stockduel.saveNudge') ?? 0) >= 2 || sessionStorage.getItem('stockduel.saveNudgeSeen') === '1';
    } catch {
      return false;
    }
  });
  if (acc.status !== 'guest' || hidden || (!won && badges === 0)) return null;
  const close = () => {
    try {
      localStorage.setItem('stockduel.saveNudge', String(Number(localStorage.getItem('stockduel.saveNudge') ?? 0) + 1));
      sessionStorage.setItem('stockduel.saveNudgeSeen', '1');
    } catch {
      /* */
    }
    setHidden(true);
  };
  const signup = () => {
    try {
      sessionStorage.setItem('stockduel.saveNudgeSeen', '1');
    } catch {
      /* */
    }
    history.pushState({ kind: 'lobby', page: 'signup' }, '', '/signup');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { kind: 'lobby', page: 'signup' } }));
  };
  return (
    <div className="panel pad guest-save">
      <b>{won ? '이번 승리' : '이번 업적'}, 계속 남기고 싶다면</b>
      <p className="muted small">게스트 기록은 이 기기에만 있어서 기기를 바꾸거나 기록을 지우면 사라지고, 사흘 동안 활동이 없으면 자동으로 지워져요. 회원가입하면 지금 기록 그대로 옮겨지고 랭킹전·친구·칭호도 쓸 수 있어요.</p>
      <div className="row">
        <button className="btn sm" onClick={signup}>
          회원가입하고 기록 남기기
        </button>
        <button className="btn ghost sm" onClick={close}>
          나중에
        </button>
      </div>
    </div>
  );
}
