/**
 * 증강 상태 (규칙 v27). 고른 줄(AugRow)만 저장하고 보기·자동 선택·등급은 여기서 늘 같은 값으로 다시 계산한다.
 * 보기는 서버 비밀값(salt)으로만 뽑으므로 화면에는 내 보기·내 증강만 보낸다.
 */
import { AUG_MAP, augmentDays, augmentOffer, shiftTier, tierPattern, type AugTier, type SectorCond } from '../game/augments.js';
import { STOCK_MAP } from '../game/stocks.js';
import { seeded } from '../lib/rng.js';
import type { GameData } from './engine.js';

export const AUG_VERSION = 27;
/** 칸마다 다시 뽑기 1번 (개미 학교 교장이 있으면 다음 고르기부터 2번 더) */
export const REROLL_PER_SLOT = 1;
/** 튜토리얼 첫 보기: 소식 진위 1번(추천) · 다음 날 현금 · 수수료 없음 */
export const TUTORIAL_OFFER = ['verdict1', 'cash1', 'nofee'];

export interface AugRow {
  id?: string;
  player_id: string;
  /** 몇 번째 고르기 (0부터) */
  n: number;
  day: number;
  action: 'pick' | 'reroll' | 'use';
  /** 고른 증강 / 다시 뽑기 전에 그 칸에 있던 증강 / 쓴 증강 */
  aug: string;
  slot?: number | null;
  payload?: { symbol?: string; pick?: string; sector?: string; trade?: string; acc?: string } | null;
  created_at?: string;
}

export interface AugSlot {
  n: number;
  day: number;
  tier: AugTier;
  offer: string[];
  rerolls: number[];
  /** 남은 다시 뽑기 (칸마다) */
  canReroll: boolean[];
  picked: string | null;
  /** 시간 안에 안 골라 서버가 정함 */
  auto: boolean;
}

export interface AugState {
  days: number[];
  tiers: AugTier[];
  players: Record<string, AugSlot[]>;
}

export const augOn = (version?: number) => (version ?? 1) >= AUG_VERSION;

/** 종목 → 업종 조건 (증강이 뜨는 조건·업종 효과) */
export function sectorCondOf(symbol: string): SectorCond | null {
  const s = STOCK_MAP[symbol];
  if (!s) return null;
  if (s.sector === 'etf') return 'etf';
  if (s.currency === 'USD') return 'us';
  if (s.sector === 'semi') return 'semi';
  if (s.sector === 'battery') return 'battery';
  if (s.sector === 'bio') return 'bio';
  if (s.sector === 'crypto') return 'crypto';
  return null;
}

/** 그날이 시작될 때(전날까지 거래로) 들고 있던 업종 — 고르는 날 안에서는 바뀌지 않게 */
export function heldSectorsBefore(d: GameData, pid: string, day: number): SectorCond[] {
  const q: Record<string, number> = {};
  for (const t of d.trades) if (t.player_id === pid && t.day < day) q[t.symbol] = (q[t.symbol] ?? 0) + (t.side === 'buy' ? t.qty : -t.qty);
  const out = new Set<SectorCond>();
  for (const [sym, n] of Object.entries(q)) {
    const c = n > 0 ? sectorCondOf(sym) : null;
    if (c) out.add(c);
  }
  return [...out];
}

const saltOf = (d: GameData) => d.room.salt ?? d.room.id;

const seatsOf = (d: GameData) => [...d.players].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map((p) => p.id);

/**
 * '판에 한 명만' 증강은 고르기 차례마다 한 자리에만 뜰 수 있음 — 미리 정해 두면 누가 먼저 골랐는지(상대 증강)가 보기로 새지 않음
 */
function uniqueSeat(salt: string, aug: string, n: number, seats: string[]): string {
  let best = seats[0];
  let bestV = Infinity;
  for (const s of seats) {
    const v = seeded(`${salt}:augu:${aug}:${n}:${s}`)();
    if (v < bestV) {
      bestV = v;
      best = s;
    }
  }
  return best;
}

