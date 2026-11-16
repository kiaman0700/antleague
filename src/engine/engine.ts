/**
 * 게임 규칙 엔진 — 서버(Vercel 함수)와 연습 모드(브라우저)가 같은 코드를 쓴다.
 * 모든 행동은 여기서 검증되고, 화면에 보내는 정보(View)도 여기서 만든다.
 * 둘이서 하는 게임에서 이 코드는 서버에서만 돌기 때문에
 *  - 가격은 서버가 정한 값으로만 체결되고
 *  - 시드(미래 가격)·루머의 진실·상대의 보유 종목은 브라우저로 나가지 않는다.
 */
import { activeEffects, canBuy, canUse, deriveItems, drawBonus, holdLimit, itemCost, FEE_BOMB_RATE, hashString, ITEM_MAP, ITEMS, SCOUT_ACCURACY, spendsFromRows, type Effect, type ItemKind, type ItemRow, type PlayerItems } from '../game/items.js';
import { generateMarket, relatedForCompany, type Bar, type Market, type NewsEvent } from '../game/market.js';
import { computeAchievements } from '../game/achievements.js';
import { dayTicks, indexTicks, releaseTick, tickMsFor, ticksPerDay } from '../game/intraday.js';
import { mulberry32, seeded } from '../lib/rng.js';
import { preRumors, publicRumors, type PublicRumor } from '../game/rumors.js';
import { COMPANY_BAD, COMPANY_GOOD } from '../game/news.js';
import { buyCost, computePortfolio, equityWith, FEE_RATE, startCashFor, type Holding, type Trade } from '../game/portfolio.js';
import { COMPANIES, STOCK_MAP, STOCK_SECTORS, STOCKS } from '../game/stocks.js';

export type UiMode = 'easy' | 'pro';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomRow {
  id: string;
  code: string;
  seed: number;
  status: RoomStatus;
  total_days: number;
  turn_seconds: number;
  day: number;
  /** ms epoch, null = 제한 없음. 카운트다운이 시작되면 당겨짐 */
  deadline: number | null;
  /** 오늘 원래 마감 시각 (카운트다운 전). 마감 취소로 기준 아래가 되면 이 시각으로 되돌림 */
  day_deadline?: number | null;
  /** 시장·카드 규칙 버전 (없으면 1 = 예전 방) */
  version?: number;
  /** v4 시장 비밀값 (room_secrets.salt) — 서버만 */
  salt?: string | null;
  host_id: string | null;
  title?: string;
  max_players?: number;
  is_private?: boolean;
  /** 한 판 더: 끝난 방에서 만든 새 방 코드 */
  next_code?: string | null;
  /** 매칭으로 만든 방 / 랭킹전 (016) */
  kind?: 'custom' | 'match';
  ranked?: boolean;
}

export const MAX_PLAYERS = 6;

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  mode: UiMode;
  ready: boolean;
  ended_day: number;
  created_at: string;
  version: number;
  /** 게임 중 나감(기권) — 007 마이그레이션 */
  left_game?: boolean;
  /** 마지막으로 화면을 받아 간 시각 (자리 비움 판단) — 서버만 */
  last_seen?: string | null;
  /** (v7) 장 전 '준비 완료'를 누른 날 — 025 마이그레이션 */
  pre_day?: number;
}

/** 지정가(예약) 주문 — 그날 장중 가격이 닿으면 지정한 가격에 체결, 못 닿으면 장 마감 때 만료 */
export interface OrderRow {
  id?: string;
  player_id: string;
  day: number;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  /** 미국 주식은 달러, 나머지는 원 */
  limit_price: number;
  fee: number;
  status: 'open' | 'filled' | 'cancelled' | 'expired';
  fill_price?: number | null;
  created_at?: string;
}

export interface GameData {
  room: RoomRow;
  players: PlayerRow[];
  trades: Trade[];
  items: ItemRow[];
  orders: OrderRow[];
}

export const MAX_OPEN_ORDERS = 5;

export interface PublicPlayer {
  id: string;
  nickname: string;
  mode: UiMode;
  ready: boolean;
  endedDay: number;
  /** 나는 정확한 값, 상대는 10만원 단위(5초마다 바뀌는 정확한 값으로 보유 종목을 역산하지 못하게) */
  equity: number;
  /** 상대는 어제까지의 거래 횟수만 (오늘 언제 거래했는지 드러나지 않게) */
  tradeCount: number;
  /** on = 접속 중, away = 자리 비움(오래 응답 없음), left = 나감(기권) */
  status: 'on' | 'away' | 'left';
  /** 상대의 수익률 구간(%) [이상, 미만] — 내 것·끝난 게임은 null (정확한 값) */
  band?: [number, number] | null;
  /** 지금 순위 (서버가 정확한 재산으로 계산) */
  rank?: number;
  /** 회원(로그인한 사람) — 이름 옆 인증 표시. 게스트는 false */
  verified?: boolean;
  /** (v7) 오늘 장 전 '준비 완료'를 눌렀는지 */
  preReady?: boolean;
}

/** 상대 수익률을 보여 주는 구간 폭(%p) */
export const RET_BAND = 2;
/** 순위·구간을 다시 계산하는 간격 (칸 수, 6칸 = 30초) */
export const RANK_EVERY_TICKS = 6;

export interface Notice {
  key: string;
  text: string;
  kind: 'ok' | 'warn';
}

export interface View {
  room: { id: string; code: string; status: RoomStatus; day: number; totalDays: number; turnSeconds: number; deadline: number | null; countdown: boolean; /** (v7) 장 전이면 장이 열리는 시각 */ preUntil?: number | null; hostId: string | null; title: string; maxPlayers: number; isPrivate: boolean; nextCode?: string | null; rulesVersion?: number; ranked?: boolean; kind?: 'custom' | 'match' };
  serverNow: number;
  meId: string;
  players: PublicPlayer[];
  /** (v7) 오늘 장 전 찌라시 — 진위는 감별기를 쓴 사람에게만 */
  rumors?: PublicRumor[];
  /** 시장 정보가 바뀌었을 때만 채워짐 (marketKey 로 판단) */
  market: Market | null;
  /** 오늘 장중 가격 — 지금 칸까지만. 장이 열려 있을 때만 */
  live: LiveView | null;
  marketKey: string;
  myTrades: Trade[];
  myOrders: OrderRow[];
  myItemRows: ItemRow[];
  myItems: PlayerItems;
  effectsToday: ItemKind[];
  notices: Notice[];
  reveals: {
    tomorrow: NewsEvent[] | null;
    bestSector: string | null;
    rumorCheck: boolean;
    spy: { nickname: string; cash: number; holdings: Record<string, Holding> } | null;
    scout: { symbol: string; up: boolean } | null;
    blackout: boolean;
  };
  /** 게임이 끝나면 모든 기록 공개 */
  final: { seed: number; trades: Trade[]; items: ItemRow[]; players: { id: string; nickname: string; left?: boolean }[]; badges: Record<string, string[]> } | null;
}

