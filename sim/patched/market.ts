import { gaussian, mulberry32, pick, range, type Rng } from '../../src/lib/rng.js';
import * as T from '../../src/game/news.js';
import { CAP_WEIGHT, COMPANIES, COMPANY_LINKS, etfMembers, SECTOR_MAP, STOCK_MAP, STOCK_SECTORS, STOCKS, type StockDef } from '../../src/game/stocks.js';

/** 하루 장중 가격 포인트 수 (마감 애니메이션 / 라인차트용) */
export const INTRADAY_POINTS = 8;
export const LIMIT_UP = 1.3;
export const LIMIT_DOWN = 0.7;
export const KR_INDEX_BASE = 2500;
export const US_INDEX_BASE = 5000;

export type NewsKind = 'macro' | 'sector' | 'company';
export type MacroType = 'rate' | 'fed' | 'oil' | 'fx' | 'kr' | 'us';

export interface NewsEvent {
  day: number;
  kind: NewsKind;
  symbol: string | null;
  sector: string | null;
  macro?: MacroType;
  headline: string;
  rumor: boolean;
  /** 헤드라인이 말하는 방향 (루머는 실제와 다를 수 있음) */
  tone: 'good' | 'bad';
  /** 루머일 때 실제 방향 (아이템 '루머 감별기'용) */
  realTone: 'good' | 'bad';
  /** 이 뉴스와 관련된 종목 (뉴스 아래 바로가기) */
  related: string[];
  /** 기사 머리말 */
  label?: NewsLabel;
  /** 표시 없이 섞여 나오는 가짜 기사 (가격 영향 없음). 서버에만 있고 화면 데이터로는 나가지 않음 */
  fake?: boolean;
  /** 사실 여부 — 루머 감별기를 쓴 오늘 뉴스, 또는 이미 지나간 날의 뉴스에만 서버가 붙여 줌 */
  verdict?: 'true' | 'false';
  /** 장중 속보면 하루 중 공개 위치(0~1). 없으면 아침 뉴스. 공개 전에는 화면 데이터에 없음 */
  at?: number;
}
export type NewsLabel = '속보' | '단독' | '시황' | '특징주' | '해외';

export interface Bar {
  open: number;
  close: number;
  high: number;
  low: number;
  /** open → close 장중 흐름 */
  path: number[];
}

export interface Macro {
  /** 한국 기준금리 % */
  rate: number;
  /** 미국 기준금리 % */
  usRate: number;
  /** 원/달러 */
  fx: number;
  /** 유가 $ */
  oil: number;
}

export interface Market {
  seed: number;
  totalDays: number;
  /** 첫날 시가 이전 기준가 (원) */
  base: Record<string, number>;
  /** 모든 종목의 원화 가격 — 내 돈은 전부 원화로 계산 */
  bars: Record<string, Bar[]>;
  /** 미국 주식의 달러 가격 (표시용) */
  usd: Record<string, Bar[]>;
  baseUsd: Record<string, number>;
  index: Bar[];
  usIndex: Bar[];
  /** 각 날짜 아침(뉴스 반영 후) 거시 지표. macro0 = 첫날 전 */
  macro: Macro[];
  macro0: Macro;
  news: NewsEvent[];
  /** 미리 공지되는 일정 (방향은 알려주지 않음) */
  events: MarketEvent[];
  /** 배당: 기준일 종가 기준으로 보유 수량 × perShare 지급. perShare 는 기준일이 지나야 공개 */
  dividends: Dividend[];
  /** 시장 규칙 버전: 1 = 처음 규칙, 2 = 지수 시총 가중·공급망·미국장→다음 날 한국·장세 */
  version?: number;
  /** 화면 전용: 오늘 장중 가격이 합쳐져 있으면 그 날·칸 (오늘 막대의 close = 지금 가격) */
  live?: { day: number; tick: number; n: number; startAt: number; endAt: number };
}

export type EventKind = 'fomc' | 'bok' | 'earnings' | 'expiry' | 'dividend';
export interface MarketEvent {
  day: number;
  kind: EventKind;
  title: string;
  desc: string;
}
export interface Dividend {
  day: number;
  symbol: string;
  /** 배당률 (기준일 종가 대비) */
  yieldPct: number;
  /** 1주당 배당금(원). 기준일 마감 전에는 0 */
  perShare: number;
}

export const DIVIDEND_PAYERS = ['KBNK', 'MLKY', 'RAMN', 'OILK', 'HOME', 'CARE', 'MART', 'FIZZ', 'MEGA', 'DIVK', 'SECU'];

