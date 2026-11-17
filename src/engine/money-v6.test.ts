import { describe, expect, it } from 'vitest';
import { buildView, portfolioOf, validateBuyItem, validateUseItem, type GameData } from './engine.js';
import { BONUS_TABLE, drawBonus, itemCost, spendsFromRows, ITEMS } from '../game/items.js';
import { computePortfolio, startCashFor } from '../game/portfolio.js';

const now = Date.now();
function game(version: number, salt = 'cd'.repeat(16)): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 7, salt, status: 'playing', total_days: 10, turn_seconds: 180, day: 1, deadline: now + 100_000, day_deadline: now + 100_000, host_id: 'a', version },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0 })),
    trades: [],
    items: [],
    orders: [],
  };
}
/** 무료 카드 대신 시험용으로 봉투를 손에 쥐여 줌 (구매 기록처럼 보이지만 값 0 — 봉투는 원래 상점에 없음) */
const giveBonus = (d: GameData, pid: string) => d.items.push({ player_id: pid, day: 0, kind: 'bonus', action: 'buy', cost: 0, payload: null });

describe('v6: 시작 돈 100만원 (예전 방은 그대로)', () => {
  it('v6 는 100만원, v5 는 1,000만원', () => {
    expect(startCashFor(6)).toBe(1_000_000);
    expect(startCashFor(5)).toBe(10_000_000);
    expect(portfolioOf(game(6), 'a').cash).toBe(1_000_000);
    expect(portfolioOf(game(5), 'a').cash).toBe(10_000_000);
  });
  it('카드 값도 1/10 (1대1 방해 1.5배 포함)', () => {
    for (const it of ITEMS.filter((i) => !i.shopless)) {
      expect(itemCost(it.kind, 3, 6)).toBe(Math.round(it.cost / 10));
      expect(itemCost(it.kind, 3, 5)).toBe(it.cost);
    }
    expect(itemCost('freeze', 2, 6)).toBe(30_000);
    expect(itemCost('freeze', 2, 5)).toBe(300_000);
    expect(validateBuyItem(game(6), 'a', now, { kind: 'paper' }).cost).toBe(60_000);
  });
  it('상대 재산은 원 단위로 보임 — 100만원 기준', () => {
    const v = buildView(game(6), 'a', now);
    const opp = v.players.find((p) => p.id === 'b')!;
    expect(opp.band).toBeNull();
    expect(opp.equity).toBeGreaterThan(900_000);
    expect(opp.equity).toBeLessThan(1_100_000);
  });
});

describe('v6: 용돈 봉투 확률', () => {
  it('확률표 합은 1, 평균은 약 +5.2만원', () => {
    expect(BONUS_TABLE.reduce((a, b) => a + b.p, 0)).toBeCloseTo(1, 9);
    const ev = BONUS_TABLE.reduce((a, b) => a + b.amount * b.p, 0);
    expect(ev).toBeGreaterThan(50_000);
    expect(ev).toBeLessThan(55_000);
  });
  it('뽑기 분포가 확률표와 맞다 (±1%p)', () => {
    const n = 100_000;
    const cnt = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const a = drawBonus((i + 0.5) / n);
      cnt.set(a, (cnt.get(a) ?? 0) + 1);
    }
    for (const b of BONUS_TABLE) expect(Math.abs((cnt.get(b.amount) ?? 0) / n - b.p)).toBeLessThan(0.01);
  });
  it('서버가 금액을 정해 기록하고, 돈 흐름에 그대로 반영', () => {
    const d = game(6);
    giveBonus(d, 'a');
    const row = validateUseItem(d, 'a', now, { kind: 'bonus' });
    expect(typeof row.payload?.amount).toBe('number');
    expect(BONUS_TABLE.map((b) => b.amount)).toContain(row.payload!.amount);
    const pf = computePortfolio([], spendsFromRows([row]), Infinity, [], 1_000_000);
    expect(pf.cash).toBe(1_000_000 + row.payload!.amount!);
  });
  it('잃는 돈은 지금 현금까지만 (빚 없음)', () => {
    // 현금이 거의 없을 때 여러 방에서 뽑아 보면 마이너스가 나와도 현금 아래로는 안 내려감
    let sawLoss = false;
    for (let i = 0; i < 60; i++) {
      const d = game(6, i.toString(16).padStart(32, '0'));
      d.trades.push({ player_id: 'a', day: 0, symbol: 'CORE', side: 'buy', qty: 11, price: 88_000, fee: 0.0015 });
      giveBonus(d, 'a');
      const cash = portfolioOf(d, 'a').cash;
      const a = validateUseItem(d, 'a', now, { kind: 'bonus' }).payload!.amount!;
      if (a < 0) sawLoss = true;
      expect(a).toBeGreaterThanOrEqual(-cash);
    }
    expect(sawLoss).toBe(true);
  });
  it('결과는 방 비밀값마다 다르고, 같은 방·같은 순서면 같음 (새로고침해도 안 바뀜)', () => {
    const d1 = game(6, 'aa'.repeat(16));
    giveBonus(d1, 'a');
    const r1 = validateUseItem(d1, 'a', now, { kind: 'bonus' }).payload!.amount;
    const r2 = validateUseItem(d1, 'a', now, { kind: 'bonus' }).payload!.amount;
    expect(r1).toBe(r2);
    const outs = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const d = game(6, (i + 100).toString(16).padStart(32, '0'));
      giveBonus(d, 'a');
      outs.add(validateUseItem(d, 'a', now, { kind: 'bonus' }).payload!.amount!);
    }
    expect(outs.size).toBeGreaterThan(2);
  });
  it('예전 방(v5) 봉투는 50만원 고정 그대로', () => {
    const d = game(5);
    giveBonus(d, 'a');
    const row = validateUseItem(d, 'a', now, { kind: 'bonus' });
    expect(row.payload?.amount).toBeUndefined();
    expect(spendsFromRows([row])[0].cost).toBe(-500_000);
  });
  it('화면 데이터에 방 비밀값·다음 봉투 결과가 없다', () => {
    const d = game(6);
    giveBonus(d, 'a');
    const v = buildView(d, 'a', now);
    const json = JSON.stringify(v);
    expect(json).not.toContain(d.room.salt!);
    expect(json).not.toContain('amount');
  });
});

