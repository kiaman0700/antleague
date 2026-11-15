/** 연습 모드: 서버 대신 브라우저에서 같은 엔진을 돌린다 (혼자 하는 거라 조작해도 손해 볼 사람이 없음) */
import { buildView, CURRENT_RULES_VERSION, dayClock, marketFor, nextRoomState, resolveOrders, validateBuyItem, validateCancelOrder, validateEndTurn, validatePlaceOrder, validateTrade, validateUseItem, GameError, type GameData, type View } from './engine.js';
import { STOCK_MAP } from '../game/stocks.js';

const KEY = 'stockduel.solo2';
/** 혼자 연습 하루 길이 선택지(초) */
export const SOLO_DAY_OPTIONS = [60, 180, 300] as const;
export const DEFAULT_SOLO_DAY = 180;

export interface SoloSave {
  data: GameData;
  nickname: string;
  /** 화면 편집용 가상 게임 — 저장하지 않음, 시간이 흐르지 않음 */
  demo?: boolean;
  /** 멈춘 장면의 시각 */
  frozenAt?: number;
  /** 튜토리얼 게임 (봇과 함께, 시간이 흐르지 않음, 저장하지 않음) */
  tutorial?: { symbol: string; headline: string };
}

/** 튜토리얼 봇 */
export const TUTORIAL_BOT = { id: 'bot', nickname: '연습봇' };

/**
 * 튜토리얼 시나리오: 첫날 아침에 '좋은 기업 뉴스'가 있는 시장을 골라 고정.
 * 시간은 흐르지 않고(장 마감은 직접), 봇이 함께 함
 */
export function makeTutorial(nickname: string): SoloSave {
  let seed = 7000;
  let pick: { symbol: string; headline: string } | null = null;
  for (; seed < 9000 && !pick; seed++) {
    const m = marketFor(seed, 6, CURRENT_RULES_VERSION);
    const n = m.news.find((x) => x.day === 0 && x.kind === 'company' && x.tone === 'good' && !x.rumor && !x.fake && x.at == null && x.symbol && !STOCK_MAP[x.symbol].etf);
    if (n && m.bars[n.symbol!][0].close > m.bars[n.symbol!][0].open) pick = { symbol: n.symbol!, headline: n.headline };
  }
  seed--;
  const now = new Date().toISOString();
  const data: GameData = {
    room: { id: 'tutorial', code: 'TUTOR0', seed, status: 'playing', total_days: 6, turn_seconds: 180, day: 0, deadline: null, day_deadline: null, host_id: 'me', version: CURRENT_RULES_VERSION },
    players: [
      { id: 'me', room_id: 'tutorial', nickname: nickname || '나', mode: 'easy', ready: true, ended_day: -1, created_at: '1', version: 0 },
      { id: TUTORIAL_BOT.id, room_id: 'tutorial', nickname: TUTORIAL_BOT.nickname, mode: 'easy', ready: true, ended_day: -1, created_at: '2', version: 0 },
    ],
    trades: [],
    // 나: 루머 감별기·방패를 들고 시작 (카드 연습용)
    items: [
      { id: 'tut-i1', player_id: 'me', day: 0, kind: 'detector', action: 'buy', cost: 0, created_at: now },
      { id: 'tut-i2', player_id: 'me', day: 0, kind: 'shield', action: 'buy', cost: 0, created_at: now },
    ],
    orders: [],
  };
  const m = marketFor(seed, 6, CURRENT_RULES_VERSION);
  // 봇: 첫날 지수 ETF 를 조금 삼
  data.trades.push({ id: 'tut-b1', player_id: TUTORIAL_BOT.id, day: 0, symbol: 'KIDX', side: 'buy', qty: 200, price: m.bars.KIDX[0].open, fee: 0.0015, created_at: now });
  return { nickname: nickname || '나', data, tutorial: pick ?? { symbol: 'CORE', headline: '' } };
}

/** 봇의 정해진 행동: 둘째 날 아침에 나에게 수수료 폭탄 (내 방패가 막는 걸 보여 줌) */
function botActs(d: GameData) {
  if (d.room.day === 1) {
    const at = new Date().toISOString();
    d.items.push({ id: 'tut-b2', player_id: TUTORIAL_BOT.id, day: 1, kind: 'fee', action: 'buy', cost: 0, created_at: at });
    d.items.push({ id: 'tut-b3', player_id: TUTORIAL_BOT.id, day: 1, kind: 'fee', action: 'use', cost: 0, payload: { target: 'me' }, created_at: at });
  }
}