export function roundPrice(p: number): number {
  const unit = p >= 50000 ? 100 : p >= 10000 ? 50 : p >= 5000 ? 10 : 5;
  return Math.max(unit, Math.round(p / unit) * unit);
}
export const roundUsd = (p: number) => Math.max(0.01, Math.round(p * 100) / 100);
const round2 = (v: number) => Math.round(v * 100) / 100;

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const ETFS = STOCKS.filter((s) => s.etf);

/* ---------------- 연관 종목 ---------------- */

const MACRO_RELATED: Record<MacroType, string[]> = {
  rate: ['KBNK', 'BILD', 'CLOD', 'HBIO', 'HOME', 'BLOK'],
  fed: ['QNTX', 'NXRA', 'HYPR', 'U500', 'UTEC', 'USDX'],
  oil: ['OILK', 'OILX', 'SKYA', 'SUNE', 'TRVL', 'VOLA'],
  fx: ['USDX', 'HDMR', 'CORE', 'SKYA', 'U500', 'MLKY'],
  kr: ['KIDX', 'KLEV', 'KINV', 'SECU', 'CORE', 'NEOT'],
  us: ['U500', 'UTEC', 'NXRA', 'HYPR', 'MEGA', 'SEMI'],
};

function etfsHolding(symbols: string[]) {
  return ETFS.filter((e) => e.etf!.track.type === 'basket' && etfMembers(e.etf!).some((m) => symbols.includes(m))).map((e) => e.symbol);
}

function uniq(list: string[], max = 6) {
  return [...new Set(list)].slice(0, max);
}

export function relatedForCompany(s: StockDef): string[] {
  const peers = COMPANIES.filter((p) => p.sector === s.sector && p.symbol !== s.symbol).map((p) => p.symbol);
  const linked = Object.entries(SECTOR_MAP[s.sector].links)
    .filter(([, w]) => w >= 0.2)
    .flatMap(([id]) => COMPANIES.filter((c) => c.sector === id).slice(0, 1).map((c) => c.symbol));
  return uniq([s.symbol, ...peers.slice(0, 2), ...linked, ...etfsHolding([s.symbol])]);
}

export function relatedForSector(id: string): string[] {
  const own = COMPANIES.filter((c) => c.sector === id).map((c) => c.symbol);
  const linked = Object.entries(SECTOR_MAP[id].links)
    .filter(([, w]) => w >= 0.2)
    .flatMap(([sid]) => COMPANIES.filter((c) => c.sector === sid).slice(0, 1).map((c) => c.symbol));
  return uniq([...own, ...linked, ...etfsHolding(own)]);
}

/* ---------------- 생성 ---------------- */

/**
 * 같은 (seed, totalDays, version)이면 항상 같은 시장.
 * version 2 는 v1 과 같은 난수 흐름 위에 연관성을 더한다 (v1 방의 가격은 절대 바뀌지 않음)
 */
