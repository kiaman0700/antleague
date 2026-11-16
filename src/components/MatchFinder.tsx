/**
 * 홈의 '대결 찾기' (매칭): 랭킹전/일반전 × 1대1/다인전 × 신속/일반 → 실력이 비슷한 사람끼리 자동으로 방이 만들어지고 바로 시작
 * 랭킹전은 회원만. 친구와는 아래 '방 만들기'(커스텀 방, 점수 반영 없음)
 */
import { useEffect, useRef, useState } from 'react';
import { api, leaveQueueOnExit } from '../net/api';
import { SPEED_PRESET, type QueueKind, type QueueSize, type QueueSpeed } from '../engine/matching';
import { Icon } from './Icon';
import { play } from '../lib/sound';

const PREF = 'stockduel.match';
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
  nickname: string;
  nickOk: boolean;
  ui: string;
  onNeedNick: () => void;
  onLogin: () => void;
  onMatched: (m: Matched) => void;
}

export function MatchFinder({ member, loading, nickname, nickOk, ui, onNeedNick, onLogin, onMatched }: Props) {
  const [pref, setPref] = useState(loadPref);
  const [searching, setSearching] = useState(false);
  const [info, setInfo] = useState<{ waitedSec: number; inQueue: number; window: number } | null>(null);
  const [err, setErr] = useState('');
  const matchedRef = useRef(false);
  const kind: QueueKind = pref.kind === 'ranked' && !member ? 'casual' : pref.kind;
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
    if (!member && !nickOk) return onNeedNick();
    try {
      await api('queueJoin', { queue: `${kind}_${pref.size}_${pref.speed}`, nickname: nickname.trim(), mode: ui === 'pro' ? 'pro' : 'easy' });
      matchedRef.current = false;
      setLinking(false);
      setInfo(null);
      setSearching(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const [linking, setLinking] = useState(false);
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

  // 결과 화면에서 '다시 찾기'로 왔으면 바로 시작
  useEffect(() => {
    try {
      if (localStorage.getItem(FIND_AGAIN)) {
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
        const s = await api<{ status: string; waitedSec?: number; inQueue?: number; window?: number } & Partial<Matched>>('queueStatus');
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
        setInfo({ waitedSec: s.waitedSec ?? 0, inQueue: s.inQueue ?? 1, window: s.window ?? 100 });
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
      <h3>
        <Icon name="users" size={18} /> 대결 찾기
      </h3>
      {seg(kind, [['ranked', '랭킹전', member ? '점수가 오르내려요' : '회원 전용'], ['casual', '일반전', '부담 없이']], (v) => (v === 'ranked' && !member ? onLogin() : save({ ...pref, kind: v })))}
      {seg(pref.size, [['duel', '1대1', '두 명'], ['multi', '다인전', '3~4명']], (v) => save({ ...pref, size: v }))}
      {seg(pref.speed, [['quick', SPEED_PRESET.quick.label, SPEED_PRESET.quick.minutes], ['normal', SPEED_PRESET.normal.label, SPEED_PRESET.normal.minutes]], (v) => save({ ...pref, speed: v }))}
      {!member && !loading && <p className="muted small mf-note">게스트는 일반전만 할 수 있어요. <button className="linkish-soft" onClick={onLogin}>로그인하면 랭킹전</button></p>}
      {err && <p className="error">{err}</p>}
      <button className="btn primary xl full" onClick={start} disabled={searching || loading}>
        <Icon name="search" size={18} /> {kind === 'ranked' ? '랭킹전' : '일반전'} 찾기
      </button>

      {searching && (
        <div className="modal-bg mf-bg">
          <div className="modal mf-modal" role="dialog" aria-label="상대 찾는 중">
            <div className="mf-spin" aria-hidden />
            <h3>상대를 찾고 있어요</h3>
            <p className="muted">
              {kind === 'ranked' ? '랭킹전' : '일반전'} · {pref.size === 'duel' ? '1대1' : '다인전(3~4명)'} · {SPEED_PRESET[pref.speed].label} ({SPEED_PRESET[pref.speed].minutes})
            </p>
            <p className="mf-time">{info ? `${Math.floor(info.waitedSec / 60)}:${String(info.waitedSec % 60).padStart(2, '0')}` : '0:00'}</p>
            <small className="muted">
              {pref.size === 'multi' ? '4명이 모이면 바로, 3명이면 조금 기다렸다가 시작해요. ' : ''}
              {kind === 'ranked' ? `점수 ±${info?.window ?? 100} 안에서 찾는 중 (기다릴수록 넓어져요)` : '실력이 비슷한 사람부터 찾아요'}
            </small>
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
