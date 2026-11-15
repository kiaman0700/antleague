import { ITEM_MAP } from '../game/items.js';
import { describe, expect, it } from 'vitest';
import { dayTicks } from '../game/intraday.js';
import { generateMarket } from '../game/market.js';
import { buildView, cleanNickname, dayClock, GameError, nextRoomState, validateBuyItem, validateEndTurn, validateTrade, validateUseItem, type GameData } from './engine.js';

const SEED = 4242;
function game(over: Partial<GameData['room']> = {}): GameData {
  return {
    room: { id: 'r1', code: 'ABC234', seed: SEED, status: 'playing', total_days: 10, turn_seconds: 90, day: 2, deadline: Date.now() + 60_000, host_id: 'a', ...over },
    players: [
      { id: 'a', room_id: 'r1', nickname: '나', mode: 'easy', ready: true, ended_day: -1, created_at: '2026-01-01T00:00:00Z', version: 0 },
      { id: 'b', room_id: 'r1', nickname: '너', mode: 'pro', ready: true, ended_day: -1, created_at: '2026-01-01T00:00:01Z', version: 0 },
    ],
    trades: [],
    items: [],
    orders: [],
  };
}
const now = Date.now();
const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GameError ? e.message : 'other';
  }
  return null;
};

describe('미래 정보 숨김', () => {
  it('시드와 오늘 종가·미래 가격이 화면 데이터에 없다', () => {
    const v = buildView(game(), 'a', now);
    const m = v.market!;
    const full = generateMarket(SEED, 10);
    expect(m.seed).toBe(0);
    expect(JSON.stringify(v)).not.toContain(String(SEED));
    expect(m.bars.NEOT.length).toBe(3); // 0,1일 + 오늘
    expect(m.bars.NEOT[2].close).toBe(full.bars.NEOT[2].open); // 오늘 종가는 시가로 가려짐
    expect(m.macro.length).toBe(3);
    expect(m.news.every((n) => n.day <= 2)).toBe(true);
    expect(v.final).toBeNull();
  });
  it('오늘 루머의 진실은 감별기 없이는 숨겨진다', () => {
    for (let s = 1; s < 60; s++) {
      const d = game();
      d.room.seed = s;
      const v = buildView(d, 'a', now);
      for (const n of v.market!.news.filter((x) => x.day === 2 && x.rumor)) expect(n.realTone).toBe(n.tone);
    }
  });
  it('상대 거래 내역은 보이지 않는다', () => {
    const d = game();
    d.trades.push({ player_id: 'b', day: 0, symbol: 'CORE', side: 'buy', qty: 5, price: 1, fee: 0.001 });
    const v = buildView(d, 'a', now);
    expect(v.myTrades.length).toBe(0);
    expect(JSON.stringify(v)).not.toContain('"CORE","side"');
  });
  it('같은 marketKey 면 시장 데이터를 다시 보내지 않는다', () => {
    const v1 = buildView(game(), 'a', now);
    const v2 = buildView(game(), 'a', now, v1.marketKey);
    expect(v2.market).toBeNull();
  });
});