/** 시뮬레이션용 제안 규칙: 시가 몫 g 범위, 시가/장중 잡음 독립 */
const patchOf = () => JSON.parse((globalThis as any).process?.env?.SIM_PATCH || '{}') as { gLo?: number; gHi?: number; indep?: boolean; openW?: number; dayW?: number };
export function generateMarket(seed: number, totalDays: number, version = 1): Market {
  const rng = mulberry32(seed);
  const rng3 = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
  const PATCH = patchOf();
  const v2 = version >= 2;
  // v2 전용 난수 (장세 전환) — v1 난수 흐름은 건드리지 않음
  const rng2 = mulberry32((seed ^ 0x5f3759df) >>> 0);
  let regime = 0; // -1 하락장, 0 보합, 1 상승장
  let prevUsRet = 0;
  let prevKrRet = 0;
  const news: NewsEvent[] = [];

  let macro: Macro = {
    rate: pick(rng, [2.75, 3.0, 3.25, 3.5]),
    usRate: pick(rng, [3.75, 4.0, 4.25, 4.5, 4.75]),
    fx: Math.round(range(rng, 1280, 1420)),
    oil: Math.round(range(rng, 65, 95)),
  };
  const macro0 = macro;
  const macroByDay: Macro[] = [];

  // 기준가
  const baseUsd: Record<string, number> = {};
  const base: Record<string, number> = {};
  for (const s of COMPANIES) {
    if (s.currency === 'USD') {
      baseUsd[s.symbol] = roundUsd(s.basePrice * range(rng, 0.85, 1.15));
      base[s.symbol] = roundPrice(baseUsd[s.symbol] * macro.fx);
    } else base[s.symbol] = roundPrice(s.basePrice * range(rng, 0.85, 1.15));
  }
  for (const e of ETFS) base[e.symbol] = roundPrice(e.basePrice * range(rng, 0.8, 1.6));

  const bars: Record<string, Bar[]> = Object.fromEntries(STOCKS.map((s) => [s.symbol, []]));
  const usd: Record<string, Bar[]> = Object.fromEntries(COMPANIES.filter((s) => s.currency === 'USD').map((s) => [s.symbol, []]));
  const last: Record<string, number> = { ...base };
  const lastUsd: Record<string, number> = { ...baseUsd };
  const indexBars: Bar[] = [];
  const usIndexBars: Bar[] = [];
  let krLevel = KR_INDEX_BASE;
  let usLevel = US_INDEX_BASE;

  const { events, dividends } = planCalendar(seed, totalDays);
  const isEvent = (day: number, kind: EventKind) => events.some((e) => e.day === day && e.kind === kind);

  for (let day = 0; day < totalDays; day++) {
    const fomc = isEvent(day, 'fomc');
    const bok = isEvent(day, 'bok');
    const earnings = isEvent(day, 'earnings');
    const expiry = isEvent(day, 'expiry');
    // ---- 1) 오늘의 뉴스 ----
    let dRate = 0;
    let dUsRate = 0;
    let fxPct = gaussian(rng) * 0.35;
    let oilPct = gaussian(rng) * 1.3;
    let krSent = 0;
    let usSent = 0;
    const sectorShock: Record<string, number> = {};
    const stockShock: Record<string, number> = {};
    const addSec = (id: string, v: number) => (sectorShock[id] = (sectorShock[id] ?? 0) + v);
    const addStock = (sym: string, v: number) => (stockShock[sym] = (stockShock[sym] ?? 0) + v);
    const pushMacro = (macroType: MacroType, headline: string, tone: 'good' | 'bad') =>
      news.push({ day, kind: 'macro', symbol: null, sector: null, macro: macroType, headline, rumor: false, tone, realTone: tone, related: MACRO_RELATED[macroType] });

    if (v2) {
      // 장세: 며칠씩 이어지는 상승장/하락장
      if (rng2() < 0.18) regime = rng2() < 0.4 ? 0 : rng2() < 0.5 ? 1 : -1;
      krSent += 0.0035 * regime;
      usSent += 0.0035 * regime;
      // 간밤 미국장 → 오늘 한국 시가
      if (day > 0) {
        krSent += 0.35 * prevUsRet;
        if (Math.abs(prevUsRet) >= 0.01) {
          const up = prevUsRet > 0;
          news.push({
            day,
            kind: 'macro',
            symbol: null,
            sector: null,
            macro: 'us',
            headline: `뉴욕증시, 간밤 ${(Math.abs(prevUsRet) * 100).toFixed(1)}% ${up ? '상승' : '하락'} 마감… 국내 증시 ${up ? '훈풍' : '부담'}`,
            rumor: false,
            tone: up ? 'good' : 'bad',
            realTone: up ? 'good' : 'bad',
            related: MACRO_RELATED.us,
            label: '해외',
          });
        }
      }
    }

    const count = day === 0 ? 2 : 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const r = rng();
      if (r < 0.04 && day > 2) {
        // 블랙스완 / 대형 호재 — 한국·미국 모두
        const crash = rng() < 0.6;
        const mag = crash ? -range(rng, 0.045, 0.075) : range(rng, 0.03, 0.05);
        krSent += mag;
        usSent += mag * 0.8;
        if (crash) fxPct += range(rng, 1, 2.5); // 위기 땐 달러 강세
        pushMacro('kr', pick(rng, crash ? T.MACRO.crash : T.MACRO.rally), crash ? 'bad' : 'good');
      } else if (r < 0.27) {
        const t = rng();
        if (t < 0.18) {
          const cut = macro.rate > 1.0 && (macro.rate >= 5 || rng() < 0.55);
          const d = rng() < 0.75 ? 0.25 : 0.5;
          dRate += cut ? -d : d;
          fxPct += cut ? 0.5 : -0.5; // 금리 내리면 원화 약세
          pushMacro('rate', fill(pick(rng, cut ? T.MACRO.rateCut : T.MACRO.rateHike), { d: d.toFixed(2) }), cut ? 'good' : 'bad');
        } else if (t < 0.34) {
          const cut = macro.usRate > 1.0 && (macro.usRate >= 5.5 || rng() < 0.55);
          const d = rng() < 0.75 ? 0.25 : 0.5;
          dUsRate += cut ? -d : d;
          fxPct += cut ? -range(rng, 0.6, 1.4) : range(rng, 0.6, 1.4); // 미국 금리 오르면 달러 강세
          pushMacro('fed', fill(pick(rng, cut ? T.MACRO.fedCut : T.MACRO.fedHike), { d: d.toFixed(2) }), cut ? 'good' : 'bad');
        } else if (t < 0.52) {
          const up = rng() < 0.5;
          const d = range(rng, 5, 12);
          oilPct += up ? d : -d;
          pushMacro('oil', fill(pick(rng, up ? T.MACRO.oilUp : T.MACRO.oilDown), { d: d.toFixed(0) }), up ? 'bad' : 'good');
        } else if (t < 0.68) {
          const up = rng() < 0.5;
          const d = range(rng, 1.2, 2.8);
          fxPct += up ? d : -d;
          pushMacro('fx', fill(pick(rng, up ? T.MACRO.fxUp : T.MACRO.fxDown), { d: d.toFixed(1) }), up ? 'bad' : 'good');
        } else if (t < 0.84) {
          const good = rng() < 0.5;
          krSent += (good ? 1 : -1) * range(rng, 0.012, 0.028);
          pushMacro('kr', pick(rng, good ? T.MACRO.good : T.MACRO.bad), good ? 'good' : 'bad');
        } else {
          const good = rng() < 0.5;
          const m = (good ? 1 : -1) * range(rng, 0.012, 0.028);
          usSent += m;
          krSent += m * (v2 ? 0.15 : 0.4); // 미국 증시는 한국에도 영향 (v2: 대부분은 다음 날 아침에)
          pushMacro('us', pick(rng, good ? T.MACRO.usGood : T.MACRO.usBad), good ? 'good' : 'bad');
        }
      } else if (r < 0.5) {
        const sec = pick(rng, STOCK_SECTORS);
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
          related: relatedForSector(sec.id),
        });
      } else {
        companyNews(1);
      }
    }
    // 실적 발표 주간: 실적 뉴스가 더 많고 더 크게
    if (earnings) {
      companyNews(1.35, true);
      companyNews(1.35, true);
    }

    function companyNews(boost: number, earningsOnly = false) {
      {
        const s = pick(rng, COMPANIES);
        const sec = SECTOR_MAP[s.sector];
        const good = rng() < 0.5;
        const rumor = !earningsOnly && rng() < 0.25;
        const realGood = rumor ? (rng() < 0.6 ? good : !good) : good;
        let mag = boost * range(rng, 0.05, 0.14) * Math.sqrt(s.vol / 0.018) * (rumor ? 0.75 : 1) * (realGood ? 1 : -1);
        // 이미 소문이 퍼져 '재료 소멸' — 좋은 뉴스에도 떨어지는 경우
        if (!rumor && rng() < 0.12) mag = -mag * 0.3;
        addStock(s.symbol, mag);
        // v2: 공급망·고객사로 번짐
        if (v2) for (const [l, w] of Object.entries(COMPANY_LINKS[s.symbol] ?? {})) addStock(l, mag * w);
        for (const p of COMPANIES) if (p.sector === s.sector && p.symbol !== s.symbol) addStock(p.symbol, mag * 0.25);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w * 0.3);
        const pool = earningsOnly
          ? (good ? T.EARNINGS_GOOD : T.EARNINGS_BAD)
          : [...(good ? T.COMPANY_GOOD : T.COMPANY_BAD), ...((good ? T.SECTOR_COMPANY_GOOD : T.SECTOR_COMPANY_BAD)[s.sector] ?? [])];
        news.push({
          day,
          kind: 'company',
          symbol: s.symbol,
          sector: s.sector,
          headline: (rumor ? '[루머] ' : '') + fill(pick(rng, pool), { name: s.name }),
          rumor,
          tone: good ? 'good' : 'bad',
          realTone: realGood ? 'good' : 'bad',
          related: relatedForCompany(s),
        });
      }
    }

    // 금리 결정일: 반드시 결정 뉴스 (동결 포함), 변동 폭도 더 큼
    if (fomc) {
      const t = rng();
      if (t < 0.3) {
        usSent += (rng() < 0.5 ? 1 : -1) * range(rng, 0.004, 0.012);
        pushMacro('fed', pick(rng, T.MACRO.fedHold), 'good');
      } else {
        const cut = macro.usRate > 1.0 && (macro.usRate >= 5.5 || t < 0.65);
        const d = rng() < 0.6 ? 0.25 : 0.5;
        dUsRate += cut ? -d : d;
        usSent += (cut ? 1 : -1) * range(rng, 0.008, 0.02);
        fxPct += cut ? -range(rng, 0.8, 1.8) : range(rng, 0.8, 1.8);
        pushMacro('fed', fill(pick(rng, cut ? T.MACRO.fedCut : T.MACRO.fedHike), { d: d.toFixed(2) }), cut ? 'good' : 'bad');
      }
    }
    if (bok) {
      const t = rng();
      if (t < 0.3) pushMacro('rate', pick(rng, T.MACRO.rateHold), 'good');
      else {
        const cut = macro.rate > 1.0 && (macro.rate >= 5 || t < 0.65);
        const d = rng() < 0.6 ? 0.25 : 0.5;
        dRate += cut ? -d : d;
        krSent += (cut ? 1 : -1) * range(rng, 0.006, 0.015);
        fxPct += cut ? 0.6 : -0.6;
        pushMacro('rate', fill(pick(rng, cut ? T.MACRO.rateCut : T.MACRO.rateHike), { d: d.toFixed(2) }), cut ? 'good' : 'bad');
      }
    }

    // ---- 2) 거시 지표 ----
    const prevMacro = macro;
    macro = {
      rate: round2(Math.min(6, Math.max(0.5, macro.rate + dRate))),
      usRate: round2(Math.min(7, Math.max(0.25, macro.usRate + dUsRate))),
      fx: Math.round(macro.fx * (1 + fxPct / 100)),
      oil: Math.round(macro.oil * (1 + oilPct / 100) * 10) / 10,
    };
    macroByDay.push(macro);
    const fxRet = Math.log(macro.fx / prevMacro.fx);
    const oilRet = Math.log(macro.oil / prevMacro.oil);

    // ---- 3) 업종 흐름 ----
    const global = gaussian(rng);
    // 옵션 만기일, (v2) 큰 하락 다음 날은 변동성이 커짐
    const nm = (expiry ? 1.9 : 1) * (v2 && prevKrRet < -0.02 ? 1.4 : 1);
    const krNoise = 0.0003 + nm * (0.0055 * global + 0.006 * gaussian(rng));
    const usNoise = 0.0004 + nm * (0.0065 * global + 0.005 * gaussian(rng));
    const global2 = gaussian(rng3);
    const krNoise2 = nm * (0.0055 * global2 + 0.006 * gaussian(rng3));
    const usNoise2 = nm * (0.0065 * global2 + 0.005 * gaussian(rng3));
    const sectorRet: Record<string, { s: number; n: number; n2: number }> = {};
    for (const sec of STOCK_SECTORS) {
      const isUS = sec.region === 'US';
      const known =
        sec.beta * (isUS ? usSent : krSent) +
        sec.rate * (isUS ? dUsRate : dRate + 0.3 * dUsRate) +
        (sec.fx * fxPct) / 100 +
        (sec.oil * oilPct) / 100 +
        (sectorShock[sec.id] ?? 0);
      const noise = sec.beta * (isUS ? usNoise : krNoise) + sec.vol * gaussian(rng);
      const noise2 = sec.beta * (isUS ? usNoise2 : krNoise2) + sec.vol * gaussian(rng3);
      sectorRet[sec.id] = { s: known, n: noise, n2: noise2 };
    }

    // ---- 4) 개별 종목 ----
    const rOpenK: Record<string, number> = {};
    const rDayK: Record<string, number> = {};
    let krO = 0,
      krC = 0,
      krN = 0,
      usO = 0,
      usC = 0,
      usN = 0;
    for (const s of COMPANIES) {
      const sr = sectorRet[s.sector];
      const S = s.sectorBeta * sr.s + (stockShock[s.symbol] ?? 0);
      const N = s.sectorBeta * sr.n + s.drift + s.vol * gaussian(rng);
      // 뉴스는 아침 시가에 일부 반영(갭), 나머지는 장중에
      const g0 = range(rng, 0.3, 0.7);
      const g = PATCH.gLo != null ? PATCH.gLo + ((g0 - 0.3) / 0.4) * ((PATCH.gHi ?? PATCH.gLo) - PATCH.gLo) : g0;
      const N2 = s.sectorBeta * sr.n2 + s.vol * gaussian(rng3);
      const rOpen = g * S + (PATCH.indep ? (PATCH.openW ?? 0.45) * N2 : 0.3 * N);
      const rDay = (1 - g) * S + (PATCH.indep ? (PATCH.dayW ?? 0.9) * N : 0.7 * N);
      const vol = s.vol + SECTOR_MAP[s.sector].vol;

      if (s.currency === 'USD') {
        const prev = lastUsd[s.symbol];
        const lim = (p: number) => Math.min(prev * 1.5, Math.max(prev * 0.5, p));
        const open = roundUsd(lim(prev * Math.exp(rOpen)));
        const close = roundUsd(lim(open * Math.exp(rDay)));
        const path = intradayPath(rng, open, close, vol, false).map(roundUsd);
        usd[s.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
        lastUsd[s.symbol] = close;
        // 원화 환산 (오늘 환율)
        const kPath = path.map((p) => roundPrice(p * macro.fx));
        const kb = { open: kPath[0], close: kPath[kPath.length - 1], high: Math.max(...kPath), low: Math.min(...kPath), path: kPath };
        bars[s.symbol].push(kb);
        const wu = v2 ? (CAP_WEIGHT[s.symbol] ?? 1) : 1;
        usO += wu * Math.log(open / prev);
        usC += wu * Math.log(close / prev);
        usN += wu;
      } else {
        const prev = last[s.symbol];
        // 실제 한국 시장처럼 하루 ±30% 가격제한폭(상한가/하한가)
        const lim = (p: number) => Math.min(prev * LIMIT_UP, Math.max(prev * LIMIT_DOWN, Math.max(s.basePrice * 0.05, p)));
        const open = roundPrice(lim(prev * Math.exp(rOpen)));
        const close = roundPrice(lim(open * Math.exp(rDay)));
        const path = intradayPath(rng, open, close, vol).map((p, i, a) => (i === 0 || i === a.length - 1 ? p : roundPrice(lim(p))));
        bars[s.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
        const w = v2 ? (CAP_WEIGHT[s.symbol] ?? 1) : 1; // v2: 시가총액 가중
        krO += w * Math.log(open / prev);
        krC += w * Math.log(close / prev);
        krN += w;
      }
      const b = bars[s.symbol][day];
      rOpenK[s.symbol] = Math.log(b.open / last[s.symbol]);
      rDayK[s.symbol] = Math.log(b.close / b.open);
      last[s.symbol] = b.close;
    }

    // ---- 5) 지수 ----
    const io = krLevel * Math.exp(krO / krN);
    const ic = krLevel * Math.exp(krC / krN);
    const ip = intradayPath(rng, io, ic, 0.006, false).map(round2);
    indexBars.push({ open: round2(io), close: round2(ic), high: Math.max(...ip), low: Math.min(...ip), path: ip });
    krLevel = ic;
    const uo = usLevel * Math.exp(usO / usN);
    const uc = usLevel * Math.exp(usC / usN);
    const up = intradayPath(rng, uo, uc, 0.006, false).map(round2);
    usIndexBars.push({ open: round2(uo), close: round2(uc), high: Math.max(...up), low: Math.min(...up), path: up });
    prevUsRet = Math.log(uc / usLevel);
    prevKrRet = Math.log(ic / (indexBars.length > 1 ? indexBars[indexBars.length - 2].close : KR_INDEX_BASE));
    usLevel = uc;

    // ---- 6) ETF: 담고 있는 것의 원화 수익률 × 배율 ----
    for (const e of ETFS) {
      const def = e.etf!;
      let ro = 0;
      let rd = 0;
      if (def.track.type === 'oil') {
        ro = 0.6 * oilRet;
        rd = 0.4 * oilRet + 0.004 * gaussian(rng);
      } else if (def.track.type === 'fx') {
        ro = fxRet;
        rd = 0.0015 * gaussian(rng);
      } else {
        const members = etfMembers(def);
        ro = members.reduce((a, m) => a + rOpenK[m], 0) / members.length;
        rd = members.reduce((a, m) => a + rDayK[m], 0) / members.length;
      }
      const prev = last[e.symbol];
      const open = roundPrice(Math.max(100, prev * Math.exp(def.lev * ro)));
      const close = roundPrice(Math.max(100, open * Math.exp(def.lev * rd)));
      const path = intradayPath(rng, open, close, 0.004 * Math.abs(def.lev));
      bars[e.symbol].push({ open, close, high: Math.max(...path), low: Math.min(...path), path });
      last[e.symbol] = close;
    }
  }

  for (const dv of dividends) dv.perShare = Math.max(1, Math.round((bars[dv.symbol][dv.day].close * dv.yieldPct) / 100));
  decorateNews(seed, totalDays, news, bars, indexBars);
  return { seed, totalDays, version, base, bars, usd, baseUsd, index: indexBars, usIndex: usIndexBars, macro: macroByDay, macro0, news, events, dividends };
}

