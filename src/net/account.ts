/**
 * 내 계정 상태 (회원 / 게스트). 회원 정보는 서버에서만 받아 옴 — 화면에 저장하지 않음.
 * 아이디 로그인: 서버가 아이디에 맞는 무작위 가짜 주소(…@u.stockduel.invalid)를 알려 주고 그 주소로 비밀번호 로그인 (메일은 가지 않음)
 */
import { useEffect, useSyncExternalStore } from 'react';
import { accessToken, supabase } from '../lib/supabase';
import { saveNick } from '../session';
import { api } from './api';
import { resetMatch } from './matchStore';

export const USER_DOMAIN = 'u.stockduel.invalid';

export interface MyProfile {
  /** 챌린저 #순위 (서버가 정함) */
  chal?: number;
  username: string;
  nickname: string;
  title: string | null;
  rating: number;
  /** 랭킹전 판 수 (2판까지 배치) */
  ranked_games?: number;
  /** 프로필 사진 프리셋 id */
  avatar?: string;
  /** 미션 경험치 (레벨) */
  xp?: number;
  games: number;
  wins: number;
  best_ret: number | null;
  rankPos: number | null;
  /** 랭크 점수 감소(다이아몬드 이상): 랭킹전을 쉬어도 되는 남은 날 · 다 쓰면 하루에 깎이는 점수 */
  decay?: { days: number; perDay: number };
}
export interface MatchRow {
  room_id: string;
  rank: number;
  players: number;
  ret: number;
  rated: boolean;
  rating_before: number | null;
  rating_after: number | null;
  created_at: string;
  /** (042) 판 종류 · 랭킹전 */
  kind?: string | null;
  ranked?: boolean | null;
}
/** 전적에 보일 판 종류 이름 (롤·배그 전적처럼) */
export function matchKindName(kind: string | null | undefined, ranked: boolean | null | undefined, players: number) {
  if (kind === 'match') return ranked ? '랭킹전' : '일반전';
  if (kind === 'bot') return '봇전';
  if (kind === 'daily') return '오늘의 도전';
  if (kind === 'friend') return '친구 1대1';
  if (kind === 'custom') return '커스텀';
  return players === 2 ? '1대1' : players + '명 대결';
}
export interface AccountState {
  /** visitor = 아직 게스트·로그인·회원가입을 고르지 않음(세션 없음) — 둘러보기만 (design/onboarding.md) */
  status: 'loading' | 'visitor' | 'guest' | 'member';
  profile: MyProfile | null;
  recent: MatchRow[];
  badges: Record<string, number>;
  /** '나의 투자 감각' (서버가 내 최근 판으로 계산한 평균, 회원만) */
  skills?: SkillInfo;
}
export interface SkillSummary {
  games: number;
  catchesPerGame: number;
  newsAccuracy: number | null;
  avgMaxWeight: number;
  avgBeat: number;
}
export interface SkillInfo {
  all: SkillSummary;
  recent: SkillSummary | null;
  older: SkillSummary | null;
}

let state: AccountState = { status: 'loading', profile: null, recent: [], badges: {} };
const subs = new Set<() => void>();
const set = (s: AccountState) => {
  state = s;
  subs.forEach((f) => f());
};
let inflight: Promise<void> | null = null;

/** 서버에서 내 계정 상태를 다시 받아 옴 */
export function refreshAccount(): Promise<void> {
  if (!supabase) {
    set({ status: 'guest', profile: null, recent: [], badges: {} });
    return Promise.resolve();
  }
  if (inflight) return inflight;
  inflight = supabase.auth
    .getSession()
    .then((r) => !!r.data.session)
    .catch(() => true)
    .then((has) => {
      if (!has) {
        // 회원이던 기기가 (다른 곳 접속·만료로) 로그아웃됐으면 회원 닉네임을 이 기기에 남기지 않음 (함께 쓰는 기기)
        if (state.status === 'member') saveNick('');
        set({ status: 'visitor', profile: null, recent: [], badges: {} });
        return;
      }
      return loadProfile();
    })
    .finally(() => (inflight = null));
  return inflight;
}

function loadProfile(): Promise<void> {
  return api<{ profile: MyProfile | null; recent?: MatchRow[]; badges?: Record<string, number>; skills?: SkillInfo }>('profile')
    .then((r) => {
      set({ status: r.profile ? 'member' : 'guest', profile: r.profile, recent: r.recent ?? [], badges: r.badges ?? {}, skills: r.skills });
      // 회원이면 게임에서 쓰는 닉네임도 프로필 닉네임으로
      if (r.profile) saveNick(r.profile.nickname);
    })
    .catch(() => set({ ...state, status: state.status === 'loading' ? 'guest' : state.status }));
}

