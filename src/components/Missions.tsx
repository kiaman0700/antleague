/** 미션 (설계서 design/missions.md): 오늘 3개 · 이번 주 1개 · 레벨 막대. 판정·경험치는 서버만 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { Icon } from './Icon';
import { ErrorState, Loading } from './ui';
import { HoverPop } from './HoverPop';
import { levelOf } from '../game/missions';

interface MissionItem {
  id: string;
  title: string;
  tier: 'easy' | 'normal' | 'hard';
  xp: number;
  goal: number;
  progress: number;
  done: boolean;
}
export interface MissionInfo {
  member: boolean;
  xp: number;
  level: { level: number; into: number; need: number };
  today: { endsAt: number; list: MissionItem[] };
  week: { endsAt: number; list: MissionItem[] };
  todayXp: number;
  cap: number;
  /** 오늘 받은 판 경험치 / 하루 상한 */
  gameToday?: number;
  gameCap?: number;
  /** 결과 화면: 이 판에서 받은 판 경험치 */
  thisGame?: { xp: number; detail: string; firstWin: number } | null;
}

export function useMissions(enabled = true, room?: string) {
  const [info, setInfo] = useState<MissionInfo | null>(null);
  const [err, setErr] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setErr(false);
    api<MissionInfo | null>('missions', room ? { room } : {})
      // 로그인 전(세션 없음)이면 서버에 안 묻고 null → 미션 없이 안내만
      .then((r) => alive && setInfo(r ?? { member: false, xp: 0, level: { level: 1, into: 0, need: 100 }, today: { endsAt: 0, list: [] }, week: { endsAt: 0, list: [] }, todayXp: 0, cap: 0 }))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [enabled, n, room]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { info, err, reload };
}

