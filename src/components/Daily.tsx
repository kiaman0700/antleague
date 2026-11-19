import { ToonIcon } from './ToonIcon';
import { STREAK_RULE, StreakResult, type StreakInfo } from './Streak';
/** 오늘의 도전 (설계서 design/bots-daily.md 3단계): 오늘 점수표 · 내 순위 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { pct } from '../lib/format';
import { ErrorState, Loading } from './ui';

export interface DailyInfo {
  day: string;
  /** 지난 날 기록을 보는 중 (자정을 넘겨 끝낸 판의 결과 화면) */
  past?: boolean;
  ready: boolean;
  played?: boolean;
  finished?: boolean;
  myRet?: number | null;
  myRank?: number | null;
  member?: boolean;
  /** 거래를 한 번도 안 하고 끝낸 기록 (점수표에 안 오름) */
  noTrade?: boolean;
  resume?: { roomId: string; playerId: string; code: string } | null;
  total?: number;
  top?: { rank: number; nickname: string; ret: number; me: boolean }[];
  /** 친구들의 오늘 기록 (친구만, 닉네임·수익률) */
  friends?: { nickname: string; ret: number | null; finished: boolean }[];
  /** 연속 기록 (서버 계산) */
  streak?: StreakInfo | null;
  /** (v26) 오늘의 시장 테마 id */
  theme?: string;
}

/** 연속 기록 칩: 'n일 연속' (최고 기록은 칩 설명에) */
export function StreakChip({ s }: { s?: DailyInfo['streak'] }) {
  if (!s || s.streak <= 0) return null;
  return (
    <span className="streak-chip" title={`최고 ${s.best}일 · ${STREAK_RULE}`}>
      <ToonIcon name="flame" size={16} /> {s.streak}일 연속
    </span>
  );
}

export function useDailyInfo(enabled = true, room?: string) {
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [err, setErr] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setErr(false);
    api<DailyInfo | null>('dailyInfo', room ? { room } : undefined)
      .then((r) => alive && setInfo(r ?? { day: '', ready: true, played: false, top: [], total: 0 }))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [enabled, n, room]);
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
        친구들
      </h4>
      <ol className="daily-board">
        {f.map((r, i) => (
          <li key={i}>
            <span className="db-name">
              <span className="df-nick">{r.nickname}</span>
            </span>
            {r.finished && r.ret !== null ? <b className={r.ret > 0 ? 'up' : r.ret < 0 ? 'down' : ''}>{pct(r.ret, 1)}</b> : <small className="muted">도전 중</small>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 결과 화면: 오늘의 도전 순위 */
export function DailyResult({ room }: { room?: string }) {
  const { info, err, reload } = useDailyInfo(true, room);
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
      <h3>{info.past ? '그날의 도전 순위' : '오늘의 도전 순위'} <StreakChip s={info.streak} /></h3>
      <StreakResult s={info.streak} />
      <p className="muted small">
        {info.myRank ? `${info.past ? '그날' : '오늘'} ${info.total}명 중 ${info.myRank}위예요.` : !info.finished ? '기록을 저장하는 중이에요.' : info.noTrade ? '거래를 한 번도 안 한 기록은 점수표에 오르지 않아요.' : info.member ? '이 계정 기록은 점수표에 오르지 않아요.' : '게스트 기록은 점수표에 오르지 않아요. 회원으로 하면 순위에 올라가요.'} {info.past ? '오늘의 새 시장이 이미 열려 있어요.' : '내일 0시에 새 시장이 열려요.'}
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
