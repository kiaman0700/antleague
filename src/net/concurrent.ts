/**
 * (060) 동시 접속 안내 상태 — FC온라인 방식 (design/v26-batch.md)
 * - 'ask'      : 다른 기기에서 접속 중 → '여기서 접속할까요?'
 * - 'kicked'   : 다른 기기가 '여기서 접속'을 골라 이 기기는 동시 접속으로 로그아웃됨
 * 로비 등 어디서든 App 이 하나의 창으로 보여 줌. 서버가 늘 다시 확인하므로 이 값은 화면 표시용일 뿐.
 */
import { useSyncExternalStore } from 'react';

export type ConcurrentMode = null | 'ask' | 'kicked';
let mode: ConcurrentMode = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setConcurrent(m: ConcurrentMode) {
  if (mode === m) return;
  // 로그아웃 안내는 '확인' 전까지 그대로
  if (m === 'ask' && mode === 'kicked') return;
  mode = m;
  emit();
}
export const concurrentMode = () => mode;
/** 요청이 다시 통과하면(다른 기기가 그만둠) 묻던 창은 저절로 닫음 */
export function concurrentCleared() {
  if (mode === 'ask') setConcurrent(null);
}

/** 로그아웃되기 전 이 기기가 손님이었는지 — 다시 들어오는 곳(손님: 시작 창, 회원: 로그인 화면)을 고름 */
let guest = false;
export const noteGuest = (g: boolean) => {
  guest = g;
};
export const wasGuest = () => guest;
/** 다시 로그인하는 곳으로: 회원은 /login, 손님은 홈 + 시작 창(로그인·이어하기 코드·게스트로 시작) */
export function goSignIn(asGuest: boolean) {
  try {
    if (asGuest) sessionStorage.setItem('stockduel.askWelcome', '1');
    window.dispatchEvent(new CustomEvent('go-signin', { detail: asGuest ? 'home' : 'login' }));
  } catch {
    /* 무시 */
  }
}
export function useConcurrent(): ConcurrentMode {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => mode,
  );
}