export interface LiveView {
  day: number;
  /** 지금 칸 (0 = 시가) */
  tick: number;
  /** 하루 전체 칸 수 */
  n: number;
  startAt: number;
  endAt: number;
  tickMs: number;
  /** 종목별 원화 가격, 0~tick 칸 */
  krw: Record<string, number[]>;
  /** 미국 주식 달러 가격, 0~tick 칸 */
  usd: Record<string, number[]>;
  index: number[];
  usIndex: number[];
}

/**
 * 오늘 장 시계. 장 시작 = 원래 마감 시각(day_deadline) - 제한 시간.
 * 카운트다운으로 마감이 당겨져도 칸 속도는 그대로(남은 흐름은 마감 때 한꺼번에 확정)
 */
export function dayClock(r: RoomRow, now: number) {
  const turn = r.turn_seconds > 0 ? r.turn_seconds : 180;
  // 한 칸 길이: v11 부터 1초(긴 날은 2~4초), 그 전 방은 5초
  const tickMs = tickMsFor(r.version, turn);
  const n = ticksPerDay(turn, tickMs);
  const base = r.day_deadline ?? r.deadline;
  if (base == null) return { n, tick: 0, startAt: now, endAt: now + n * tickMs, tickMs };
  const startAt = base - n * tickMs;
  const tick = Math.min(n, Math.max(0, Math.floor((now - startAt) / tickMs)));
  return { n, tick, startAt, endAt: base, tickMs };
}

/** 지금 칸의 가격 (원화, 또는 미국 주식 달러) — 거래·예약 기준 */
function livePrice(d: GameData, m: Market, symbol: string, now: number, cur: 'krw' | 'usd' = 'krw') {
  const { n, tick } = dayClock(d.room, now);
  return dayTicks(m, symbol, d.room.day, n, cur)[tick];
}

/** 모든 종목의 지금 가격 (원화) */
function livePriceMap(d: GameData, m: Market, now: number) {
  const out: Record<string, number> = {};
  for (const s of STOCKS) out[s.symbol] = livePrice(d, m, s.symbol, now);
  return out;
}

const tickOf = (startAt: number, iso: string | undefined, tickMs: number) => (iso ? Math.max(0, Math.floor((new Date(iso).getTime() - startAt) / tickMs)) : 0);

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** 한국어 조사: 받침이 있으면 a(이/을), 없으면 b(가/를). 한글이 아니면 받침 없는 것으로 */
export function josa(word: string, a: string, b: string) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  const batchim = code >= 0 && code < 11172 && code % 28 !== 0;
  return word + (batchim ? a : b);
}

/* ---------------- 입력 검증 ---------------- */

export const DAY_CHOICES = [10, 20, 30];
/** 하루 제한 시간(초): 1·3·5·10분. (예전 방의 0=무제한·90초는 서버가 그대로 진행) */
export const TURN_CHOICES = [60, 180, 300, 600];
/** 예전 '무제한'(0) 방은 이 시간으로 진행 */
export const LEGACY_TURN_SECONDS = 600;
/**
 * 카운트다운 규칙 — 몇 명이 마감을 안 눌러 오래 기다리는 것 방지
 * - 1대1: 한 명이 마감하면 90초
 * - 3인 이상: 3분의 2 이상(올림)이 마감하면 30초
 * 남은 시간이 이미 그보다 짧으면 그대로
 */
export function graceRule(players: number): { need: number; seconds: number } {
  return players <= 2 ? { need: 1, seconds: 90 } : { need: Math.ceil((players * 2) / 3), seconds: 30 };
}
export const MAX_QTY = 1_000_000;

export function cleanNickname(v: unknown): string {
  if (typeof v !== 'string') throw new GameError('닉네임을 입력해 주세요.');
  const s = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  // 제어문자·꺾쇠 금지, 1~10자
  if (!/^[^\p{C}<>]{1,10}$/u.test(s)) throw new GameError('닉네임은 1~10자로, 특수 제어문자 없이 입력해 주세요.');
  return s;
}
export function cleanMode(v: unknown): UiMode {
  if (v === 'easy' || v === 'pro') return v;
  throw new GameError('잘못된 모드예요.');
}
export function cleanDays(v: unknown) {
  if (typeof v === 'number' && DAY_CHOICES.includes(v)) return v;
  throw new GameError('게임 길이를 다시 골라 주세요.');
}
export function cleanTurn(v: unknown) {
  if (typeof v === 'number' && TURN_CHOICES.includes(v)) return v;
  throw new GameError('고민 시간을 다시 골라 주세요.');
}
export function cleanCode(v: unknown) {
  if (typeof v !== 'string') throw new GameError('방 코드를 입력해 주세요.');
  const s = v.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(s)) throw new GameError('방 코드는 6자리예요.');
  return s;
}
function cleanSymbol(v: unknown) {
  if (typeof v === 'string' && STOCK_MAP[v]) return v;
  throw new GameError('없는 종목이에요.');
}
function cleanKind(v: unknown): ItemKind {
  if (typeof v === 'string' && ITEMS.some((i) => i.kind === v)) return v as ItemKind;
  throw new GameError('없는 카드예요.');
}

/* ---------------- 시장 ---------------- */

const marketCache = new Map<string, Market>();
/** 이 판의 시장 규칙 버전 (예전 방 = 1, 새 방 = 2) */
export const CURRENT_RULES_VERSION = 11;
/** v7: 날과 날 사이 '장 전 시간' (어제 정리·찌라시·예약 주문). 첫날은 없음 */
export const PREMARKET_VERSION = 7;
/** 장 전 시간(초): 신속 20초 · 일반 30초 · 그 밖엔 하루 시간의 ⅓ (15~45초) */
export function preSeconds(turnSeconds: number) {
  if (turnSeconds <= 60) return 20;
  if (turnSeconds <= 90) return 30;
  return Math.max(15, Math.min(45, Math.round(turnSeconds / 3)));
}
/** 지금 장 전인지 (v7 방, 장이 아직 안 열림) */
export function inPremarket(r: RoomRow, now: number) {
  if ((r.version ?? 1) < PREMARKET_VERSION || r.status !== 'playing' || r.day === 0 || r.day >= r.total_days) return false;
  // 예전부터 있던 장 시작 전 4초(시가 그대로 거래 가능)는 장 전으로 치지 않음 → 그 앞까지만
  return now < premarketEnd(r, now);
}
/** 장 전 시간이 끝나는 시각 */
export function premarketEnd(r: RoomRow, now: number) {
  return dayClock(r, now).startAt - 4000;
}

export function marketFor(seed: number, days: number, version = 1, salt?: string | null): Market {
  const key = `${seed}:${days}:${version}:${salt ?? ''}`;
  let m = marketCache.get(key);
  if (!m) {
    m = generateMarket(seed, days, version, salt ?? undefined);
    marketCache.set(key, m);
    if (marketCache.size > 50) marketCache.delete(marketCache.keys().next().value!);
  }
  return m;
}

