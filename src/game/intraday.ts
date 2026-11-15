/**
 * 장중 5초 칸 가격.
 * 일별 가격(시가·종가·고가·저가)과 8점 장중 흐름은 그대로 두고, 그 사이를 **다른 난수**로 잘게 이어서 만든다.
 * → 같은 시드의 일별 가격이 바뀌지 않아 진행 중인 게임이 안전하다.
 *
 * 장중에도 서로 연결되게:
 * - 시장 공통 흐름(한국·미국) + 업종 공통 흐름을 먼저 만들고, 종목은 업종 민감도만큼 따라간다
 * - 지수 칸 = 종목 칸의 (v2: 시가총액) 가중 평균, 지수·바스켓 ETF 칸 = 담은 종목 칸 × 배율
 *
 * 이 함수는 서버(진짜 가격)와 혼자 연습에서만 쓴다. 화면으로는 지금 칸까지만 잘라서 보낸다.
 */
import { gaussian, mulberry32 } from '../lib/rng.js';
import { KR_INDEX_BASE, roundPrice, roundUsd, US_INDEX_BASE, type Bar, type Market } from './market.js';
import { CAP_WEIGHT, COMPANIES, etfMembers, SECTOR_MAP, STOCK_MAP } from './stocks.js';

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

/**
 * 속보 시점(at) 전에는 하루 흐름의 15%만 진행, 속보 뒤에 나머지가 몰림.
 * jump(v3): 속보가 뜨는 칸에서 바로 그만큼 뛰고(실제 시장처럼) 나머지만 천천히 → 보고 따라 사도 이미 많이 오른 뒤
 */
function warp(f: number, at: number | null, jump = 0) {
  if (at === null) return f;
  return f < at ? (0.15 * f) / at : 0.15 + jump + ((0.85 - jump) * (f - at)) / (1 - at);
}

const cache = new Map<string, number[]>();
function cached(key: string, make: () => number[]) {
  const hit = cache.get(key);
  if (hit) return hit;
  const v = make();
  if (cache.size > 8000) cache.clear();
  cache.set(key, v);
  return v;
}

/** 양 끝이 0인 무작위 흐름 (로그 수익률 단위, 하루 동안 표준편차 ≈ amp) */
function bridge(seedKey: string, n: number, amp: number): number[] {
  const rng = mulberry32(hash(seedKey));
  const w = [0];
  for (let j = 1; j <= n; j++) w.push(w[j - 1] + gaussian(rng));
  const scale = amp / Math.sqrt(n);
  return w.map((v, j) => (v - (j / n) * w[n]) * scale);
}

/** 시장 공통 흐름 (한국·미국 같은 시간에 열림. 미국은 한국과 일부 같이 움직임) */
function marketFlow(m: Market, region: 'KR' | 'US', day: number, n: number) {
  return cached(`mf:${m.seed}:${m.totalDays}:${region}:${day}:${n}`, () => {
    const kr = bridge(`${m.seed}:mf:KR:${day}:${n}`, n, 0.01);
    if (region === 'KR') return kr;
    const us = bridge(`${m.seed}:mf:US:${day}:${n}`, n, 0.01);
    return us.map((v, j) => 0.85 * v + 0.3 * kr[j]);
  });
}
/** 업종 공통 흐름 */
function sectorFlow(m: Market, sector: string, day: number, n: number) {
  return cached(`sf:${m.seed}:${m.totalDays}:${sector}:${day}:${n}`, () => bridge(`${m.seed}:sf:${sector}:${day}:${n}`, n, 0.009));
}

/**
 * symbol 의 day 장중 가격 n+1 칸 (0 = 시가, n = 종가).
 * cur='usd' 면 미국 주식의 달러 가격. 시장 데이터(m)는 서버의 전체 시장이어야 함(장중 흐름 포함).
 */
export function dayTicks(m: Market, symbol: string, day: number, n: number, cur: 'krw' | 'usd' = 'krw'): number[] {
  return cached(`${m.seed}:${m.totalDays}:${m.version ?? 1}:${symbol}:${day}:${n}:${cur}`, () => {
    const def = STOCK_MAP[symbol];
    const bar: Bar | undefined = (cur === 'usd' ? m.usd[symbol] : m.bars[symbol])?.[day];
    if (!bar || !def) throw new Error('no bar');
    // 실제 한국 ETF 호가 단위는 가격과 상관없이 5원 (주식은 가격대별 호가 단위)
    const round = cur === 'usd' ? roundUsd : def.etf ? (v: number) => Math.max(5, Math.round(v / 5) * 5) : roundPrice;
    // 지수·바스켓 ETF: 담은 종목 칸에서 계산
    if (def.etf && (def.etf.track.type === 'basket' || def.etf.track.type === 'index')) {
      const members = etfMembers(def.etf);
      const mt = members.map((sym) => dayTicks(m, sym, day, n));
      const out: number[] = [];
      for (let j = 0; j <= n; j++) {
        if (j === 0) out.push(bar.open);
        else if (j === n) out.push(bar.close);
        else {
          const r = mt.reduce((a, t) => a + Math.log(t[j] / t[0]), 0) / mt.length;
          out.push(round(Math.max(100, bar.open * Math.exp(def.etf.lev * r))));
        }
      }
      return out;
    }
    const sec = SECTOR_MAP[def.sector];
    const flow =
      def.etf || !sec
        ? null
        : {
            mk: marketFlow(m, sec.region === 'US' ? 'US' : 'KR', day, n),
            sf: sectorFlow(m, def.sector, day, n),
            beta: sec.beta * def.sectorBeta,
            sb: def.sectorBeta,
          };
    return fineTicks(bar, n, mulberry32(hash(`${m.seed}:${symbol}:${day}:${n}`)), releaseOf(m, symbol, day), round, flow, (m.version ?? 1) >= 3 ? 0.55 : 0);
  });
}