/** 미리 공지되는 일정: 연준·금통위·실적 시즌·옵션 만기·배당 기준일 */
export function planCalendar(seed: number, totalDays: number): { events: MarketEvent[]; dividends: Dividend[] } {
  const r = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const events: MarketEvent[] = [];
  const dividends: Dividend[] = [];
  const taken = new Set<number>();
  const free = (lo: number, hi: number) => {
    for (let k = 0; k < 40; k++) {
      const d = lo + Math.floor(r() * (hi - lo + 1));
      if (d >= 0 && d < totalDays && !taken.has(d)) {
        taken.add(d);
        return d;
      }
    }
    return -1;
  };
  const add = (day: number, kind: EventKind, title: string, desc: string) => day >= 0 && events.push({ day, kind, title, desc });
  const last = totalDays - 2;

  add(free(2, last), 'fomc', '🇺🇸 미 연준 금리 결정', '미국 금리가 바뀔 수 있는 날. 미국 주식과 환율이 크게 움직여요.');
  add(free(2, last), 'bok', '🇰🇷 한국은행 금통위', '한국 기준금리 결정일. 은행·건설·성장주가 크게 반응해요.');
  const windows = totalDays >= 20 ? 2 : 1;
  for (let w = 0; w < windows; w++) {
    const start = free(1 + Math.floor((w * totalDays) / windows), Math.min(last - 2, Math.floor(((w + 1) * totalDays) / windows) - 3));
    if (start < 0) continue;
    for (let k = 0; k < 3; k++) {
      taken.add(start + k);
      add(start + k, 'earnings', `실적 발표 주간 (${k + 1}/3)`, '기업 실적 뉴스가 쏟아지고 주가 변동이 커져요.');
    }
  }
  if (totalDays >= 20) add(free(5, last), 'expiry', '옵션 만기일', '평소보다 주가가 크게 출렁이는 날이에요.');

  const divDays = totalDays >= 20 ? 2 : 1;
  for (let k = 0; k < divDays; k++) {
    const day = free(3 + Math.floor((k * totalDays) / divDays), Math.min(last, Math.floor(((k + 1) * totalDays) / divDays)));
    if (day < 0) continue;
    const payers = [...DIVIDEND_PAYERS].sort(() => r() - 0.5).slice(0, 4 + Math.floor(r() * 3));
    for (const symbol of payers) dividends.push({ day, symbol, yieldPct: Math.round((1.5 + r() * 2.5) * 10) / 10, perShare: 0 });
    add(day, 'dividend', '배당 기준일', '이날 장 마감 때 가지고 있으면 배당금을 받아요.');
  }
  events.sort((a, b) => a.day - b.day);
  return { events, dividends };
}

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

