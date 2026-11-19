/** 방 코드 글자 (서버 newCode 와 같음 — 헷갈리는 I·O·0·1 없음) */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 입력 칸에 친 글자 → 방 코드.
 * 초대 링크(…/room/ABC123, …/game/ABC123, ?room=ABC123)를 통째로 붙여 넣어도 코드만 꺼냄.
 * 그 밖에는 글자·숫자만 남겨 대문자로 (최대 6자).
 */
export function parseRoomCode(raw: string): string {
  const link = raw.match(/(?:\/(?:room|game)\/|[?&]room=)([A-Za-z0-9]{6})(?![A-Za-z0-9])/);
  if (link) return link[1].toUpperCase();
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/** 코드에 절대 없는 글자(I·O·0·1)가 들어 있는지 — 잘못 읽은 것 */
export function hasConfusable(code: string): boolean {
  return /[IO01]/.test(code);
}
