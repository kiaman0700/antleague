/**
 * 게임 규칙 엔진 — 서버(Vercel 함수)와 연습 모드(브라우저)가 같은 코드를 쓴다.
 * 모든 행동은 여기서 검증되고, 화면에 보내는 정보(View)도 여기서 만든다.
 * 둘이서 하는 게임에서 이 코드는 서버에서만 돌기 때문에
 *  - 가격은 서버가 정한 값으로만 체결되고
 *  - 시드(미래 가격)·루머의 진실·상대의 보유 종목은 브라우저로 나가지 않는다.
 */
import { activeEffects, canBuy, canUse, deriveItems, FEE_BOMB_RATE, ITEM_MAP, ITEMS, type Effect, type ItemKind, type ItemRow, type PlayerItems } from '../game/items.js';
import { generateMarket, relatedForCompany, type Bar, type Market, type NewsEvent } from '../game/market.js';
import { computeAchievements } from '../game/achievements.js';
import { COMPANY_BAD, COMPANY_GOOD } from '../game/news.js';
import { buyCost, computePortfolio, equityWith, FEE_RATE, START_CASH, type Holding, type Trade } from '../game/portfolio.js';
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
  /** ms epoch, null = 제한 없음 */
  deadline: number | null;
  host_id: string | null;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  nickname: string;
  mode: UiMode;
  ready: boolean;
  ended_day: number;
  created_at: string;
  version: number;
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
  equity: number;
  tradeCount: number;
}

export interface Notice {
  key: string;
  text: string;
  kind: 'ok' | 'warn';
}

export interface View {
  room: { id: string; code: string; status: RoomStatus; day: number; totalDays: number; turnSeconds: number; deadline: number | null; hostId: string | null };
  serverNow: number;
  meId: string;
  players: PublicPlayer[];
  /** 시장 정보가 바뀌었을 때만 채워짐 (marketKey 로 판단) */
  market: Market | null;
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
  };
  /** 게임이 끝나면 모든 기록 공개 */
  final: { seed: number; trades: Trade[]; items: ItemRow[]; players: { id: string; nickname: string }[]; badges: Record<string, string[]> } | null;
}

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/* ---------------- 입력 검증 ---------------- */

export const DAY_CHOICES = [10, 20, 30];
export const TURN_CHOICES = [0, 60, 90, 180];
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
export function marketFor(seed: number, days: number): Market {
  const key = `${seed}:${days}`;
  let m = marketCache.get(key);
  if (!m) {
    m = generateMarket(seed, days);
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
  };
}

/** 오늘까지만 보이는 시장 — 오늘 종가·미래 가격·루머의 진실은 빠진다 */
export function sliceMarket(m: Market, day: number, finished: boolean, opts: { rumorCheck: boolean; fakes: NewsEvent[] }): Market {
  const strip = (b: Bar): Bar => ({ open: b.open, close: b.close, high: b.high, low: b.low, path: [] });
  if (finished) {
    return {
      ...m,
      bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, v.map(strip)])),
      usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, v.map(strip)])),
      index: m.index.map(strip),
      usIndex: m.usIndex.map(strip),
      seed: 0,
    };
  }
  // 배당금은 기준일 종가로 정해지므로, 기준일이 끝나기 전에는 숨김 (배당률·날짜는 공개)
  const dividends = m.dividends.map((d) => (d.day < day ? d : { ...d, perShare: 0 }));
  const cut = (arr: Bar[]): Bar[] => {
    const o = arr[day].open;
    return [...arr.slice(0, day).map(strip), { open: o, close: o, high: o, low: o, path: [] }];
  };
  const news = m.news
    .filter((n) => n.day <= day)
    .map((n) => (n.day === day && n.rumor && !opts.rumorCheck ? { ...n, realTone: n.tone } : n));
  return {
    seed: 0,
    totalDays: m.totalDays,
    base: m.base,
    baseUsd: m.baseUsd,
    bars: Object.fromEntries(Object.entries(m.bars).map(([k, v]) => [k, cut(v)])),
    usd: Object.fromEntries(Object.entries(m.usd).map(([k, v]) => [k, cut(v)])),
    index: cut(m.index),
    usIndex: cut(m.usIndex),
    macro: m.macro.slice(0, day + 1),
    macro0: m.macro0,
    news: [...news, ...opts.fakes],
    events: m.events,
    dividends,
  };
}