/** 로그인·로그아웃·다른 곳 접속으로 세션이 바뀌면 계정 상태를 다시 */
if (supabase) {
  supabase.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => void refreshAccount(), 0);
  });
}
if (typeof window !== 'undefined')
  window.addEventListener('session-replaced', () => {
    // 안내는 App 의 동시 접속 창('kicked')이 '확인'을 누를 때까지 보여 줌
    void refreshAccount();
  });

export function useAccount(): AccountState {
  const s = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
  );
  useEffect(() => {
    if (state.status === 'loading') refreshAccount();
  }, []);
  return s;
}

export interface GuestLeftover {
  guestToken: string;
  games: number;
  playing: number;
}

/**
 * 아이디·비밀번호 로그인 → 이 기기는 그 회원 계정이 됨.
 * 로그인 전에 게스트로 남긴 기록이 있으면 돌려줌 (가져올지 버릴지 고르게)
 */
export async function loginWith(username: string, password: string): Promise<GuestLeftover | null> {
  if (!supabase) throw new Error('온라인 설정이 없어요.');
  const u = username.trim().toLowerCase();
  // 무엇이 틀렸는지(아이디·비밀번호·형식) 구별해서 알려 주지 않음
  if (!/^[a-z0-9_]{4,16}$/.test(u) || password.length < 1 || password.length > 72) throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
  await resetMatch(); // 로그인하면 계정이 바뀌므로 지금 계정의 매칭 대기는 멈춤
  const before = (await supabase.auth.getSession()).data.session;
  const wasGuest = before && !before.user.email?.endsWith('@' + USER_DOMAIN) ? before.access_token : null;
  // 로그인 주소는 아이디와 상관없는 무작위 값이라 서버에 물어봄 (없는 아이디도 가짜 주소가 와서 구별 안 됨)
  let email = '';
  try {
    const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'loginEmail', username: u }) });
    if (r.status === 429) throw new Error('로그인 시도가 너무 많아요. 잠시 후 다시 해 주세요.');
    email = ((await r.json()) as { email?: string }).email ?? '';
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('로그인 시도')) throw e;
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  if (!email) throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/rate|many/i.test(error.message) ? '로그인 시도가 너무 많아요. 잠시 후 다시 해 주세요.' : '아이디 또는 비밀번호가 맞지 않아요.');
  await refreshAccount();
  if (!wasGuest) return null;
  try {
    const s = await api<{ games: number; playing: number }>('guestSummary', { guestToken: wasGuest });
    if (s.games + s.playing > 0) return { guestToken: wasGuest, ...s };
    // 남긴 기록이 없는 빈 게스트는 조용히 정리
    await api('mergeGuest', { guestToken: wasGuest, mode: 'discard' }).catch(() => {});
  } catch {
    /* 게스트가 아니었거나 이미 정리됨 */
  }
  return null;
}

/** 게스트 기록을 이 계정으로 가져오거나(merge) 버림(discard) */
export async function resolveGuest(guestToken: string, mode: 'merge' | 'discard') {
  const r = await api<{ moved: number }>('mergeGuest', { guestToken, mode });
  await refreshAccount();
  return r.moved;
}

/** 로그아웃 → 다음에 게임하면 새 게스트로 */
export async function logout() {
  await resetMatch(); // 다른 계정으로 바뀌기 전에 이 계정의 매칭 대기를 멈춤
  await supabase?.auth.signOut();
  // 회원 닉네임이 게스트 닉네임으로 남지 않게 (손님은 회원 닉네임을 못 써서 막힘) → 다음에 온라인 기능을 누르면 손님 닉네임을 새로 정함
  saveNick('');
  set({ status: 'visitor', profile: null, recent: [], badges: {} });
}

/** 게스트로 시작: 이 브라우저에 게스트 계정(세션)을 만듦 → 둘러보기에서 벗어남 */
export async function startGuest() {
  await accessToken();
  await refreshAccount();
}

/** (051) 게스트 이어하기 코드로 그 게스트 불러오기 — 지금 이 브라우저의 로그인은 바뀜(예전 기기는 끊김) */
export async function resumeGuestWithCode(code: string) {
  if (!supabase) throw new Error('온라인 설정이 없어요.');
  let r: Response;
  try {
    r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'guestResume', code }) });
  } catch {
    throw new Error('인터넷 연결을 확인해 주세요.');
  }
  const b = (await r.json().catch(() => null)) as { email?: string; password?: string; error?: string } | null;
  if (!r.ok || !b?.email || !b.password) throw new Error(b?.error ?? '코드가 맞지 않아요. 다시 확인해 주세요.');
  await resetMatch();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  const { error } = await supabase.auth.signInWithPassword({ email: b.email, password: b.password });
  if (error) throw new Error('불러오지 못했어요. 잠시 뒤에 다시 해 주세요.');
  saveNick('');
  await refreshAccount();
}