const left = (endsAt: number) => {
  const ms = Math.max(0, endsAt - Date.now());
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}일 뒤`;
  if (h >= 1) return `${h}시간 뒤`;
  return `${Math.max(1, Math.ceil(ms / 60_000))}분 뒤`;
};

function Row({ m }: { m: MissionItem }) {
  return (
    <li className={'ms-row' + (m.done ? ' done' : '')}>
      <span className="ms-check" aria-hidden>
        {m.done && <Icon name="check" size={13} />}
      </span>
      <span className="ms-title">
        {m.title}
        {m.goal > 1 && !m.done && (
          <small className="ms-count">
            {' '}
            {m.progress}/{m.goal}
          </small>
        )}
        <span className="sr-only">{m.done ? ' (완료)' : ' (아직)'}</span>
      </span>
      <b className="ms-xp">+{m.xp}</b>
    </li>
  );
}

/** 레벨 + 경험치 막대 (최대 레벨이면 MAX) — 프로필 팝업·마이프로필 */
export function LevelMeter({ xp, className, title }: { xp: number; className?: string; title?: string }) {
  const { level, into, need } = levelOf(xp);
  const max = need === 0;
  return (
    <div className={'ms-level' + (className ? ' ' + className : '')} title={title}>
      <b className="ms-lv">Lv.{level}</b>
      <div className="ms-bar" role="progressbar" aria-label={max ? '최대 레벨' : '다음 레벨까지'} aria-valuemin={0} aria-valuemax={max ? 1 : need} aria-valuenow={max ? 1 : into}>
        <i style={{ width: max ? '100%' : `${Math.round((into / need) * 100)}%` }} />
      </div>
      <small className="muted">{max ? 'MAX' : `${into}/${need}`}</small>
    </div>
  );
}
export function LevelBar({ info }: { info: MissionInfo }) {
  return <LevelMeter xp={info.xp} />;
}

/**
 * 미션 칸. guest 면 '회원이 되면 쌓여요' 안내.
 * onSignup 이 있으면 게스트에게 가입 버튼
 */
export function MissionsPanel({ enabled = true, onSignup, retry = 0, src, noLevel, room }: { enabled?: boolean; onSignup?: () => void; retry?: number; src?: ReturnType<typeof useMissions>; /** 레벨 막대 빼고 오늘 받은 경험치만 (메뉴바 팝업 — 레벨은 프로필에) */ noLevel?: boolean; /** 결과 화면: 이 판에서 받은 경험치도 */ room?: string }) {
  const own = useMissions(enabled && !src, room);
  const { info, err, reload } = src ?? own;
  // 결과 화면: 판정이 막 저장되는 중일 수 있어 잠깐 뒤 한 번 더
  const tries = useRef(0);
  useEffect(() => {
    if (!retry || !info || tries.current >= retry) return;
    tries.current++;
    const t = setTimeout(reload, 2500);
    return () => clearTimeout(t);
  }, [info, retry, reload]);
  if (!enabled) return null;
  if (err) return <section className="panel pad missions"><ErrorState what="미션" onRetry={reload} compact /></section>;
  if (!info) return <section className="panel pad missions"><Loading inline label="미션 불러오는 중…" /></section>;
  const doneN = info.today.list.filter((m) => m.done).length;
  if (!info.today.list.length)
    return (
      <section className="panel pad missions" aria-label="미션">
        <h3>오늘의 미션</h3>
        <div className="ms-guest">
          <p className="muted small">회원이 되면 매일 미션 3개·이번 주 미션을 깨고 레벨을 올릴 수 있어요. 레벨에 따라 프로필 사진·칭호가 열려요.</p>
          {onSignup && (
            <button className="btn sm" onClick={onSignup}>
              회원가입
            </button>
          )}
        </div>
      </section>
    );
  return (
    <section className="panel pad missions" aria-label="미션">
      <div className="ms-head">
        <h3>
          오늘의 미션 <small className="muted">{doneN}/{info.today.list.length}</small>
        </h3>
        <small className="muted">{left(info.today.endsAt)} 새 미션</small>
      </div>
      {info.member && (noLevel ? (
          <p className="ms-today muted small">
            오늘 받은 경험치 · 미션 <b>{info.todayXp}</b>/{info.cap} · 대결 <b>{info.gameToday ?? 0}</b>/{info.gameCap ?? 600}
          </p>
        ) : (
          <LevelBar info={info} />
        ))}
      {info.thisGame && (
        <p className="ms-gain">
          이번 판 경험치 <b>+{info.thisGame.xp + info.thisGame.firstWin}</b>
          <small className="muted">
            {' '}
            {info.thisGame.detail}
            {info.thisGame.firstWin > 0 ? ` · 오늘 첫 승 ${info.thisGame.firstWin}` : ''}
            {info.thisGame.xp === 0 && !info.thisGame.firstWin ? ' (오늘 대결 경험치를 다 받았어요)' : ''}
          </small>
        </p>
      )}
      <ul className="ms-list">
        {info.today.list.map((m) => (
          <Row key={m.id} m={m} />
        ))}
      </ul>
      <div className="ms-head ms-week">
        <h4>이번 주 미션</h4>
        <small className="muted">{left(info.week.endsAt)} 바뀜</small>
      </div>
      <ul className="ms-list">
        {info.week.list.map((m) => (
          <Row key={m.id} m={m} />
        ))}
      </ul>
      {info.member ? (
        info.todayXp >= info.cap && <p className="muted small">오늘 받을 수 있는 경험치({info.cap})를 다 받았어요. 내일 또 만나요.</p>
      ) : (
        <div className="ms-guest">
          <p className="muted small">회원이 되면 미션으로 경험치가 쌓이고, 레벨에 따라 프로필 사진·칭호가 열려요.</p>
          {onSignup && (
            <button className="btn sm" onClick={onSignup}>
              회원가입
            </button>
          )}
        </div>
      )}
      <p className="ms-note muted small">대결·봇전·오늘의 도전을 끝까지 하면(거래 1번 이상) 미션이 확인되고 판 경험치도 받아요. 랭킹전·일반전 40(1위 +30) · 봇전 10~20 · 오늘의 도전 20 · 오늘 첫 승 +50 · 새 업적 +20. 커스텀 방은 경험치가 없어요.</p>
    </section>
  );
}

/**
 * 위 메뉴바에 고정하는 미션 버튼 (사용자 요청 2026-11-17): '미션 2/3' + 둥근 진행 표시.
 * 마우스를 올리거나(PC) 누르면(휴대폰·키보드) 오늘·이번 주 미션이 팝업으로 뜸. 열 때마다 새로 받아 옴. 레벨은 내 프로필 팝업에
 */
export function MissionsButton({ onSignup, compact }: { onSignup?: () => void; compact?: boolean }) {
  const m = useMissions(true);
  const list = m.info?.today.list ?? [];
  const done = list.filter((x) => x.done).length;
  const pct = list.length ? done / list.length : 0;
  const r = 8;
  const len = 2 * Math.PI * r;
  return (
    <HoverPop
      className={'msb' + (compact ? ' compact' : '') + (list.length && done === list.length ? ' all' : '')}
      label={list.length ? `오늘의 미션 ${done}/${list.length} 완료` : '오늘의 미션'}
      onOpen={m.reload}
      button={
        <>
          <svg className="msb-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <circle cx="11" cy="11" r={r} fill="none" stroke="#3a3a3a" strokeWidth="3" />
            {pct > 0 && <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${len * pct} ${len}`} transform="rotate(-90 11 11)" />}
          </svg>
          {!compact && <span>미션</span>}
          {list.length > 0 && (
            <b>
              {done}/{list.length}
            </b>
          )}
        </>
      }
    >
      <MissionsPanel src={m} onSignup={onSignup} noLevel />
    </HoverPop>
  );
}