/**
 * 지수 장중 칸 = 종목 칸의 가중 평균 (v1 균등, v2 시가총액). 시가·종가는 그날 지수와 정확히 같다
 */
export function indexTicks(m: Market, which: 'kr' | 'us', day: number, n: number): number[] {
  return cached(`idx:${m.seed}:${m.totalDays}:${m.version ?? 1}:${which}:${day}:${n}`, () => {
    const bars = which === 'kr' ? m.index : m.usIndex;
    const bar = bars[day];
    const prevLevel = day === 0 ? (which === 'kr' ? KR_INDEX_BASE : US_INDEX_BASE) : bars[day - 1].close;
    const v2 = (m.version ?? 1) >= 2;
    const comps = COMPANIES.filter((c) => (which === 'kr' ? c.currency === 'KRW' : c.currency === 'USD'));
    const series = comps.map((c) => {
      const cur = which === 'us' ? 'usd' : 'krw';
      const src = which === 'us' ? m.usd[c.symbol] : m.bars[c.symbol];
      const prev = day === 0 ? (which === 'us' ? m.baseUsd[c.symbol] : m.base[c.symbol]) : src[day - 1].close;
      return { t: dayTicks(m, c.symbol, day, n, cur), prev, w: v2 ? (CAP_WEIGHT[c.symbol] ?? 1) : 1 };
    });
    const W = series.reduce((a, s) => a + s.w, 0);
    const out: number[] = [];
    for (let j = 0; j <= n; j++) {
      if (j === 0) out.push(bar.open);
      else if (j === n) out.push(bar.close);
      else out.push(Math.round(prevLevel * Math.exp(series.reduce((a, s) => a + s.w * Math.log(s.t[j] / s.prev), 0) / W) * 100) / 100);
    }
    return out;
  });
}

/** 이 종목의 그날 장중 속보 중 가장 이른 시점 (진짜 기사만 가격을 움직임) */
function releaseOf(m: Market, symbol: string, day: number): number | null {
  let at: number | null = null;
  for (const n of m.news) if (n.day === day && n.symbol === symbol && n.at != null && !n.fake && (at === null || n.at < at)) at = n.at;
  return at;
}

function fineTicks(
  bar: Bar,
  n: number,
  rng: () => number,
  at: number | null,
  round: (v: number) => number,
  flow: { mk: number[]; sf: number[]; beta: number; sb: number } | null,
  jump = 0,
): number[] {
  const lo = Math.log(bar.open);
  const lc = Math.log(bar.close);
  // 종목 고유 흔들림 (양 끝 0)
  const w = [0];
  for (let j = 1; j <= n; j++) w.push(w[j - 1] + gaussian(rng));
  const idioAmp = (Math.log(bar.high / bar.low) * (flow ? 0.35 : 0.6)) / Math.sqrt(n);
  const trend: number[] = [];
  const dev: number[] = [];
  for (let j = 0; j <= n; j++) {
    trend.push(lo + warp(j / n, at, jump) * (lc - lo));
    const common = flow ? flow.beta * flow.mk[j] + flow.sb * flow.sf[j] : 0;
    dev.push(common + (w[j] - (j / n) * w[n]) * idioAmp);
  }
  // 그날 고가·저가 안에 들어오도록 흔들림 크기만 줄임 (모양·상관은 그대로)
  const hi = Math.log(bar.high);
  const lw = Math.log(bar.low);
  let scale = 1;
  for (let j = 1; j < n; j++) {
    if (dev[j] > 0 && trend[j] + dev[j] > hi) scale = Math.min(scale, Math.max(0, (hi - trend[j]) / dev[j]));
    if (dev[j] < 0 && trend[j] + dev[j] < lw) scale = Math.min(scale, Math.max(0, (lw - trend[j]) / dev[j]));
  }
  const out: number[] = [];
  for (let j = 0; j <= n; j++) {
    if (j === 0) out.push(bar.open);
    else if (j === n) out.push(bar.close);
    else out.push(Math.min(bar.high, Math.max(bar.low, round(Math.exp(trend[j] + scale * dev[j])))));
  }
  return out;
}