function priceMap(m: Market, day: number, closed: boolean) {
  const out: Record<string, number> = {};
  for (const s of STOCKS) {
    const b = m.bars[s.symbol][Math.min(day, m.totalDays - 1)];
    out[s.symbol] = closed ? b.close : b.open;
  }
  return out;
}

function fakeNews(e: Effect, i: number): NewsEvent {
  const sym = e.payload?.symbol && STOCK_MAP[e.payload.symbol] && !STOCK_MAP[e.payload.symbol].etf ? e.payload.symbol : COMPANIES[0].symbol;
  const tone = e.payload?.tone === 'bad' ? 'bad' : 'good';
  const pool = tone === 'good' ? COMPANY_GOOD : COMPANY_BAD;
  const s = STOCK_MAP[sym];
  return {
    day: e.days[0],
    kind: 'company',
    symbol: sym,
    sector: s.sector,
    headline: pool[(e.usedDay + i) % pool.length].replace('{name}', s.name),
    rumor: false,
    tone,
    realTone: tone,
    related: relatedForCompany(s),
    // 진짜 기업 기사처럼 가끔 [단독] 머리말 (진짜 기사의 비율과 비슷하게)
    label: ((e.usedDay * 31 + i * 17 + sym.charCodeAt(0)) % 4 === 0 ? '단독' : undefined),
    fake: true,
  };
}

/** 짧은 해시 (시장 키에 비밀 정보 개수를 그대로 드러내지 않게) */
function hashKey(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** 뉴스가 가짜인지 (표시 없는 가짜 기사·상대의 가짜 뉴스 카드·틀린 루머) */
export function isFakeNews(n: NewsEvent) {
  return !!n.fake || (n.rumor && n.tone !== n.realTone);
}

/**
 * 화면으로 보낼 뉴스 한 건. 서버만 아는 '가짜 표시'는 지우고,
 * - 오늘 뉴스: 진실(realTone)을 감춤. 루머 감별기를 썼으면 사실/가짜 판정만 붙임
 * - 지난 뉴스: 장이 끝나 밝혀졌으므로 가짜·루머에 판정을 붙임
 */
function publicNews(n: NewsEvent, today: number, rumorCheck: boolean): NewsEvent {
  const { fake: _f, verdict: _v, ...rest } = n;
  const fake = isFakeNews(n);
  if (n.day >= today) return rumorCheck && n.day === today ? { ...rest, realTone: rest.tone, verdict: fake ? 'false' : 'true' } : { ...rest, realTone: rest.tone };
  return fake || n.rumor ? { ...rest, verdict: fake ? 'false' : 'true' } : rest;
}

/** 같은 날 뉴스 순서를 기사 내용으로 섞음 — 상대의 가짜 뉴스가 맨 뒤에 붙어서 티 나지 않게 */
function newsOrder(a: NewsEvent, b: NewsEvent) {
  return a.day - b.day || hashString(a.headline) - hashString(b.headline);
}

/** 오늘까지만 보이는 시장 — 오늘 종가·미래 가격·뉴스의 진실은 빠진다 */
export function sliceMarket(m: Market, day: number, finished: boolean, opts: { rumorCheck: boolean; fakes: NewsEvent[]; blackout?: boolean; tick?: number; n?: number }): Market {
  const strip = (b: Bar): Bar => ({ open: b.open, close: b.close, high: b.high, low: b.low, path: [] });
  if (finished) {
    return {
      ...m,
      bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, v.map(strip)])),
      usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, v.map(strip)])),
      index: m.index.map(strip),
      usIndex: m.usIndex.map(strip),
      seed: 0,
      salt: undefined,
      news: m.news.map((n) => publicNews(n, Infinity, false)).sort(newsOrder),
    };
  }
  // 배당금은 기준일 종가로 정해지므로, 기준일이 끝나기 전에는 숨김 (배당률·날짜는 공개)
  const dividends = m.dividends.map((d) => (d.day < day ? d : { ...d, perShare: 0 }));
  const cut = (arr: Bar[]): Bar[] => {
    const o = arr[day].open;
    return [...arr.slice(0, day).map(strip), { open: o, close: o, high: o, low: o, path: [] }];
  };
  // 장중 속보는 공개 칸이 되기 전에는 내용·개수 모두 보내지 않음
  const released = (n: NewsEvent) => n.day < day || n.at == null || (opts.tick ?? 0) >= releaseTick(n.at, opts.n ?? 1);
  const news = [...m.news.filter((n) => n.day <= day), ...opts.fakes]
    .filter(released)
    .filter((n) => !(opts.blackout && n.day === day))
    .map((n) => publicNews(n, day, opts.rumorCheck))
    .sort(newsOrder);
  return {
    seed: 0,
    totalDays: m.totalDays,
    base: m.base,
    baseUsd: m.baseUsd,
    bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, cut(v)])),
    usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, cut(v)])),
    index: cut(m.index),
    usIndex: cut(m.usIndex),
    version: m.version,
    macro: m.macro.slice(0, day + 1),
    macro0: m.macro0,
    news,
    events: m.events,
    dividends,
  };
}

/** 지급이 끝난 배당만 (게임 종료 시 전부) */
function paidDividends(d: GameData) {
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
  const finished = d.room.status === 'finished' || d.room.day >= d.room.total_days;
  return finished ? m.dividends : m.dividends.filter((x) => x.day < d.room.day);
}

/* ---------------- 상태 계산 ---------------- */

