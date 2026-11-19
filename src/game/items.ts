import { mulberry32 } from '../lib/rng.js';

export type ItemKind = 'paper' | 'detector' | 'spy' | 'analyst' | 'scout' | 'freeze' | 'fake' | 'fee' | 'blackout' | 'shield' | 'mirror' | 'bonus';
export type ItemType = 'info' | 'attack' | 'defense' | 'bonus';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  emoji: string;
  type: ItemType;
  cost: number;
  desc: string;
  /** 둘 이상일 때만 의미가 있는 카드 */
  multiOnly?: boolean;
  /** 상점에서 팔지 않음 (무료 카드로만) */
  shopless?: boolean;
  /** 갖고 있으면 자동 발동 */
  passive?: boolean;
}

/**
 * 밸런스 기준 (값은 예전 1,000만원 시작 기준 — v6 부터는 itemCost 로 1/10, v8·v9 는 PRICE_V8·V9)
 * - 정보 카드: 기대 이익보다 조금 싸게. 확실한 정보일수록 비싸게
 * - 방해 카드: 상대가 잃는 기대 손해 ≈ 가격. 너무 싸면 서로 괴롭히기만 하는 게임이 됨
 * - 방어 카드: 막는 공격 평균 가격보다 싸게, 반사는 공격 효과까지 주니 더 비싸게
 */
export const ITEMS: ItemDef[] = [
  { kind: 'paper', name: '내일 신문', emoji: '📰', type: 'info', cost: 600_000, desc: '내일 아침에 나올 뉴스 헤드라인을 오늘 미리 봐요. (확실한 정보예요)' },
  { kind: 'analyst', name: '애널리스트 콜', emoji: '📈', type: 'info', cost: 300_000, desc: '오늘 장에서 가장 많이 오를 업종을 알려줘요.' },
  { kind: 'scout', name: '차트 분석', emoji: '📊', type: 'info', cost: 200_000, desc: '지금 보고 있는 종목이 오늘 오를지 내릴지 알려줘요. (정확도 약 70%)' },
  { kind: 'detector', name: '루머 감별기', emoji: '🔍', type: 'info', cost: 100_000, desc: '오늘 소식(뉴스·커뮤니티 글·소문 기사) 중 하나를 골라 진짜인지 가짜인지 알려줘요. 표시 없는 가짜 기사와 상대가 보낸 가짜 뉴스도 잡아내요. 비싸니 중요한 순간에 쓰세요.' },
  { kind: 'spy', name: '염탐', emoji: '👀', type: 'info', cost: 150_000, desc: '고른 상대가 지금 어떤 종목을 얼마나 갖고 있는지 몰래 봐요.', multiOnly: true },
  { kind: 'freeze', name: '거래 정지', emoji: '🧊', type: 'attack', cost: 200_000, desc: '고른 상대가 내일 하루 동안 사고팔 수 없어요.', multiOnly: true },
  { kind: 'blackout', name: '정보 차단', emoji: '📵', type: 'attack', cost: 150_000, desc: '고른 상대는 내일 하루 동안 그날 나오는 뉴스·커뮤니티 글을 볼 수 없어요.', multiOnly: true },
  { kind: 'fake', name: '가짜 뉴스', emoji: '📢', type: 'attack', cost: 100_000, desc: '내일 고른 상대 화면에만 내가 만든 가짜 속보가 떠요.', multiOnly: true },
  { kind: 'fee', name: '수수료 폭탄', emoji: '💸', type: 'attack', cost: 200_000, desc: '고른 상대의 거래 수수료가 사흘간 10배(1%)가 돼요.', multiOnly: true },
  { kind: 'shield', name: '방패', emoji: '🛡️', type: 'defense', cost: 200_000, desc: '갖고만 있으면 나를 노린 방해 카드를 1번 자동으로 막아요.', multiOnly: true, passive: true },
  { kind: 'mirror', name: '반사 거울', emoji: '🪞', type: 'defense', cost: 400_000, desc: '갖고만 있으면 나를 노린 방해 카드를 1번 쓴 사람에게 되돌려요.', multiOnly: true, passive: true },
  { kind: 'bonus', name: '용돈 봉투', emoji: '🎁', type: 'bonus', cost: 0, desc: '쓰면 확률에 따라 현금을 받거나 잃어요. 상점에서는 살 수 없고 무료 카드로만 나와요.', shopless: true },
];
export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.kind, i])) as Record<ItemKind, ItemDef>;

