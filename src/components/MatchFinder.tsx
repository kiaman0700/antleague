/**
 * 홈의 '대결 찾기' (매칭): 랭킹전/일반전 × 1대1/다인전 × 신속/일반 → 실력이 비슷한 사람끼리 자동으로 방이 만들어지고 바로 시작
 * 랭킹전은 회원만. 친구와는 아래 '방 만들기'(커스텀 방, 점수 반영 없음)
 */
import { useEffect, useRef, useState } from 'react';
import { api, leaveQueueOnExit } from '../net/api';
import { SPEED_PRESET, waitLabel, type QueueKind, type QueueSize, type QueueSpeed } from '../engine/matching';
import { Icon } from './Icon';
import { play } from '../lib/sound';
import { loadNick } from '../session';

const PREF = 'stockduel.match';
/** 선택지 아래 작은 글씨: 설명 + 지금 기다리는 사람 수 */
const waitTag = (base: string, n: number) => (n > 0 ? `${base} · ${n}명 대기` : base);
const loadPref = (): { kind: QueueKind; size: QueueSize; speed: QueueSpeed } => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF) ?? 'null');
    if (v && v.kind && v.size && v.speed) return v;
  } catch {
    /* 저장소 없음 */
  }
  return { kind: 'casual', size: 'duel', speed: 'quick' };
};
/** 결과 화면 '다시 찾기' → 홈에 오면 바로 찾기 */
export const FIND_AGAIN = 'stockduel.findAgain';

export interface Matched {
  roomId: string;
  playerId: string;
  code: string;
  nickname: string;
  mode: string;
}

interface Props {
  member: boolean;
  /** 계정 상태를 아직 모름 (게스트 안내를 잠깐 보였다 숨기지 않게) */
  loading?: boolean;
  /** 메뉴에서 랭킹전/일반전을 이미 골랐으면 고정 (종류 고르는 칸을 숨김) */
  fixedKind?: QueueKind;
  /** 찾기 전에 확인할 것 (게스트 닉네임 안내 등). 확인되면 go() 를 부름 */
  guard?: (go: () => void) => void;
  nickname: string;
  nickOk: boolean;
  ui: string;
  onNeedNick: () => void;
  onLogin: () => void;
  onMatched: (m: Matched) => void;
  /** 일반전 파티 (2명이면 다인전으로만, 파티장만 찾기 시작, 파티원은 자동으로 따라감) */
  party?: { isLeader: boolean; searching: boolean; size: number } | null;
}

