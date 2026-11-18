import { gaussian, mulberry32, pick, range, seeded, type Rng } from '../lib/rng.js';
import * as T from './news.js';
import { planStories, SECTOR_NEWS_MULT } from './stories.js';
import { CAP_WEIGHT, COMPANIES, COMPANY_LINKS, etfMembers, SECTOR_MAP, STOCK_MAP, STOCK_SECTORS, STOCKS, type StockDef } from './stocks.js';

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
  /** (v12 사건 찌라시) 이 날부터 진위를 밝힘 — 결과 발표 전에 '사실로 확인'이 붙어 결과가 새지 않게. 서버 전용 */
  revealDay?: number;
  /**
   * (v17) 관련 회사와의 관계 — 화면이 '거래처·같은 업종·경쟁사·연관 업종·ETF' 와 예상 방향(공개 tone 기준, 경쟁사는 반대)을 보여 줌.
   * 고정된 회사 정보라 공개해도 됨 (실제로 얼마나 움직이는지는 넣지 않음)
   */
  rel?: Record<string, NewsRel>;
}
export type NewsRel = 'link' | 'peer' | 'rival' | 'chain' | 'etf';
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
  /** v4 비밀값 — 서버 안에서만. 화면 데이터(sliceMarket)에는 절대 넣지 않음 */
  salt?: string;
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
  live?: { day: number; tick: number; n: number; startAt: number; endAt: number; tickMs?: number };
}

