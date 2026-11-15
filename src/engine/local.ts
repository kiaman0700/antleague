/** 연습 모드: 서버 대신 브라우저에서 같은 엔진을 돌린다 (혼자 하는 거라 조작해도 손해 볼 사람이 없음) */
import { buildView, nextRoomState, resolveOrders, validateBuyItem, validateCancelOrder, validateEndTurn, validatePlaceOrder, validateTrade, validateUseItem, GameError, type GameData, type View } from './engine.js';

const KEY = 'stockduel.solo2';

export interface SoloSave {
  data: GameData;
  nickname: string;
}

export function loadSolo(): SoloSave | null {
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? (JSON.parse(s) as SoloSave) : null;
    if (v && !v.data.orders) v.data.orders = [];
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

export function newSolo(nickname: string, totalDays: number): SoloSave {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const s: SoloSave = {
    nickname,
    data: {
      room: { id: 'solo', code: 'SOLO00', seed, status: 'playing', total_days: totalDays, turn_seconds: 0, day: 0, deadline: null, host_id: 'me' },
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

export function soloView(s: SoloSave): View {
  return buildView(s.data, 'me', Date.now());
}

export function soloAct(s: SoloSave, action: string, payload: Record<string, unknown>): SoloSave {
  const d: GameData = structuredClone(s.data);
  const now = Date.now();
  const created_at = new Date().toISOString();
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
    case 'endTurn': {
      const { day } = validateEndTurn(d, 'me', now);
      d.players[0].ended_day = day;
      const next = nextRoomState(d, now);
      if (next) {
        for (const r of resolveOrders(d, d.room.day)) {
          d.orders = d.orders.map((o) => (o.id === r.id ? { ...o, status: r.status, fill_price: r.trade?.price ?? null } : o));
          if (r.trade) d.trades.push({ ...r.trade, id: uid(), created_at: new Date().toISOString() });
        }
        d.room = { ...d.room, ...next };
      }
      break;
    }
    default:
      throw new GameError('알 수 없는 요청이에요.');
  }
  const out = { ...s, data: d };
  saveSolo(out);
  return out;
}