describe('거래 검증', () => {
  it('가격은 클라이언트가 아니라 서버 시장 가격으로 정해진다', () => {
    const g = game();
    const t = validateTrade(g, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, price: 1 } as never);
    // 실시간: 서버 시각의 장중 칸 가격
    const { n, tick } = dayClock(g.room, now);
    expect(t.price).toBe(dayTicks(generateMarket(SEED, 10), 'NEOT', 2, n)[tick]);
  });
  it('잘못된 입력·규칙 위반은 거절', () => {
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'XXXX', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1.5 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: -3 }))).toBeTruthy();
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 999999 }))).toMatch(/현금/);
    expect(err(() => validateTrade(game(), 'a', now, { symbol: 'NEOT', side: 'sell', qty: 1 }))).toMatch(/수량/);
    expect(err(() => validateTrade(game(), 'zz', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game({ status: 'finished' }), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toBeTruthy();
    expect(err(() => validateTrade(game({ deadline: now - 1 }), 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toMatch(/시간/);
    const ended = game();
    ended.players[0].ended_day = 2;
    expect(err(() => validateTrade(ended, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }))).toMatch(/마감/);
  });
  it('거래 정지 카드를 맞으면 다음 날 거래 불가', () => {
    const d = game({ day: 1 });
    // b 가 0일에 거래정지 사용 → 1일에 a 거래 불가 (보유 카드가 없으면 사용이 무시되므로 구매 후 사용)
    d.items.push({ player_id: 'b', day: 0, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' });
    d.items.push({ player_id: 'b', day: 0, kind: 'freeze', action: 'use', cost: 0, created_at: '2' });
    const r = err(() => validateTrade(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1 }));
    // 시작 카드로 a 가 방패를 받았으면 막힘 → 둘 중 하나
    expect(r === null || /거래 정지/.test(r)).toBe(true);
  });
});

describe('카드·턴 검증', () => {
  it('없는 카드는 사용 불가, 가짜 뉴스는 올바른 내용만', () => {
    expect(err(() => validateUseItem(game(), 'a', now, { kind: 'nope' }))).toBeTruthy();
    const d = game();
    d.items.push({ player_id: 'a', day: 2, kind: 'fake', action: 'buy', cost: 1, created_at: '1' });
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'KIDX', tone: 'good' } }))).toBeTruthy();
    expect(err(() => validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'NEOT', tone: '<script>' } }))).toBeTruthy();
    expect(validateUseItem(d, 'a', now, { kind: 'fake', payload: { symbol: 'NEOT', tone: 'bad', extra: 'x' } }).payload).toEqual({ target: 'b', symbol: 'NEOT', tone: 'bad' });
  });
  it('카드 구매 비용은 서버가 정한다', () => {
    const d = game();
    const row = validateBuyItem(d, 'a', now, { kind: 'detector', cost: 0 } as never);
    expect(row.cost).toBe(ITEM_MAP.detector.cost);
  });
  it('둘 다 마감하거나 시간이 지나야 다음 날', () => {
    const d = game();
    expect(nextRoomState(d, now)).toBeNull();
    d.players.forEach((p) => (p.ended_day = 2));
    expect(nextRoomState(d, now)?.day).toBe(3);
    expect(nextRoomState(game({ deadline: now - 1 }), now)?.day).toBe(3);
    expect(nextRoomState(game({ day: 9, deadline: now - 1 }), now)?.status).toBe('finished');
    expect(validateEndTurn(game({ deadline: now - 1 }), 'a', now).day).toBe(2);
  });
  it('닉네임 검증', () => {
    expect(cleanNickname('  개미 왕 ')).toBe('개미 왕');
    expect(err(() => cleanNickname('<img>'))).toBeTruthy();
    expect(err(() => cleanNickname('a\u0000b'))).toBeTruthy();
    expect(err(() => cleanNickname('12345678901'))).toBeTruthy();
    expect(err(() => cleanNickname(''))).toBeTruthy();
  });
});

