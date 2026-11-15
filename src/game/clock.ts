import { useEffect, useState } from 'react';
import { TICKS_PER_DAY } from './market';

export interface ClockState {
  /** 시작 전이면 음수 */
  elapsed: number;
  countdown: number;
  started: boolean;
  over: boolean;
  /** 현재 가격 인덱스 0..totalTicks */
  tick: number;
  /** 0부터 시작하는 게임 일자 */
  day: number;
  /** 오늘 하루 진행률 0..1 */
  dayProgress: number;
  /** 다음 틱까지 진행률 0..1 */
  tickProgress: number;
}

export function computeClock(now: number, startedAt: number, dayMs: number, totalDays: number): ClockState {
  const tickMs = dayMs / TICKS_PER_DAY;
  const totalTicks = totalDays * TICKS_PER_DAY;
  const elapsed = now - startedAt;
  const started = elapsed >= 0;
  const over = elapsed >= totalTicks * tickMs;
  const rawTick = Math.floor(Math.max(0, elapsed) / tickMs);
  const tick = Math.min(rawTick, totalTicks);
  const day = Math.min(Math.floor(tick / TICKS_PER_DAY), totalDays - 1);
  const dayProgress = over ? 1 : (Math.max(0, elapsed) % dayMs) / dayMs;
  const tickProgress = over ? 1 : (Math.max(0, elapsed) % tickMs) / tickMs;
  return { elapsed, countdown: Math.ceil(-elapsed / 1000), started, over, tick, day, dayProgress, tickProgress };
}

/** offset = 서버시각 - 내시각 */
export function useGameClock(startedAt: number, dayMs: number, totalDays: number, offset: number): ClockState {
  const [state, setState] = useState(() => computeClock(Date.now() + offset, startedAt, dayMs, totalDays));
  useEffect(() => {
    const id = setInterval(() => setState(computeClock(Date.now() + offset, startedAt, dayMs, totalDays)), 100);
    return () => clearInterval(id);
  }, [startedAt, dayMs, totalDays, offset]);
  return state;
}
