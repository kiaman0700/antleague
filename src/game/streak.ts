/**
 * 연속 기록 계산 (design/v26-batch.md A): 인정되는 판을 한 날이 이어진 수. 얼리기 없음 — 하루 빠지면 0부터.
 * 오늘을 아직 안 했으면 끊긴 게 아님(오늘 안에 하면 이어짐). 서버가 기록(날짜)으로만 계산하고 화면은 숫자만 받음.
 */
/** 한 번씩 축하하는 날 수 */
export const STREAK_MILESTONES = [7, 30, 100];

/** days: 인정된 날(YYYY-MM-DD, 한국 날짜), today: 오늘 */
export function streakOf(days: string[], today: string): { streak: number; best: number; playedToday: boolean } {
  const set = new Set(days.filter((d) => d <= today));
  if (!set.size) return { streak: 0, best: 0, playedToday: false };
  const toNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
  const nums = [...set].map(toNum).sort((a, b) => a - b);
  const t = toNum(today);
  let run = 0;
  let best = 0;
  let prev = -Infinity;
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  // 마지막으로 한 날이 오늘이나 어제면 이어지는 중
  const streak = prev === t || prev === t - 1 ? run : 0;
  return { streak, best, playedToday: set.has(today) };
}

/** 이 연속 기록에서 막 닿은 축하 날 수 (없으면 0) */
export const milestoneOf = (streak: number) => (STREAK_MILESTONES.includes(streak) ? streak : 0);