function sortedPlayers(d: GameData) {
  return [...d.players].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function itemsOf(d: GameData) {
  const day = Math.min(d.room.day, d.room.total_days - 1);
  return deriveItems(d.room.seed, sortedPlayers(d).map((p) => p.id), d.items, day, d.room.total_days, d.players.length < 2, d.room.version ?? 1);
}

function spendsOf(d: GameData, pid: string) {
  return spendsFromRows(d.items.filter((r) => r.player_id === pid));
}

export function portfolioOf(d: GameData, pid: string) {
  return computePortfolio(
    d.trades.filter((t) => t.player_id === pid),
    spendsOf(d, pid),
    Infinity,
    paidDividends(d),
    startCashFor(d.room.version),
  );
}

/**
 * keySalt: 시장 키를 섞을 서버 비밀값(방마다). 시드처럼 화면이 알면 안 되는 값은 절대 키에 넣지 않음.
 * 없으면(혼자 연습 — 어차피 브라우저에서 도는 게임) 방 ID 를 씀
 */
export function buildView(d: GameData, meId: string, now: number, clientMarketKey?: string, keySalt?: string, verified?: Set<string>): View {
  const r = d.room;
  const players = sortedPlayers(d);
  const base: Omit<View, 'market' | 'marketKey'> & { market: Market | null; marketKey: string } = {
    room: { id: r.id, code: r.code, status: r.status, day: r.day, totalDays: r.total_days, turnSeconds: r.turn_seconds, deadline: r.deadline, countdown: isCountdown(r), hostId: r.host_id, title: r.title ?? '개미리그', maxPlayers: r.max_players ?? 2, isPrivate: !!r.is_private, nextCode: r.status === 'finished' ? (r.next_code ?? null) : null, rulesVersion: r.version ?? 1, ranked: !!r.ranked, kind: r.kind ?? 'custom' },
    serverNow: now,
    meId,
    players: players.map((p) => ({ id: p.id, nickname: p.nickname, mode: p.mode, ready: p.ready, endedDay: p.ended_day, equity: startCashFor(r.version), tradeCount: 0, verified: !!verified?.has(p.id), preReady: (p.pre_day ?? -1) >= r.day, status: p.left_game ? ('left' as const) : isActive(p, now) ? ('on' as const) : ('away' as const) })),
    market: null,
    live: null,
    marketKey: 'waiting',
    myTrades: [],
    myOrders: [],
    myItemRows: [],
    myItems: { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 },
    effectsToday: [],
    notices: [],
    reveals: { tomorrow: null, bestSector: null, rumorCheck: false, spy: null, scout: null, blackout: false },
    final: null,
  };
  if (r.status === 'waiting') return base;

  const finished = r.status === 'finished' || r.day >= r.total_days;
  const day = Math.min(r.day, r.total_days - 1);
  const m = marketFor(r.seed, r.total_days, r.version ?? 1, r.salt);
  const open = r.status === 'playing' && !finished;
  const clock = dayClock(r, now);
  const prices = open ? livePriceMap(d, m, now) : priceMap(m, day, finished);
  const items = itemsOf(d);
  const mine = items.players[meId] ?? base.myItems;

  // 순위는 서버가 정확한 재산으로 정하고, 상대의 재산은 금액 대신 '수익률 구간'(2%p 단위)만 보냄
  // 상대의 순위·구간은 30초(6칸) 단위 가격으로만 → 칸마다 바뀌는 값으로 정확한 재산을 좁혀 가지 못하게
  const coarse = open ? (() => {
    const c = dayClock(r, now);
    // 30초 단위 (칸 길이와 상관없이)
    const every = Math.max(1, Math.round((RANK_EVERY_TICKS * 5000) / c.tickMs));
    return livePriceMap(d, m, c.startAt + Math.floor(c.tick / every) * every * c.tickMs);
  })() : prices;
  const exacts = new Map(players.map((p) => [p.id, Math.round(equityWith(portfolioOf(d, p.id), p.id === meId ? prices : coarse))]));
  const rankEq = new Map(players.map((p) => [p.id, Math.round(equityWith(portfolioOf(d, p.id), coarse))]));
  const order = [...players].sort((a, b) => rankEq.get(b.id)! - rankEq.get(a.id)! || a.created_at.localeCompare(b.created_at)).map((p) => p.id);
  base.players = players.map((p) => {
    const exact = exacts.get(p.id)!;
    const mine = p.id === meId || finished;
    const start = startCashFor(r.version);
    const lo = Math.floor(((exact / start - 1) * 100) / RET_BAND) * RET_BAND;
    return {
      ...base.players.find((x) => x.id === p.id)!,
      // 상대: 구간 가운데 값(대략) — 화면은 금액 대신 구간으로 보여 줌
      equity: mine ? exact : Math.round(start * (1 + (lo + RET_BAND / 2) / 100)),
      band: mine ? null : ([lo, lo + RET_BAND] as [number, number]),
      rank: order.indexOf(p.id) + 1,
      tradeCount: d.trades.filter((t) => t.player_id === p.id && (mine || t.day < r.day)).length,
    };
  });
  base.myTrades = d.trades.filter((t) => t.player_id === meId);
  base.myOrders = d.orders.filter((o) => o.player_id === meId);
  base.myItemRows = d.items.filter((r) => r.player_id === meId);
  base.myItems = mine;
  // 가짜 뉴스는 받은 사람에게도 비밀 → 효과 목록에서 뺌
  base.effectsToday = finished ? [] : activeEffects(items, meId, r.day).map((e) => e.kind).filter((k) => k !== 'fake');

  // 알림: 나를 노린 방해(가짜 뉴스는 비밀), 방패로 막은 것, 내 공격이 막힌 것
  const nick = (id: string) => players.find((p) => p.id === id)?.nickname ?? '상대';
  items.effects.forEach((e, i) => {
    const key = `${e.from}-${e.kind}-${e.usedDay}-${i}`;
    const name = ITEM_MAP[e.kind].name;
    if (e.reflected) {
      // 누가 썼는지·상대가 무슨 카드를 가졌는지는 알리지 않음
      if (e.by === meId) base.notices.push({ key, text: `반사 거울이 누군가의 ${josa(name, '을', '를')} 되돌려 보냈어요!`, kind: 'ok' });
      else if (e.from === meId) base.notices.push({ key, text: `${nick(e.by ?? '')}에게 쓴 ${josa(name, '이', '가')} 방어에 막혀 나에게 돌아왔어요!`, kind: 'warn' });
      return;
    }
    if (e.crowded) {
      // 몰아치기로 무효가 된 공격: 쓴 사람에게만 다음 날 알림 (당한 사람에게는 아무 일도 없음)
      if (e.from === meId && r.day > e.usedDay) base.notices.push({ key, text: `${josa(nick(e.to), '은', '는')} 그날 이미 다른 사람의 방해를 받아서 내 ${josa(name, '은', '는')} 효과가 없었어요`, kind: 'warn' });
      return;
    }
    if (e.to === meId) {
      if (e.blocked) base.notices.push({ key, text: `방패가 누군가의 ${josa(name, '을', '를')} 막았어요!`, kind: 'ok' });
      else if (e.kind !== 'fake') base.notices.push({ key, text: `누군가 나에게 ${name} 카드를 썼어요! 다음 날부터 적용돼요`, kind: 'warn' });
    } else if (e.from === meId && e.blocked) base.notices.push({ key, text: `${nick(e.to)}에게 쓴 ${josa(name, '은', '는')} 방어에 막혔어요`, kind: 'warn' });
  });

  const todayInfo = finished ? [] : mine.infoUses.filter((u) => u.day === r.day).map((u) => u.kind);
  const rumorCheck = todayInfo.includes('detector');
  if (!finished) {
    if (todayInfo.includes('paper') && r.day + 1 < r.total_days) {
      base.reveals.tomorrow = m.news.filter((n) => n.day === r.day + 1).map((n) => publicNews(n, r.day + 1, false)).sort(newsOrder);
    }
    if (todayInfo.includes('analyst')) {
      let best = STOCK_SECTORS[0].id;
      let bestR = -Infinity;
      for (const sec of STOCK_SECTORS) {
        const ss = COMPANIES.filter((s) => s.sector === sec.id);
        const avg = ss.reduce((a, s) => a + m.bars[s.symbol][r.day].close / m.bars[s.symbol][r.day].open - 1, 0) / ss.length;
        if (avg > bestR) {
          bestR = avg;
          best = sec.id;
        }
      }
      base.reveals.bestSector = best;
    }
    if (todayInfo.includes('scout')) {
      const use = [...mine.infoUses].reverse().find((u) => u.kind === 'scout' && u.day === r.day);
      const sym = use?.symbol && m.bars[use.symbol] ? use.symbol : null;
      if (sym) {
        const b = m.bars[sym][r.day];
        const truth = b.close >= b.open;
        // 70% 확률로 맞음 — 같은 날 같은 종목이면 항상 같은 답
        const rng = r.salt ? seeded(`${r.salt}:scout:${sym}:${r.day}`) : mulberry32((r.seed ^ hashString(sym)) + r.day * 131);
        base.reveals.scout = { symbol: sym, up: rng() < SCOUT_ACCURACY ? truth : !truth };
      }
    }
    if (todayInfo.includes('spy')) {
      const spyUse = [...mine.infoUses].reverse().find((u) => u.kind === 'spy' && u.day === r.day);
      const opp = players.find((p) => p.id === spyUse?.target && p.id !== meId) ?? players.find((p) => p.id !== meId);
      if (opp) {
        const pf = portfolioOf(d, opp.id);
        base.reveals.spy = { nickname: opp.nickname, cash: pf.cash, holdings: pf.holdings };
      }
    }
  }
  base.reveals.rumorCheck = rumorCheck;

  const fakes = finished
    ? []
    : items.effects.filter((e) => e.to === meId && !e.blocked && e.kind === 'fake' && e.days[0] <= r.day).map(fakeNews);
  const blackout = !finished && base.effectsToday.includes('blackout');
  base.reveals.blackout = blackout;
  // (v7) 장 전 찌라시 (둘째 날부터, 정보 차단을 맞은 날은 안 보임) · 장 전이면 장이 열리는 시각
  if ((r.version ?? 1) >= PREMARKET_VERSION && open && r.day > 0 && !blackout) base.rumors = publicRumors(preRumors(m, day, r.salt ?? String(r.seed)), rumorCheck);
  base.room.preUntil = inPremarket(r, now) ? premarketEnd(r, now) : null;
  // 공개된 장중 속보 수가 바뀌면 시장 데이터를 다시 보냄 (아직 안 뜬 속보는 키에도 영향 없음)
  const releasedNow = open ? m.news.filter((x) => x.day === day && x.at != null && clock.tick >= releaseTick(x.at, clock.n)).length : 0;
  // 가짜 뉴스·감별 여부는 키에 그대로 드러나지 않게 시드와 섞어 해시 (바뀌면 다시 보내는 용도로만)
  const marketKey = `${r.status}:${r.day}:${releasedNow}:${hashKey(`${keySalt ?? r.id}|${meId}|${r.day}|${rumorCheck ? 1 : 0}|${fakes.length}|${blackout ? 1 : 0}`)}`;
  base.marketKey = marketKey;
  if (clientMarketKey !== marketKey) base.market = sliceMarket(m, day, finished, { rumorCheck, fakes, blackout, tick: open ? clock.tick : 0, n: clock.n });
  if (open) {
    const upto = (arr: number[]) => arr.slice(0, clock.tick + 1);
    const krw: Record<string, number[]> = {};
    const usd: Record<string, number[]> = {};
    for (const s of STOCKS) {
      krw[s.symbol] = upto(dayTicks(m, s.symbol, day, clock.n));
      if (m.usd[s.symbol]) usd[s.symbol] = upto(dayTicks(m, s.symbol, day, clock.n, 'usd'));
    }
    base.live = { day, tick: clock.tick, n: clock.n, startAt: clock.startAt, endAt: clock.endAt, tickMs: clock.tickMs, krw, usd, index: upto(indexTicks(m, 'kr', day, clock.n)), usIndex: upto(indexTicks(m, 'us', day, clock.n)) };
  }

  if (finished) {
    base.final = { seed: r.seed, trades: d.trades, items: d.items, players: players.map((p) => ({ id: p.id, nickname: p.nickname, left: !!p.left_game })), badges: finalResults(d).badges };
  }
  return base;
}

/* ---------------- 행동 검증 ---------------- */

function requirePlaying(d: GameData, meId: string, now: number) {
  const r = d.room;
  if (r.status !== 'playing' || r.day >= r.total_days) throw new GameError('지금은 게임 중이 아니에요.', 409);
  const me = d.players.find((p) => p.id === meId);
  if (!me) throw new GameError('이 방의 플레이어가 아니에요.', 403);
  if (me.left_game) throw new GameError('기권한 게임이에요.', 409);
  if (me.ended_day >= r.day) throw new GameError('오늘은 이미 장 마감을 눌렀어요.', 409);
  if (r.deadline !== null && now >= r.deadline) throw new GameError('오늘 시간이 다 됐어요.', 409);
  return me;
}

export function validateTrade(d: GameData, meId: string, now: number, input: { symbol?: unknown; side?: unknown; qty?: unknown }): Trade {
  requirePlaying(d, meId, now);
  if (inPremarket(d.room, now)) throw new GameError('아직 장이 열리지 않았어요. 장 전에는 예약 주문만 할 수 있어요.', 409);
  const symbol = cleanSymbol(input.symbol);
  const side = input.side === 'buy' || input.side === 'sell' ? input.side : null;
  if (!side) throw new GameError('사기/팔기를 골라 주세요.');
  const qty = input.qty;
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new GameError('수량을 확인해 주세요.');

  const items = itemsOf(d);
  const fx = activeEffects(items, meId, d.room.day);
  if (fx.some((e) => e.kind === 'freeze')) throw new GameError('거래 정지 카드 때문에 오늘은 거래할 수 없어요.', 409);
  const fee = fx.some((e) => e.kind === 'fee') ? FEE_BOMB_RATE : FEE_RATE;

  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
  const price = livePrice(d, m, symbol, now); // 가격은 오직 서버가 정한다 — 요청을 받은 순간의 칸
  const pf = portfolioOf(d, meId);
  if (side === 'buy' && buyCost(qty, price, fee) > pf.cash) throw new GameError('현금이 부족해요.');
  if (side === 'sell' && (pf.holdings[symbol]?.qty ?? 0) < qty) throw new GameError('가진 수량이 부족해요.');
  if (side === 'buy') {
    const cap = leveragedCap(d, m, pf, symbol, price, now);
    if (cap !== null && qty > cap) throw new GameError(`레버리지·인버스 ETF는 합쳐서 총재산의 ${Math.round(LEVERAGE_CAP * 100)}%까지만 살 수 있어요` + (cap > 0 ? ` (지금 최대 ${cap}주)` : ''));
  }
  return { player_id: meId, day: d.room.day, symbol, side, qty, price, fee };
}

/** 레버리지·인버스 ETF (하루 수익률의 2배·반대로) */
export const isLeveraged = (symbol: string) => {
  const e = STOCK_MAP[symbol]?.etf;
  return !!e && e.lev !== 1;
};
/** v4 규칙: 레버리지·인버스 ETF 는 합쳐서 총재산의 이만큼까지만 (몰빵 한 방으로 다인전을 이기는 걸 막음 — 실제로도 별도 제한이 있음) */
export const LEVERAGE_CAP = 0.3;

/** 이 레버리지 ETF 를 지금 더 살 수 있는 최대 수량 (제한 없는 종목·예전 방이면 null) */
export function leveragedCap(d: GameData, m: Market, pf: ReturnType<typeof portfolioOf>, symbol: string, price: number, now: number): number | null {
  if ((d.room.version ?? 1) < 4 || !isLeveraged(symbol)) return null;
  const prices = livePriceMap(d, m, now);
  const equity = equityWith(pf, prices);
  let held = 0;
  for (const [sym, h] of Object.entries(pf.holdings)) if (isLeveraged(sym)) held += h.qty * (prices[sym] ?? 0);
  const room = LEVERAGE_CAP * equity - held;
  return Math.max(0, Math.floor(room / (price * (1 + FEE_RATE))));
}

export function validateBuyItem(d: GameData, meId: string, now: number, input: { kind?: unknown }): ItemRow {
  requirePlaying(d, meId, now);
  const kind = cleanKind(input.kind);
  const solo = d.players.length < 2;
  if (solo && ITEM_MAP[kind].multiOnly) throw new GameError('이 카드는 둘이서 할 때만 쓸 수 있어요.');
  const mine = itemsOf(d).players[meId];
  const cost = itemCost(kind, d.players.length, d.room.version ?? 1);
  const why = canBuy(mine, kind, portfolioOf(d, meId).cash, cost, holdLimit(d.room.version ?? 1));
  if (why) throw new GameError(why);
  return { player_id: meId, day: d.room.day, kind, action: 'buy', cost, payload: null };
}

export function validateUseItem(d: GameData, meId: string, now: number, input: { kind?: unknown; payload?: unknown }): ItemRow {
  requirePlaying(d, meId, now);
  const kind = cleanKind(input.kind);
  const solo = d.players.length < 2;
  if (solo && ITEM_MAP[kind].multiOnly) throw new GameError('이 카드는 둘이서 할 때만 쓸 수 있어요.');
  const mine = itemsOf(d).players[meId];
  const usedToday = d.items.some((r) => r.player_id === meId && r.action === 'use' && r.kind === kind && r.day === d.room.day);
  const why = canUse(mine, kind, d.room.day, d.room.total_days, usedToday);
  if (why) throw new GameError(why);
  let payload: ItemRow['payload'] = null;
  if (ITEM_MAP[kind].type === 'attack' || kind === 'spy') {
    // 기권한 사람은 대상이 될 수 없음 (카드가 헛되이 쓰이지 않게)
    const others = d.players.filter((p) => p.id !== meId && !p.left_game);
    if (!others.length) throw new GameError('카드를 쓸 상대가 없어요. 모두 나갔어요.', 409);
    const t = (input.payload as { target?: unknown } | undefined)?.target;
    const target = typeof t === 'string' ? others.find((p) => p.id === t) : others.length === 1 ? others[0] : undefined;
    if (!target) throw new GameError('카드를 쓸 상대를 골라 주세요.');
    // 한 사람에게 방해는 하루 한 번: 이미 누군가(나 포함) 방해했으면 거절하고 카드는 그대로 둠.
    // 막혔든(방패) 되돌아갔든(반사) 그날 그 사람은 방해받은 것으로 침 — 누가 썼는지는 말하지 않음
    if (ITEM_MAP[kind].type === 'attack' && attackedToday(itemsOf(d), target.id, d.room.day))
      throw new GameError(`오늘은 이미 누군가 ${josa(target.nickname, '에게', '에게')} 방해 카드를 썼어요. 내 카드는 쓰이지 않고 그대로 있어요`, 409);
    payload = { target: target.id };
  }
  if (kind === 'scout') {
    const p = (input.payload ?? {}) as { symbol?: unknown };
    payload = { symbol: cleanSymbol(p.symbol) };
  }
  if (kind === 'fake') {
    const p = (input.payload ?? {}) as { symbol?: unknown; tone?: unknown };
    const symbol = cleanSymbol(p.symbol);
    if (STOCK_MAP[symbol].etf) throw new GameError('가짜 뉴스는 회사에만 쓸 수 있어요.');
    if (p.tone !== 'good' && p.tone !== 'bad') throw new GameError('호재/악재를 골라 주세요.');
    payload = { ...payload, symbol, tone: p.tone };
  }
  // (v6) 용돈 봉투: 서버가 방 비밀값으로 결과를 뽑아 기록 — 잃는 돈은 지금 현금까지만 (빚 없음)
  if (kind === 'bonus' && (d.room.version ?? 1) >= 6) {
    const nth = d.items.filter((r) => r.player_id === meId && r.action === 'use' && r.kind === 'bonus').length;
    const u = seeded(`${d.room.salt ?? d.room.seed}:bonus:${meId}:${nth}`)();
    const cash = portfolioOf(d, meId).cash;
    payload = { amount: Math.max(drawBonus(u), -Math.max(0, cash)) };
  }
  return { player_id: meId, day: d.room.day, kind, action: 'use', cost: 0, payload };
}

/** 오늘 이 사람이 이미 방해를 받았는지 (적용·방패로 막힘·반사로 되돌림 모두 — 원래 대상 기준) */
export function attackedToday(items: ReturnType<typeof deriveItems>, playerId: string, day: number): boolean {
  // 반사로 자기 공격을 되맞은 경우(e.to === e.from)는 넣지 않음 — 넣으면 거울 주인이 거절 메시지로 공격자를 알아낼 수 있음
  return items.effects.some((e) => e.usedDay === day && ((e.to === playerId && !(e.reflected && e.to === e.from)) || (e.reflected && e.by === playerId)));
}

export function validateEndTurn(d: GameData, meId: string, now: number) {
  const me = requirePlaying(d, meId, now - 1e12); // 시간이 지나도 마감 버튼은 허용
  // 장 전에 마감하면 그날 장이 통째로 건너뛰어질 수 있음 → 장이 열린 뒤에만
  if (inPremarket(d.room, now)) throw new GameError('장이 열린 뒤에 마감할 수 있어요.', 409);
  return { playerId: me.id, day: d.room.day };
}

/** 이 시간 넘게 화면을 받아 가지 않으면 '자리 비움' — 남은 사람들이 그 사람을 기다리지 않음 */
export const AWAY_MS = 90_000;
/** 지금 게임에 참여 중인지 (나가지 않았고 최근에 접속). 기록이 없으면(예전 데이터) 참여 중으로 봄 */
export function isActive(p: PlayerRow, now: number): boolean {
  if (p.left_game) return false;
  if (!p.last_seen) return true;
  return now - new Date(p.last_seen).getTime() < AWAY_MS;
}
const activePlayers = (d: GameData, now: number) => d.players.filter((p) => isActive(p, now));
const endedCount = (d: GameData, now: number) => activePlayers(d, now).filter((p) => p.ended_day >= d.room.day).length;
/** 나가지 않은 모든 사람이 오늘 마감했는지 (자리 비운 사람도 마감해야 '바로' 넘어감 — 잠깐 앱을 바꾼 사람을 건너뛰지 않게) */
const allStayingEnded = (d: GameData) => {
  const staying = d.players.filter((p) => !p.left_game);
  return staying.length > 0 && staying.every((p) => p.ended_day >= d.room.day);
};

/** 게임 중 나가기 = 기권: 남은 날 모두 마감한 것으로 (기록과 순위에는 그대로 남음) */
export function validateLeave(d: GameData, meId: string): { left_game: true; ended_day: number } {
  if (!d.players.some((p) => p.id === meId)) throw new GameError('이 방의 플레이어가 아니에요.', 403);
  return { left_game: true, ended_day: d.room.total_days };
}

/**
 * 마감 인원이 기준(graceRule)에 닿으면 카운트다운 마감 시각을 돌려준다.
 * 지금 마감 시각이 이미 더 이르면(또는 모두 마감했으면) null
 */
export function graceDeadline(d: GameData, now: number): number | null {
  const r = d.room;
  if (r.status !== 'playing') return null;
  // 카운트다운 기준은 지금 접속 중인 사람으로 (자리 비운 사람 때문에 하루가 끝까지 늘어지지 않게)
  const active = activePlayers(d, now).length;
  const ended = endedCount(d, now);
  const rule = graceRule(active);
  if (active === 0 || allStayingEnded(d) || ended < rule.need) return null;
  const target = now + rule.seconds * 1000;
  return r.deadline === null || target < r.deadline ? target : null;
}

/** 지금 카운트다운 중인지 (원래 마감 시각보다 당겨져 있음) */
export function isCountdown(r: RoomRow) {
  return r.deadline !== null && r.day_deadline != null && r.deadline < r.day_deadline;
}

/** 마감 취소로 기준 아래가 됐으면 원래 마감 시각을 돌려준다 (되돌릴 필요 없으면 null) */
export function restoreDeadline(d: GameData, now = Date.now()): number | null {
  const r = d.room;
  if (r.status !== 'playing' || !isCountdown(r)) return null;
  return endedCount(d, now) < graceRule(activePlayers(d, now).length).need ? r.day_deadline! : null;
}

/** 장 마감 취소 — 다음 날로 넘어가기 전이면 언제든. 시간이 이미 다 됐으면 불가 */
export function validateCancelEnd(d: GameData, meId: string, now: number) {
  const r = d.room;
  if (r.status !== 'playing' || r.day >= r.total_days) throw new GameError('지금은 게임 중이 아니에요.', 409);
  const me = d.players.find((p) => p.id === meId);
  if (!me) throw new GameError('이 방의 플레이어가 아니에요.', 403);
  if (me.left_game) throw new GameError('기권한 게임이에요.', 409);
  if (me.ended_day < r.day) throw new GameError('오늘은 아직 장 마감을 누르지 않았어요.', 409);
  if (r.deadline !== null && now >= r.deadline) throw new GameError('시간이 다 돼서 취소할 수 없어요.', 409);
  return { playerId: me.id, endedDay: r.day - 1 };
}

/** 두 사람 모두 마감했거나 시간이 다 됐으면 다음 날로 */
export function nextRoomState(d: GameData, now: number): Pick<RoomRow, 'day' | 'status' | 'deadline' | 'day_deadline'> | null {
  const r = d.room;
  if (r.status !== 'playing') return null;
  // 나가지 않은 사람이 모두 마감하면 바로 (자리 비운 사람은 카운트다운으로만 기다림). 아무도 없으면 시간까지
  // 대결에서 나머지가 모두 기권했으면 남은 한 사람의 승리로 바로 끝 (혼자 남은 날을 다 넘기지 않게)
  if (d.players.length >= 2 && d.players.filter((p) => !p.left_game).length <= 1) return { day: r.total_days, status: 'finished', deadline: null, day_deadline: null };
  const allEnded = allStayingEnded(d);
  const timeUp = r.deadline !== null && now >= r.deadline;
  if (!allEnded && !timeUp) return null;
  const day = r.day + 1;
  const status: RoomStatus = day >= r.total_days ? 'finished' : 'playing';
  // v7: 다음 날 장이 열리기 전에 장 전 시간을 둠 (장 시계의 시작 = 마감 시각 - 하루 시간 이므로 마감 시각을 그만큼 뒤로)
  // (장 전 시간 + 예전부터 있던 장 시작 전 4초)
  const pre = (r.version ?? 1) >= PREMARKET_VERSION ? preSeconds(r.turn_seconds) + 4 : 4;
  const deadline = status === 'playing' && r.turn_seconds > 0 ? now + (r.turn_seconds + pre) * 1000 : null;
  return { day, status, deadline, day_deadline: deadline };
}

/** (v7) 장 전 '준비 완료' */
export function validatePreReady(d: GameData, meId: string, now: number) {
  const r = d.room;
  const me = d.players.find((p) => p.id === meId);
  if (!me) throw new GameError('이 방의 플레이어가 아니에요.', 403);
  if (me.left_game) throw new GameError('기권한 게임이에요.', 409);
  if (!inPremarket(r, now)) throw new GameError('지금은 장 전 시간이 아니에요.', 409);
  return { playerId: me.id, day: r.day };
}
/** (v7) 남은 사람이 모두 준비 완료했으면 바로 장을 여는 새 마감 시각 (아니면 null) */
export function preAllReadyDeadline(d: GameData, now: number): number | null {
  const r = d.room;
  if (!inPremarket(r, now)) return null;
  const staying = d.players.filter((p) => !p.left_game && isActive(p, now));
  if (!staying.length || !staying.every((p) => (p.pre_day ?? -1) >= r.day)) return null;
  return now + r.turn_seconds * 1000;
}

export function finalResults(d: GameData) {
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
  const prices = priceMap(m, d.room.total_days - 1, true);
  const players = sortedPlayers(d);
  const badges = computeAchievements({
    market: m,
    seed: d.room.seed,
    items: d.items,
    players: players.map((p) => ({
      id: p.id,
      trades: d.trades.filter((t) => t.player_id === p.id),
      spends: spendsOf(d, p.id),
      filledOrders: d.orders.filter((o) => o.player_id === p.id && o.status === 'filled').length,
    })),
  });
  const results = players.map((p) => {
    const equity = Math.round(equityWith(portfolioOf(d, p.id), prices));
    return { nickname: p.nickname, equity, ret: equity / startCashFor(d.room.version) - 1, badges: badges[p.id] ?? [], left: !!p.left_game };
  });
  // 기권한 사람은 재산과 상관없이 뒤로 (끝까지 한 사람끼리는 재산 순)
  const ranked = [...results].sort((a, b) => Number(a.left) - Number(b.left) || b.equity - a.equity);
  const stay = ranked.filter((r) => !r.left);
  const winner = ranked.length >= 2 && stay.length >= 1 && (stay.length === 1 || stay[0].equity !== stay[1].equity) ? stay[0].nickname : null;
  return { results: ranked, winner, badges };
}

/* ---------------- 지정가(예약) 주문 ---------------- */

export function validatePlaceOrder(d: GameData, meId: string, now: number, input: { symbol?: unknown; side?: unknown; qty?: unknown; limit?: unknown }): OrderRow {
  requirePlaying(d, meId, now);
  const symbol = cleanSymbol(input.symbol);
  const side = input.side === 'buy' || input.side === 'sell' ? input.side : null;
  if (!side) throw new GameError('사기/팔기를 골라 주세요.');
  const qty = input.qty;
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new GameError('수량을 확인해 주세요.');
  const limit = input.limit;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) throw new GameError('예약 가격을 확인해 주세요.');

  const items = itemsOf(d);
  const fx = activeEffects(items, meId, d.room.day);
  if (fx.some((e) => e.kind === 'freeze')) throw new GameError('거래 정지 카드 때문에 오늘은 주문할 수 없어요.', 409);
  const fee = fx.some((e) => e.kind === 'fee') ? FEE_BOMB_RATE : FEE_RATE;

  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
  const open = livePrice(d, m, symbol, now, STOCK_MAP[symbol].currency === 'USD' ? 'usd' : 'krw');
  const isUS = STOCK_MAP[symbol].currency === 'USD';
  const lim = isUS ? Math.round(limit * 100) / 100 : Math.round(limit);
  if (side === 'buy' && !(lim < open && lim >= open * 0.7)) throw new GameError('예약 사기 가격은 지금 가격보다 낮고, 30% 이내여야 해요.');
  if (side === 'sell' && !(lim > open && lim <= open * 1.3)) throw new GameError('예약 팔기 가격은 지금 가격보다 높고, 30% 이내여야 해요.');

  const mine = d.orders.filter((o) => o.player_id === meId && o.day === d.room.day && o.status === 'open');
  if (mine.length >= MAX_OPEN_ORDERS) throw new GameError(`예약 주문은 하루 ${MAX_OPEN_ORDERS}개까지예요.`);
  const pf = portfolioOf(d, meId);
  const fxRate = m.macro[d.room.day].fx;
  const krw = (o: { limit_price: number; symbol: string }) => (STOCK_MAP[o.symbol].currency === 'USD' ? Math.round(o.limit_price * fxRate) : o.limit_price);
  if (side === 'buy') {
    const reserved = mine.filter((o) => o.side === 'buy').reduce((a, o) => a + buyCost(o.qty, krw(o), o.fee), 0);
    if (reserved + buyCost(qty, krw({ limit_price: lim, symbol }), fee) > pf.cash) throw new GameError('예약해 둔 주문까지 합치면 현금이 부족해요.');
  } else {
    const reserved = mine.filter((o) => o.side === 'sell' && o.symbol === symbol).reduce((a, o) => a + o.qty, 0);
    if (reserved + qty > (pf.holdings[symbol]?.qty ?? 0)) throw new GameError('예약해 둔 주문까지 합치면 가진 수량이 부족해요.');
  }
  return { player_id: meId, day: d.room.day, symbol, side, qty, limit_price: lim, fee, status: 'open' };
}

