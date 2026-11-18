/** 미션 2판 (설계서 design/missions-v2.md): 일일 6개 · 주간 3개 · 바꾸기(일일 하루 3번·주간 한 주 1번) · 레벨 막대. 판정·경험치는 서버만 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { useAccount } from '../net/account';
import { Icon } from './Icon';
import { ErrorState, Loading } from './ui';
import { HoverPop } from './HoverPop';
import { ask } from './ConfirmHost';
import { levelOf } from '../game/missions';

interface MissionItem {
  id: string;
  title: string;
  tier: 'easy' | 'normal' | 'hard';
  xp: number;
  goal: number;
  progress: number;
  done: boolean;
  /** 깰 수 있는 게임 종류 이름 (예: 봇전) */
  modes?: string[];
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
  /** 남은 바꾸기 횟수 (회원만, 없으면 바꾸기 버튼 없음) */
  rerolls?: { day: number; week: number } | null;
  /** (051) 튜토리얼 완료하기 — 일일·주간과 따로, 계정마다 한 번 */
  tutorial?: { done: boolean; xp: number };
}

const EMPTY: MissionInfo = { member: false, xp: 0, level: { level: 1, into: 0, need: 100 }, today: { endsAt: 0, list: [] }, week: { endsAt: 0, list: [] }, todayXp: 0, cap: 0 };
/**
 * 앱 전체가 함께 쓰는 미션 정보 (room 없는 것만): 메뉴바 버튼이 휴대폰·PC 두 곳 + 화면을 옮길 때마다 따로 물어
 * 요청 제한(429)에 걸리던 것 — 15초 안이면 받아 둔 것을 쓰고, 같은 때 여러 곳이 물어도 한 번만 보냄. 실패하면 받아 둔 것 유지
 */
const shared: { at: number; who: string; data: MissionInfo | null; inflight: Promise<MissionInfo> | null } = { at: 0, who: '', data: null, inflight: null };
function fetchShared(force: boolean, who: string): Promise<MissionInfo> {
  // 계정이 바뀌면(로그인·로그아웃) 받아 둔 것은 버림
  if (shared.who !== who) {
    shared.who = who;
    shared.data = null;
    shared.inflight = null;
  }
  if (!force && shared.data && Date.now() - shared.at < 15_000) return Promise.resolve(shared.data);
  if (shared.inflight) return shared.inflight;
  const mine = api<MissionInfo | null>('missions', {})
    // 로그인 전(세션 없음)이면 서버에 안 묻고 null → 미션 없이 안내만
    .then((r) => {
      if (shared.who !== who) return r ?? EMPTY;
      shared.data = r ?? EMPTY;
      shared.at = Date.now();
      return shared.data;
    })
    .finally(() => {
      if (shared.inflight === mine) shared.inflight = null;
    });
  shared.inflight = mine;
  return mine;
}

export function useMissions(enabled = true, room?: string) {
  const acc = useAccount();
  const who = acc.profile?.username ?? acc.status;
  const [info, setInfo] = useState<MissionInfo | null>(() => (room || shared.who !== who ? null : shared.data));
  const [err, setErr] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled || who === 'loading') return; // 계정 확인 전엔 안 물음
    let alive = true;
    setErr(false);
    const req = room ? api<MissionInfo | null>('missions', { room }).then((r) => r ?? EMPTY) : fetchShared(n > 0, who);
    req.then((r) => alive && setInfo(r)).catch(() => alive && !shared.data && setErr(true));
    return () => {
      alive = false;
    };
  }, [enabled, n, room, who]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  /** 서버가 돌려준 새 미션 정보를 바로 반영 (바꾸기 뒤) */
  const put = useCallback(
    (r: MissionInfo) => {
      if (!room) {
        shared.data = r;
        shared.at = Date.now();
      }
      setInfo(r);
    },
    [room],
  );
  return { info, err, reload, put };
}

