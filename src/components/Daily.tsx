import { Icon } from './Icon';
/** 오늘의 도전 (설계서 design/bots-daily.md 3단계): 오늘 점수표 · 내 순위 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { pct } from '../lib/format';
import { ErrorState, Loading } from './ui';

export interface DailyInfo {
  day: string;
  ready: boolean;
  played?: boolean;
  finished?: boolean;
  myRet?: number | null;
  myRank?: number | null;
  member?: boolean;
  resume?: { roomId: string; playerId: string; code: string } | null;
  total?: number;
  top?: { rank: number; nickname: string; ret: number; me: boolean }[];
  /** 친구들의 오늘 기록 (친구만, 닉네임·수익률) */
  friends?: { nickname: string; ret: number | null; finished: boolean; played?: boolean; together?: number }[];
  /** 연속 기록 (서버 계산) */
  streak?: { streak: number; best: number; freezes: number; playedToday: boolean };
}

/** 연속 기록 표시: '🔥' 대신 아이콘 + 'n일 연속' + 얼리기 */
export function StreakChip({ s }: { s?: DailyInfo['streak'] }) {
  if (!s || s.streak <= 0) return null;
  return (
    <span className="streak-chip" title={`가장 긴 기록 ${s.best}일 · 7일마다 얼리기 1개(최대 2개) — 하루 놓쳐도 얼리기로 이어져요`}>
      <Icon name="flame" size={13} /> {s.streak}일 연속{s.freezes > 0 ? ` · 얼리기 ${s.freezes}` : ''}
    </span>
  );
}

export function useDailyInfo(enabled = true) {
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [err, setErr] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setErr(false);
    api<DailyInfo | null>('dailyInfo')
      .then((r) => alive && setInfo(r ?? { day: '', ready: true, played: false, top: [], total: 0 }))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [enabled, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { info, err, reload };
}

/** 오늘 점수표 (회원·끝낸 판만) */
export function DailyBoard({ info, limit = 10 }: { info: DailyInfo; limit?: number }) {
  const top = (info.top ?? []).slice(0, limit);
  if (!top.length)
    return (
      <p className="muted small">
        {info.finished
          ? `아직 오늘 점수표에 오른 회원이 없어요.${info.member === false ? ' 게스트 기록은 점수표에 안 올라가요.' : ''}`
          : '아직 오늘 도전을 끝낸 회원이 없어요. 첫 기록의 주인공이 되어 보세요.'}
      </p>
    );
  return (
    <ol className="daily-board">
      {top.map((r) => (
        <li key={r.rank} className={r.me ? 'me' : ''}>
          <span className="db-rank">{r.rank}</span>
          <span className="db-name">{r.nickname}</span>
          <b className={r.ret > 0 ? 'up' : r.ret < 0 ? 'down' : ''}>{pct(r.ret, 1)}</b>
        </li>
      ))}
    </ol>
  );
}

/** 친구들의 오늘 기록 — 같은 시장이라 바로 비교 (끝낸 친구는 수익률, 하는 중이면 '도전 중') */
export function DailyFriends({ info }: { info: DailyInfo }) {
  const f = info.friends ?? [];
  if (!f.length) return null;
  return (
    <div className="daily-friends">
      <h4>
        <Icon name="users" size={14} /> 친구들
      </h4>
      <ol className="daily-board">
        {f.map((r, i) => {
          const tg = r.together ?? 0;
          return (
            <li key={i}>
              <span className="db-name">
                <span className="df-nick">{r.nickname}</span>
                {tg >= 2 && (
                  <small className="df-together" title="둘 다 오늘의 도전을 한 날이 이어진 수">
                    <Icon name="flame" size={12} /> 함께 {tg}일
                  </small>
                )}
              </span>
              {r.played === false ? (
                <small className="muted">오늘 아직</small>
              ) : r.finished && r.ret !== null ? (
                <b className={r.ret > 0 ? 'up' : r.ret < 0 ? 'down' : ''}>{pct(r.ret, 1)}</b>
              ) : (
                <small className="muted">도전 중</small>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 결과 화면: 오늘의 도전 순위 */
export function DailyResult() {
  const { info, err, reload } = useDailyInfo();
  // 마지막 날 기록이 막 저장되는 중일 수 있어서, 아직 '끝남'이 아니면 잠깐 뒤 다시 (3번까지)
  const tries = useRef(0);
  useEffect(() => {
    if (info && !info.finished && tries.current < 3) {
      tries.current += 1;
      const t = setTimeout(reload, 2000);
      return () => clearTimeout(t);
    }
  }, [info, reload]);
  if (err) return <ErrorState what="오늘의 순위" onRetry={reload} compact />;
  if (!info) return <Loading inline label="오늘의 순위를 불러오는 중…" />;
  return (
    <div className="panel pad daily-result">
      <h3>오늘의 도전 순위 <StreakChip s={info.streak} /></h3>
      {info.streak && info.streak.streak > 0 && (
        <p className="small streak-note">
          {info.streak.streak}일째 이어서 도전 중! {info.streak.streak % 7 === 0 ? '얼리기를 하나 받았어요 — 하루 놓쳐도 이어져요.' : `${7 - (info.streak.streak % 7)}일 더 하면 얼리기를 받아요.`}
        </p>
      )}
      <p className="muted small">
        {info.myRank ? `오늘 ${info.total}명 중 ${info.myRank}위예요.` : !info.finished ? '기록을 저장하는 중이에요.' : info.member ? '이 계정 기록은 점수표에 오르지 않아요.' : '게스트 기록은 점수표에 오르지 않아요. 회원으로 하면 순위에 올라가요.'} 내일 0시에 새 시장이 열려요.
      </p>
      <DailyFriends info={info} />
      <DailyBoard info={info} />
    </div>
  );
}

/** 랭킹 화면: 오늘의 도전 점수표 (로그인 전이면 숨김) */
export function DailyRankPanel() {
  const { info } = useDailyInfo();
  if (!info || !info.ready || !info.day) return null;
  return (
    <section className="panel pad daily-rank" aria-label="오늘의 도전 점수표">
      <h3>오늘의 도전 점수표</h3>
      <p className="muted small">모두 같은 시장으로 하루 한 번 겨룬 오늘 기록이에요. 연습 메뉴의 '오늘의 도전'에서 할 수 있어요.</p>
      <DailyBoard info={info} limit={10} />
    </section>
  );
}
