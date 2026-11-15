import { mulberry32 } from '../lib/rng';

export type ItemKind = 'paper' | 'detector' | 'spy' | 'analyst' | 'freeze' | 'fake' | 'fee' | 'shield';
export type ItemType = 'info' | 'attack' | 'defense';

export interface ItemDef {
  kind: ItemKind;
  name: string;
  emoji: string;
  type: ItemType;
  cost: number;
  desc: string;
  multiOnly?: boolean;
}

export const ITEMS: ItemDef[] = [
  { kind: 'paper', name: '내일 신문', emoji: '📰', type: 'info', cost: 900_000, desc: '내일 아침에 나올 뉴스 헤드라인을 오늘 미리 봐요.' },
  { kind: 'analyst', name: '애널리스트 콜', emoji: '📈', type: 'info', cost: 600_000, desc: '오늘 장에서 가장 많이 오를 업종을 알려줘요.' },
  { kind: 'detector', name: '루머 감별기', emoji: '🔍', type: 'info', cost: 300_000, desc: '오늘 나온 [루머] 뉴스가 진짜인지 가짜인지 알려줘요.' },
  { kind: 'spy', name: '염탐', emoji: '👀', type: 'info', cost: 300_000, desc: '상대가 지금 어떤 종목을 얼마나 갖고 있는지 몰래 봐요.', multiOnly: true },
  { kind: 'freeze', name: '거래 정지', emoji: '🧊', type: 'attack', cost: 1_000_000, desc: '상대가 내일 하루 동안 사고팔 수 없어요.', multiOnly: true },
  { kind: 'fake', name: '가짜 뉴스', emoji: '📢', type: 'attack', cost: 400_000, desc: '내일 상대 화면에만 내가 만든 가짜 속보가 떠요.', multiOnly: true },
  { kind: 'fee', name: '수수료 폭탄', emoji: '💸', type: 'attack', cost: 500_000, desc: '상대의 거래 수수료가 이틀간 10배(1%)가 돼요.', multiOnly: true },
  { kind: 'shield', name: '방패', emoji: '🛡️', type: 'defense', cost: 500_000, desc: '갖고만 있으면 상대의 방해 아이템을 1번 자동으로 막아요.', multiOnly: true },
];
export const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.kind, i])) as Record<ItemKind, ItemDef>;

export const START_CARDS = 2;
export const GRANT_EVERY = 5;
export const HOLD_LIMIT = 3;
export const USE_LIMIT = 2;
export const FEE_BOMB_RATE = 0.01;

export interface ItemRow {
  id?: string;
  player_id: string;
  day: number;
  kind: ItemKind;
  action: 'buy' | 'use';
  cost: number;
  payload?: { symbol?: string; tone?: 'good' | 'bad' } | null;
  created_at?: string;
}

export interface Effect {
  from: string;
  to: string;
  kind: ItemKind;
  /** 효과가 적용되는 날 */
  days: number[];
  blocked: boolean;
  usedDay: number;
  payload?: ItemRow['payload'];
}

export interface PlayerItems {
  inventory: Partial<Record<ItemKind, number>>;
  used: Partial<Record<ItemKind, number>>;
  /** 내가 쓴 정보 아이템 (화면에 결과 표시) */
  infoUses: { kind: ItemKind; day: number }[];
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

export function grantDays(totalDays: number) {
  const out: number[] = [];
  for (let d = GRANT_EVERY; d < totalDays; d += GRANT_EVERY) out.push(d);
  return out;
}

/** 아이템 상태는 DB에 저장된 구매/사용 기록으로부터 두 기기가 똑같이 계산한다 */
export function deriveItems(seed: number, playerIds: string[], rows: ItemRow[], currentDay: number, totalDays: number, solo: boolean): ItemState {
  const pool = ITEMS.filter((i) => !solo || !i.multiOnly).map((i) => i.kind);
  const players: Record<string, PlayerItems> = {};
  for (const id of playerIds) players[id] = { inventory: {}, used: {}, infoUses: [], grants: [], total: 0 };
  const effects: Effect[] = [];
  const add = (p: PlayerItems, k: ItemKind, n: number) => {
    p.inventory[k] = (p.inventory[k] ?? 0) + n;
    p.total += n;
  };
  const sorted = [...rows].sort((a, b) => a.day - b.day || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const gdays = new Set(grantDays(totalDays));

  for (let d = 0; d <= currentDay; d++) {
    for (const id of playerIds) {
      const p = players[id];
      const n = d === 0 ? START_CARDS : gdays.has(d) ? 1 : 0;
      const rng = mulberry32((seed ^ hash(id)) + d * 7919);
      for (let i = 0; i < n; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        const skipped = p.total >= HOLD_LIMIT;
        p.grants.push({ day: d, kind, skipped });
        if (!skipped) add(p, kind, 1);
      }
    }
    for (const r of sorted) {
      if (r.day !== d) continue;
      const p = players[r.player_id];
      if (!p) continue;
      if (r.action === 'buy') {
        add(p, r.kind, 1);
        continue;
      }
      if ((p.inventory[r.kind] ?? 0) <= 0) continue;
      add(p, r.kind, -1);
      p.used[r.kind] = (p.used[r.kind] ?? 0) + 1;
      const def = ITEM_MAP[r.kind];
      if (def.type === 'info') p.infoUses.push({ kind: r.kind, day: r.day });
      if (def.type === 'attack') {
        const target = playerIds.find((x) => x !== r.player_id);
        if (!target) continue;
        const t = players[target];
        let blocked = false;
        if ((t.inventory.shield ?? 0) > 0) {
          add(t, 'shield', -1);
          t.used.shield = (t.used.shield ?? 0) + 1;
          blocked = true;
        }
        const days = r.kind === 'fee' ? [r.day + 1, r.day + 2] : [r.day + 1];
        effects.push({ from: r.player_id, to: target, kind: r.kind, days, blocked, usedDay: r.day, payload: r.payload });
      }
    }
  }
  return { players, effects };
}

export function activeEffects(state: ItemState, playerId: string, day: number) {
  return state.effects.filter((e) => e.to === playerId && !e.blocked && e.days.includes(day));
}

/** 아이템을 살/쓸 수 있는지. 문제가 있으면 이유 문자열 */
export function canBuy(p: PlayerItems, kind: ItemKind, cash: number): string | null {
  if (p.total >= HOLD_LIMIT) return `카드는 최대 ${HOLD_LIMIT}장까지 가질 수 있어요`;
  if ((p.used[kind] ?? 0) + (p.inventory[kind] ?? 0) >= USE_LIMIT) return `이 카드는 한 판에 ${USE_LIMIT}번까지만 쓸 수 있어요`;
  if (cash < ITEM_MAP[kind].cost) return '현금이 부족해요';
  return null;
}

export function canUse(p: PlayerItems, kind: ItemKind, day: number, totalDays: number, alreadyUsedToday: boolean): string | null {
  if ((p.inventory[kind] ?? 0) <= 0) return '이 카드가 없어요';
  if ((p.used[kind] ?? 0) >= USE_LIMIT) return `한 판에 ${USE_LIMIT}번까지만 쓸 수 있어요`;
  if (kind === 'shield') return '방패는 갖고 있으면 자동으로 발동돼요';
  if (alreadyUsedToday) return '같은 카드는 하루에 한 번만 쓸 수 있어요';
  const def = ITEM_MAP[kind];
  if ((def.type === 'attack' || kind === 'paper') && day >= totalDays - 1) return '마지막 날에는 쓸 수 없어요';
  return null;
}