/** 갱신까지 남은 시간 (게임에서 흔한 '갱신까지 3시간 12분' 꼴) */
const left = (endsAt: number) => {
  const ms = Math.max(0, endsAt - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${m}분` : `${Math.max(1, m)}분`;
};

/** 모든 게임 종류에서 깰 수 있으면 표시 안 함 */
const ALL_MODES = 4;
function Row({ m, onReroll, busy }: { m: MissionItem; onReroll?: () => void; busy?: boolean }) {
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
        {m.modes && m.modes.length < ALL_MODES && <span className="ms-modes">{m.modes.join(' · ')}</span>}
      </span>
      <b className="ms-xp">+{m.xp}</b>
      {onReroll && !m.done && (
        <button className="ms-reroll" onClick={onReroll} disabled={busy} aria-label={`${m.title} 다른 미션으로 바꾸기`} title="다른 미션으로 바꾸기">
          <Icon name="refresh" size={14} />
        </button>
      )}
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
  const { info, err, reload, put } = src ?? own;
  const [busy, setBusy] = useState(false);
  const [rerollErr, setRerollErr] = useState('');
  const reroll = async (kind: 'day' | 'week', slot: number, title: string, progress: number) => {
    if (progress > 0 && !(await ask(`'${title}' 미션을 바꾸면 지금까지의 진행이 사라져요. 바꿀까요?`, { ok: '바꾸기' }))) return;
    setBusy(true);
    setRerollErr('');
    try {
      put(await api<MissionInfo>('missionReroll', { kind, slot }));
    } catch (e) {
      setRerollErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  // 바꾸기는 회원 · 미션 칸(결과 화면 아님)에서만
  const canReroll = !room && !!info?.member && !!info?.rerolls;
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
        <h3>일일 미션</h3>
        <div className="ms-guest">
          <p className="muted small">회원이 되면 일일 미션·주간 미션을 깨고 레벨을 올릴 수 있어요. 레벨에 따라 프로필 사진·칭호가 열려요.</p>
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
      {/* 튜토리얼을 아직 안 한 사람에게만: 끝내면 레벨 1 → 2 경험치 (한 번) */}
      {info.tutorial && !info.tutorial.done && !room && (
        <div className="ms-tut">
          <Icon name="play" size={16} />
          <span>
            <b>튜토리얼 완료하기</b>
            <small className="muted">연습봇과 한 판(게임 기초)을 끝내면 · 한 번만</small>
          </span>
          <b className="ms-tut-xp">+{info.tutorial.xp}</b>
        </div>
      )}
      <div className="ms-head">
        <h3>
          일일 미션 <small className="muted">{doneN}/{info.today.list.length}</small>
        </h3>
        <small className="muted">갱신까지 {left(info.today.endsAt)}</small>
      </div>
      {canReroll && (
        <p className="ms-reroll-left muted small">
          <Icon name="refresh" size={12} /> 일일 미션 바꾸기 <b>{info.rerolls!.day}</b>번 남음 <span className="muted">(하루 3번)</span>
        </p>
      )}
      {rerollErr && <p className="error small">{rerollErr}</p>}
      {/* 미션 칸에는 미션만 — 경험치 상한·규칙 설명은 빼고(사용자 요청 2026-11-17), 레벨 막대는 noLevel 이 아닐 때만 */}
      {info.member && !noLevel && <LevelBar info={info} />}
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
        {info.today.list.map((m, i) => (
          <Row key={m.id} m={m} busy={busy} onReroll={canReroll && info.rerolls!.day > 0 ? () => reroll('day', i, m.title, m.progress) : undefined} />
        ))}
      </ul>
      <div className="ms-head ms-week">
        <h4>주간 미션</h4>
        <small className="muted">갱신까지 {left(info.week.endsAt)}</small>
      </div>
      {canReroll && (
        <p className="ms-reroll-left muted small">
          <Icon name="refresh" size={12} /> 주간 미션 바꾸기 <b>{info.rerolls!.week}</b>번 남음 <span className="muted">(한 주 1번)</span>
        </p>
      )}
      <ul className="ms-list">
        {info.week.list.map((m, i) => (
          <Row key={m.id} m={m} busy={busy} onReroll={canReroll && info.rerolls!.week > 0 ? () => reroll('week', i, m.title, m.progress) : undefined} />
        ))}
      </ul>
      {!info.member && (
        <div className="ms-guest">
          <p className="muted small">회원이 되면 미션으로 경험치가 쌓이고, 레벨에 따라 프로필 사진·칭호가 열려요.</p>
          {onSignup && (
            <button className="btn sm" onClick={onSignup}>
              회원가입
            </button>
          )}
        </div>
      )}
      <p className="ms-note muted small">대결·봇전·오늘의 도전을 끝까지 하면(거래 1번 이상) 미션이 확인돼요.</p>
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
  const week = m.info?.week.list ?? [];
  const wDone = week.filter((x) => x.done).length;
  const wPct = week.length ? wDone / week.length : 0;
  // 두 겹 링 (사용자 요청 2026-11-18): 안쪽 = 일일 미션, 바깥 = 주간 미션
  const ring = (r: number, p: number, cls: string) => {
    const len = 2 * Math.PI * r;
    return (
      <>
        <circle cx="12" cy="12" r={r} fill="none" className="msb-track" strokeWidth="2.6" />
        {p > 0 && <circle cx="12" cy="12" r={r} fill="none" className={cls} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={`${len * p} ${len}`} transform="rotate(-90 12 12)" />}
      </>
    );
  };
  return (
    <HoverPop
      className={'msb' + (compact ? ' compact' : '') + (list.length && done === list.length ? ' all' : '')}
      label={list.length ? `일일 미션 ${done}/${list.length} · 주간 미션 ${wDone}/${week.length} 완료` : '미션'}
      onOpen={m.reload}
      button={
        <>
          <svg className="msb-ring" width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            {ring(10, wPct, 'msb-week')}
            {ring(5.6, pct, 'msb-day')}
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
