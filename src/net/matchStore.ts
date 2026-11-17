/**
 * 매칭 대기 (앱 전체에서 하나): 대기 중에도 다른 화면(공부·친구·랭킹·설정 등)을 볼 수 있고,
 * 위 '플레이' 버튼(모바일은 아래 알림 띠)에 대기 시간이 흐름. 다른 방·다른 매칭·연습은 막음.
 * 매칭 결과는 App(늘 떠 있음)이 받아 게임으로 이동 — 로비 밖(튜토리얼·화면 편집 등)에 있어도 바로 들어감
 */
import { useSyncExternalStore } from 'react';
import { api, ApiError, leaveQueueOnExit } from './api';
import { play } from '../lib/sound';

export interface Matched {
  roomId: string;
  playerId: string;
  code: string;
  nickname: string;
  mode: string;
  /** 받은 시각 — 2분 넘게 못 쓰면 버림 (서버도 2분 뒤 매칭 결과를 지움) */
  at: number;
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
/** 마지막 찾기 설정 (화면을 잠깐 벗어났다 돌아오면 같은 설정으로 다시 찾기) */
let last: { queue: string; nickname: string; mode: string; follow: boolean } | null = null;
/** 찾는 중에 화면을 벗어난 시각 (0 = 계속 보고 있었음) */
let awayStart = 0;
const REJOIN_MS = 3 * 60_000;
/** 찾기 세대: 그만 찾기 → 다시 찾기 사이에 늦게 온 예전 응답은 무시 */
let gen = 0;
let inflight = false;
/** '준비 중'(대기표 만드는 중)에 그만 찾기를 눌렀으면 만든 뒤 바로 빠짐 */
let cancelAsked = false;
const stopPoll = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
async function tick() {
  if (st.phase !== 'searching' && st.phase !== 'linking') return stopPoll();
  if (inflight) return; // 방을 만드는 응답이 1.5초보다 오래 걸려도 겹치지 않게
  inflight = true;
  const my = gen;
  try {
    const s = await api<{ status: string; reason?: string } & Partial<MatchInfo> & Partial<Matched>>('queueStatus');
    if (my !== gen || getMatch().phase === 'idle') return; // 그사이 그만 찾기·새로 찾기
    if (s.status === 'matched' && s.roomId && s.playerId) {
      stopPoll();
      play('win');
      flashTitle();
      set({ phase: 'idle', queue: null, info: null, err: '', matched: { roomId: s.roomId, playerId: s.playerId, code: s.code ?? '', nickname: s.nickname ?? '', mode: s.mode ?? 'easy', at: Date.now() } });
      return;
    }
    if (s.status === 'none') {
      stopPoll();
      // 휴대폰에서 앱을 바꾸거나 화면을 끄면 확인 요청이 멈춰 서버가 10초 뒤 대기표를 지움(그사이 매칭되지 않게).
      // 3분 안에 돌아왔으면 같은 설정으로 바로 다시 찾고, 더 오래 비웠으면 멈췄다고 알림 (파티원은 파티장이 다시 찾음)
      if (s.reason !== 'party' && awayStart && last && !last.follow) {
        const away = Date.now() - awayStart;
        awayStart = 0;
        if (away < REJOIN_MS) {
          const l = last;
          set({ phase: 'idle', queue: null, info: null });
          void startMatch(l.queue, l.nickname, l.mode).then(() => getMatch().phase === 'searching' && showNotice('화면을 벗어난 사이 대기가 끊겨서 다시 찾고 있어요.'));
          return;
        }
        set({ phase: 'idle', queue: null, info: null, err: '화면을 오래 벗어나 있어서 찾기를 멈췄어요. 다시 찾아 주세요.' });
        return;
      }
      set({ phase: 'idle', queue: null, info: null, err: s.reason === 'party' ? '파티원 연결이 끊겨서 같이 찾기가 취소됐어요. 친구가 다시 들어오면 찾아 주세요.' : '대기가 끝났어요. 다시 찾아 주세요.' });
      return;
    }
    const info: MatchInfo = { waitedSec: s.waitedSec ?? 0, inQueue: s.inQueue ?? 1, window: s.window ?? 100, similar: s.similar ?? 0, online: s.online ?? 0, etaSec: s.etaSec ?? null };
    // 서버가 센 대기 시간(초 단위로 버림)에 화면 시계를 맞추되, 2초 넘게 어긋날 때만 — 매번 맞추면 시작 시각이
    // 1초 안에서 앞뒤로 흔들려 숫자가 2씩 뛰거나 멈춰 보였음. 연결이 돌아오면 오류 글자도 지움
    const serverStart = Date.now() - info.waitedSec * 1000;
    // 보고 있는 화면에서 대기가 이어졌으면 '벗어나 있었음' 기록을 지움
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') awayStart = 0;
    set({ info, err: '', ...(Math.abs(serverStart - st.startedAt) > 2000 ? { startedAt: serverStart } : {}) });
  } catch (e) {
    if (my !== gen) return;
    // 로그인이 풀렸으면 더 묻지 않고 멈춤 (헛된 요청 반복 방지)
    if (e instanceof ApiError && e.status === 401) {
      stopPoll();
      set({ phase: 'idle', queue: null, info: null, err: '로그인이 풀려서 찾기를 멈췄어요. 다시 찾아 주세요.' });
      return;
    }
    set({ err: e instanceof Error ? e.message : String(e) });
  } finally {
    inflight = false;
  }
}
/** 다른 탭을 보고 있으면 탭 제목을 깜빡여 알려 줌 (돌아오면 원래대로) */
function flashTitle() {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  const orig = document.title;
  let on = false;
  const id = setInterval(() => {
    on = !on;
    document.title = on ? '상대를 찾았어요!' : orig;
  }, 900);
  const stop = () => {
    clearInterval(id);
    document.title = orig;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}
const startPoll = () => {
  stopPoll();
  inflight = false;
  void tick();
  timer = setInterval(tick, 1500);
};

/** 찾기 시작 (서버에 대기표) */
export async function startMatch(queue: string, nickname: string, mode: string) {
  if (st.phase !== 'idle') return;
  gen++;
  cancelAsked = false;
  last = { queue, nickname, mode, follow: false };
  // 뒤에 있는 창에서 다시 찾기가 시작됐으면 '벗어나 있음'을 그대로 기억
  awayStart = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? awayStart || Date.now() : 0;
  set({ phase: 'joining', err: '', matched: null, startedAt: Date.now(), info: null }); // 지난 찾기의 시작 시각이 잠깐 보이지 않게
  try {
    await api('queueJoin', { queue, nickname, mode });
    if (cancelAsked) {
      // 만드는 사이 그만 찾기를 눌렀음 → 만든 대기표에서 바로 빠짐
      cancelAsked = false;
      await api('queueLeave').catch(() => {});
      set({ phase: 'idle', queue: null, info: null });
      return;
    }
    set({ phase: 'searching', queue, startedAt: Date.now(), info: null });
    startPoll();
  } catch (e) {
    set({ phase: 'idle', err: e instanceof Error ? e.message : String(e) });
  }
}
/** 파티원: 파티장이 이미 대기표를 만들었으니 확인만 */
export function followMatch(queue: string | null) {
  if (st.phase !== 'idle') return;
  gen++;
  last = queue ? { queue, nickname: '', mode: '', follow: true } : null;
  awayStart = typeof document !== 'undefined' && document.visibilityState === 'hidden' ? awayStart || Date.now() : 0;
  set({ phase: 'searching', queue, startedAt: Date.now(), info: null, err: '', matched: null });
  startPoll();
}
/** 그만 찾기 — 이미 상대가 잡혀 방을 만드는 중이면 취소하지 않고 결과를 기다림. 멈췄으면 true */
export async function cancelMatch(): Promise<boolean> {
  if (st.phase === 'idle') return true;
  if (st.phase === 'linking') return false;
  if (st.phase === 'joining') {
    cancelAsked = true;
    return false;
  }
  // 먼저 지금 돌고 있는 확인을 무효로 — 그만 찾기와 동시에 온 'none' 응답이 '다시 찾기'를 시작하지 않게
  gen++;
  stopPoll();
  awayStart = 0;
  try {
    const r = await api<{ ok: boolean; pending?: boolean }>('queueLeave');
    if (r.pending) {
      // 이미 상대가 잡혀 방을 만드는 중 → 결과를 받으러 다시 확인
      set({ phase: 'linking' });
      startPoll();
      return false;
    }
  } catch {
    /* 연결이 끊겼어도 멈춤 — 서버가 10초 뒤 대기표를 정리 */
  }
  set({ phase: 'idle', queue: null, info: null, err: '' });
  return true;
}
/** 계정이 바뀔 때(로그인·로그아웃): 대기를 멈추고 남은 결과도 버림 */
export async function resetMatch() {
  if (st.phase === 'searching') await api('queueLeave').catch(() => {});
  gen++;
  stopPoll();
  cancelAsked = false;
  set({ phase: 'idle', queue: null, info: null, err: '', notice: '', matched: null });
}
/** 매칭 결과를 한 번만 꺼내 씀 (게임 화면으로 이동할 때). 2분 넘은 결과는 버림 */
export function consumeMatched() {
  const m = st.matched;
  if (!m) return null;
  set({ matched: null });
  return Date.now() - m.at < 120_000 ? m : null;
}
export const clearMatchErr = () => st.err && set({ err: '' });

/** 대기 중에는 할 수 없는 행동이면 안내하고 false (방 만들기·입장·연습·튜토리얼·1대1 신청 등) */
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function showNotice(text: string) {
  set({ notice: text });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => set({ notice: '' }), 3500);
}
export function okWhileMatching(what = '이건') {
  if (st.phase === 'idle') return true;
  showNotice(`매칭 대기 중이에요. ${what} 그만 찾기를 누른 뒤에 할 수 있어요.`);
  return false;
}

// 창을 닫으면 대기 취소 (페이지가 사라져도 요청이 끝까지 가도록)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (st.phase === 'searching') {
      leaveQueueOnExit();
      awayStart = awayStart || Date.now();
    }
  });
  // 휴대폰: 앱 바꾸기·화면 끄기 → 확인이 멈춤. 돌아오면 바로 한 번 확인 (끊겼으면 위에서 다시 찾기)
  document.addEventListener('visibilitychange', () => {
    if (st.phase !== 'searching') return;
    if (document.visibilityState === 'hidden') awayStart = awayStart || Date.now();
    else {
      if (!timer) startPoll();
      else void tick();
    }
  });
  // 뒤로 가기 캐시에서 페이지가 되살아나면(멈춰 있던 화면) 확인을 다시 시작
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && st.phase === 'searching') startPoll();
  });
}

/** 대기열 이름 → "일반전 · 1대1 · 신속" */
export function queueText(q: string | null) {
  if (!q) return '';
  const [kind, size, speed] = q.split('_');
  return `${kind === 'ranked' ? '랭킹전' : '일반전'} · ${size === 'duel' ? '1대1' : '다인전'} · ${speed === 'quick' ? '신속' : '일반'}`;
}
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