const UNIQUE_IDS = Object.values(AUG_MAP).filter((a) => a.unique).map((a) => a.id);

export function deriveAugs(d: GameData): AugState {
  const r = d.room;
  const days = augmentDays(r.total_days);
  const salt = saltOf(d);
  const tiers = tierPattern(salt, days.length, r.version ?? 27);
  const seats = seatsOf(d);
  const multi = d.players.length >= 2;
  const finished = r.status === 'finished' || r.day >= r.total_days;
  const rows = d.augs ?? [];
  const players: Record<string, AugSlot[]> = {};
  for (const pid of seats) {
    const slots: AugSlot[] = [];
    const owned: string[] = [];
    for (let n = 0; n < days.length; n++) {
      const day = days[n];
      if (day > r.day || (r.status === 'waiting')) break;
      const prev = owned[n - 1];
      const tier = r.id === 'tutorial' && n === 0 ? 'silver' : shiftTier(tiers[n], prev === 'eye' ? 1 : prev === 'loan' ? -1 : 0);
      // 다른 자리 몫인 '한 명만' 증강은 처음부터 내 보기에 없음
      const takenUnique = UNIQUE_IDS.filter((u) => uniqueSeat(salt, u, n, seats) !== pid);
      const ctx = { salt, seat: pid, n, picks: days.length, tier, daysLeft: r.total_days - day, multi, owned: [...owned], takenUnique, heldSectors: heldSectorsBefore(d, pid, day) };
      // 들어온 순서대로: 고르기 전 다시 뽑기만, 칸마다·모두 합쳐 한도 안에서만. 고른 뒤의 다시 뽑기는 무시
      const mine = rows.filter((x) => x.player_id === pid && x.n === n).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      const extra = owned.includes('principal') ? 2 : 0;
      const seq: number[] = [];
      const rerolls = [0, 0, 0];
      // 튜토리얼 첫 고르기는 늘 같은 쉬운 실버 3개 (다시 뽑기 없음)
      const fixed = r.id === 'tutorial' && n === 0 ? TUTORIAL_OFFER : null;
      let offer = fixed ?? augmentOffer(ctx, seq);
      /** 동시에 온 고르기와 다시 뽑기: 고르기를 보낸 순간 보기에 있던 것이면 인정 */
      const seenOffers = new Set(offer);
      let picked: string | null = null;
      for (const x of mine) {
        if (x.action === 'pick') {
          if (seenOffers.has(x.aug)) {
            picked = x.aug;
            break;
          }
          continue;
        }
        if (fixed || x.action !== 'reroll' || x.slot == null || !(x.slot >= 0 && x.slot < offer.length)) continue;
        if (rerolls[x.slot] >= REROLL_PER_SLOT + extra || seq.length >= 3 * REROLL_PER_SLOT + extra) continue;
        rerolls[x.slot]++;
        seq.push(x.slot);
        offer = augmentOffer(ctx, seq);
        for (const id of offer) seenOffers.add(id);
      }
      const used = seq.length;
      let auto = false;
      if (!picked && (finished || r.day > day)) {
        picked = offer.length ? offer[Math.floor(seeded(`${salt}:augauto:${pid}:${n}`)() * offer.length)] : null;
        auto = true;
      }
      const canReroll = offer.map((_, i) => !fixed && !picked && rerolls[i] < REROLL_PER_SLOT + extra && used < 3 * REROLL_PER_SLOT + extra);
      slots.push({ n, day, tier, offer, rerolls, canReroll, picked, auto });
      if (picked) owned.push(picked);
      else break;
    }
    players[pid] = slots;
  }
  return { days, tiers, players };
}

/** 지금 가진 증강 (고른 순서) */
export function ownedAugs(s: AugState, pid: string): string[] {
  return (s.players[pid] ?? []).map((x) => x.picked).filter((x): x is string => !!x);
}

/** 오늘 고를 차례가 남아 있으면 그 칸 */
export function pendingSlot(s: AugState, pid: string, day: number): AugSlot | null {
  const last = (s.players[pid] ?? []).at(-1);
  return last && !last.picked && last.day === day ? last : null;
}
