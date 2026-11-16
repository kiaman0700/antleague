/**
 * 내 계정 상태 (회원 / 게스트). 회원 정보는 서버에서만 받아 옴 — 화면에 저장하지 않음.
 * 아이디 로그인은 "아이디@u.stockduel.invalid" 가짜 주소로 비밀번호 로그인 (메일은 가지 않음)
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { saveNick } from '../session';
import { api } from './api';

export const USER_DOMAIN = 'u.stockduel.invalid';

export interface MyProfile {
  username: string;
  nickname: string;
  title: string | null;
  rating: number;
  games: number;
  wins: number;
  best_ret: number | null;
  rankPos: number | null;
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
}
export interface AccountState {
  status: 'loading' | 'guest' | 'member';
  profile: MyProfile | null;
  recent: MatchRow[];
  badges: Record<string, number>;
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
  inflight = api<{ profile: MyProfile | null; recent?: MatchRow[]; badges?: Record<string, number> }>('profile')
    .then((r) => {
      set({ status: r.profile ? 'member' : 'guest', profile: r.profile, recent: r.recent ?? [], badges: r.badges ?? {} });
      // 회원이면 게임에서 쓰는 닉네임도 프로필 닉네임으로
      if (r.profile) saveNick(r.profile.nickname);
    })
    .catch(() => set({ ...state, status: state.status === 'loading' ? 'guest' : state.status }))
    .finally(() => (inflight = null));
  return inflight;
}

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

/** 아이디·비밀번호 로그인 → 이 기기는 그 회원 계정이 됨 */
export async function loginWith(username: string, password: string) {
  if (!supabase) throw new Error('온라인 설정이 없어요.');
  const u = username.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithPassword({ email: `${u}@${USER_DOMAIN}`, password });
  if (error) throw new Error(/rate|many/i.test(error.message) ? '로그인 시도가 너무 많아요. 잠시 후 다시 해 주세요.' : '아이디 또는 비밀번호가 맞지 않아요.');
  await refreshAccount();
}

/** 로그아웃 → 다음에 게임하면 새 게스트로 */
export async function logout() {
  await supabase?.auth.signOut();
  set({ status: 'guest', profile: null, recent: [], badges: {} });
}