/** 새 하루의 마감 시각 (장 시작 3초 뒤부터 칸이 흐름) */
const freshDeadline = (daySec: number, now: number) => now + (daySec + 3) * 1000;

/** 연습 저장이 쓸 수 있는 모양인지 */
export function validSave(v: unknown): v is SoloSave {
  const d = (v as SoloSave | null)?.data;
  const r = d?.room;
  return (
    !!r &&
    typeof r.seed === 'number' &&
    Number.isFinite(r.seed) &&
    Number.isInteger(r.day) &&
    Number.isInteger(r.total_days) &&
    r.total_days > 0 &&
    r.day >= 0 &&
    r.day <= r.total_days &&
    Array.isArray(d.players) &&
    d.players.length > 0 &&
    Array.isArray(d.trades) &&
    Array.isArray(d.items)
  );
}

export function loadSolo(): SoloSave | null {
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? (JSON.parse(s) as SoloSave) : null;
    // 모양이 깨진 저장은 버림 (계속 오류 화면이 뜨지 않게)
    if (v && !validSave(v)) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (v && !v.data.orders) v.data.orders = [];
    // 예전 연습 저장(시간 제한 없음)은 하루 3분 실시간으로 이어서
    if (v && v.data.room.status === 'playing' && (v.data.room.turn_seconds <= 0 || v.data.room.deadline == null)) {
      const dl = freshDeadline(v.data.room.turn_seconds > 0 ? v.data.room.turn_seconds : DEFAULT_SOLO_DAY, Date.now());
      v.data.room = { ...v.data.room, turn_seconds: v.data.room.turn_seconds > 0 ? v.data.room.turn_seconds : DEFAULT_SOLO_DAY, deadline: dl, day_deadline: dl };
    }
    return v;
  } catch {
    return null;
  }
}
export function saveSolo(s: SoloSave | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장 못 해도 진행 */
  }
}

/** 화면 편집용 가상 게임: 몇 날이 지난 상태로 만들고 저장하지 않음 (하던 연습 게임을 덮어쓰지 않게) */
export function makeDemo(nickname: string): SoloSave {
  const s = newSolo(nickname || '나', 20, 300, false);
  const d = s.data;
  // 멈춘 한 장면: 5일차 장 한가운데 (장중 차트가 절반쯤 그려진 상태)
  const frozenAt = Date.now();
  const dl = frozenAt + 150_000;
  d.room = { ...d.room, day: 4, deadline: dl, day_deadline: dl };
  // 예약 주문도 하나 보이게
  const nanoOpen = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1).bars.NANO[4].open;
  d.orders.push({ id: 'demo-o1', player_id: 'me', day: 4, symbol: 'NANO', side: 'buy', qty: 10, limit_price: Math.round((nanoOpen * 0.95) / 50) * 50, fee: 0.0015, status: 'open', created_at: new Date(frozenAt - 60_000).toISOString() });
  d.trades.push({ player_id: 'me', day: 2, symbol: 'CORE', side: 'buy', qty: 20, price: 80_000, fee: 0.0015, id: 'demo1', created_at: new Date(Date.now() - 3600_000).toISOString() });
  d.trades.push({ player_id: 'me', day: 3, symbol: 'NXRA', side: 'buy', qty: 5, price: 250_000, fee: 0.0015, id: 'demo2', created_at: new Date(Date.now() - 1800_000).toISOString() });
  return { ...s, demo: true, frozenAt };
}