export const START_CARDS = 2;
export const GRANT_EVERY = 5;
export const HOLD_LIMIT = 3;
/** 한 사람이 가질 수 있는 카드 수: v10 부터 5장 (예전 방은 3장) */
export const holdLimit = (version = 1) => (version >= 10 ? 5 : HOLD_LIMIT);
export const USE_LIMIT = 2;
export const FEE_BOMB_RATE = 0.01;
export const FEE_BOMB_DAYS = 3;
export const BONUS_AMOUNT = 500_000;
/**
 * (v6) 용돈 봉투: 공개된 확률로 받거나 잃음. 평균 약 +5.2만원 (시작 돈 100만원의 약 5%)
 * 결과는 서버가 방 비밀값으로 뽑아 사용 기록(payload.amount)에 저장 → 화면은 미리 알 수 없음
 */
export const BONUS_TABLE: readonly { amount: number; p: number }[] = [
  { amount: 300_000, p: 0.05 },
  { amount: 150_000, p: 0.15 },
  { amount: 80_000, p: 0.3 },
  { amount: 30_000, p: 0.25 },
  { amount: -50_000, p: 0.15 },
  { amount: -100_000, p: 0.1 },
];
/** 0~1 난수 하나로 봉투 결과 */
export function drawBonus(u: number): number {
  let acc = 0;
  for (const b of BONUS_TABLE) {
    acc += b.p;
    if (u < acc) return b.amount;
  }
  return BONUS_TABLE[BONUS_TABLE.length - 1].amount;
}
/** 카드 설명 (규칙 버전에 따라 용돈 봉투 문구가 다름) */
export function itemDesc(kind: ItemKind, version = 6): string {
  if (kind === 'bonus')
    return version >= 13
      ? '쓰면 확률에 따라 현금을 받거나 잃어요. +30만 5% · +15만 15% · +8만 30% · +3만 25% · −5만 15% · −10만 10%. 현금이 10만원 이상 있어야 쓸 수 있어요. 무료 카드로만 나와요.'
      : version >= 6
      ? '쓰면 확률에 따라 현금을 받거나 잃어요. +30만 5% · +15만 15% · +8만 30% · +3만 25% · −5만 15% · −10만 10%. 무료 카드로만 나와요.'
      : '쓰면 현금 50만원이 들어와요. 상점에서는 살 수 없고 무료 카드로만 나와요.';
  return ITEM_MAP[kind].desc;
}
export const SCOUT_ACCURACY = 0.7;

export interface ItemRow {
  id?: string;
  player_id: string;
  day: number;
  kind: ItemKind;
  action: 'buy' | 'use';
  cost: number;
  /** target: 방해·염탐 카드의 대상 / symbol: 가짜 뉴스·차트 분석 종목 */
  payload?: { symbol?: string; tone?: 'good' | 'bad'; target?: string; amount?: number; /** (v14) 감별기로 고른 소식 (뉴스 제목 또는 찌라시 글) */ pick?: string } | null;
  created_at?: string;
}

export interface Effect {
  from: string;
  to: string;
  kind: ItemKind;
  /** 효과가 적용되는 날 */
  days: number[];
  blocked: boolean;
  /** 반사 거울에 튕겨서 쓴 사람이 맞음. by = 거울 주인 */
  reflected?: boolean;
  by?: string;
  /** (v3) 같은 날 같은 사람에게 이미 다른 방해가 있어서 효과 없음 — 한 사람에게 몰아치기 방지 */
  crowded?: boolean;
  usedDay: number;
  payload?: ItemRow['payload'];
}

export interface PlayerItems {
  inventory: Partial<Record<ItemKind, number>>;
  used: Partial<Record<ItemKind, number>>;
  /** 내가 쓴 정보 카드 (화면에 결과 표시) */
  infoUses: { kind: ItemKind; day: number; target?: string; symbol?: string; /** (v14) 감별기로 고른 소식 */ pick?: string }[];
  grants: { day: number; kind: ItemKind; skipped: boolean }[];
  total: number;
}