export function validateCancelOrder(d: GameData, meId: string, now: number, input: { orderId?: unknown }): string {
  requirePlaying(d, meId, now);
  const o = d.orders.find((x) => x.id === input.orderId);
  if (!o || o.player_id !== meId) throw new GameError('주문을 찾을 수 없어요.', 404);
  if (o.status !== 'open' || o.day !== d.room.day) throw new GameError('이미 처리된 주문이에요.', 409);
  return o.id!;
}

/**
 * 장 마감 때 예약 주문 처리: 오늘 장중 가격 흐름이 예약 가격에 닿으면 그 가격에 체결.
 * 체결 순간 돈/수량이 모자라면 취소, 못 닿으면 만료.
 */
/**
 * 예약 주문 처리: 주문을 넣은 칸 **이후** ~ upto 칸 사이에 가격이 닿으면 그 칸에서 체결.
 * final(하루 끝)이면 끝까지 안 닿은 주문은 만료. final 이 아니면 안 닿은 주문은 결과에 없음(그대로 대기)
 */
export function resolveOrders(d: GameData, day: number, upto: number, final: boolean): { id: string; status: OrderRow['status']; trade?: Trade }[] {
  const m = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
  const fx = m.macro[day].fx;
  const clock = dayClock(d.room, 0);
  const open = d.orders.filter((o) => o.day === day && o.status === 'open').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const out: { id: string; status: OrderRow['status']; trade?: Trade }[] = [];
  const extra: Trade[] = [];
  for (const o of open) {
    const isUS = STOCK_MAP[o.symbol].currency === 'USD';
    const ticks = dayTicks(m, o.symbol, day, clock.n, isUS ? 'usd' : 'krw');
    const from = Math.min(clock.n, tickOf(clock.startAt, o.created_at, clock.tickMs) + 1);
    let hitAt = -1;
    for (let k = from; k <= Math.min(upto, clock.n); k++) {
      if (o.side === 'buy' ? ticks[k] <= o.limit_price : ticks[k] >= o.limit_price) {
        hitAt = k;
        break;
      }
    }
    if (hitAt < 0) {
      if (final) out.push({ id: o.id!, status: 'expired' });
      continue;
    }
    const price = isUS ? Math.round(o.limit_price * fx) : o.limit_price;
    const pf = computePortfolio([...d.trades.filter((t) => t.player_id === o.player_id), ...extra.filter((t) => t.player_id === o.player_id)], spendsOf(d, o.player_id), Infinity, paidDividends(d), startCashFor(d.room.version));
    const ok = o.side === 'buy' ? buyCost(o.qty, price, o.fee) <= pf.cash : (pf.holdings[o.symbol]?.qty ?? 0) >= o.qty;
    if (!ok) {
      out.push({ id: o.id!, status: 'cancelled' });
      continue;
    }
    // 체결 시각 = 가격이 닿은 칸의 시각 (거래 순서가 맞게)
    const trade: Trade = { player_id: o.player_id, day, symbol: o.symbol, side: o.side, qty: o.qty, price, fee: o.fee, created_at: new Date(clock.startAt + hitAt * clock.tickMs + extra.length).toISOString() };
    extra.push(trade);
    out.push({ id: o.id!, status: 'filled', trade });
  }
  return out;
}