/** 막대의 '지금 값': 마감 후엔 종가, 장중이면 지금 칸 가격(장중 데이터가 합쳐진 경우), 아니면 시가 */
export function barNow(m: Market, b: Bar, day: number, closed: boolean): number {
  return closed || m.live?.day === day ? b.close : b.open;
}

/** 해당 날짜의 '현재가'(원): 장중엔 지금 칸 가격(없으면 시가), 마감 후엔 종가 */
export function priceAt(m: Market, symbol: string, day: number, closed: boolean): number {
  const d = Math.min(day, m.totalDays - 1);
  return barNow(m, m.bars[symbol][d], d, closed);
}

export function usdAt(m: Market, symbol: string, day: number, closed: boolean): number | null {
  const u = m.usd[symbol];
  if (!u) return null;
  const d = Math.min(day, m.totalDays - 1);
  return barNow(m, u[d], d, closed);
}

/** 전일 종가 (첫날은 기준가) */
export function prevClose(m: Market, symbol: string, day: number): number {
  return day <= 0 ? m.base[symbol] : m.bars[symbol][day - 1].close;
}
export function prevCloseUsd(m: Market, symbol: string, day: number): number | null {
  if (!m.usd[symbol]) return null;
  return day <= 0 ? m.baseUsd[symbol] : m.usd[symbol][day - 1].close;
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

/**
 * 기사 꾸미기 — 머리말, 어제 장 정리(시황·특징주), 표시 없는 가짜 기사.
 * 가격을 만드는 난수와 다른 난수를 써서, 이 함수가 바뀌어도 같은 시드의 가격은 그대로다.
 * 여기서 더하는 기사는 가격에 영향을 주지 않는다.
 */
function decorateNews(seed: number, totalDays: number, news: NewsEvent[], bars: Record<string, Bar[]>, indexBars: Bar[]) {
  const rng = mulberry32((seed ^ 0x6e657773) >>> 0);
  for (const n of news) {
    if (n.rumor) continue;
    if (n.kind === 'macro' && !n.headline.startsWith('[') && rng() < 0.35) n.label = '속보';
    else if (n.kind === 'company' && rng() < 0.25) n.label = '단독';
  }
  const extra: NewsEvent[] = [];
  const dayRet = (b: Bar[], day: number, base: number) => b[day].close / (day > 0 ? b[day - 1].close : base) - 1;
  const p1 = (x: number) => (Math.abs(x) * 100).toFixed(1);
  for (let day = 1; day < totalDays; day++) {
    const y = day - 1;
    // 어제 가장 크게 움직인 업종
    let bestSec: { id: string; r: number } | null = null;
    for (const sec of STOCK_SECTORS) {
      const ss = COMPANIES.filter((c) => c.sector === sec.id);
      if (!ss.length) continue;
      const r = ss.reduce((a, c) => a + dayRet(bars[c.symbol], y, bars[c.symbol][0].open), 0) / ss.length;
      if (!bestSec || Math.abs(r) > Math.abs(bestSec.r)) bestSec = { id: sec.id, r };
    }
    if (bestSec && Math.abs(bestSec.r) >= 0.02 && rng() < 0.7) {
      const up = bestSec.r > 0;
      extra.push({
        day,
        kind: 'sector',
        symbol: null,
        sector: bestSec.id,
        headline: fill(pick(rng, up ? T.RECAP_SECTOR_UP : T.RECAP_SECTOR_DOWN), { sector: SECTOR_MAP[bestSec.id].name, p: p1(bestSec.r) }),
        rumor: false,
        tone: up ? 'good' : 'bad',
        realTone: up ? 'good' : 'bad',
        related: relatedForSector(bestSec.id),
        label: '시황',
      });
    }
    // 어제의 특징주
    let mover: { s: StockDef; r: number } | null = null;
    for (const c of COMPANIES) {
      const r = dayRet(bars[c.symbol], y, bars[c.symbol][0].open);
      if (!mover || Math.abs(r) > Math.abs(mover.r)) mover = { s: c, r };
    }
    if (mover && Math.abs(mover.r) >= 0.07) {
      const up = mover.r > 0;
      const limit = Math.abs(mover.r) >= LIMIT_UP - 1 - 0.005;
      const pool = limit ? (up ? T.RECAP_LIMIT_UP : T.RECAP_LIMIT_DOWN) : up ? T.RECAP_STOCK_UP : T.RECAP_STOCK_DOWN;
      extra.push({
        day,
        kind: 'company',
        symbol: mover.s.symbol,
        sector: mover.s.sector,
        headline: fill(pick(rng, pool), { name: mover.s.name, p: p1(mover.r) }),
        rumor: false,
        tone: up ? 'good' : 'bad',
        realTone: up ? 'good' : 'bad',
        related: relatedForCompany(mover.s),
        label: '특징주',
      });
    }
    // 지수 시황 (가끔)
    const ir = indexBars[y].close / (y > 0 ? indexBars[y - 1].close : KR_INDEX_BASE) - 1;
    if (Math.abs(ir) >= 0.01 && rng() < 0.5) {
      const up = ir > 0;
      extra.push({ day, kind: 'macro', symbol: null, sector: null, macro: 'kr', headline: fill(pick(rng, up ? T.RECAP_KR_UP : T.RECAP_KR_DOWN), { p: p1(ir) }), rumor: false, tone: up ? 'good' : 'bad', realTone: up ? 'good' : 'bad', related: MACRO_RELATED.kr, label: '시황' });
    }
    // 표시 없는 가짜 기사 — 진짜 기사와 똑같이 생김. 루머 감별기로만 가려낼 수 있음
    if (rng() < 0.35) {
      const s = pick(rng, COMPANIES);
      const good = rng() < 0.5;
      const pool = [...(good ? T.COMPANY_GOOD : T.COMPANY_BAD), ...((good ? T.SECTOR_COMPANY_GOOD : T.SECTOR_COMPANY_BAD)[s.sector] ?? [])];
      extra.push({
        day,
        kind: 'company',
        symbol: s.symbol,
        sector: s.sector,
        headline: fill(pick(rng, pool), { name: s.name }),
        rumor: false,
        tone: good ? 'good' : 'bad',
        realTone: good ? 'good' : 'bad',
        related: relatedForCompany(s),
        label: rng() < 0.25 ? '단독' : undefined,
        fake: true,
      });
    }
  }
  news.push(...extra);
  news.sort((a, b) => a.day - b.day);

  // 장중 속보: 하루 0~2개. 그날 기업 뉴스 중 일부가 아침이 아니라 장 중간(20~80%)에 뜬다
  for (let day = 0; day < totalDays; day++) {
    const pool = news.filter((n) => n.day === day && n.kind === 'company' && n.label !== '시황' && n.label !== '특징주');
    const count = (rng() < 0.55 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
    for (let i = 0; i < count && pool.length; i++) {
      const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      n.at = Math.round(range(rng, 0.2, 0.8) * 1000) / 1000;
      n.label = '속보';
    }
  }
}