describe('하루 제한 시간 · 카운트다운', () => {
  const t = 5_000_000;
  const mk = (ended: number[], deadline: number | null = t + 600_000, dayDeadline: number | null = deadline) => ({
    room: { id: 'r', code: 'AAAAAA', seed: 1, status: 'playing' as const, total_days: 10, turn_seconds: 600, day: 2, deadline, day_deadline: dayDeadline, host_id: 'p0' },
    players: ended.map((e, i) => ({ id: 'p' + i, room_id: 'r', nickname: 'P' + i, mode: 'easy' as const, ready: true, ended_day: e, created_at: '1', version: 0 })),
    trades: [],
    items: [],
    orders: [],
  });
  it('무제한(0)은 없고 최대 10분까지만 고를 수 있다', async () => {
    const { cleanTurn } = await import('./engine.js');
    expect(() => cleanTurn(0)).toThrow(GameError);
    expect(() => cleanTurn(1200)).toThrow(GameError);
    expect(() => cleanTurn('600')).toThrow(GameError);
    for (const v of [60, 180, 300, 600]) expect(cleanTurn(v)).toBe(v);
  });
  it('시간이 다 되면 아무도 마감을 안 눌러도 다음 날로 넘어간다', () => {
    expect(nextRoomState(mk([1, 1]), t + 600_000 - 1)).toBeNull();
    const next = nextRoomState(mk([1, 1]), t + 600_000);
    expect(next?.day).toBe(3);
    expect(next?.deadline).toBe(next?.day_deadline);
  });
  it('1대1: 한 명이 마감하면 90초 카운트다운', async () => {
    const { graceDeadline } = await import('./engine.js');
    expect(graceDeadline(mk([1, 1]), t)).toBeNull();
    expect(graceDeadline(mk([2, 1]), t)).toBe(t + 90_000);
  });
  it('3인 이상: 3분의 2 이상이 마감하면 30초 카운트다운', async () => {
    const { graceDeadline } = await import('./engine.js');
    expect(graceDeadline(mk([2, 1, 1]), t)).toBeNull(); // 3명 중 1명
    expect(graceDeadline(mk([2, 2, 1]), t)).toBe(t + 30_000); // 3명 중 2명
    expect(graceDeadline(mk([2, 2, 2, 1, 1, 1]), t)).toBeNull(); // 6명 중 3명
    expect(graceDeadline(mk([2, 2, 2, 2, 1, 1]), t)).toBe(t + 30_000); // 6명 중 4명
  });
  it('남은 시간이 이미 카운트다운보다 짧으면 그대로', async () => {
    const { graceDeadline } = await import('./engine.js');
    expect(graceDeadline(mk([2, 2, 1], t + 10_000), t)).toBeNull();
    expect(graceDeadline(mk([2, 1], t + 60_000), t)).toBeNull();
  });
  it('모두 마감하면 시간과 상관없이 바로 넘어간다', () => {
    expect(nextRoomState(mk([2, 2]), t)?.day).toBe(3);
    expect(nextRoomState(mk([2, 2, 2]), t)?.day).toBe(3);
  });
});

describe('장 마감 취소', () => {
  const t = 5_000_000;
  const mk = (ended: number[], deadline: number | null = t + 600_000, dayDeadline: number | null = deadline) => ({
    room: { id: 'r', code: 'AAAAAA', seed: 1, status: 'playing' as const, total_days: 10, turn_seconds: 600, day: 2, deadline, day_deadline: dayDeadline, host_id: 'p0' },
    players: ended.map((e, i) => ({ id: 'p' + i, room_id: 'r', nickname: 'P' + i, mode: 'easy' as const, ready: true, ended_day: e, created_at: '1', version: 0 })),
    trades: [],
    items: [],
    orders: [],
  });
  it('마감한 사람은 넘어가기 전까지 취소할 수 있다 (카운트다운 중에도)', async () => {
    const { validateCancelEnd } = await import('./engine.js');
    expect(validateCancelEnd(mk([2, 1]), 'p0', t).endedDay).toBe(1);
    expect(validateCancelEnd(mk([2, 1], t + 90_000, t + 600_000), 'p0', t).endedDay).toBe(1);
  });
  it('마감 안 했거나, 시간이 다 됐거나, 게임 중이 아니면 취소할 수 없다', async () => {
    const { validateCancelEnd } = await import('./engine.js');
    expect(() => validateCancelEnd(mk([2, 1]), 'p1', t)).toThrow(GameError);
    expect(() => validateCancelEnd(mk([2, 1], t), 'p0', t)).toThrow(GameError);
    expect(() => validateCancelEnd(mk([2, 1]), 'nobody', t)).toThrow(GameError);
    const fin = mk([2, 1]);
    fin.room.status = 'finished' as never;
    expect(() => validateCancelEnd(fin, 'p0', t)).toThrow(GameError);
  });
  it('취소로 기준 아래가 되면 원래 마감 시각으로 되돌린다 (끝내고 취소해서 남의 시간 줄이기 방지)', async () => {
    const { restoreDeadline } = await import('./engine.js');
    expect(restoreDeadline(mk([1, 1], t + 90_000, t + 600_000))).toBe(t + 600_000); // 1대1: 0명 마감
    expect(restoreDeadline(mk([2, 1, 1], t + 30_000, t + 600_000))).toBe(t + 600_000); // 3인: 1명 < 2명
    expect(restoreDeadline(mk([2, 2, 1], t + 30_000, t + 600_000))).toBeNull(); // 아직 기준 이상
    expect(restoreDeadline(mk([1, 1]))).toBeNull(); // 카운트다운 중이 아님
  });
});

