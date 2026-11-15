/**
 * 장중 5초 칸 가격.
 * 일별 가격(시가·종가·고가·저가)과 8점 장중 흐름은 그대로 두고, 그 사이를 **다른 난수**로 잘게 이어서 만든다.
 * → 같은 시드의 일별 가격이 바뀌지 않아 진행 중인 게임이 안전하다.
 * 이 함수는 서버(진짜 가격)와 혼자 연습에서만 쓴다. 화면으로는 지금 칸까지만 잘라서 보낸다.
 */
import { mulberry32, gaussian } from '../lib/rng.js';
import { roundPrice, roundUsd, type Bar, type Market } from './market.js';

/** 한 칸 = 5초 */
export const TICK_MS = 5000;

/** 하루 제한 시간(초)에 들어가는 칸 수 */
export function ticksPerDay(turnSeconds: number) {
  return Math.max(1, Math.round((turnSeconds * 1000) / TICK_MS));
}

/** 장중 속보가 공개되는 칸 (at = 하루 중 위치 0~1) */
export function releaseTick(at: number, n: number) {
  return Math.min(n, Math.max(1, Math.ceil(at * n)));
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 속보 시점(at) 전에는 하루 흐름의 15%만 진행, 속보 뒤에 나머지가 몰림 */
function warp(f: number, at: number | null) {
  if (at === null) return f;
  return f < at ? (0.15 * f) / at : 0.15 + (0.85 * (f - at)) / (1 - at);
}

const cache = new Map<string, number[]>();

/**
 * symbol 의 day 장중 가격 n+1 칸 (0 = 시가, n = 종가).
 * cur='usd' 면 미국 주식의 달러 가격. 시장 데이터(m)는 서버의 전체 시장이어야 함(장중 흐름 포함).
 */
export function dayTicks(m: Market, symbol: string, day: number, n: number, cur: 'krw' | 'usd' = 'krw'): number[] {
  const key = `${m.seed}:${m.totalDays}:${symbol}:${day}:${n}:${cur}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const bar: Bar | undefined = (cur === 'usd' ? m.usd[symbol] : m.bars[symbol])?.[day];
  if (!bar) throw new Error('no bar');
  const out = fineTicks(bar, n, mulberry32(hash(`${m.seed}:${symbol}:${day}:${n}`)), releaseOf(m, symbol, day), cur === 'usd' ? roundUsd : roundPrice);
  if (cache.size > 5000) cache.clear();
  cache.set(key, out);
  return out;
}

/** 지수 장중 칸 (표시용, 소수 둘째 자리) */
export function indexTicks(m: Market, which: 'kr' | 'us', day: number, n: number): number[] {
  const bar = (which === 'kr' ? m.index : m.usIndex)[day];
  return fineTicks(bar, n, mulberry32(hash(`${m.seed}:idx-${which}:${day}:${n}`)), null, (v) => Math.round(v * 100) / 100);
}

/** 이 종목의 그날 장중 속보 중 가장 이른 시점 (진짜 기사만 가격을 움직임) */
function releaseOf(m: Market, symbol: string, day: number): number | null {
  let at: number | null = null;
  for (const n of m.news) if (n.day === day && n.symbol === symbol && n.at != null && !n.fake && (at === null || n.at < at)) at = n.at;
  return at;
}

function fineTicks(bar: Bar, n: number, rng: () => number, at: number | null, round: (v: number) => number): number[] {
  const anchors = bar.path.length >= 2 ? bar.path : [bar.open, bar.close];
  const k = anchors.length - 1;
  const logA = anchors.map((v) => Math.log(v));
  const amp = Math.log(bar.high / bar.low) * 0.12;
  const out: number[] = [];
  for (let j = 0; j <= n; j++) {
    if (j === 0) {
      out.push(bar.open);
      continue;
    }
    if (j === n) {
      out.push(bar.close);
      continue;
    }
    const g = warp(j / n, at) * k;
    const i = Math.min(k - 1, Math.floor(g));
    const t = g - i;
    const base = logA[i] + (logA[i + 1] - logA[i]) * t;
    const noise = gaussian(rng) * amp * Math.sin(Math.PI * (j / n));
    const v = round(Math.exp(base + noise));
    out.push(Math.min(bar.high, Math.max(bar.low, v)));
  }
  return out;
}
