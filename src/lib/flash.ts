/**
 * 화면을 옮겨 가며 보여 줄 짧은 확인 한 줄 (예: 기권한 뒤 로비에서 '기권했어요').
 * 앱 메모리에만 두고, 보여 준 지 3.5초 뒤에 지움 — 로비가 처음 그려지는 동안 몇 번 다시 그려져도 사라지지 않게.
 */
let text = '';
let tone: 'info' | undefined;
let clearAt = 0;

/** kind 'info': 해낸 일이 아니라 알려 주는 말 (체크 표시 대신 안내 아이콘) */
export function setFlash(t: string, kind?: 'info') {
  text = t;
  tone = kind;
  clearAt = 0;
  // 이미 그려진 로비도 바로 보여 주게
  try {
    window.dispatchEvent(new Event('flash'));
  } catch {
    /* 무시 */
  }
}

/** 지금 보여 줄 글 (처음 읽은 때부터 3.5초 동안 같은 글) */
export function peekFlash(): string {
  if (!text) return '';
  const now = Date.now();
  if (!clearAt) clearAt = now + 3500;
  if (now > clearAt) {
    text = '';
    clearAt = 0;
  }
  return text;
}

export function flashTone() {
  return tone;
}

/** 남은 표시 시간(ms) */
export function flashLeft(): number {
  return clearAt ? Math.max(0, clearAt - Date.now()) : 0;
}
