/** 화면 전용: 서버가 보낸 '지금 칸까지의 장중 가격'을 시장 데이터의 오늘 막대에 합친다 */
import type { LiveView } from '../engine/engine';
import type { Bar, Market } from './market';

function merge(bar: Bar, ticks: number[] | undefined): Bar {
  if (!ticks || !ticks.length) return bar;
  return { ...bar, path: ticks, close: ticks[ticks.length - 1], high: Math.max(bar.open, ...ticks), low: Math.min(bar.open, ...ticks) };
}

export function withLive(m: Market, live: LiveView | null | undefined): Market {
  if (!live || !m.bars || live.day >= m.totalDays) return m;
  const day = live.day;
  const mapBars = (rec: Record<string, Bar[]>, src: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(rec).map(([k, arr]) => [k, arr.map((b, i) => (i === day ? merge(b, src[k]) : b))]));
  return {
    ...m,
    bars: mapBars(m.bars, live.krw),
    usd: mapBars(m.usd, live.usd),
    index: m.index.map((b, i) => (i === day ? merge(b, live.index) : b)),
    usIndex: m.usIndex.map((b, i) => (i === day ? merge(b, live.usIndex) : b)),
    live: { day, tick: live.tick, n: live.n, startAt: live.startAt, endAt: live.endAt },
  };
}