export interface ItemState {
  players: Record<string, PlayerItems>;
  effects: Effect[];
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export { hash as hashString };

export function grantDays(totalDays: number) {
  const out: number[] = [];
  for (let d = GRANT_EVERY; d < totalDays; d += GRANT_EVERY) out.push(d);
  return out;
}

/** 카드 구매(지출)와 용돈 봉투(수입)를 돈 흐름으로 */
export function spendsFromRows(rows: ItemRow[]): { day: number; cost: number }[] {
  return rows
    .filter((r) => r.action === 'buy' || (r.action === 'use' && r.kind === 'bonus'))
    .map((r) => ({ day: r.day, cost: r.action === 'buy' ? r.cost : -(typeof r.payload?.amount === 'number' ? r.payload.amount : BONUS_AMOUNT) }));
}

/** 아이템 상태는 DB에 저장된 구매/사용 기록으로부터 모든 기기가 똑같이 계산한다 */
export function deriveItems(seed: number, playerIds: string[], rows: ItemRow[], currentDay: number, totalDays: number, solo: boolean, version = 1): ItemState {
  // v3: 무료 카드는 모두에게 같은 날 같은 종류 (운으로 승부가 갈리지 않게), 몰아치기 방지
  const v3 = version >= 3;
  // v3: 반사 거울은 상점에서만 (무료로 흔하면 방해 카드가 오히려 손해만 봄)
  const pool = ITEMS.filter((i) => (!solo || !i.multiOnly) && !(v3 && i.kind === 'mirror')).map((i) => i.kind);
  const players: Record<string, PlayerItems> = {};
  for (const id of playerIds) players[id] = { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 };
  const effects: Effect[] = [];
  const add = (p: PlayerItems, k: ItemKind, n: number) => {
    p.inventory[k] = (p.inventory[k] ?? 0) + n;
    p.total += n;
  };
  const consume = (p: PlayerItems, k: ItemKind) => {
    add(p, k, -1);
    p.used[k] = (p.used[k] ?? 0) + 1;
  };
  const sorted = [...rows].sort((a, b) => a.day - b.day || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const gdays = new Set(grantDays(totalDays));

  for (let d = 0; d <= currentDay; d++) {
    for (const id of playerIds) {
      const p = players[id];
      const n = d === 0 ? START_CARDS : gdays.has(d) ? 1 : 0;
      const rng = mulberry32((seed ^ (v3 ? 0x5eed : hash(id))) + d * 7919);
      for (let i = 0; i < n; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        const skipped = p.total >= holdLimit(version);
        p.grants.push({ day: d, kind, skipped });
        if (!skipped) add(p, kind, 1);
      }
    }
    for (const r of sorted) {
      if (r.day !== d) continue;
      const p = players[r.player_id];
      if (!p || !ITEM_MAP[r.kind]) continue;
      if (r.action === 'buy') {
        add(p, r.kind, 1);
        continue;
      }
      if ((p.inventory[r.kind] ?? 0) <= 0) continue;
      consume(p, r.kind);
      const def = ITEM_MAP[r.kind];
      if (def.type === 'info') p.infoUses.push({ kind: r.kind, day: r.day, target: r.payload?.target, symbol: r.payload?.symbol, pick: r.payload?.pick });
      if (def.type === 'attack') {
        // 대상을 고르지 않았으면(2인) 다른 한 명
        const chosen = r.payload?.target;
        const target = chosen && chosen !== r.player_id && playerIds.includes(chosen) ? chosen : playerIds.find((x) => x !== r.player_id);
        if (!target) continue;
        const t = players[target];
        const days = r.kind === 'fee' ? Array.from({ length: FEE_BOMB_DAYS }, (_, k) => r.day + 1 + k) : [r.day + 1];
        // v3: 오늘 이미 다른 사람이 이 사람을 방해했으면 두 번째부터는 효과 없음 (방패도 쓰지 않음)
        if (v3 && effects.some((e) => e.usedDay === r.day && e.to === target && e.from !== r.player_id && !e.reflected)) {
          effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked: true, crowded: true, usedDay: r.day, payload: r.payload });
          continue;
        }
        if ((t.inventory.shield ?? 0) > 0) {
          consume(t, 'shield');
          effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked: true, usedDay: r.day, payload: r.payload });
        } else if ((t.inventory.mirror ?? 0) > 0) {
          consume(t, 'mirror');
          // 쓴 사람에게 그대로 돌아감 (돌아온 공격은 다시 막거나 튕기지 않음)
          effects.push({ from: r.player_id, to: r.player_id, kind: r.kind, days, blocked: false, reflected: true, by: target, usedDay: r.day, payload: r.payload });
        } else {
          effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked: false, usedDay: r.day, payload: r.payload });
        }
      }
    }
  }
  return { players, effects };
}

export function activeEffects(state: ItemState, playerId: string, day: number) {
  return state.effects.filter((e) => e.to === playerId && !e.blocked && e.days.includes(day));
}

/** 아이템을 살/쓸 수 있는지. 문제가 있으면 이유 문자열 */
/**
 * 카드 값: 1대1에서는 방해 카드가 1.5배 (상대가 한 명뿐이라 매일 같은 사람을 방해할 수 있어 너무 강했음 — 시뮬 69%)
 */
export const DUEL_ATTACK_MULT = 1.5;
/**
 * (v8) 카드 값 다시 매김 — 시뮬(뉴스봇끼리 3·11일차 사용)에서 카드가 값보다 이득이 작아 사는 쪽이 손해였음
 * → 정보 카드는 '잘 쓰면 이득', 방해 카드는 '상대 손해 ≈ 값'이 되게. 100만원 시작 기준 금액
 */
