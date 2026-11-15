import { gaussian, mulberry32, pick, range, Rng } from '../lib/rng';
import * as T from './news';
import { SECTOR_MAP, SECTORS, STOCKS, STOCK_MAP } from './stocks';

/** 하루 장중 가격 포인트 수 (마감 애니메이션 / 라인차트용) */
export const INTRADAY_POINTS = 8;
export const LIMIT_UP = 1.3;
export const LIMIT_DOWN = 0.7;

export type NewsKind = 'macro' | 'sector' | 'company';

export interface NewsEvent {
  day: number;
  kind: NewsKind;
  symbol: string | null;
  sector: string | null;
  headline: string;
  rumor: boolean;
  /** 헤드라인이 말하는 방향 (루머는 실제와 다를 수 있음) */
  tone: 'good' | 'bad';
  /** 루머일 때 실제 방향 (아이템 '루머 감별기'용) */
  realTone: 'good' | 'bad';
}

export interface Bar {
  open: number;
  close: number;
  high: number;
  low: number;
  /** open → close 장중 흐름 */
  path: number[];
}

export interface Macro {
  /** 기준금리 % */
  rate: number;
  /** 원/달러 */
  fx: number;
  /** 유가 $ */
  oil: number;
}

export interface Market {
  seed: number;
  totalDays: number;
  /** 첫날 시가 이전 기준가 */
  base: Record<string, number>;
  bars: Record<string, Bar[]>;
  index: Bar[];
  /** 각 날짜 아침(뉴스 반영 후) 거시 지표 */
  macro: Macro[];
  news: NewsEvent[];
}

