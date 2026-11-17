import { api } from '../net/api';
import { balancedCols } from '../components/ui';
import { TierBadge } from '../components/TierBadge';
import { isPlaced, PLACEMENT_GAMES, tierOf } from '../game/tier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeIcon, CardIcon, Icon, SectorIcon, type IconName } from '../components/Icon';
import { LineChart } from '../components/Chart';
import { BADGE_MAP, titleOf } from '../game/achievements';
import { PLAYER_COLORS } from '../components/Board';
import { josa, type View } from '../engine/engine';
import { deriveItems, ITEM_MAP, spendsFromRows, type ItemKind } from '../game/items';
import { KR_INDEX_BASE, type Market } from '../game/market';
import { computePortfolio, equityHistory, startCashFor } from '../game/portfolio';
import { STOCK_MAP, STOCKS } from '../game/stocks';
import { pct, tone, won, wonShort } from '../lib/format';
import { SPEED_PRESET } from '../engine/matching';
import { play } from '../lib/sound';
import type { Session } from '../session';
import { DailyResult } from '../components/Daily';
import { MissionsPanel } from '../components/Missions';

interface Props {
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

export function ResultScreen({ session, market, final, onExit, nextCode, onRematch, matchKind, ranked: rankedGame, onFindAgain, onReplay, dayInfo, party, onBackToParty }: Props) {
  // 랭킹전: 내 점수 변화 (회원만 — 서버가 반영한 값)
  const [rating, setRating] = useState<{ rated: boolean; rating_before: number | null; rating_after: number | null; ranked_games?: number } | null>(null);
  const [ratingGone, setRatingGone] = useState(false);
  useEffect(() => {
    if (session.mode !== 'multi' || !session.roomId) return;
    let n = 0;
    const load = () =>
      api<typeof rating>('myMatch', { roomId: session.roomId })
        .then((r) => (r ? setRating(r) : n++ < 5 ? setTimeout(load, 1500) : setRatingGone(true)))
        .catch(() => setRatingGone(true));
    load();
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

  const results = useMemo(() => {
    const people = [...final.players].sort((a, b) => (a.id === session.playerId ? -1 : b.id === session.playerId ? 1 : 0));
    const items = deriveItems(final.seed, final.players.map((p) => p.id), final.items, last, market.totalDays, final.players.length < 2, market.version ?? 1);
    return people.map((p) => {
      const trades = final.trades.filter((t) => t.player_id === p.id);
      const spends = spendsFromRows(final.items.filter((r) => r.player_id === p.id));
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
      return { id: p.id, nickname: p.nickname, left: !!p.left, bonusOn, equity, ret: equity / START_CASH - 1, hist, trades: trades.length, pf, best, worst, used, fakesReceived };
    });
  }, [final, session.playerId, market, last, START_CASH]);

  // 기권한 사람은 재산과 상관없이 뒤로 — 상대가 기권하면 남은 사람이 이김
  const ranked = [...results].sort((a, b) => Number(a.left) - Number(b.left) || b.equity - a.equity);
  const stay = ranked.filter((r) => !r.left);
  const winner = ranked.length >= 2 && stay.length >= 1 && (stay.length === 1 || stay[0].equity !== stay[1].equity) ? stay[0] : null;
  // 같은 재산이면 같은 순위 (비기면 둘 다 1위)
  const rankOf = (id: string) => {
    const me = ranked.find((r) => r.id === id);
    if (!me) return 0;
    // 기권한 사람은 끝까지 한 사람들 뒤
    if (me.left) return ranked.filter((r) => !r.left).length + ranked.filter((r) => r.left && r.equity > me.equity).length;
    return ranked.filter((r) => !r.left && r.equity > me.equity).length;
  };

  const played = useRef(false);
  useEffect(() => {
    if (played.current || solo) return;
    played.current = true;
    play(winner?.id === session.playerId ? 'win' : 'lose');
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
    if (results.length >= 2) {
      // 날마다 1위가 누구였는지
      const leaderOn = (d: number) => results.reduce((a, r) => (r.hist[d + 1] > a.hist[d + 1] ? r : a), results[0]);
      const gapOn = (d: number) => {
        const v = results.map((r) => r.hist[d + 1]).sort((x, y) => y - x);
        return v[0] - v[1];
      };
      let changes = 0;
      for (let d = 1; d < days; d++) if (leaderOn(d).id !== leaderOn(d - 1).id) changes++;
      const champ = leaderOn(days - 1);
      let takeDay = -1;
      for (let d = 1; d < days; d++) if (leaderOn(d).id === champ.id && leaderOn(d - 1).id !== champ.id) takeDay = d;
      if (takeDay >= 0) {
        out.push({ icon: 'flame', title: `${takeDay + 1}일차, 운명이 갈렸다`, text: `${josa(champ.nickname, '이', '가')} 1위로 올라선 뒤 끝까지 지켰어요`, day: takeDay });
      } else {
        let best = 0;
        let bd = 0;
        for (let d = 1; d < days; d++) if (gapOn(d) - gapOn(d - 1) > best) [best, bd] = [gapOn(d) - gapOn(d - 1), d];
        // 차이가 없었으면(비김 등) 지어낸 문장 대신 넘어감
        if (best > 0) out.push({ icon: 'flame', title: `${bd + 1}일차, 격차가 벌어졌다`, text: `${josa(champ.nickname, '이', '가')} 처음부터 1위를 지키며 하루에 ${wonShort(best)} 더 달아났어요`, day: bd });
      }
      const tieEnd = gapOn(days - 1) === 0;
      // 기권으로 끝난 판: 남은 사람이 한 명이면 재산이 같아도 비긴 게 아님
      const stayers = results.filter((r) => !r.left);
      const byForfeit = stayers.length === 1;
      out.push({
        icon: 'refresh',
        title: '1위 다툼',
        text: byForfeit
          ? `${josa(stayers[0].nickname, '이', '가')} 끝까지 남아 이겼어요 (${results.length > 2 ? '다른 사람들' : '상대'} 기권)`
          : tieEnd
            ? '마지막 날까지 똑같아서 비겼어요'
            : changes
              ? `1위가 ${changes}번 바뀌었어요`
              : `${josa(champ.nickname, '이', '가')} 끝까지 1위였어요`,
      });
    }
    for (const r of results) {
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
        return b !== 0 && Math.sign(b) === Math.sign(dv) && Math.abs(b) * 2 >= Math.abs(dv) ? `용돈 봉투로 ${b > 0 ? '+' : ''}${wonShort(b)}` : undefined;
      };
      if (best > 0) out.push({ icon: 'trend', title: `${r.nickname}의 최고의 날`, text: `${bd + 1}일차 +${wonShort(best)}`, day: bd, note: why(bd, best) });
      if (worst < 0) out.push({ icon: 'warn', title: `${r.nickname}의 최악의 날`, text: `${wd + 1}일차 ${wonShort(worst)}`, day: wd, note: why(wd, worst) });
    }
    return out;
  }, [results, market]);

  // 한 판 더 버튼 아래 작은 글: 판 설정 (예: 10일 · 하루 1분 / 신속 · 약 10~14분)
  const days = dayInfo?.days ?? market.totalDays;
  const sec = dayInfo?.daySec ?? 0;
  const secText = sec >= 60 ? `${Math.round(sec / 60)}분` : `${sec}초`;
  const setText = sec ? `${days}일 · 하루 ${secText}` : `${days}일`;
  const preset = Object.values(SPEED_PRESET).find((x) => x.days === days && x.turnSeconds === sec);
  const speedText = preset ? `${preset.label} · ${preset.minutes}` : setText;
  const me = results.find((r) => r.id === session.playerId)!;
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

  return (
    <div className="result">
      <div className={'banner ' + (solo ? (me.ret > indexRet ? 'win' : '') : winner ? (iWon ? 'win' : 'lose') : 'draw')}>
        {solo ? (
          <>
            <div className="crown"><Icon name={me.ret > indexRet ? 'trophy' : 'activity'} size={40} /></div>
            <h1>{matchKind === 'daily' ? '오늘의 도전 끝!' : '연습 끝!'}</h1>
            <p>
              내 수익률 <b className={tone(me.ret)}>{pct(me.ret)}</b> · 시장(지수) <b className={tone(indexRet)}>{pct(indexRet)}</b>
            </p>
            <p>{me.ret > indexRet ? '시장보다 잘했어요!' : '이번엔 시장이 이겼네요. 다시 도전!'}</p>
          </>
        ) : results.length < 2 ? (
          <h1>상대 기록을 불러오지 못했어요</h1>
        ) : winner ? (
          <>
            <div className="crown"><Icon name="crown" size={40} /></div>
            <h1>{winner.nickname} 승리!</h1>
            <p>
              {ranked.slice(1).every((r) => r.left)
                ? ranked.length > 2 ? '다른 사람들이 모두 기권해서 이겼어요' : '상대가 기권해서 이겼어요'
                : `2위와 ${wonShort(Math.abs(ranked[0].equity - ranked[1].equity))} 차이`}{' '}
              · {iWon ? '오늘의 투자왕!' : `나는 ${rankOf(session.playerId) + 1}위 · 다음 판엔 꼭 이겨봐요`}
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
              <dt>쓴 카드</dt>
              <dd>{r.used.length ? r.used.map(([k, n]) => `${ITEM_MAP[k].name}${n > 1 ? '×' + n : ''}`).join(', ') : '-'}</dd>
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

      <div className="panel pad">
        <h3><Icon name="medal" /> 이번 판 업적</h3>
        <div className="badge-cols" style={{ ['--cols' as string]: balancedCols(results.length) }}>
          {results.map((r, i) => (
            <div key={r.id}>
              <small style={{ color: COLORS[i] }}>{r.nickname}</small>
              <div className="badges">
                {(final.badges[r.id] ?? []).length === 0 && <span className="muted small">이번엔 없어요</span>}
                {(final.badges[r.id] ?? []).map((id) => {
                  const b = BADGE_MAP[id];
                  return (
                    <span key={id} className={'badge r' + b.rarity} title={b.desc}>
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
      </div>

      {highlights.length > 0 && (
      <div className="panel pad">
        <h3><Icon name="star" /> 하이라이트</h3>
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

      <div className="panel pad">
        <h3><Icon name="play" /> 하루별 리플레이</h3>
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
          refLine={{ value: START_CASH, label: `시작 ${START_CASH >= 10_000_000 ? '1,000만원' : '100만원'}` }}
          fmt={(v) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e7 ? `${Math.round(v / 1e4).toLocaleString('ko-KR')}만` : `${(Math.round(v / 1e3) / 10).toLocaleString('ko-KR')}만`)}
          fill={false}
        />
      </div>

      <div className="panel pad">
        <h3>
          이번 시장 성적 <span className="muted small">종합지수 {pct(indexRet)}</span>
        </h3>
        <div className="stock-rank">
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
            <span className="muted">랭킹 점수를 반영하는 중…</span>
          )}
        </div>
      )}
      {matchKind === 'daily' && <DailyResult />}
      {/* 서버 판이 끝나면 미션이 확인됨 (연습은 이 기기 판이라 안 셈) */}
      {session.mode === 'multi' && <MissionsPanel retry={2} room={session.roomId ?? undefined} />}
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
              {rematching ? '방으로 가는 중…' : <><b>{matchKind === 'bot' ? '같은 봇과 한 판 더' : nextCode ? '다시 하기 방 입장' : '이 사람들과 한 판 더'}</b><small>{final.players.length}명 · {setText}</small></>}
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
    </div>
  );
}
