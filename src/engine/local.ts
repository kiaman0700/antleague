/** 연습 모드: 서버 대신 브라우저에서 같은 엔진을 돌린다 (혼자 하는 거라 조작해도 손해 볼 사람이 없음) */
import { buildView, CURRENT_RULES_VERSION, dayClock, graceDeadline, marketFor, nextRoomState, resolveOrders, validateBuyItem, validateCancelOrder, validateEndTurn, validatePlaceOrder, validateTrade, validateUseItem, GameError, type GameData, type View } from './engine.js';
import { STOCK_MAP } from '../game/stocks.js';
import { botInfo, MAX_BOTS, runBots, type BotRun } from './bots.js';
import { DEFAULT_SOLO_DAY, SOLO_DAY_OPTIONS, dayDeadlines, loadSolo, saveSolo, validSave, type SoloSave } from './soloStore.js';
export { DEFAULT_SOLO_DAY, SOLO_DAY_OPTIONS, loadSolo, saveSolo, validSave, type SoloSave };



/** 튜토리얼 봇 */
export const TUTORIAL_BOT = { id: 'bot', nickname: '연습봇' };

/**
 * 튜토리얼 시나리오: 첫날 아침에 '좋은 기업 뉴스'가 있는 시장을 골라 고정.
 * 시간은 흐르지 않고(장 마감은 직접), 봇이 함께 함
 */
/**
 * 튜토리얼도 늘 최신 규칙 (사용자 요청 2026-11-18 — 규칙이 바뀌면 튜토리얼도 같이).
 * 장면(첫날 오르는 좋은 기업 뉴스)을 찾으려고 비밀값은 공개된 고정값 — 튜토리얼 시장은 숨길 게 없음
 */
export const TUTORIAL_VERSION = CURRENT_RULES_VERSION;
/** v4+ 시장은 비밀값으로만 만들어져서, 장면을 찾을 때 비밀값을 바꿔 가며 찾음 (공개 값) */
const tutorialSalt = (n: number) => `tutorial-${n}`;

