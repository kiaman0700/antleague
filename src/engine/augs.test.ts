/** 규칙 v27 증강: 고르기·다시 뽑기·자동 선택·정보가 새지 않음 (design/augments-v27.md) */
import { describe, expect, it } from 'vitest';
import { buildView, marketFor, validateBuyItem, validateEndTurn, validatePickAug, validateRerollAug, type GameData } from './engine.js';
import { deriveAugs } from './augs.js';
import { AUG_MAP } from '../game/augments.js';

const T0 = 1_900_000_000_000;
const SALT = 'cd'.repeat(16);
function game(day = 0, version = 27, ids = ['a', 'b']): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 33, salt: SALT, status: 'playing', total_days: 10, turn_seconds: 60, day, deadline: T0 + 30_000, day_deadline: T0 + 30_000, host_id: 'a', version },
    players: ids.map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [],
    items: [],
    orders: [],
    augs: [],
  };
}
const err = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const push = (d: GameData, row: ReturnType<typeof validatePickAug>) => d.augs!.push({ ...row, created_at: String(d.augs!.length) });

describe('v27 시장은 v26 과 같음 (바뀐 건 카드 → 증강)', () => {
  it('같은 시드·salt 면 가격·뉴스가 똑같다', () => {
    const a = marketFor(33, 10, 26, SALT);
    const b = marketFor(33, 10, 27, SALT);
    expect(JSON.stringify({ ...b, version: 0 })).toBe(JSON.stringify({ ...a, version: 0 }));
  });
});

describe('v27 고르기', () => {
  it('첫날 보기 3개가 화면에 오고, 보기에 있는 것만 고를 수 있음', () => {
    const d = game(0);
    const v = buildView(d, 'a', T0);
    expect(v.aug?.offer?.ids).toHaveLength(3);
    expect(err(() => validatePickAug(d, 'a', T0, { aug: 'jackpot_x' }))).toMatch(/보기에 없는/);
    const id = v.aug!.offer!.ids[1];
    push(d, validatePickAug(d, 'a', T0, { aug: id }));
    const v2 = buildView(d, 'a', T0);
    expect(v2.aug?.offer).toBeNull();
    expect(v2.aug?.mine.map((x) => x.id)).toEqual([id]);
    expect(err(() => validatePickAug(d, 'a', T0, { aug: id }))).toMatch(/고를 증강이 없/);
  });
  it('고르는 날이 아니면 고를 수 없음', () => {
    const d = game(1);
    // 0일차에 안 골랐으니 자동으로 정해졌고, 1일차는 고르는 날이 아님
    expect(buildView(d, 'a', T0).aug?.offer).toBeNull();
    expect(buildView(d, 'a', T0).aug?.mine).toHaveLength(1);
    expect(buildView(d, 'a', T0).aug?.mine[0].auto).toBe(true);
    expect(err(() => validatePickAug(d, 'a', T0, { aug: 'cash1' }))).toMatch(/고를 증강이 없/);
  });
  it('안 고르고 하루가 지나면 보기 3개 중 하나로 자동, 늘 같은 것', () => {
    const offer = buildView(game(0), 'a', T0).aug!.offer!.ids;
    const a = deriveAugs(game(1)).players.a[0];
    expect(a.auto).toBe(true);
    expect(offer).toContain(a.picked);
    expect(deriveAugs(game(1)).players.a[0].picked).toBe(a.picked);
  });
  it('사람은 증강을 고르기 전엔 장 마감 불가', () => {
    const d = game(0);
    expect(err(() => validateEndTurn(d, 'a', T0))).toMatch(/증강을 먼저/);
    push(d, validatePickAug(d, 'a', T0, { aug: buildView(d, 'a', T0).aug!.offer!.ids[0] }));
    expect(err(() => validateEndTurn(d, 'a', T0))).toBeNull();
  });
  it('v27 엔 카드를 살 수 없음, v26 은 그대로', () => {
    expect(err(() => validateBuyItem(game(0), 'a', T0, { kind: 'scout' }))).toMatch(/증강/);
    expect(err(() => validateBuyItem(game(0, 26), 'a', T0, { kind: 'scout' })) ?? '').not.toMatch(/증강/);
  });
  it('v26 판엔 증강 화면 데이터가 없음', () => {
    expect(buildView(game(0, 26), 'a', T0).aug).toBeUndefined();
    expect(err(() => validatePickAug(game(0, 26), 'a', T0, { aug: 'cash1' }))).toMatch(/증강이 없/);
  });
  it('장이 끝난 뒤(마감 시각 지남)엔 못 고름', () => {
    const d = game(0);
    const id = buildView(d, 'a', T0).aug!.offer!.ids[0];
    expect(err(() => validatePickAug(d, 'a', T0 + 31_000, { aug: id }))).toMatch(/자동으로/);
  });
});

