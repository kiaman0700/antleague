/**
 * 오늘의 도전 연속 기록 (설계서 design/v24-big-update.md C — 조사: 연속 기록 + 놓친 날을 살리는 '얼리기'가 오래 하게 함).
 * 날마다 오늘의 도전을 하면 +1, 7일마다 얼리기 1개(최대 2개). 하루 놓치면 얼리기 하나로 이어짐(그날은 +1 없음), 얼리기가 없으면 0부터.
 * 오늘을 아직 안 했으면 끊긴 게 아님(오늘 안에 하면 이어짐). 서버가 기록(날짜)으로만 계산 — 화면이 보낸 값은 안 씀
 */
export const FREEZE_EVERY = 7;
export const FREEZE_MAX = 2;

/** days: 도전한 날(YYYY-MM-DD, 한국 날짜), today: 오늘 */
export function streakOf(days: string[], today: string): { streak: number; best: number; freezes: number; playedToday: boolean } {
  const set = new Set(days);
  if (!set.size) return { streak: 0, best: 0, freezes: 0, playedToday: false };
  const toNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
  const nums = [...set].map(toNum).sort((a, b) => a - b);
  const t = toNum(today);
  let streak = 0;
  let best = 0;
  let freezes = 0;
  let earned = 0;
  for (let d = nums[0]; d <= t; d++) {
    if (set.has(new Date(d * 86_400_000).toISOString().slice(0, 10))) {
      streak++;
      earned++;
      if (earned % FREEZE_EVERY === 0) freezes = Math.min(FREEZE_MAX, freezes + 1);
    } else if (d === t) {
      // 오늘은 아직 안 함 — 끊긴 게 아님
    } else if (freezes > 0) {
      freezes--;
    } else {
      streak = 0;
      earned = 0;
    }
    best = Math.max(best, streak);
  }
  return { streak, best, freezes, playedToday: set.has(today) };
}
