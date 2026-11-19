/**
 * (060) 동시 접속 안내 상태 — FC온라인 방식 (사용자 결정 2026-11-19, design/v26-batch.md)
 * - 'ask'      : 다른 기기에서 접속 중 → '여기서 접속할까요?'
 * - 'declined' : 취소함 → 이 기기는 접속하지 않은 상태(요청은 계속 거절됨). [여기서 접속] 만
 * - 'kicked'   : 다른 기기가 '여기서 접속'을 골라 이 기기는 동시 접속으로 로그아웃됨
 * 로비 등 어디서든 App 이 하나의 창으로 보여 줌. 서버가 늘 다시 확인하므로 이 값은 화면 표시용일 뿐.
 */
import { useSyncExternalStore } from 'react';

export type ConcurrentMode = null | 'ask' | 'declined' | 'kicked';
let mode: ConcurrentMode = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setConcurrent(m: ConcurrentMode) {
  if (mode === m) return;
  // 취소한 뒤에 오는 요청 거절은 다시 묻지 않음 (취소 화면 유지), 로그아웃 안내는 '확인' 전까지 그대로
  if (m === 'ask' && (mode === 'declined' || mode === 'kicked')) return;
  mode = m;
  emit();
}
export const concurrentMode = () => mode;
/** 요청이 다시 통과하면(다른 기기가 그만둠) 묻던 창은 저절로 닫음 */
export function concurrentCleared() {
  if (mode === 'ask' || mode === 'declined') setConcurrent(null);
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