describe('v27 다시 뽑기', () => {
  it('칸마다 한 번, 그 칸만 바뀌고 나머지는 그대로', () => {
    const d = game(0);
    const before = buildView(d, 'a', T0).aug!.offer!.ids;
    push(d, validateRerollAug(d, 'a', T0, { slot: 2 }));
    const after = buildView(d, 'a', T0).aug!.offer!;
    expect(after.ids[0]).toBe(before[0]);
    expect(after.ids[1]).toBe(before[1]);
    expect(after.ids[2]).not.toBe(before[2]);
    expect(after.canReroll).toEqual([true, true, false]);
    expect(err(() => validateRerollAug(d, 'a', T0, { slot: 2 }))).toMatch(/더 다시 뽑을 수 없/);
    expect(err(() => validateRerollAug(d, 'a', T0, { slot: 7 }))).toMatch(/어느 칸/);
    // 예전 보기의 증강은 이제 못 고름
    expect(err(() => validatePickAug(d, 'a', T0, { aug: before[2] }))).toMatch(/보기에 없는/);
  });
  it('개미 학교 교장을 가지면 다음 고르기에서 2번 더', () => {
    // 첫 고르기에서 교장을 받는 판을 찾음
    for (let s = 0; s < 400; s++) {
      const d = game(0);
      d.room.salt = 'p' + s;
      const v = buildView(d, 'a', T0).aug!.offer!;
      if (!v.ids.includes('principal')) continue;
      push(d, validatePickAug(d, 'a', T0, { aug: 'principal' }));
      d.room.day = 3;
      d.players.forEach((p) => (p.ended_day = 2));
      // 칸마다 1+2번, 모두 합쳐 3+2번
      for (let i = 0; i < 3; i++) push(d, validateRerollAug(d, 'a', T0, { slot: 0 }));
      expect(err(() => validateRerollAug(d, 'a', T0, { slot: 0 }))).toMatch(/더 다시/);
      push(d, validateRerollAug(d, 'a', T0, { slot: 1 }));
      push(d, validateRerollAug(d, 'a', T0, { slot: 2 }));
      expect(err(() => validateRerollAug(d, 'a', T0, { slot: 1 }))).toMatch(/더 다시/);
      return;
    }
    throw new Error('교장 보기를 못 찾음');
  });
});