describe('v8: 카드 값 다시 매김 (예전 방은 그대로)', () => {
  it('v8 새 값, v7 은 1/10 그대로', () => {
    expect(itemCost('paper', 3, 8)).toBe(30_000);
    expect(itemCost('paper', 3, 7)).toBe(60_000);
    expect(itemCost('freeze', 2, 8)).toBe(15_000); // 1대1 방해 1.5배
    expect(itemCost('freeze', 4, 8)).toBe(10_000);
    expect(itemCost('fee', 2, 8)).toBe(25_000);
  });
});

describe('기권한 사람은 카드 대상이 아님', () => {
  it('1대1 에서 상대가 기권했으면 방해 카드는 거절 (카드는 그대로)', async () => {
    const { validateUseItem: use } = await import('./engine.js');
    const d = game(8);
    d.items.push({ player_id: 'a', day: 0, kind: 'freeze', action: 'buy', cost: 0, payload: null });
    d.players[1] = { ...d.players[1], left_game: true };
    expect(() => use(d, 'a', now, { kind: 'freeze', payload: { target: 'b' } })).toThrow(/상대가 없어요/);
  });
});

describe('v9: 카드 값 (시뮬로 다시 맞춤)', () => {
  it('내일 신문 4.5만, 거래 정지 2만(1대1 3만), v8 방은 그대로', () => {
    expect(itemCost('paper', 3, 9)).toBe(45_000);
    expect(itemCost('freeze', 4, 9)).toBe(20_000);
    expect(itemCost('freeze', 2, 9)).toBe(30_000);
    expect(itemCost('paper', 3, 8)).toBe(30_000);
  });
});

describe('v10: 카드 5장까지', () => {
  it('v10 은 5장, 그 전 방은 3장', async () => {
    const { holdLimit, canBuy } = await import('../game/items.js');
    expect(holdLimit(10)).toBe(5);
    expect(holdLimit(9)).toBe(3);
    const p = { inventory: { scout: 1, detector: 1, analyst: 1 }, used: {}, infoUses: [], grants: [], total: 3 };
    expect(canBuy(p, 'paper', 1e9, 1, holdLimit(9))).toMatch(/최대 3장/);
    expect(canBuy(p, 'paper', 1e9, 1, holdLimit(10))).toBeNull();
  });
});

describe('(v13) 용돈 봉투는 현금이 10만원 이상일 때만', () => {
  it('현금을 다 주식에 넣으면 못 씀, 현금이 있으면 씀', () => {
    const d = game(13);
    d.trades.push({ player_id: 'a', day: 0, symbol: 'CORE', side: 'buy', qty: 11, price: 88_000, fee: 0.0015 });
    giveBonus(d, 'a');
    const cash = portfolioOf(d, 'a').cash;
    if (cash < 100_000) expect(() => validateUseItem(d, 'a', now, { kind: 'bonus' })).toThrow(/10만원/);
    const d2 = game(13);
    giveBonus(d2, 'a');
    expect(() => validateUseItem(d2, 'a', now, { kind: 'bonus' })).not.toThrow();
  });
});