function roundPrice(p: number): number {
  const unit = p >= 50000 ? 100 : p >= 10000 ? 50 : p >= 5000 ? 10 : 5;
  return Math.max(unit, Math.round(p / unit) * unit);
}

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** 같은 (seed, totalDays)면 항상 같은 시장 — 두 기기가 서버 없이 같은 시장을 본다 */
export function generateMarket(seed: number, totalDays: number): Market {
  const rng = mulberry32(seed);
  const news: NewsEvent[] = [];
  const base: Record<string, number> = {};
  for (const s of STOCKS) base[s.symbol] = roundPrice(s.basePrice * range(rng, 0.85, 1.15));

  let macro: Macro = { rate: pick(rng, [2.75, 3.0, 3.25, 3.5]), fx: Math.round(range(rng, 1280, 1420)), oil: Math.round(range(rng, 65, 95)) };
  const macroByDay: Macro[] = [];

  // 결과: 각 종목의 하루 '뉴스 충격(S)'과 '잡음(N)' 로그수익률
  const bars: Record<string, Bar[]> = Object.fromEntries(STOCKS.map((s) => [s.symbol, []]));
  const last: Record<string, number> = { ...base };
  const indexBars: Bar[] = [];
  let indexLevel = 2500;

  for (let day = 0; day < totalDays; day++) {
    // ---- 1) 오늘의 뉴스 ----
    let dRate = 0;
    let fxPct = gaussian(rng) * 0.35;
    let oilPct = gaussian(rng) * 1.3;
    let sentiment = 0;
    const sectorShock: Record<string, number> = {};
    const stockShock: Record<string, number> = {};
    const addSec = (id: string, v: number) => (sectorShock[id] = (sectorShock[id] ?? 0) + v);
    const addStock = (sym: string, v: number) => (stockShock[sym] = (stockShock[sym] ?? 0) + v);

    const count = day === 0 ? 2 : 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const r = rng();
      if (r < 0.04 && day > 2) {
        // 블랙스완 / 대형 호재
        const crash = rng() < 0.6;
        sentiment += crash ? -range(rng, 0.045, 0.075) : range(rng, 0.03, 0.05);
        const tone = crash ? 'bad' : 'good';
        news.push({ day, kind: 'macro', symbol: null, sector: null, headline: pick(rng, crash ? T.MACRO.crash : T.MACRO.rally), rumor: false, tone, realTone: tone });
      } else if (r < 0.24) {
        const t = rng();
        let headline: string;
        let tone: 'good' | 'bad';
        if (t < 0.25) {
          // 금리
          const cut = macro.rate > 1.0 && (macro.rate >= 5 || rng() < 0.55);
          const d = rng() < 0.75 ? 0.25 : 0.5;
          dRate += cut ? -d : d;
          headline = fill(pick(rng, cut ? T.MACRO.rateCut : T.MACRO.rateHike), { d: d.toFixed(2) });
          tone = cut ? 'good' : 'bad';
        } else if (t < 0.5) {
          const up = rng() < 0.5;
          const d = range(rng, 5, 12);
          oilPct += up ? d : -d;
          headline = fill(pick(rng, up ? T.MACRO.oilUp : T.MACRO.oilDown), { d: d.toFixed(0) });
          tone = up ? 'bad' : 'good';
        } else if (t < 0.72) {
          const up = rng() < 0.5;
          const d = range(rng, 1.2, 2.8);
          fxPct += up ? d : -d;
          headline = fill(pick(rng, up ? T.MACRO.fxUp : T.MACRO.fxDown), { d: d.toFixed(1) });
          tone = up ? 'bad' : 'good';
        } else {
          const good = rng() < 0.5;
          sentiment += (good ? 1 : -1) * range(rng, 0.012, 0.028);
          headline = pick(rng, good ? T.MACRO.good : T.MACRO.bad);
          tone = good ? 'good' : 'bad';
        }
        news.push({ day, kind: 'macro', symbol: null, sector: null, headline, rumor: false, tone, realTone: tone });
      } else if (r < 0.48) {
        const sec = pick(rng, SECTORS);
        const good = rng() < 0.5;
        const rumor = rng() < 0.2;
        const realGood = rumor ? (rng() < 0.6 ? good : !good) : good;
        const mag = range(rng, 0.025, 0.06) * (rumor ? 0.8 : 1) * (realGood ? 1 : -1);
        addSec(sec.id, mag);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w);
        news.push({
          day,
          kind: 'sector',
          symbol: null,
          sector: sec.id,
          headline: (rumor ? '[루머] ' : '') + pick(rng, (good ? T.SECTOR_GOOD : T.SECTOR_BAD)[sec.id]),
          rumor,
          tone: good ? 'good' : 'bad',
          realTone: realGood ? 'good' : 'bad',
        });
      } else {
        const s = pick(rng, STOCKS);
        const sec = SECTOR_MAP[s.sector];
        const good = rng() < 0.5;
        const rumor = rng() < 0.25;
        const realGood = rumor ? (rng() < 0.6 ? good : !good) : good;
        let mag = range(rng, 0.05, 0.14) * Math.sqrt(s.vol / 0.018) * (rumor ? 0.75 : 1) * (realGood ? 1 : -1);
        // 이미 소문이 퍼져 '재료 소멸' — 좋은 뉴스에도 떨어지는 경우
        if (!rumor && rng() < 0.12) mag = -mag * 0.3;
        addStock(s.symbol, mag);
        // 같은 업종 경쟁사도 업황 기대감에 함께 반응, 연관 업종은 조금
        for (const p of STOCKS) if (p.sector === s.sector && p.symbol !== s.symbol) addStock(p.symbol, mag * 0.25);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w * 0.3);
        const pool = [...(good ? T.COMPANY_GOOD : T.COMPANY_BAD), ...((good ? T.SECTOR_COMPANY_GOOD : T.SECTOR_COMPANY_BAD)[s.sector] ?? [])];
        news.push({
          day,
          kind: 'company',
          symbol: s.symbol,
          sector: s.sector,
          headline: (rumor ? '[루머] ' : '') + fill(pick(rng, pool), { name: s.name }),
          rumor,
          tone: good ? 'good' : 'bad',
          realTone: realGood ? 'good' : 'bad',
        });
      }
    }

    // ---- 2) 거시 지표 갱신 ----
    macro = {
      rate: Math.round(Math.min(6, Math.max(0.5, macro.rate + dRate)) * 100) / 100,
      fx: Math.round(macro.fx * (1 + fxPct / 100)),
      oil: Math.round(macro.oil * (1 + oilPct / 100) * 10) / 10,
    };
    macroByDay.push(macro);

    // ---- 3) 가격 ----
    const marketNoise = 0.0003 + 0.008 * gaussian(rng);
    const sectorRet: Record<string, { s: number; n: number }> = {};
    for (const sec of SECTORS) {
      const known = sec.beta * sentiment + sec.rate * dRate + (sec.fx * fxPct) / 100 + (sec.oil * oilPct) / 100 + (sectorShock[sec.id] ?? 0);
      const noise = sec.beta * marketNoise + sec.vol * gaussian(rng);
      sectorRet[sec.id] = { s: known, n: noise };
    }

    let idxOpen = 0;
    let idxClose = 0;
    for (const s of STOCKS) {
      const sr = sectorRet[s.sector];
      const S = s.sectorBeta * sr.s + (stockShock[s.symbol] ?? 0);
      const N = s.sectorBeta * sr.n + s.drift + s.vol * gaussian(rng);
      // 뉴스는 아침 시가에 일부 반영(갭), 나머지는 장중에
      const g = range(rng, 0.3, 0.7);
      const rOpen = g * S + 0.3 * N;
      const rDay = (1 - g) * S + 0.7 * N;
      const prev = last[s.symbol];
      // 실제 한국 시장처럼 하루 ±30% 가격제한폭(상한가/하한가)
      const limit = (p: number) => Math.min(prev * LIMIT_UP, Math.max(prev * LIMIT_DOWN, Math.max(s.basePrice * 0.05, p)));
      const open = roundPrice(limit(prev * Math.exp(rOpen)));
      const close = roundPrice(limit(open * Math.exp(rDay)));
      const path = intradayPath(rng, open, close, s.vol + SECTOR_MAP[s.sector].vol).map((p, i, a) =>
        i === 0 || i === a.length - 1 ? p : roundPrice(limit(p)),
      );
      bars[s.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
      idxOpen += Math.log(open / prev);
      idxClose += Math.log(close / prev);
      last[s.symbol] = close;
    }
    const n = STOCKS.length;
    const io = indexLevel * Math.exp(idxOpen / n);
    const ic = indexLevel * Math.exp(idxClose / n);
    const ipath = intradayPath(rng, io, ic, 0.006, false).map((v) => Math.round(v * 100) / 100);
    indexBars.push({ open: round2(io), close: round2(ic), high: Math.max(...ipath), low: Math.min(...ipath), path: ipath });
    indexLevel = ic;
  }

  return { seed, totalDays, base, bars, index: indexBars, macro: macroByDay, news };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** open에서 close로 가는 브라운 브리지 형태의 장중 흐름 */