export function makeTutorial(nickname: string): SoloSave {
  let seed = 7000;
  let pick: { symbol: string; headline: string } | null = null;
  for (; seed < 9000 && !pick; seed++) {
    const m = marketFor(seed, 6, TUTORIAL_VERSION, tutorialSalt(seed));
    const n = m.news.find((x) => x.day === 0 && x.kind === 'company' && x.tone === 'good' && !x.rumor && !x.fake && x.at == null && x.symbol && !STOCK_MAP[x.symbol].etf);
    // 최신 규칙은 아침 뉴스가 시가에 먼저 반영돼서(장중엔 되돌림도 있음) '전날보다 2% 넘게 오른 종목'으로 고름
    if (n && m.bars[n.symbol!][0].close > m.base[n.symbol!] * 1.02 && m.bars[n.symbol!][0].close >= m.bars[n.symbol!][0].open) pick = { symbol: n.symbol!, headline: n.headline };
  }
  seed--;
  const now = new Date().toISOString();
  const data: GameData = {
    room: { id: 'tutorial', code: 'TUTOR0', seed, status: 'playing', total_days: 6, turn_seconds: 180, day: 0, deadline: null, day_deadline: null, host_id: 'me', version: TUTORIAL_VERSION, salt: tutorialSalt(seed) },
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
  const m = marketFor(seed, 6, TUTORIAL_VERSION, tutorialSalt(seed));
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






/** 화면 편집용 가상 게임: 몇 날이 지난 상태로 만들고 저장하지 않음 (하던 연습 게임을 덮어쓰지 않게) */
export function makeDemo(nickname: string): SoloSave {
  const s = newSolo(nickname || '나', 20, 300, false);
  const d = s.data;
  // 멈춘 한 장면: 5일차 장 한가운데 (장중 차트가 절반쯤 그려진 상태)
  const frozenAt = Date.now();
  const dl = frozenAt + 150_000;
  d.room = { ...d.room, day: 4, deadline: dl, day_deadline: dl };
  // 예약 주문도 하나 보이게
  const nanoOpen = marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt).bars.NANO[4].open;
  d.orders.push({ id: 'demo-o1', player_id: 'me', day: 4, symbol: 'NANO', side: 'buy', qty: 5, limit_price: Math.round((nanoOpen * 0.95) / 50) * 50, fee: 0.0015, status: 'open', created_at: new Date(frozenAt - 60_000).toISOString() });
  d.trades.push({ player_id: 'me', day: 2, symbol: 'CORE', side: 'buy', qty: 4, price: 80_000, fee: 0.0015, id: 'demo1', created_at: new Date(Date.now() - 3600_000).toISOString() });
  d.trades.push({ player_id: 'me', day: 3, symbol: 'NXRA', side: 'buy', qty: 1, price: 250_000, fee: 0.0015, id: 'demo2', created_at: new Date(Date.now() - 1800_000).toISOString() });
  // 찬스 카드 5장을 꽉 채워 둠 (손패 부채꼴·카드 모양을 미리 볼 수 있게) — 저장 안 되는 견본 게임이라 값은 0
  const kinds = ['paper', 'analyst', 'scout', 'detector', 'bonus'] as const;
  // 무료로 받은 카드는 기록이 아니라 규칙으로 계산되므로, 지금 손에 든 카드를 화면 데이터로 확인
  const inv = buildView(d, 'me', frozenAt).myItems;
  const have = new Set(Object.entries(inv.inventory).filter(([, n]) => (n ?? 0) > 0).map(([k]) => k));
  let total = inv.total;
  for (const k of kinds) {
    if (have.has(k) || total >= 5) continue;
    d.items.push({ id: 'demo-c-' + k, player_id: 'me', day: 0, kind: k, action: 'buy', cost: 0, payload: null, created_at: new Date(frozenAt - 7200_000).toISOString() });
    total++;
  }
  return { ...s, demo: true, frozenAt };
}

/** 연습 게임 시장 비밀값 (128비트) */
function randomSalt(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 봇전: 봇 이름 (같은 난이도가 여럿이면 번호) */
function botNames(levels: number[]) {
  const seen: Record<number, number> = {};
  const total: Record<number, number> = {};
  for (const l of levels) total[l] = (total[l] ?? 0) + 1;
  return levels.map((l) => {
    seen[l] = (seen[l] ?? 0) + 1;
    const name = botInfo(l)?.name ?? '봇';
    return total[l] > 1 ? `${name} ${seen[l]}` : name;
  });
}

/** 봇이 한 일을 저장 데이터에 반영 */
function applyBots(d: GameData, run: BotRun) {
  if (!Object.keys(run.steps).length && !run.ends.length) return false;
  for (const t of run.trades) d.trades.push({ ...t, id: uid() });
  for (const it of run.items) d.items.push({ ...it, id: uid() });
  d.players = d.players.map((p) => (run.steps[p.id] !== undefined ? { ...p, bot_step: run.steps[p.id], ...(run.ends.includes(p.id) ? { ended_day: d.room.day } : {}) } : p));
  return true;
}

export function newSolo(nickname: string, totalDays: number, daySec: number = DEFAULT_SOLO_DAY, persist = true, botLevels: number[] = []): SoloSave {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const unlimited = daySec === 0;
  const sec = unlimited ? DEFAULT_SOLO_DAY : (SOLO_DAY_OPTIONS as readonly number[]).includes(daySec) ? daySec : DEFAULT_SOLO_DAY;
  const bots = botLevels.filter((l) => l >= 1 && l <= 3).slice(0, MAX_BOTS);
  const s: SoloSave = {
    ...(unlimited ? { unlimited: true } : {}),
    nickname,
    data: {
      room: { id: 'solo', code: 'SOLO00', seed, salt: randomSalt(), status: 'playing', total_days: totalDays, turn_seconds: sec, day: 0, deadline: null, day_deadline: null, host_id: 'me', version: CURRENT_RULES_VERSION },
      players: [
        { id: 'me', room_id: 'solo', nickname, mode: 'easy', ready: true, ended_day: -1, created_at: new Date().toISOString(), version: 0 },
        // 봇전: 봇 1~5명 (난이도 1·2·3)
        ...botNames(bots).map((name, i) => ({ id: 'bot' + (i + 1), room_id: 'solo', nickname: name, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i + 2), version: 0, bot_level: bots[i] })),
      ],
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
  // 봇전: 봇이 움직일 칸이 됐으면 움직임 (시간이 다 됐으면 남은 칸까지 하고 넘어감)
  if (d.room.deadline !== null && !s.tutorial) changed = applyBots(d, runBots(d, now, { salt: d.room.salt ?? undefined })) || changed;
  // 시간이 다 됐거나 모두(나 + 봇) 장 마감했으면 다음 날
  if (d.room.deadline !== null && nextRoomState(d, now)) changed = advance(d, now) || changed;
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
      if (d.room.deadline === null && !s.tutorial && !s.demo) throw new GameError('장 시작을 누른 뒤에 지금 가격으로 사고팔 수 있어요. 장 전에는 예약 주문만 할 수 있어요.', 409);
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
        d.room = { ...d.room, ...dayDeadlines(d.room.turn_seconds, now, s.unlimited) };
      }
      break;
    }
    case 'endTurn': {
      // 혼자 연습: 장 마감을 누르면 남은 시간을 건너뛰고 바로 다음 날
      const { day } = validateEndTurn(d, 'me', now);
      // 튜토리얼: 봇도 같이 마감
      for (const p of d.players) if (p.id === 'me' || s.tutorial) p.ended_day = day;
      if (s.tutorial) {
        if (advance(d, now)) botActs(d);
        break;
      }
      // 혼자 연습: 바로 다음 날. 봇전: 봇이 아직 마감 안 했으면 카운트다운 (봇도 서둘러 정리하고 마감)
      if (!advance(d, now)) {
        const grace = graceDeadline(d, now);
        if (grace !== null) d.room = { ...d.room, deadline: grace };
        applyBots(d, runBots(d, now, { salt: d.room.salt ?? undefined }));
        if (nextRoomState(d, now)) advance(d, now);
      }
      break;
    }
    default:
      throw new GameError('알 수 없는 요청이에요.');
  }
  const out = { ...s, data: d };
  if (!s.demo && !s.tutorial) saveSolo(out);
  return out;
}
