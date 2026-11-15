/** 연습 모드: 서버 대신 브라우저에서 같은 엔진을 돌린다 (혼자 하는 거라 조작해도 손해 볼 사람이 없음) */
import { buildView, CURRENT_RULES_VERSION, dayClock, nextRoomState, resolveOrders, validateBuyItem, validateCancelOrder, validateEndTurn, validatePlaceOrder, validateTrade, validateUseItem, GameError, type GameData, type View } from './engine.js';

const KEY = 'stockduel.solo2';
/** 혼자 연습 하루 길이 선택지(초) */
export const SOLO_DAY_OPTIONS = [60, 180, 300] as const;
export const DEFAULT_SOLO_DAY = 180;

export interface SoloSave {
  data: GameData;
  nickname: string;
}

/** 새 하루의 마감 시각 (장 시작 3초 뒤부터 칸이 흐름) */
const freshDeadline = (daySec: number, now: number) => now + (daySec + 3) * 1000;

export function loadSolo(): SoloSave | null {
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? (JSON.parse(s) as SoloSave) : null;
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

export function newSolo(nickname: string, totalDays: number, daySec: number = DEFAULT_SOLO_DAY): SoloSave {
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
  saveSolo(s);
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
  saveSolo(out);
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
      d.players[0].ended_day = day;
      advance(d, now);
      break;
    }
    default:
      throw new GameError('알 수 없는 요청이에요.');
  }
  const out = { ...s, data: d };
  saveSolo(out);
  return out;
}