function intradayPath(rng: Rng, open: number, close: number, vol: number, round = true): number[] {
  const k = INTRADAY_POINTS;
  const lo = Math.log(open);
  const lc = Math.log(close);
  const steps: number[] = [0];
  for (let i = 1; i < k; i++) steps.push(steps[i - 1] + gaussian(rng) * vol * 0.35);
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const t = i / (k - 1);
    const bridge = steps[i] - t * steps[k - 1];
    const v = Math.exp(lo + t * (lc - lo) + bridge);
    out.push(i === 0 ? open : i === k - 1 ? close : round ? roundPrice(v) : v);
  }
  return out;
}

/** 해당 날짜의 '현재가': 장중(턴 진행 중)엔 시가, 마감 후엔 종가 */
export function priceAt(m: Market, symbol: string, day: number, closed: boolean): number {
  const b = m.bars[symbol][Math.min(day, m.totalDays - 1)];
  return closed ? b.close : b.open;
}

/** 전일 종가 (첫날은 기준가) */
export function prevClose(m: Market, symbol: string, day: number): number {
  return day <= 0 ? m.base[symbol] : m.bars[symbol][day - 1].close;
}

export function pricesAt(m: Market, day: number, closed: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of STOCKS) out[s.symbol] = priceAt(m, s.symbol, day, closed);
  return out;
}

export function newsFor(m: Market, day: number) {
  return m.news.filter((n) => n.day === day);
}

export function stockName(sym: string) {
  return STOCK_MAP[sym]?.name ?? sym;
}
