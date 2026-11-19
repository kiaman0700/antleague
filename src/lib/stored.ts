/**
 * 이 기기에 저장한 JSON 값 읽기 — 망가졌거나(예전 버전·확장 프로그램·저장 중 끊김) 모양이 다르면 기본값.
 * 기본값이 목록이면 목록만, 객체면 객체만 받음. ok 로 항목·값을 더 거를 수 있음.
 * (예전엔 모양을 안 봐서 관심 종목 값이 목록이 아니면 모든 게임 화면이 오류로 멈췄음)
 */
export function sameShape(v: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(v);
  if (fallback === null) return true;
  if (typeof fallback === 'object') return typeof v === 'object' && v !== null && !Array.isArray(v);
  return typeof v === typeof fallback;
}

export function parseStored<T>(raw: string | null, fallback: T, ok?: (v: T) => boolean): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!sameShape(v, fallback)) return fallback;
    if (ok && !ok(v as T)) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

export function readStored<T>(key: string, fallback: T, ok?: (v: T) => boolean): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  return parseStored(raw, fallback, ok);
}

/** 목록 항목이 모두 글자인지 */
export const allStrings = (v: unknown[]) => v.every((x) => typeof x === 'string');
