/** 카운트다운 길이(초) — 서버·화면 공용 (가벼운 모듈: 로비가 엔진 전체를 불러오지 않게) */
export function graceSecondsFor(players: number, turnSeconds: number) {
  return players <= 2 ? Math.max(20, Math.min(90, Math.round(turnSeconds / 3))) : Math.max(10, Math.min(30, Math.round(turnSeconds / 6)));
}