export function MatchFinder({ member, loading, fixedKind, guard, nickname, nickOk, ui, onNeedNick, onLogin, onMatched, party }: Props) {
  const [pref, setPref] = useState(loadPref);
  const [searching, setSearching] = useState(false);
  const [info, setInfo] = useState<{ waitedSec: number; inQueue: number; window: number; similar: number; online: number; etaSec: number | null } | null>(null);
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const matchedRef = useRef(false);
  const inParty = !!party && party.size > 1;
  const sizeEff: QueueSize = inParty ? 'multi' : pref.size;
  const want = fixedKind ?? pref.kind;
  const kind: QueueKind = want === 'ranked' && !member ? 'casual' : want;
  const save = (p: typeof pref) => {
    setPref(p);
    try {
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch {
      /* 저장 못 해도 괜찮음 */
    }
  };

  const start = async () => {
    setErr('');
    if (guard && !member) return guard(() => void begin());
    if (!member && !nickOk) return onNeedNick();
    return begin();
  };
  const [joining, setJoining] = useState(false);
  const begin = async (over?: { size: QueueSize; speed: QueueSpeed }) => {
    setJoining(true);
    const size = over?.size ?? sizeEff;
    const speed = over?.speed ?? pref.speed;
    try {
      await api('queueJoin', { queue: `${kind}_${size}_${speed}`, nickname: (member ? nickname : loadNick() || nickname).trim(), mode: ui === 'pro' ? 'pro' : 'easy' });
      matchedRef.current = false;
      setLinking(false);
      setInfo(null);
      setSearching(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };
  const cancel = async () => {
    try {
      const r = await api<{ ok: boolean; pending?: boolean }>('queueLeave');
      // 이미 상대가 잡혀 방을 만드는 중이면 취소하지 않고 결과를 기다림
      if (r.pending) return setLinking(true);
    } catch {
      /* 연결이 끊겼어도 화면은 닫음 — 서버가 10초 뒤 대기표를 정리 */
    }
    setSearching(false);
  };

  // 대기열마다 지금 기다리는 사람 수 (사람이 적을 때 붐비는 쪽을 고르게)
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [eta, setEta] = useState<Record<string, number | null>>({});
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ counts: Record<string, number>; eta?: Record<string, number | null>; online?: number }>('queueCounts')
        .then((r) => {
          if (!alive) return;
          setCounts(r.counts ?? {});
          setEta(r.eta ?? {});
          setOnline(r.online ?? null);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, searching ? 5000 : 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [searching]);
  const waitingIn = (size: QueueSize, speed: QueueSpeed) => counts[`${kind}_${size}_${speed}`] ?? 0;
  const label = (size: QueueSize, speed: QueueSpeed) => `${size === 'duel' ? '1대1' : '다인전'} ${SPEED_PRESET[speed].label}`;
  /** 오래 기다리면: 사람이 기다리는 다른 대기열(같은 랭킹전/일반전)로 바꾸기 제안 */
  const alt = (() => {
    if (!info || linking || inParty) return null;
    const opts: [QueueSize, QueueSpeed][] = (['duel', 'multi'] as QueueSize[]).flatMap((z) => (['quick', 'normal'] as QueueSpeed[]).map((p) => [z, p] as [QueueSize, QueueSpeed]));
    const others = opts.filter(([z, p]) => !(z === sizeEff && p === pref.speed)).map(([z, p]) => ({ size: z, speed: p, n: waitingIn(z, p) }));
    const busy = others.filter((o) => o.n > 0).sort((a, b) => b.n - a.n)[0];
    if (info.waitedSec >= 25 && busy) return busy;
    // 다인전이 45초 넘게 안 모이면 1대1 을 권함 (기다리는 사람이 없어도 먼저 들어가 있으면 다음 사람과 바로)
    if (info.waitedSec >= 45 && sizeEff === 'multi') return { size: 'duel' as QueueSize, speed: pref.speed, n: waitingIn('duel', pref.speed) };
    return null;
  })();
  const switchTo = async (o: { size: QueueSize; speed: QueueSpeed }) => {
    save({ ...pref, size: o.size, speed: o.speed });
    setSearching(false);
    await begin(o);
  };

  // 파티원: 파티장이 찾기 시작하면 내 화면도 '찾는 중'으로 (내 대기표는 서버가 이미 만들어 둠)
  useEffect(() => {
    if (inParty && party!.searching && !searching && !matchedRef.current) {
      matchedRef.current = false;
      setInfo(null);
      setSearching(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inParty, party?.searching]);

  // 결과 화면에서 '다시 찾기'로 왔으면 바로 시작
  useEffect(() => {
    try {
      const again = localStorage.getItem(FIND_AGAIN);
      // 결과 화면에서 고른 종류의 메뉴에서만 시작 (다른 메뉴에서 엉뚱한 대기열로 들어가지 않게)
      if (again && (!fixedKind || again === fixedKind || again === '1')) {
        localStorage.removeItem(FIND_AGAIN);
        start();
      }
    } catch {
      /* 무시 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 찾는 동안: 1.5초마다 상태 확인 (서버가 그때 실력이 맞는 사람끼리 묶음)
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await api<{ status: string; waitedSec?: number; inQueue?: number; window?: number; similar?: number; online?: number; etaSec?: number | null } & Partial<Matched>>('queueStatus');
        if (!alive) return;
        if (s.status === 'matched' && s.roomId && s.playerId) {
          matchedRef.current = true;
          setSearching(false);
          play('win');
          onMatched({ roomId: s.roomId, playerId: s.playerId, code: s.code ?? '', nickname: s.nickname ?? nickname, mode: s.mode ?? 'easy' });
          return;
        }
        if (s.status === 'none') {
          setSearching(false);
          setErr('대기가 끝났어요. 다시 찾아 주세요.');
          return;
        }
        setInfo({ waitedSec: s.waitedSec ?? 0, inQueue: s.inQueue ?? 1, window: s.window ?? 100, similar: s.similar ?? 0, online: s.online ?? 0, etaSec: s.etaSec ?? null });
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  // 화면을 떠나거나 창을 닫으면 대기 취소 (매칭이 이미 됐으면 그대로)
  const searchingRef = useRef(false);
  searchingRef.current = searching;
  useEffect(() => {
    const bye = () => {
      if (searchingRef.current && !matchedRef.current) leaveQueueOnExit();
    };
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      if (searchingRef.current && !matchedRef.current) api('queueLeave').catch(() => {});
    };
  }, []);

  const seg = <T extends string>(value: T, items: [T, string, string?][], on: (v: T) => void, disabled?: (v: T) => boolean) => (
    <div className="seg mf-seg" role="radiogroup">
      {items.map(([v, l, sub]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={disabled?.(v)} onClick={() => on(v)}>
          <b>{l}</b>
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel pad match-finder">
      {!fixedKind && (
        <h3>
          <Icon name="users" size={18} /> 대결 찾기
        </h3>
      )}
      {!fixedKind && seg(kind, [['ranked', '랭킹전', member ? '점수가 오르내려요' : '회원 전용'], ['casual', '일반전', '부담 없이']], (v) => (v === 'ranked' && !member ? onLogin() : save({ ...pref, kind: v })))}
      {inParty ? <p className="muted small mf-note">파티는 <b>다인전</b>(4명 방)으로 같이 찾아요.</p> : seg(sizeEff, [['duel', '1대1', waitTag('두 명', waitingIn('duel', pref.speed))], ['multi', '다인전', waitTag('3~4명', waitingIn('multi', pref.speed))]], (v) => save({ ...pref, size: v }))}
      {seg(pref.speed, [['quick', SPEED_PRESET.quick.label, waitTag(SPEED_PRESET.quick.minutes, waitingIn(sizeEff, 'quick'))], ['normal', SPEED_PRESET.normal.label, waitTag(SPEED_PRESET.normal.minutes, waitingIn(sizeEff, 'normal'))]], (v) => save({ ...pref, speed: v }))}
      {!member && !loading && !fixedKind && <p className="muted small mf-note">게스트는 일반전만 할 수 있어요. <button className="linkish-soft" onClick={onLogin}>로그인하면 랭킹전</button></p>}
      {err && <p className="error">{err}</p>}
      {online !== null && (
        <p className="mf-eta" aria-live="polite">
          <Icon name="hourglass" size={14} /> 예상 대기 <b>{waitLabel(eta[`${kind}_${sizeEff}_${pref.speed}`] ?? null)}</b>
          {waitingIn(sizeEff, pref.speed) > 0 && <small className="muted"> · {waitingIn(sizeEff, pref.speed)}명 기다리는 중</small>}
        </p>
      )}
      {inParty && kind === 'ranked' && <p className="muted small mf-note">파티 중에는 랭킹전을 찾을 수 없어요. 친구끼리 점수를 주고받지 못하게, 랭킹전은 혼자만 찾아요.</p>}
      <button className="btn primary xl full" onClick={start} disabled={searching || loading || joining || (inParty && (!party!.isLeader || kind === 'ranked'))}>
        <Icon name="search" size={18} /> {joining ? '준비 중…' : inParty && !party!.isLeader ? '파티장이 찾기를 시작해요' : `${kind === 'ranked' ? '랭킹전' : '일반전'} ${inParty ? '파티로 ' : ''}찾기`}
      </button>

      {searching && (
        <div className="modal-bg mf-bg">
          <div className="modal mf-modal" role="dialog" aria-label="상대 찾는 중">
            <div className="mf-spin" aria-hidden />
            <h3>상대를 찾고 있어요</h3>
            <p className="muted">
              {kind === 'ranked' ? '랭킹전' : '일반전'} · {sizeEff === 'duel' ? '1대1' : '다인전(3~4명)'} · {SPEED_PRESET[pref.speed].label} ({SPEED_PRESET[pref.speed].minutes})
            </p>
            <p className="mf-time">{info ? `${Math.floor(info.waitedSec / 60)}:${String(info.waitedSec % 60).padStart(2, '0')}` : '0:00'}</p>
            <small className="muted">
              {sizeEff === 'multi' ? '4명이 모이면 바로, 3명이면 조금 기다렸다가 시작해요. ' : ''}
              {kind === 'ranked'
                ? (info?.waitedSec ?? 0) >= 120
                  ? '사람이 적어서 점수 범위를 넓혀 찾는 중이에요'
                  : `점수 ±${info?.window ?? 100} 안에서 찾는 중 (기다릴수록 넓어져요)`
                : '실력이 비슷한 사람부터 찾아요'}
            </small>
            {info && (
              <p className="mf-eta in-modal">
                <Icon name="hourglass" size={14} /> 예상 대기 <b>{waitLabel(info.etaSec)}</b>
              </p>
            )}
            {info && (
              <small className="mf-queue">
                나 포함 {Math.max(1, info.inQueue)}명이 기다리는 중
              </small>
            )}
            {alt && (
              <button className="btn sm mf-alt" onClick={() => switchTo(alt)}>
                <Icon name="refresh" size={14} /> {label(alt.size, alt.speed)}으로 바꿔 찾기{alt.n > 0 ? ` · ${alt.n}명 대기 중` : ''}
              </button>
            )}
            {linking ? (
              <p className="mf-linking">상대를 찾았어요! 방을 만드는 중…</p>
            ) : (
              <button className="btn ghost" onClick={cancel}>
                그만 찾기
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
