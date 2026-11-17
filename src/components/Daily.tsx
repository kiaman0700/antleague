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
  if (!top.length) return <p className="muted small">아직 오늘 도전을 끝낸 회원이 없어요. 첫 기록의 주인공이 되어 보세요.</p>;
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
      <h3>오늘의 도전 순위</h3>
      <p className="muted small">
        {info.myRank ? `오늘 ${info.total}명 중 ${info.myRank}위예요.` : !info.finished ? '기록을 저장하는 중이에요.' : info.member ? '이 계정 기록은 점수표에 오르지 않아요.' : '게스트 기록은 점수표에 오르지 않아요. 회원으로 하면 순위에 올라가요.'} 내일 0시에 새 시장이 열려요.
      </p>
      <DailyBoard info={info} />
    </div>
  );
}