export function newSolo(nickname: string, totalDays: number, daySec: number = DEFAULT_SOLO_DAY, persist = true): SoloSave {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const sec = (SOLO_DAY_OPTIONS as readonly number[]).includes(daySec) ? daySec : DEFAULT_SOLO_DAY;
  const dl = freshDeadline(sec, Date.now());
  const s: SoloSave = {
    nickname,
    data: {
      room: { id: 'solo', code: 'SOLO00', seed, status: 'playing', total_days: totalDays, turn_seconds: sec, day: 0, deadline: dl, day_deadline: dl, host_id: 'me', version: CURRENT_RULES_VERSION },
      players: [{ id: 'me', room_id: 'solo', nickname, mode: 'easy', ready: true, ended_day: -1, created_at: new Date().toISOString(), version: 0 }],
      trades: [],
      items: [],
      orders: [],
    },
  };
  if (persist) saveSolo(s);
  return s;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

export function soloView(s: SoloSave, now = Date.now()): View {
  return buildView(s.data, 'me', now);
}

/** 예약 주문 결과 반영 */
function applyOrders(d: GameData, results: ReturnType<typeof resolveOrders>) {
  for (const r of results) {
    d.orders = d.orders.map((o) => (o.id === r.id ? { ...o, status: r.status, fill_price: r.trade?.price ?? null } : o));
    if (r.trade) d.trades.push({ ...r.trade, id: uid() });
  }
  return results.length > 0;
}

/**
 * 하루를 끝내고 다음 날로 (남은 예약은 끝까지 확인 후 만료).
 * 혼자 연습은 다음 날 장을 **멈춘 채로** 둔다 — 결산을 보거나 자리를 비운 동안 날이 저절로 넘어가지 않게.
 * 결산 화면에서 "다음 날 시작"(startDay)을 누르면 열린다
 */
function advance(d: GameData, now: number) {
  const next = nextRoomState(d, now);
  if (!next) return false;
  applyOrders(d, resolveOrders(d, d.room.day, dayClock(d.room, now).n, true));
  d.room = { ...d.room, ...next, deadline: null, day_deadline: null };
  return true;
}

/**
 * 시간이 흐른 만큼 반영: 지금 칸까지 닿은 예약 체결, 시간이 다 되면 다음 날로.
 * 바뀐 게 없으면 같은 객체를 돌려줌 (저장·다시 그리기 생략)
 */
export function soloSync(s: SoloSave, now = Date.now()): SoloSave {
  if (s.data.room.status !== 'playing') return s;
  const d: GameData = structuredClone(s.data);
  let changed = false;
  if (d.orders.some((o) => o.day === d.room.day && o.status === 'open')) changed = applyOrders(d, resolveOrders(d, d.room.day, dayClock(d.room, now).tick, false));
  if (d.room.deadline !== null && now >= d.room.deadline) changed = advance(d, now) || changed;
  if (!changed) return s;
  const out = { ...s, data: d };
  if (!s.demo && !s.tutorial) saveSolo(out);
  return out;
}

export function soloAct(s: SoloSave, action: string, payload: Record<string, unknown>): SoloSave {
  const d: GameData = structuredClone(s.data);
  const now = Date.now();
  const created_at = new Date(now).toISOString();
  switch (action) {
    case 'trade':
      d.trades.push({ ...validateTrade(d, 'me', now, payload), id: uid(), created_at });
      break;
    case 'buyItem':
      d.items.push({ ...validateBuyItem(d, 'me', now, payload), id: uid(), created_at });
      break;
    case 'useItem':
      d.items.push({ ...validateUseItem(d, 'me', now, payload), id: uid(), created_at });
      break;
    case 'placeOrder':
      d.orders.push({ ...validatePlaceOrder(d, 'me', now, payload), id: uid(), created_at });
      break;
    case 'cancelOrder': {
      const id = validateCancelOrder(d, 'me', now, payload);
      d.orders = d.orders.map((o) => (o.id === id ? { ...o, status: 'cancelled' } : o));
      break;
    }
    case 'startDay': {
      // 멈춰 있는 날만 시작 (이미 열린 날은 시간을 늘리지 않음)
      if (d.room.status === 'playing' && d.room.deadline === null) {
        const dl = freshDeadline(d.room.turn_seconds, now);
        d.room = { ...d.room, deadline: dl, day_deadline: dl };
      }
      break;
    }
    case 'endTurn': {
      // 혼자 연습: 장 마감을 누르면 남은 시간을 건너뛰고 바로 다음 날
      const { day } = validateEndTurn(d, 'me', now);
      // 튜토리얼: 봇도 같이 마감
      for (const p of d.players) if (p.id === 'me' || s.tutorial) p.ended_day = day;
      if (advance(d, now) && s.tutorial) botActs(d);
      break;
    }
    default:
      throw new GameError('알 수 없는 요청이에요.');
  }
  const out = { ...s, data: d };
  if (!s.demo && !s.tutorial) saveSolo(out);
  return out;
}