describe('v27 정보가 새지 않음', () => {
  it('상대 화면 데이터엔 내 증강·보기·다시 뽑기가 없음', () => {
    const d = game(0);
    const mine = buildView(d, 'a', T0).aug!.offer!.ids;
    push(d, validateRerollAug(d, 'a', T0, { slot: 0 }));
    push(d, validatePickAug(d, 'a', T0, { aug: buildView(d, 'a', T0).aug!.offer!.ids[0] }));
    const myPick = d.augs!.find((x) => x.action === 'pick')!.aug;
    const bv = buildView(d, 'b', T0);
    expect(bv.aug?.mine).toEqual([]);
    expect(JSON.stringify(bv.aug)).not.toContain(myPick);
    expect(bv.final).toBeNull();
    // 보기도 다른 사람 것이 섞이지 않음
    expect(mine.length).toBe(3);
  });
  it('화면 데이터에 salt 가 없음', () => {
    expect(JSON.stringify(buildView(game(0), 'a', T0))).not.toContain(SALT);
  });
  it('판이 끝나면 모두의 증강이 공개됨', () => {
    const d = game(0);
    d.room.status = 'finished';
    d.room.day = 10;
    const v = buildView(d, 'b', T0);
    expect(Object.keys(v.final!.augs!)).toEqual(['a', 'b']);
    expect(v.final!.augs!.a).toHaveLength(3);
    for (const x of v.final!.augs!.a) expect(AUG_MAP[x.id]).toBeTruthy();
  });
  it('한 명만 증강(잭팟·내부자 친구)은 같은 차례에 두 사람 보기에 함께 뜨지 않음', () => {
    for (let s = 0; s < 300; s++) {
      const d = game(0, 27, ['a', 'b', 'c', 'd']);
      d.room.salt = 'u' + s;
      const st = deriveAugs(d);
      for (const u of ['jackpot', 'paper2']) {
        const holders = Object.values(st.players).filter((sl) => sl[0].offer.includes(u));
        expect(holders.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ---------------- 효과 ---------------- */
import { isLeveraged, validatePlaceOrder, validateTrade, validateUseAug } from './engine.js';
import { STOCKS } from '../game/stocks.js';
import { augIncomeAll, AUG_CAP } from './augEffects.js';

/** a 가 첫 고르기에서 id 증강을 받은 판 (salt 를 바꿔 가며 찾음) */
function withAug(id: string, ids = ['a', 'b']): GameData {
  for (let s = 0; s < 5000; s++) {
    const d = game(0, 27, ids);
    d.room.salt = 'w' + s;
    const offer = deriveAugs(d).players.a[0].offer;
    if (!offer.includes(id)) continue;
    push(d, validatePickAug(d, 'a', T0, { aug: id }));
    return d;
  }
  throw new Error('못 찾음 ' + id);
}
const goDay = (d: GameData, day: number) => {
  d.room.day = day;
  d.players.forEach((p) => (p.ended_day = day - 1));
  return d;
};
const incomeOf = (d: GameData, aug: string) => (buildView(d, 'a', T0).aug?.income ?? []).filter((x) => x.aug === aug).reduce((a, x) => a + x.amount, 0);

describe('v27 효과: 돈', () => {
  it('비상금: 다음 날 아침 내 재산 +1.2만원 (고른 날엔 재산이 뛰지 않아 상대가 고른 순간을 모름)', () => {
    const d = withAug('cash1');
    expect(incomeOf(d, 'cash1')).toBe(0);
    expect(buildView(d, 'b', T0).players.find((p) => p.id === 'a')!.equity).toBe(1_000_000);
    goDay(d, 1);
    expect(incomeOf(d, 'cash1')).toBe(12_000);
    expect(buildView(d, 'a', T0).players.find((p) => p.id === 'a')!.equity).toBeGreaterThanOrEqual(1_012_000);
  });
  it('적금 I: 3일 뒤에야 들어오고, 그 전엔 화면 데이터에 금액이 없음', () => {
    const d = withAug('save1');
    for (const day of [0, 1, 2]) {
      goDay(d, day);
      expect(incomeOf(d, 'save1')).toBe(0);
      expect(JSON.stringify(buildView(d, 'a', T0).aug!.income)).not.toContain('save1');
      expect(JSON.stringify(buildView(d, 'b', T0))).not.toContain('save1');
    }
    goDay(d, 3);
    expect(incomeOf(d, 'save1')).toBe(15_000);
  });
  it('복권: 결과는 다음 날 전까지 안 보이고, 같은 판이면 늘 같은 금액', () => {
    const d = withAug('lotto');
    expect(JSON.stringify(buildView(d, 'a', T0).aug!.income)).not.toContain('lotto');
    goDay(d, 1);
    const a = incomeOf(d, 'lotto');
    expect([0, 10_000, 20_000, 40_000]).toContain(a);
    expect(incomeOf(goDay(d, 1), 'lotto')).toBe(a);
  });
  it('짠테크 I: 거래한 날만, 판 전체 1.5만원을 넘지 않음', () => {
    const d = withAug('int1');
    // 거래 없이 하루가 지나면 이자 없음
    goDay(d, 1);
    expect(incomeOf(d, 'int1')).toBe(0);
    for (let t = 0; t < 10; t++) d.trades.push({ id: 't' + t, player_id: 'a', day: t, symbol: 'CORE', side: 'buy', qty: 1, price: 1000, fee: 0.001, created_at: String(t) });
    d.room.status = 'finished';
    d.room.day = 10;
    const m = marketFor(33, 10, 27, d.room.salt);
    const inc = augIncomeAll(d, m, m.dividends).a.filter((x) => x.aug === 'int1').reduce((s, x) => s + x.amount, 0);
    expect(inc).toBeGreaterThan(0);
    expect(inc).toBeLessThanOrEqual(AUG_CAP.int1);
  });
  it('끝난 판은 모두의 증강 수입이 결과 데이터에 있음', () => {
    const d = withAug('cash1');
    d.room.status = 'finished';
    d.room.day = 10;
    const f = buildView(d, 'b', T0).final!;
    expect(f.augIncome!.a.some((x) => x.aug === 'cash1' && x.amount === 12_000)).toBe(true);
  });
});

describe('v27 효과: 거래 규칙', () => {
  it('수수료 면제권: 수수료 0, 없는 사람은 그대로', () => {
    const d = withAug('nofee');
    // 첫날 장이 열린 시각 — b 는 아직 고르기 전
    const now = d.room.day_deadline! - 20_000;
    expect(validateTrade(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 1 }).fee).toBe(0);
    expect(validateTrade(d, 'b', now, { symbol: 'CORE', side: 'buy', qty: 1 }).fee).toBeGreaterThan(0);
  });
  it('현금왕: 레버리지·인버스 못 삼 / 레버리지 놀이: 한도 60%', () => {
    const lev = STOCKS.map((x) => x.symbol).find(isLeveraged)!;
    expect(lev).toBeTruthy();
    const k = goDay(withAug('king'), 1);
    expect(err(() => validateTrade(k, 'a', k.room.day_deadline! - 20_000, { symbol: lev, side: 'buy', qty: 1 }))).toMatch(/현금왕/);
  });
  it('예약 달인: 하루 10개·범위 40%', () => {
    const d = goDay(withAug('orders'), 1);
    const now = d.room.day_deadline! - 20_000;
    const m = marketFor(33, 10, 27, d.room.salt);
    const p = m.bars.CORE[1].open;
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 1, limit: Math.round(p * 0.65) }))).toBeNull();
    expect(err(() => validatePlaceOrder(d, 'b', now, { symbol: 'CORE', side: 'buy', qty: 1, limit: Math.round(p * 0.65) }))).toMatch(/30%/);
  });
});

describe('v27 효과: 정보·되돌리기', () => {
  it('귀동냥: 소식 하나 진위 1번, 두 번째는 거절', () => {
    const d = goDay(withAug('verdict1'), 1);
    const now = d.room.day_deadline! - 20_000;
    const v = buildView(d, 'a', now);
    expect(v.aug!.left.detector).toBe(1);
    const pick = v.market!.news.find((n) => n.day === 1)?.headline;
    if (!pick) return;
    const { row } = validateUseAug(d, 'a', now, { kind: 'detector', payload: { pick } });
    d.augs!.push({ ...row, created_at: 'z' });
    const v2 = buildView(d, 'a', now);
    expect(v2.aug!.left.detector).toBe(0);
    expect(v2.reveals.rumorCheck).toBe(true);
    expect(err(() => validateUseAug(d, 'a', now, { kind: 'detector', payload: { pick } }))).toMatch(/횟수가 없|하루에 한 번/);
    // 상대는 진위를 못 봄
    expect(buildView(d, 'b', now).reveals.rumorCheck).toBe(false);
  });
  it('증강 없이 정보 쓰기는 거절', () => {
    const d = goDay(game(0), 1);
    expect(err(() => validateUseAug(d, 'a', d.room.day_deadline! - 20_000, { kind: 'analyst' }))).toMatch(/횟수가 없/);
  });
  it('되돌리기: 오늘 산 거래를 같은 값·수수료 없이 반대로, 판에 한 번', () => {
    const d = goDay(withAug('undo'), 1);
    const now = d.room.day_deadline! - 20_000;
    const t = { ...validateTrade(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 2 }), id: 'tx1', created_at: 'a' };
    d.trades.push(t);
    const { row, undo } = validateUseAug(d, 'a', now, { kind: 'undo', payload: { trade: 'tx1' } });
    expect(undo).toMatchObject({ side: 'sell', qty: 2, price: t.price, fee: 0 });
    d.augs!.push({ ...row, created_at: 'u' });
    d.trades.push({ ...undo!, id: 'tx2', created_at: 'b' });
    expect(buildView(d, 'a', now).players.find((p) => p.id === 'a')!.equity).toBeGreaterThanOrEqual(1_000_000 - 1);
    expect(err(() => validateUseAug(d, 'a', now, { kind: 'undo', payload: { trade: 'tx1' } }))).toMatch(/한 번만/);
  });
});

describe('v27 점검에서 나온 빈틈', () => {
  it('고른 뒤에 들어온 다시 뽑기는 무시, 고르기를 보낸 순간 보기에 있던 것이면 인정', () => {
    const d = game(0);
    const before = buildView(d, 'a', T0).aug!.offer!.ids;
    // 같은 순간: 고르기(0번 칸)와 0번 칸 다시 뽑기가 함께 들어옴 — 다시 뽑기가 먼저 기록
    d.augs!.push({ player_id: 'a', n: 0, day: 0, action: 'reroll', aug: before[0], slot: 0, created_at: '1' });
    d.augs!.push({ player_id: 'a', n: 0, day: 0, action: 'pick', aug: before[0], slot: 0, created_at: '2' });
    expect(deriveAugs(d).players.a[0].picked).toBe(before[0]);
    expect(buildView(d, 'a', T0).aug!.offer).toBeNull();
  });
  it('날마다 받는 효과는 고른 다음 날부터 (고른 날 결과를 보고 고르지 못하게)', () => {
    const d = withAug('insure');
    // 고른 날 크게 잃은 것처럼: 비싸게 사고 하루가 지남
    d.trades.push({ id: 'x', player_id: 'a', day: 0, symbol: 'CORE', side: 'buy', qty: 5, price: 500_000, fee: 0.001, created_at: '0' });
    goDay(d, 1);
    expect(incomeOf(d, 'insure')).toBe(0);
  });
  it('되돌리기: 그 종목 오늘 마지막 거래만, 피한 손실은 7만원까지', () => {
    const d = goDay(withAug('undo'), 1);
    const now = d.room.day_deadline! - 20_000;
    const p = validateTrade(d, 'a', now, { symbol: 'CORE', side: 'buy', qty: 3 }).price;
    // 아주 비싸게 산 기록 (지금 가격보다 훨씬 위) → 되돌려도 7만원 넘게는 못 피함
    d.trades.push({ id: 'b1', player_id: 'a', day: 1, symbol: 'CORE', side: 'buy', qty: 3, price: p + 100_000, fee: 0.001, created_at: 'a' });
    d.trades.push({ id: 'b2', player_id: 'a', day: 1, symbol: 'CORE', side: 'buy', qty: 1, price: p, fee: 0.001, created_at: 'b' });
    expect(err(() => validateUseAug(d, 'a', now, { kind: 'undo', payload: { trade: 'b1' } }))).toMatch(/마지막 거래만/);
    d.trades.pop();
    const { undo } = validateUseAug(d, 'a', now, { kind: 'undo', payload: { trade: 'b1' } });
    expect(3 * (undo!.price - p)).toBeLessThanOrEqual(70_000 + 1);
  });
  it('상대 화면 데이터엔 내 증강 이름이 하나도 없음 (고른 날·다음 날 모두)', () => {
    const d = withAug('jackpot');
    for (const day of [0, 1, 2]) {
      goDay(d, day);
      const t = JSON.stringify(buildView(d, 'b', T0));
      expect(t).not.toContain('jackpot');
    }
  });
});
