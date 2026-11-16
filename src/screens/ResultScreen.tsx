import { api } from '../net/api';
import { TierBadge } from '../components/TierBadge';
import { isPlaced, PLACEMENT_GAMES, tierOf } from '../game/tier';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeIcon, Icon, SectorIcon, type IconName } from '../components/Icon';
import { LineChart } from '../components/Chart';
import { BADGE_MAP, titleOf } from '../game/achievements';
import { PLAYER_COLORS } from '../components/Board';
import { josa, type View } from '../engine/engine';
import { deriveItems, ITEM_MAP, spendsFromRows, type ItemKind } from '../game/items';
import { KR_INDEX_BASE, type Market } from '../game/market';
import { computePortfolio, equityHistory, startCashFor } from '../game/portfolio';
import { SECTOR_MAP, STOCK_MAP, STOCKS } from '../game/stocks';
import { pct, tone, won, wonShort } from '../lib/format';
import { play } from '../lib/sound';
import type { Session } from '../session';

interface Props {
  session: Session;
  market: Market;
  final: NonNullable<View['final']>;
  onExit: () => void;
  /** 한 판 더(같은 사람들과) — 누가 이미 만들었으면 nextCode 가 있음 */
  nextCode?: string | null;
  onRematch?: () => Promise<void>;
  /** 매칭으로 만든 방 (다시 찾기) · 랭킹전 */
  matchKind?: 'custom' | 'match';
  ranked?: boolean;
  onFindAgain?: () => void;
}

const COLORS = PLAYER_COLORS;
const rankBadge = (i: number) => <span className={'rank-badge r' + (i + 1)}>{i + 1}</span>;

export function ResultScreen({ session, market, final, onExit, nextCode, onRematch, matchKind, ranked: rankedGame, onFindAgain }: Props) {
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
  const solo = session.mode === 'solo';
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
      return { id: p.id, nickname: p.nickname, equity, ret: equity / START_CASH - 1, hist, trades: trades.length, pf, best, worst, used, fakesReceived };
    });
  }, [final, session.playerId, market, last, START_CASH]);

  const ranked = [...results].sort((a, b) => b.equity - a.equity);
  const winner = ranked.length >= 2 && ranked[0].equity !== ranked[1].equity ? ranked[0] : null;
  const rankOf = (id: string) => ranked.findIndex((r) => r.id === id);

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
    const out: { icon: string; title: string; text: string; day?: number }[] = [];
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
        out.push({ icon: 'flame', title: `${bd + 1}일차, 격차가 벌어졌다`, text: `${josa(champ.nickname, '이', '가')} 처음부터 1위를 지키며 하루에 ${wonShort(best)} 더 달아났어요`, day: bd });
      }
      out.push({ icon: 'refresh', title: '1위 다툼', text: changes ? `1위가 ${changes}번 바뀌었어요` : `${josa(champ.nickname, '이', '가')} 끝까지 1위였어요` });
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
      if (best > 0) out.push({ icon: 'sparkles', title: `${r.nickname}의 최고의 날`, text: `${bd + 1}일차 +${wonShort(best)}`, day: bd });
      if (worst < 0) out.push({ icon: 'warn', title: `${r.nickname}의 최악의 날`, text: `${wd + 1}일차 ${wonShort(worst)}`, day: wd });
    }
    return out;
  }, [results, market]);

  const me = results.find((r) => r.id === session.playerId)!;
  const iWon = winner?.id === session.playerId;

  return (
    <div className="result">
      <div className={'banner ' + (solo ? (me.ret > indexRet ? 'win' : '') : winner ? (iWon ? 'win' : 'lose') : 'draw')}>
        {solo ? (
          <>
            <div className="crown"><Icon name={me.ret > indexRet ? 'trophy' : 'activity'} size={40} /></div>
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
            <div className="crown"><Icon name="crown" size={40} /></div>
            <h1>{winner.nickname} 승리!</h1>
            <p>
              2위와 {wonShort(ranked[0].equity - ranked[1].equity)} 차이 · {iWon ? '오늘의 투자왕!' : `나는 ${rankOf(session.playerId) + 1}위 · 다음 판엔 꼭 이겨봐요`}
            </p>
          </>
        ) : (
          <h1>무승부!</h1>
        )}
      </div>

      <div className="score-cards">
        {ranked.map((r) => {
          const i = results.indexOf(r);
          return (
          <div key={r.id} className={'panel score-card' + (winner?.id === r.id ? ' champ' : '')} style={{ borderTopColor: COLORS[i] }}>
            <small style={{ color: COLORS[i] }}>
              {!solo && <span className="medal">{rankBadge(rankOf(r.id))}</span>}
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
        <div className="badge-cols">
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

      <div className="panel pad">
        <h3><Icon name="sparkles" /> 하이라이트</h3>
        <div className="hl-grid">
          {highlights.map((h, i) => (
            <button key={i} className="hl-card" onClick={() => h.day !== undefined && setReplayDay(h.day)}>
              <span className="hl-icon"><Icon name={h.icon as IconName} size={18} /></span>
              <b>{h.title}</b>
              <span>{h.text}</span>
              {h.day !== undefined && <small className="muted"><Icon name="news" size={12} /> {headline(h.day)}</small>}
            </button>
          ))}
        </div>
      </div>

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
                <SectorIcon id={s.sector} /> {s.name}
              </span>
              <b className={tone(r)}>{pct(r, 1)}</b>
            </div>
          ))}
        </div>
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
      <div className="center-actions">
        {matchKind === 'match' && onFindAgain ? (
          <>
            <button className="btn primary xl" onClick={onFindAgain}>
              같은 조건으로 다시 찾기
            </button>
            <button className="btn ghost" onClick={onExit}>
              로비로
            </button>
          </>
        ) : onRematch ? (
          <>
            {nextCode && <p className="rematch-note">다시 하기 방이 열렸어요! 같은 설정으로 바로 붙어요</p>}
            <button className="btn primary xl" onClick={rematch} disabled={rematching}>
              {rematching ? '방으로 가는 중…' : nextCode ? '다시 하기 방 입장' : '같은 사람들과 한 판 더!'}
            </button>
            <button className="btn ghost" onClick={onExit}>
              로비로
            </button>
            {rematchErr && <p className="error">{rematchErr}</p>}
          </>
        ) : (
          <button className="btn primary xl" onClick={onExit}>
            로비로 (새 게임 시작)
          </button>
        )}
      </div>
    </div>
  );
}