/** 지급이 끝난 배당만 (게임 종료 시 전부) */
function paidDividends(d: GameData) {
  const m = marketFor(d.room.seed, d.room.total_days);
  const finished = d.room.status === 'finished' || d.room.day >= d.room.total_days;
  return finished ? m.dividends : m.dividends.filter((x) => x.day < d.room.day);
}

/* ---------------- 상태 계산 ---------------- */

function sortedPlayers(d: GameData) {
  return [...d.players].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function itemsOf(d: GameData) {
  const day = Math.min(d.room.day, d.room.total_days - 1);
  return deriveItems(d.room.seed, sortedPlayers(d).map((p) => p.id), d.items, day, d.room.total_days, d.players.length < 2);
}

function spendsOf(d: GameData, pid: string) {
  return d.items.filter((r) => r.player_id === pid && r.action === 'buy').map((r) => ({ day: r.day, cost: r.cost }));
}

export function portfolioOf(d: GameData, pid: string) {
  return computePortfolio(
    d.trades.filter((t) => t.player_id === pid),
    spendsOf(d, pid),
    Infinity,
    paidDividends(d),
  );
}

export function buildView(d: GameData, meId: string, now: number, clientMarketKey?: string): View {
  const r = d.room;
  const players = sortedPlayers(d);
  const base: Omit<View, 'market' | 'marketKey'> & { market: Market | null; marketKey: string } = {
    room: { id: r.id, code: r.code, status: r.status, day: r.day, totalDays: r.total_days, turnSeconds: r.turn_seconds, deadline: r.deadline, hostId: r.host_id },
    serverNow: now,
    meId,
    players: players.map((p) => ({ id: p.id, nickname: p.nickname, mode: p.mode, ready: p.ready, endedDay: p.ended_day, equity: START_CASH, tradeCount: 0 })),
    market: null,
    marketKey: 'waiting',
    myTrades: [],
    myOrders: [],
    myItemRows: [],
    myItems: { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 },
    effectsToday: [],
    notices: [],
    reveals: { tomorrow: null, bestSector: null, rumorCheck: false, spy: null },
    final: null,
  };
  if (r.status === 'waiting') return base;

  const finished = r.status === 'finished' || r.day >= r.total_days;
  const day = Math.min(r.day, r.total_days - 1);
  const m = marketFor(r.seed, r.total_days);
  const prices = priceMap(m, day, finished);
  const items = itemsOf(d);
  const mine = items.players[meId] ?? base.myItems;

  base.players = players.map((p) => {
    const pf = portfolioOf(d, p.id);
    return { ...base.players.find((x) => x.id === p.id)!, equity: Math.round(equityWith(pf, prices)), tradeCount: d.trades.filter((t) => t.player_id === p.id).length };
  });
  base.myTrades = d.trades.filter((t) => t.player_id === meId);
  base.myOrders = d.orders.filter((o) => o.player_id === meId);
  base.myItemRows = d.items.filter((r) => r.player_id === meId);
  base.myItems = mine;
  base.effectsToday = finished ? [] : activeEffects(items, meId, r.day).map((e) => e.kind);

  // 알림: 나를 노린 방해(가짜 뉴스는 비밀), 방패로 막은 것, 내 공격이 막힌 것
  items.effects.forEach((e, i) => {
    const key = `${e.from}-${e.kind}-${e.usedDay}-${i}`;
    const name = `${ITEM_MAP[e.kind].emoji} ${ITEM_MAP[e.kind].name}`;
    if (e.to === meId) {
      if (e.blocked) base.notices.push({ key, text: `🛡️ 방패가 상대의 ${name}을(를) 막았어요!`, kind: 'ok' });
      else if (e.kind !== 'fake') base.notices.push({ key, text: `⚠️ 상대가 ${name} 카드를 썼어요! 다음 날부터 적용돼요`, kind: 'warn' });
    } else if (e.from === meId && e.blocked) base.notices.push({ key, text: `상대의 🛡️ 방패에 ${name}이(가) 막혔어요`, kind: 'warn' });
  });

  const todayInfo = finished ? [] : mine.infoUses.filter((u) => u.day === r.day).map((u) => u.kind);
  const rumorCheck = todayInfo.includes('detector');
  if (!finished) {
    if (todayInfo.includes('paper') && r.day + 1 < r.total_days) {
      base.reveals.tomorrow = m.news.filter((n) => n.day === r.day + 1).map((n) => ({ ...n, realTone: n.tone }));
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
    if (todayInfo.includes('spy')) {
      const opp = players.find((p) => p.id !== meId);
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
  const marketKey = `${r.status}:${r.day}:${rumorCheck ? 1 : 0}:${fakes.length}`;
  base.marketKey = marketKey;
  if (clientMarketKey !== marketKey) base.market = sliceMarket(m, day, finished, { rumorCheck, fakes });

  if (finished) {
    base.final = { seed: r.seed, trades: d.trades, items: d.items, players: players.map((p) => ({ id: p.id, nickname: p.nickname })), badges: finalResults(d).badges };
  }
  return base;
}

/* ---------------- 행동 검증 ---------------- */

function requirePlaying(d: GameData, meId: string, now: number) {
  const r = d.room;
  if (r.status !== 'playing' || r.day >= r.total_days) throw new GameError('지금은 게임 중이 아니에요.', 409);
  const me = d.players.find((p) => p.id === meId);
  if (!me) throw new GameError('이 방의 플레이어가 아니에요.', 403);
  if (me.ended_day >= r.day) throw new GameError('오늘은 이미 장 마감을 눌렀어요.', 409);
  if (r.deadline !== null && now >= r.deadline) throw new GameError('오늘 시간이 다 됐어요.', 409);
  return me;
}

export function validateTrade(d: GameData, meId: string, now: number, input: { symbol?: unknown; side?: unknown; qty?: unknown }): Trade {
  requirePlaying(d, meId, now);
  const symbol = cleanSymbol(input.symbol);
  const side = input.side === 'buy' || input.side === 'sell' ? input.side : null;
  if (!side) throw new GameError('사기/팔기를 골라 주세요.');
  const qty = input.qty;
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new GameError('수량을 확인해 주세요.');

  const items = itemsOf(d);
  const fx = activeEffects(items, meId, d.room.day);
  if (fx.some((e) => e.kind === 'freeze')) throw new GameError('🧊 거래 정지 카드 때문에 오늘은 거래할 수 없어요.', 409);
  const fee = fx.some((e) => e.kind === 'fee') ? FEE_BOMB_RATE : FEE_RATE;

  const m = marketFor(d.room.seed, d.room.total_days);
  const price = m.bars[symbol][d.room.day].open; // 가격은 오직 서버가 정한다
  const pf = portfolioOf(d, meId);
  if (side === 'buy' && buyCost(qty, price, fee) > pf.cash) throw new GameError('현금이 부족해요.');
  if (side === 'sell' && (pf.holdings[symbol]?.qty ?? 0) < qty) throw new GameError('가진 수량이 부족해요.');
  return { player_id: meId, day: d.room.day, symbol, side, qty, price, fee };
}

export function validateBuyItem(d: GameData, meId: string, now: number, input: { kind?: unknown }): ItemRow {
  requirePlaying(d, meId, now);
  const kind = cleanKind(input.kind);
  const solo = d.players.length < 2;
  if (solo && ITEM_MAP[kind].multiOnly) throw new GameError('이 카드는 둘이서 할 때만 쓸 수 있어요.');
  const mine = itemsOf(d).players[meId];
  const why = canBuy(mine, kind, portfolioOf(d, meId).cash);
  if (why) throw new GameError(why);
  return { player_id: meId, day: d.room.day, kind, action: 'buy', cost: ITEM_MAP[kind].cost, payload: null };
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
  if (kind === 'fake') {
    const p = (input.payload ?? {}) as { symbol?: unknown; tone?: unknown };
    const symbol = cleanSymbol(p.symbol);
    if (STOCK_MAP[symbol].etf) throw new GameError('가짜 뉴스는 회사에만 쓸 수 있어요.');
    if (p.tone !== 'good' && p.tone !== 'bad') throw new GameError('호재/악재를 골라 주세요.');
    payload = { symbol, tone: p.tone };
  }
  return { player_id: meId, day: d.room.day, kind, action: 'use', cost: 0, payload };
}

export function validateEndTurn(d: GameData, meId: string, now: number) {
  const me = requirePlaying(d, meId, now - 1e12); // 시간이 지나도 마감 버튼은 허용
  return { playerId: me.id, day: d.room.day };
}

/** 두 사람 모두 마감했거나 시간이 다 됐으면 다음 날로 */
export function nextRoomState(d: GameData, now: number): Pick<RoomRow, 'day' | 'status' | 'deadline'> | null {
  const r = d.room;
  if (r.status !== 'playing') return null;
  const allEnded = d.players.length > 0 && d.players.every((p) => p.ended_day >= r.day);
  const timeUp = r.deadline !== null && now >= r.deadline;
  if (!allEnded && !timeUp) return null;
  const day = r.day + 1;
  const status: RoomStatus = day >= r.total_days ? 'finished' : 'playing';
  return { day, status, deadline: status === 'playing' && r.turn_seconds > 0 ? now + (r.turn_seconds + 4) * 1000 : null };
}

export function finalResults(d: GameData) {
  const m = marketFor(d.room.seed, d.room.total_days);
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
    return { nickname: p.nickname, equity, ret: equity / START_CASH - 1, badges: badges[p.id] ?? [] };
  });
  const winner = results.length === 2 && results[0].equity !== results[1].equity ? (results[0].equity > results[1].equity ? results[0] : results[1]).nickname : null;
  return { results, winner, badges };
}

/* ---------------- 지정가(예약) 주문 ---------------- */

function nativeOpen(m: Market, symbol: string, day: number) {
  return (m.usd[symbol] ?? m.bars[symbol])[day].open;
}

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
  if (fx.some((e) => e.kind === 'freeze')) throw new GameError('🧊 거래 정지 카드 때문에 오늘은 주문할 수 없어요.', 409);
  const fee = fx.some((e) => e.kind === 'fee') ? FEE_BOMB_RATE : FEE_RATE;

  const m = marketFor(d.room.seed, d.room.total_days);
  const open = nativeOpen(m, symbol, d.room.day);
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
export function resolveOrders(d: GameData, day: number): { id: string; status: OrderRow['status']; trade?: Trade }[] {
  const m = marketFor(d.room.seed, d.room.total_days);
  const fx = m.macro[day].fx;
  const open = d.orders.filter((o) => o.day === day && o.status === 'open').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const out: { id: string; status: OrderRow['status']; trade?: Trade }[] = [];
  const extra: Trade[] = [];
  for (const o of open) {
    const path = (m.usd[o.symbol] ?? m.bars[o.symbol])[day].path.slice(1);
    const hit = o.side === 'buy' ? path.some((p) => p <= o.limit_price) : path.some((p) => p >= o.limit_price);
    if (!hit) {
      out.push({ id: o.id!, status: 'expired' });
      continue;
    }
    const price = STOCK_MAP[o.symbol].currency === 'USD' ? Math.round(o.limit_price * fx) : o.limit_price;
    const pf = computePortfolio([...d.trades.filter((t) => t.player_id === o.player_id), ...extra.filter((t) => t.player_id === o.player_id)], spendsOf(d, o.player_id), Infinity, paidDividends(d));
    const ok = o.side === 'buy' ? buyCost(o.qty, price, o.fee) <= pf.cash : (pf.holdings[o.symbol]?.qty ?? 0) >= o.qty;
    if (!ok) {
      out.push({ id: o.id!, status: 'cancelled' });
      continue;
    }
    const trade: Trade = { player_id: o.player_id, day, symbol: o.symbol, side: o.side, qty: o.qty, price, fee: o.fee, created_at: new Date(Date.UTC(2100, 0, 1, 0, 0, extra.length)).toISOString() };
    extra.push(trade);
    out.push({ id: o.id!, status: 'filled', trade });
  }
  return out;
}