export const PRICE_V8: Partial<Record<ItemKind, number>> = {
  paper: 30_000,
  analyst: 30_000,
  scout: 10_000,
  detector: 10_000,
  spy: 10_000,
  freeze: 10_000,
  blackout: 10_000,
  fake: 10_000,
  fee: 15_000,
  shield: 15_000,
  mirror: 30_000,
};
/**
 * (v9) 시뮬로 다시 맞춤: v8 에서 내일 신문(3만)이 너무 싸서 정보 카드 쓰는 쪽이 4인 47%, 방해 카드가 싸서 몰아 쓰는 쪽이 51% →
 * 내일 신문 4.5만, 방해 카드 값 올림 → 4인 정보 42%·방해 33%·뉴스 30%·레버리지 26% (기대 25%)
 */
export const PRICE_V9: Partial<Record<ItemKind, number>> = { ...PRICE_V8, paper: 45_000, freeze: 20_000, blackout: 15_000, fake: 15_000, fee: 20_000 };
/**
 * (v14) 설계서 design/cards-v14.md: 루머 감별기는 고른 소식 1개만 · 10만원, 정보 카드는 하루 1장이 되면서
 * 시뮬에서 값보다 이득이 작던 내일 신문·애널리스트 콜 값을 내림
 */
export const PRICE_V14: Partial<Record<ItemKind, number>> = { ...PRICE_V9, detector: 100_000, paper: 35_000, analyst: 25_000 };
/**
 * (v16) 루머 감별기 10만 → 5만 (design/detector-price-check.md — 시뮬에서 10만은 사면 손해가 뚜렷).
 * 판정은 그대로 고른 소식(뉴스 또는 찌라시) 1개
 */
export const PRICE_V16: Partial<Record<ItemKind, number>> = { ...PRICE_V14, detector: 50_000 };
/** v14: 같은 날 정보 카드는 1장만 */
export const INFO_ONE_PER_DAY_VERSION = 14;
export function itemCost(kind: ItemKind, players: number, version = 1): number {
  const d = ITEM_MAP[kind];
  const table = version >= 16 ? PRICE_V16 : version >= 14 ? PRICE_V14 : version >= 9 ? PRICE_V9 : PRICE_V8;
  if (version >= 8 && table[kind] != null) {
    const base = table[kind]!;
    return d.type === 'attack' && players === 2 ? Math.round((base * DUEL_ATTACK_MULT) / 5_000) * 5_000 : base;
  }
  // v6: 시작 돈이 1/10 이라 카드 값도 1/10
  const k = version >= 6 ? 0.1 : 1;
  const unit = 10_000 * k;
  const base = Math.round((d.cost * k) / (unit / 2)) * (unit / 2);
  return d.type === 'attack' && players === 2 ? Math.round((base * DUEL_ATTACK_MULT) / unit) * unit : base;
}

export function canBuy(p: PlayerItems, kind: ItemKind, cash: number, cost = ITEM_MAP[kind].cost, limit = HOLD_LIMIT): string | null {
  const def = ITEM_MAP[kind];
  if (!def || def.shopless) return '상점에서 살 수 없는 카드예요';
  if (p.total >= limit) return `카드는 최대 ${limit}장까지 가질 수 있어요`;
  if ((p.used[kind] ?? 0) + (p.inventory[kind] ?? 0) >= USE_LIMIT) return `이 카드는 한 판에 ${USE_LIMIT}번까지만 쓸 수 있어요`;
  if (cash < cost) return '현금이 모자라요';
  return null;
}

export function canUse(p: PlayerItems, kind: ItemKind, day: number, totalDays: number, alreadyUsedToday: boolean): string | null {
  const def = ITEM_MAP[kind];
  if (!def) return '없는 카드예요';
  if ((p.inventory[kind] ?? 0) <= 0) return '이 카드가 없어요';
  if (def.passive) return '갖고 있으면 자동으로 발동돼요';
  if (kind !== 'bonus' && (p.used[kind] ?? 0) >= USE_LIMIT) return `한 판에 ${USE_LIMIT}번까지만 쓸 수 있어요`;
  if (alreadyUsedToday && kind !== 'bonus') return '같은 카드는 하루에 한 번만 쓸 수 있어요';
  if ((def.type === 'attack' || kind === 'paper') && day >= totalDays - 1) return '마지막 날에는 쓸 수 없어요';
  return null;
}

/** (v14) 정보 카드는 하루 1장 — 오늘 이미 다른 정보 카드를 썼으면 그 이유 (화면에서 미리 흐리게, 서버도 같은 규칙) */
export function infoLimitReason(version: number, kind: ItemKind, usedToday: Iterable<ItemKind>): string | null {
  if (version < INFO_ONE_PER_DAY_VERSION || ITEM_MAP[kind]?.type !== 'info') return null;
  for (const u of usedToday) if (ITEM_MAP[u]?.type === 'info') return '정보 카드는 하루에 1장만 쓸 수 있어요';
  return null;
}