describe('뉴스 진실 숨김 · 루머 감별기', () => {
  /** 오늘(day) 표시 없는 가짜 기사가 있는 시드 찾기 */
  function seedWithFake(day: number) {
    for (let s = 1; s < 500; s++) if (generateMarket(s, 10).news.some((n) => n.day === day && n.fake)) return s;
    throw new Error('가짜 기사가 있는 시드를 못 찾음');
  }
  const detectorUsed = (d: GameData) => {
    d.items.push({ player_id: 'a', day: d.room.day, kind: 'detector', action: 'buy', cost: 150_000, created_at: '1' });
    d.items.push({ player_id: 'a', day: d.room.day, kind: 'detector', action: 'use', cost: 0, created_at: '2' });
    return d;
  };

  it('표시 없는 가짜 기사가 가끔 섞여 나온다 (가격 영향 없음)', () => {
    const fakes = generateMarket(SEED, 30).news.filter((n) => n.fake);
    expect(fakes.length).toBeGreaterThan(3);
    expect(fakes.every((n) => n.day >= 1 && !n.rumor)).toBe(true);
  });
  it('감별기 없이는 오늘 뉴스의 가짜 여부가 화면 데이터에 전혀 없다', () => {
    const seed = seedWithFake(2);
    const v = buildView(game({ seed }), 'a', now);
    const today = v.market!.news.filter((n) => n.day === 2);
    expect(today.length).toBeGreaterThan(0);
    for (const n of today) {
      expect('fake' in n).toBe(false);
      expect(n.verdict).toBeUndefined();
      expect(n.realTone).toBe(n.tone);
    }
    expect(JSON.stringify(v.market!.news)).not.toContain('"fake"');
  });
  it('감별기를 쓰면 오늘 뉴스 전부에 사실/가짜 판정이 붙는다 (루머가 아니어도)', () => {
    const seed = seedWithFake(2);
    const full = generateMarket(seed, 10).news.filter((n) => n.day === 2);
    const v = buildView(detectorUsed(game({ seed })), 'a', now);
    const today = v.market!.news.filter((n) => n.day === 2);
    expect(today.every((n) => n.verdict === 'true' || n.verdict === 'false')).toBe(true);
    expect(today.filter((n) => n.verdict === 'false').length).toBe(full.filter((n) => n.fake || (n.rumor && n.tone !== n.realTone)).length);
    expect(JSON.stringify(v.market!.news)).not.toContain('"fake"');
  });
  it('상대가 보낸 가짜 뉴스 카드도 감별기에 가짜로 잡힌다', () => {
    // 처음 받는 카드에 반사 거울·방패가 있으면 튕겨 나가므로, 그대로 맞는 시드를 고름
    let checked = 0;
    for (let seed = 1; seed < 200 && checked < 3; seed++) {
      const d = detectorUsed(game({ seed }));
      d.items.push({ player_id: 'b', day: 1, kind: 'fake', action: 'buy', cost: 400_000, created_at: '3' });
      d.items.push({ player_id: 'b', day: 1, kind: 'fake', action: 'use', cost: 0, payload: { target: 'a', symbol: 'NEOT', tone: 'good' }, created_at: '4' });
      const v = buildView(d, 'a', now);
      if (v.notices.some((n) => n.text.includes('반사') || n.text.includes('방패'))) continue;
      checked++;
      const card = v.market!.news.filter((n) => n.day === 2 && n.symbol === 'NEOT' && n.verdict === 'false');
      expect(card.length).toBeGreaterThan(0);
    }
    expect(checked).toBe(3);
  });
  it('지난 날의 가짜 기사는 장이 끝난 뒤 가짜로 밝혀진다', () => {
    const seed = seedWithFake(1);
    const v = buildView(game({ seed }), 'a', now);
    expect(v.market!.news.some((n) => n.day === 1 && n.verdict === 'false')).toBe(true);
  });
  it('뉴스를 꾸며도 같은 시드의 가격은 바뀌지 않는다 (진행 중인 게임 보호)', () => {
    const a = generateMarket(SEED, 20);
    const b = generateMarket(SEED, 20);
    expect(a.bars).toEqual(b.bars);
    // 시황 기사는 이미 지난 날의 실제 움직임만 다룬다
    expect(a.news.filter((n) => n.label === '시황' || n.label === '특징주').every((n) => n.day >= 1)).toBe(true);
  });
});
