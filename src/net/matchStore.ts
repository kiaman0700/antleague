/**
 * 매칭 대기 (로비 전체에서 하나): 대기 중에도 다른 화면(공부·친구·랭킹·설정 등)을 볼 수 있고,
 * 위 '플레이' 버튼(모바일은 아래 알림 띠)에 대기 시간이 흐름. 다른 방·다른 매칭·연습은 막음
 */
import { useSyncExternalStore } from 'react';
import { api, leaveQueueOnExit } from './api';
import { play } from '../lib/sound';

export interface Matched {
  roomId: string;
  playerId: string;
  code: string;
  nickname: string;
  mode: string;
}
export interface MatchInfo {
  waitedSec: number;
  inQueue: number;
  window: number;
  similar: number;
  online: number;
  etaSec: number | null;
}
export interface MatchState {
  phase: 'idle' | 'joining' | 'searching' | 'linking';
  /** 대기열 이름 (예: casual_duel_quick) */
  queue: string | null;
  /** 이 기기 시계 기준 시작 시각 (화면의 흐르는 시간용) */
  startedAt: number;
  info: MatchInfo | null;
  err: string;
  /** 잠깐 보여 줄 안내 (예: 대기 중에는 방에 못 들어가요) */
  notice: string;
  matched: Matched | null;
}

let st: MatchState = { phase: 'idle', queue: null, startedAt: 0, info: null, err: '', notice: '', matched: null };
const subs = new Set<() => void>();
const set = (p: Partial<MatchState>) => {
  st = { ...st, ...p };
  subs.forEach((f) => f());
};
export const getMatch = () => st;
export const isSearching = () => st.phase !== 'idle';
export function useMatch() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => st,
  );
}

let timer: ReturnType<typeof setInterval> | null = null;
const stopPoll = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
async function tick() {
  if (st.phase !== 'searching' && st.phase !== 'linking') return stopPoll();
  try {
    const s = await api<{ status: string; reason?: string } & Partial<MatchInfo> & Partial<Matched>>('queueStatus');
    if (getMatch().phase === 'idle') return; // 기다리는 사이 그만 찾기를 눌렀으면 무시
    if (s.status === 'matched' && s.roomId && s.playerId) {
      stopPoll();
      play('win');
      set({ phase: 'idle', queue: null, info: null, matched: { roomId: s.roomId, playerId: s.playerId, code: s.code ?? '', nickname: s.nickname ?? '', mode: s.mode ?? 'easy' } });
      return;
    }
    if (s.status === 'none') {
      stopPoll();
      set({ phase: 'idle', queue: null, info: null, err: s.reason === 'party' ? '파티원 연결이 끊겨서 같이 찾기가 취소됐어요. 친구가 다시 들어오면 찾아 주세요.' : '대기가 끝났어요. 다시 찾아 주세요.' });
      return;
    }
    const info: MatchInfo = { waitedSec: s.waitedSec ?? 0, inQueue: s.inQueue ?? 1, window: s.window ?? 100, similar: s.similar ?? 0, online: s.online ?? 0, etaSec: s.etaSec ?? null };
    // 서버가 센 대기 시간에 맞춰 화면 시계를 보정
    set({ info, startedAt: Date.now() - info.waitedSec * 1000 });
  } catch (e) {
    set({ err: e instanceof Error ? e.message : String(e) });
  }
}
const startPoll = () => {
  stopPoll();
  void tick();
  timer = setInterval(tick, 1500);
};

/** 찾기 시작 (서버에 대기표) */
export async function startMatch(queue: string, nickname: string, mode: string) {
  if (st.phase !== 'idle') return;
  set({ phase: 'joining', err: '', matched: null });
  try {
    await api('queueJoin', { queue, nickname, mode });
    set({ phase: 'searching', queue, startedAt: Date.now(), info: null });
    startPoll();
  } catch (e) {
    set({ phase: 'idle', err: e instanceof Error ? e.message : String(e) });
  }
}
/** 파티원: 파티장이 이미 대기표를 만들었으니 확인만 */
export function followMatch(queue: string | null) {
  if (st.phase !== 'idle') return;
  set({ phase: 'searching', queue, startedAt: Date.now(), info: null, err: '', matched: null });
  startPoll();
}
/** 그만 찾기 — 이미 상대가 잡혀 방을 만드는 중이면 취소하지 않고 결과를 기다림 */
export async function cancelMatch() {
  if (st.phase === 'idle' || st.phase === 'linking') return;
  try {
    const r = await api<{ ok: boolean; pending?: boolean }>('queueLeave');
    if (r.pending) return set({ phase: 'linking' });
  } catch {
    /* 연결이 끊겼어도 멈춤 — 서버가 10초 뒤 대기표를 정리 */
  }
  stopPoll();
  set({ phase: 'idle', queue: null, info: null });
}
/** 매칭 결과를 한 번만 꺼내 씀 (게임 화면으로 이동할 때) */
export function consumeMatched() {
  const m = st.matched;
  if (m) set({ matched: null });
  return m;
}
export const clearMatchErr = () => st.err && set({ err: '' });

/** 대기 중에는 할 수 없는 행동이면 안내하고 false (방 만들기·입장·연습·튜토리얼·1대1 신청 등) */
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
export function okWhileMatching(what = '이건') {
  if (st.phase === 'idle') return true;
  set({ notice: `매칭 대기 중이에요. ${what} 그만 찾기를 누른 뒤에 할 수 있어요.` });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => set({ notice: '' }), 3500);
  return false;
}

// 창을 닫으면 대기 취소 (페이지가 사라져도 요청이 끝까지 가도록)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (st.phase === 'searching') leaveQueueOnExit();
  });
}

/** 대기열 이름 → "일반전 · 1대1 · 신속" */
export function queueText(q: string | null) {
  if (!q) return '';
  const [kind, size, speed] = q.split('_');
  return `${kind === 'ranked' ? '랭킹전' : '일반전'} · ${size === 'duel' ? '1대1' : '다인전'} · ${speed === 'quick' ? '신속' : '일반'}`;
}
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