export type EventKind = 'fomc' | 'bok' | 'earnings' | 'expiry' | 'dividend' | 'story';
export interface MarketEvent {
  day: number;
  kind: EventKind;
  title: string;
  desc: string;
  /** (story) 화면이 예고 기사에서 읽은 발표 종목 */
  symbol?: string;
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

/** (v17) 관련 칩의 회사마다 관계 이름표 */
function relationsFor(s: StockDef, related: string[], rival?: string, version = 17): Record<string, NewsRel> {
  const out: Record<string, NewsRel> = {};
  for (const x of related) {
    if (x === s.symbol) continue;
    const d = STOCK_MAP[x];
    if (!d) continue;
    if (x === rival) out[x] = 'rival';
    else if (d.etf) out[x] = 'etf';
    // (v19) 같은 업종이면 연결이 있어도 '같은 업종' — '거래처'는 다른 업종의 공급망·고객사만 (코어반도체↔나노칩스가 거래처로 보이던 것)
    else if (version >= 19 && d.sector === s.sector) out[x] = 'peer';
    else if (COMPANY_LINKS[s.symbol]?.[x] != null || COMPANY_LINKS[x]?.[s.symbol] != null) out[x] = 'link';
    else if (d.sector === s.sector) out[x] = 'peer';
    else out[x] = 'chain';
  }
  return out;
}
/**
 * (v19) 진짜 경쟁 관계만 — 같은 업종이어도 부품사·고객사(거래처)는 경쟁사가 아님
 * (v17·v18 은 같은 업종 아무 회사나 골라서 '한빛모터스, 대성부품(부품사) 제치고 계약' 같은 기사가 나왔음)
 */
export const RIVALS: Record<string, string[]> = {
  NEOT: ['CLOD'],
  CLOD: ['NEOT'],
  HBIO: ['GENE', 'CARE'],
  GENE: ['HBIO', 'CARE'],
  CARE: ['HBIO', 'GENE'],
  SUNE: ['OILK'],
  OILK: ['SUNE'],
  MLKY: ['RAMN'],
  RAMN: ['MLKY'],
  NXRA: ['QNTX', 'STRM'],
  QNTX: ['NXRA', 'STRM'],
  STRM: ['NXRA', 'QNTX'],
  STAR: ['MOVI'],
  MOVI: ['STAR'],
};
/** 경쟁사 후보 (v19+ 는 RIVALS, 그 전은 같은 업종 아무 회사) */
function rivalPool(s: StockDef, version: number): StockDef[] {
  if (version >= 19) return (RIVALS[s.symbol] ?? []).map((x) => STOCK_MAP[x]).filter(Boolean);
  return COMPANIES.filter((p) => p.sector === s.sector && p.symbol !== s.symbol);
}
/** (v17) 경쟁사가 반대로 움직이는 '나눠 먹는' 소식 (수주·점유율·신제품·리콜) */
const SHARE_GOOD = [
  '{name}, {rival} 제치고 대형 계약 따내',
  '{name} 신제품 돌풍… {rival} 고객 이탈 우려',
  '{name}, 점유율 큰 폭 상승… {rival} 자리 위협',
  '{name}, 경쟁 입찰서 {rival} 누르고 수주',
];
const SHARE_BAD = [
  '{name}, 대형 수주 경쟁서 {rival}에 밀려',
  '{name} 제품 결함 리콜… 고객 {rival} 쪽으로 이동하나',
  '{name}, 점유율 하락세… {rival} 반사이익 기대',
  '{name} 핵심 거래처, {rival} 쪽으로 갈아타',
];

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
/** (v15) 발표를 앞둔 반전 소식 — 기대와 반대 방향 (맞을 수도, 오보일 수도) */
const TWIST_HEADS = [
  '{name}, 발표 앞두고 "결과 기대 이하" 내부 문건 유출설',
  '{name}, 핵심 일정 연기 가능성 제기… 투자자 불안',
  '{name}, 경쟁사 먼저 발표에 "효과 반감" 우려',
  '{name}, 대주주 지분 매도 소식에 "악재 미리 아나" 의심',
  '{name}, 업계 "발표 내용 시장 기대 못 미칠 것" 전망',
];
export function generateMarket(seed: number, totalDays: number, version = 1, salt?: string): Market {
  /**
   * v4: 방마다 서버에만 있는 128비트 비밀값(salt)으로 난수를 만듦.
   * (32비트 시드는 첫날 공개되는 금리·환율·뉴스로 몇 분 만에 역산돼 미래 가격이 드러날 수 있었음)
   */
  const S = version >= 4 && salt ? salt : null;
  const R = (tag: string, legacy: () => Rng) => (S ? seeded(`${S}:${tag}`) : legacy());
  const rng = R('main', () => mulberry32(seed));
  const v2 = version >= 2;
  /**
   * v3 (밸런스): 아침 갭 방향이 그날 결과를 알려주지 않게 시가·장중 잡음을 따로 뽑고,
   * 뉴스는 대부분 시가에 반영(이미 알려진 정보), 장중 속보 종목은 속보 전엔 거의 안 움직임.
   * v3 전용 난수(rng3)만 쓰므로 v1·v2 방의 가격은 그대로
   */
  const v3 = version >= 3;
  // v2 전용 난수 (장세 전환) — v1 난수 흐름은 건드리지 않음
  const rng2 = R('regime', () => mulberry32((seed ^ 0x5f3759df) >>> 0));
  const rng3 = R('v3', () => mulberry32((seed ^ 0x2c1b3c6d) >>> 0));
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
  // v12: 판마다 시작 가격이 크게 다름 (대략 절반~두 배) — 전용 난수라 예전 방 가격은 그대로
  const v12 = version >= 12;
  if (v12) {
    const rngB = R('base12', () => mulberry32((seed ^ 0x1b873593) >>> 0));
    for (const s of COMPANIES) {
      const f = Math.min(2, Math.max(0.5, Math.exp(0.3 * gaussian(rngB))));
      if (s.currency === 'USD') {
        baseUsd[s.symbol] = roundUsd(baseUsd[s.symbol] * f);
        base[s.symbol] = roundPrice(baseUsd[s.symbol] * macro.fx);
      } else base[s.symbol] = roundPrice(base[s.symbol] * f);
    }
  }
  // v12: 며칠에 걸친 사건 흐름 (임상 결과·수주·신작·상장 등) — 전용 난수
  const rngS = R('story12', () => mulberry32((seed ^ 0x27d4eb2f) >>> 0));
  const stories = v12 ? planStories(rngS, totalDays) : [];
  /** 사건 흐름 뉴스 (머리말을 그대로 두고, 무작위 장중 속보로 뽑지 않음) */
  const storyNews = new WeakSet<NewsEvent>();
  // v15 (설계서 design/story-v2.md): 예고 → 날마다 기대감 → (약 35%) 전날·당일 반전 소식 → 발표 크기는 '이미 오른 만큼'을 빼고.
  // 별도 난수(story15)라 v14 이하 가격·사건은 그대로
  const v15 = version >= 15;
  // v17 (설계서 design/stock-news-v17.md): 회사 뉴스 늘리고 경쟁사 반대 반응 — 전용 난수(news17)라 v16 이하 그대로
  const v17 = version >= 17;
  const rngN = R('news17', () => mulberry32((seed ^ 0x3c6ef372) >>> 0));
  const rngT = R('story15', () => mulberry32((seed ^ 0x51ed270b) >>> 0));
  const twist = stories.map((st) => {
    if (!v15) return null;
    if (rngT() >= 0.35) return null;
    // 반전은 발표 전날 아침 또는 당일 아침 (예고 다음 날 이후), 결과와 상관없이 정함 → 반전이 나왔다고 결과를 알 수는 없음
    const day = st.resolve - 1 > st.start && rngT() < 0.5 ? st.resolve - 1 : st.resolve;
    return { day, mag: range(rngT, 0.05, 0.12) };
  });
  /** 사건마다 지금까지 쌓인 기대감(사건 때문에 오른 만큼, 로그) */
  const runup = stories.map(() => 0);

  const bars: Record<string, Bar[]> = Object.fromEntries(STOCKS.map((s) => [s.symbol, []]));
  const usd: Record<string, Bar[]> = Object.fromEntries(COMPANIES.filter((s) => s.currency === 'USD').map((s) => [s.symbol, []]));
  const last: Record<string, number> = { ...base };
  const lastUsd: Record<string, number> = { ...baseUsd };
  const indexBars: Bar[] = [];
  const usIndexBars: Bar[] = [];
  let krLevel = KR_INDEX_BASE;
  let usLevel = US_INDEX_BASE;

  const { events, dividends } = planCalendar(seed, totalDays, S ? seeded(`${S}:cal`) : undefined);
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
      } else if (r < (v17 ? 0.385 : 0.5)) {
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
        // v12: 업종마다 뉴스 반응 크기가 다름 (바이오·코인 크게, 식품·금융 작게)
        if (v12) mag *= SECTOR_NEWS_MULT[s.sector] ?? 1;
        // 이미 소문이 퍼져 '재료 소멸' — 좋은 뉴스에도 떨어지는 경우
        if (!rumor && rng() < 0.12) mag = -mag * 0.3;
        addStock(s.symbol, mag);
        // v2: 공급망·고객사로 번짐
        if (v2) for (const [l, w] of Object.entries(COMPANY_LINKS[s.symbol] ?? {})) addStock(l, mag * w);
        // (v17) 약 30%는 '나눠 먹는' 소식 — 같은 업종 경쟁사 하나는 반대로 움직임 (루머·실적 뉴스 제외)
        const peers = COMPANIES.filter((p) => p.sector === s.sector && p.symbol !== s.symbol);
        const cands = v17 ? rivalPool(s, version) : [];
        const rival = v17 && !rumor && !earningsOnly && cands.length && rngN() < 0.3 ? cands[Math.floor(rngN() * cands.length)] : null;
        for (const p of peers) addStock(p.symbol, p === rival ? -mag * range(rngN, 0.35, 0.6) : mag * 0.25);
        for (const [link, w] of Object.entries(sec.links)) addSec(link, mag * w * 0.3);
        const pool = rival
          ? good
            ? SHARE_GOOD
            : SHARE_BAD
          : earningsOnly
            ? (good ? T.EARNINGS_GOOD : T.EARNINGS_BAD)
            : [...(good ? T.COMPANY_GOOD : T.COMPANY_BAD), ...((good ? T.SECTOR_COMPANY_GOOD : T.SECTOR_COMPANY_BAD)[s.sector] ?? [])];
        const related = rival ? uniq([s.symbol, rival.symbol, ...relatedForCompany(s).filter((x) => x !== s.symbol && x !== rival.symbol)]) : relatedForCompany(s);
        news.push({
          day,
          kind: 'company',
          symbol: s.symbol,
          sector: s.sector,
          headline: (rumor ? '[루머] ' : '') + fill(pick(rival ? rngN : rng, pool), { name: s.name, rival: rival?.name ?? '' }),
          rumor,
          tone: good ? 'good' : 'bad',
          realTone: realGood ? 'good' : 'bad',
          related,
          ...(v17 ? { rel: relationsFor(s, related, rival?.symbol, version) } : {}),
        });
      }
    }

    // ---- v12 사건 흐름 ----
    const storyBreaking: { sym: string; at: number }[] = [];
    for (const st of stories) {
      const def = STOCK_MAP[st.symbol];
      const vars = { name: def.name, d: String(st.resolve - st.start) };
      const push = (headline: string, tone: 'good' | 'bad', realTone: 'good' | 'bad', rumor: boolean, extra: Partial<NewsEvent> = {}) => {
        const ev: NewsEvent = { day, kind: 'company', symbol: st.symbol, sector: def.sector, headline: (rumor ? '[루머] ' : '') + fill(headline, vars), rumor, tone, realTone, related: relatedForCompany(def), ...extra };
        storyNews.add(ev);
        news.push(ev);
      };
      const si = stories.indexOf(st);
      if (day === st.start) {
        // 기대감: 결과 발표를 앞두고 미리 오름
        addStock(st.symbol, st.setupMag);
        runup[si] += st.setupMag;
        const head = pick(rngS, st.kind.open);
        // (v15) 예고에 발표 날짜를 분명히 (일정 띠처럼 n일차)
        // 문구에 이미 '{d}일 뒤'가 있으면 그 자리를 'n일차에'로 바꾸고, 없으면 끝에 '(n일차 발표 예정)' — 날짜를 두 번 말하지 않게
        const day15 = `${st.resolve + 1}일차`;
        const open15 = head.includes('{d}일 뒤') ? fill(head.replace('{d}일 뒤', day15 + '에'), vars) : fill(head, vars) + ` (${day15} 발표 예정)`;
        push(v15 ? open15 : head, 'good', 'good', false, { label: '단독' });
      } else if (day > st.start && day < st.resolve) {
        // (v15) 발표 날까지 날마다 기대감에 조금씩 더 오름 (사는 사람이 몰림)
        if (v15) {
          const drift = range(rngT, 0.01, 0.04);
          addStock(st.symbol, drift);
          runup[si] += drift;
        }
        // 중간 찌라시: 70%는 실제 결과 쪽, 30%는 반대 (감별기로 진짜를 가릴 수 있음). 미리 아는 사람이 조금씩 움직여 주가도 살짝
        if (rngS() < 0.75) {
          const rumorGood = rngS() < 0.7 ? st.good : !st.good;
          push(pick(rngS, rumorGood ? st.kind.rumorGood : st.kind.rumorBad), rumorGood ? 'good' : 'bad', st.good ? 'good' : 'bad', true, { revealDay: st.resolve + 1 });
          // 소문 쪽으로 조금 움직임 (결과가 아니라 소문을 따라 — 주가로 결과가 새지 않게)
          addStock(st.symbol, ((version >= 13 ? rumorGood : st.good) ? 1 : -1) * st.setupMag * 0.35);
        }
      }
      // (v15) 반전 소식: 그날 아침 '기대와 반대' 기사가 나와 주가가 크게 빠짐. 결과가 나쁘면 맞는 기사, 좋으면 오보(발표 다음 날 밝혀짐)
      const tw = twist[si];
      if (tw && day === tw.day) {
        addStock(st.symbol, -tw.mag);
        runup[si] -= tw.mag;
        const twHead = pick(rngT, TWIST_HEADS);
        const ev: NewsEvent = { day, kind: 'company', symbol: st.symbol, sector: def.sector, headline: fill(twHead, vars), rumor: false, tone: 'bad', realTone: st.good ? 'good' : 'bad', related: relatedForCompany(def), label: '특징주', revealDay: st.resolve + 1, ...(st.good ? { fake: true } : {}) };
        storyNews.add(ev);
        news.push(ev);
      }
      if (day === st.resolve) {
        // 결과 발표: 장중 속보로 크게 (상·하한가 근처)
        // (v15) '소문에 사고 뉴스에 판다': 미리 많이 오른 좋은 결과는 조금만(때로 오히려 빠짐), 많이 오른 뒤 나쁜 결과는 더 크게
        const mag = v15
          ? st.good
            ? Math.max(-0.06, st.resultMag - runup[si] * 0.8)
            : -(st.resultMag + Math.max(0, runup[si]) * 0.9)
          : (st.good ? 1 : -1) * st.resultMag;
        addStock(st.symbol, mag);
        for (const [l, w] of Object.entries(COMPANY_LINKS[st.symbol] ?? {})) addStock(l, mag * w * 0.5);
        for (const pe of COMPANIES) if (pe.sector === def.sector && pe.symbol !== st.symbol) addStock(pe.symbol, mag * 0.15);
        const at = Math.round(range(rngS, 0.2, 0.7) * 1000) / 1000;
        push(pick(rngS, st.good ? st.kind.good : st.kind.bad), st.good ? 'good' : 'bad', st.good ? 'good' : 'bad', false, { at, label: '속보' });
        storyBreaking.push({ sym: st.symbol, at });
      } else if (day === st.resolve + 1) {
        // 다음 날: 차익 실현·추격 매수로 조금 되돌리거나 더 감
        addStock(st.symbol, (rngS() < 0.5 ? -1 : 1) * range(rngS, 0.01, 0.05));
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
    // v3: 시가 쪽 잡음은 따로 (같은 잡음이 시가와 장중에 같이 들어가면 갭 방향 = 그날 방향이 됨)
    const global3 = v3 ? gaussian(rng3) : 0;
    const krNoise3 = v3 ? nm * (0.0055 * global3 + 0.006 * gaussian(rng3)) : 0;
    const usNoise3 = v3 ? nm * (0.0065 * global3 + 0.005 * gaussian(rng3)) : 0;
    const sectorRet: Record<string, { s: number; n: number; n3: number }> = {};
    for (const sec of STOCK_SECTORS) {
      const isUS = sec.region === 'US';
      const known =
        sec.beta * (isUS ? usSent : krSent) +
        sec.rate * (isUS ? dUsRate : dRate + 0.3 * dUsRate) +
        (sec.fx * fxPct) / 100 +
        (sec.oil * oilPct) / 100 +
        (sectorShock[sec.id] ?? 0);
      const noise = sec.beta * (isUS ? usNoise : krNoise) + sec.vol * gaussian(rng);
      sectorRet[sec.id] = { s: known, n: noise, n3: v3 ? sec.beta * (isUS ? usNoise3 : krNoise3) + sec.vol * gaussian(rng3) : 0 };
    }

    // v3: 장중 속보를 가격 만들기 전에 정함 → 그 종목은 속보 전(시가)엔 거의 반영 안 됨
    const breaking = new Set<string>();
    // v12: 사건 결과 발표는 늘 장중 속보 (속보 전에는 거의 안 움직이고 발표 순간 크게)
    for (const b of storyBreaking) {
      breaking.add(b.sym);
      for (const l of Object.keys(COMPANY_LINKS[b.sym] ?? {})) breaking.add(l);
    }
    if (v3) {
      const pool = news.filter((n) => n.day === day && n.kind === 'company' && n.symbol && n.at == null && !storyNews.has(n));
      const count = (rng3() < 0.55 ? 1 : 0) + (rng3() < 0.2 ? 1 : 0);
      for (let i = 0; i < count && pool.length; i++) {
        const n = pool.splice(Math.floor(rng3() * pool.length), 1)[0];
        n.at = Math.round(range(rng3, 0.2, 0.8) * 1000) / 1000;
        n.label = '속보';
        breaking.add(n.symbol!);
        for (const l of Object.keys(COMPANY_LINKS[n.symbol!] ?? {})) breaking.add(l);
      }
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
      const g1 = range(rng, 0.3, 0.7);
      let rOpen: number;
      let rDay: number;
      if (v3) {
        const g = breaking.has(s.symbol) ? 0.05 : range(rng3, 0.8, 0.95);
        const N3 = s.sectorBeta * sr.n3 + s.vol * gaussian(rng3);
        rOpen = g * S + 0.45 * N3;
        rDay = (1 - g) * S + 0.9 * N;
        // v5: 이유 없이(뉴스와 상관없는 잡음으로) 벌어진 갭은 장중에 절반쯤 되돌아감 (실제 '갭 메우기')
        // → 아침에 많이 오른 종목만 기계적으로 사는 전략이 뉴스를 읽는 것보다 유리하지 않게
        if (version >= 5) rDay -= 0.5 * 0.45 * N3;
      } else {
        rOpen = g1 * S + 0.3 * N;
        rDay = (1 - g1) * S + 0.7 * N;
      }
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
  decorateNews(seed, totalDays, news, bars, indexBars, v3, S ? seeded(`${S}:news`) : undefined);
  if (v17) {
    // 관계 이름표가 없는 회사 기사(사건 흐름·특징주·표시 없는 가짜 기사)에도 붙임.
    // 가짜 기사도 30%는 '경쟁사' 모양으로 바꿈 — 경쟁사 기사 = 진짜 기사로 티 나지 않게 (가격 영향은 원래 없음)
    const rngF = R('fake17', () => mulberry32((seed ^ 0x6a09e667) >>> 0));
    for (const n of news) {
      if (n.kind !== 'company' || !n.symbol || n.rel) continue;
      const def = STOCK_MAP[n.symbol];
      // (v18) 머리말(단독)이 붙은 가짜 기사도 — v17 은 머리말 없는 것만 바꿔서 '단독 + 경쟁사 모양 = 진짜'가 보였음
      if (n.fake && (version >= 18 || !n.label) && rngF() < 0.3) {
        const peers = rivalPool(def, version);
        if (peers.length) {
          const rival = peers[Math.floor(rngF() * peers.length)];
          n.headline = fill(pick(rngF, n.tone === 'good' ? SHARE_GOOD : SHARE_BAD), { name: def.name, rival: rival.name });
          n.related = uniq([def.symbol, rival.symbol, ...n.related.filter((x) => x !== def.symbol && x !== rival.symbol)]);
          n.rel = relationsFor(def, n.related, rival.symbol, version);
          continue;
        }
      }
      n.rel = relationsFor(def, n.related, undefined, version);
    }
  }
  return { seed, totalDays, version, ...(S ? { salt: S } : {}), base, bars, usd, baseUsd, index: indexBars, usIndex: usIndexBars, macro: macroByDay, macro0, news, events, dividends };
}

/** 미리 공지되는 일정: 연준·금통위·실적 시즌·옵션 만기·배당 기준일 */
export function planCalendar(seed: number, totalDays: number, rngIn?: Rng): { events: MarketEvent[]; dividends: Dividend[] } {
  const r = rngIn ?? mulberry32((seed ^ 0x5bd1e995) >>> 0);
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

  add(free(2, last), 'fomc', '미 연준 금리 결정', '미국 금리가 바뀔 수 있는 날. 미국 주식과 환율이 크게 움직여요.');
  add(free(2, last), 'bok', '한국은행 금통위', '한국 기준금리 결정일. 은행·건설·성장주가 크게 반응해요.');
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
function decorateNews(seed: number, totalDays: number, news: NewsEvent[], bars: Record<string, Bar[]>, indexBars: Bar[], v3 = false, rngIn?: Rng) {
  const rng = rngIn ?? mulberry32((seed ^ 0x6e657773) >>> 0);
  for (const n of news) {
    if (n.rumor) continue;
    if (v3 && n.at != null) continue; // 이미 정한 장중 속보
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

  // 장중 속보: 하루 0~2개. 그날 기업 뉴스 중 일부가 아침이 아니라 장 중간(20~80%)에 뜬다 (v3 는 가격 만들 때 이미 정함)
  for (let day = 0; day < totalDays && !v3; day++) {
    const pool = news.filter((n) => n.day === day && n.kind === 'company' && n.label !== '시황' && n.label !== '특징주');
    const count = (rng() < 0.55 ? 1 : 0) + (rng() < 0.2 ? 1 : 0);
    for (let i = 0; i < count && pool.length; i++) {
      const n = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      n.at = Math.round(range(rng, 0.2, 0.8) * 1000) / 1000;
      n.label = '속보';
    }
  }
}
