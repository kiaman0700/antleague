/** 규칙 v14 (설계서 design/cards-v14.md + 첫날 장 전 시간): 감별기 10만원·고른 소식 1개 · 정보 카드 하루 1장 · 값 조정 · 첫날 장 전 */
import { describe, expect, it } from 'vitest';
import { buildView, firstDayLead, inPremarket, marketFor, nextRoomState, preSeconds, SOLO_PRE_SECONDS, validateTrade, validateUseItem, type GameData } from './engine.js';
import { itemCost } from '../game/items.js';
import { preRumors } from '../game/rumors.js';

const T0 = 1_900_000_000_000;
const SALT = 'ab'.repeat(16);
/** day 번째 날 장이 열려 있는 상태 (now = T0, 마감 T0+30초) */
function game(version: number, day = 2): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 21, salt: SALT, status: 'playing', total_days: 10, turn_seconds: 60, day, deadline: T0 + 30_000, day_deadline: T0 + 30_000, host_id: 'a', version },
    players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [],
    items: [],
    orders: [],
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
const own = (d: GameData, kind: 'detector' | 'analyst' | 'paper') => d.items.push({ player_id: 'a', day: d.room.day, kind, action: 'buy', cost: 1, created_at: '1' });

describe('v14 카드 값', () => {
  it('감별기 10만원 · 내일 신문 3.5만 · 애널리스트 2.5만 (v13 은 그대로)', () => {
    expect(itemCost('detector', 2, 14)).toBe(100_000);
    expect(itemCost('paper', 4, 14)).toBe(35_000);
    expect(itemCost('analyst', 4, 14)).toBe(25_000);
    expect(itemCost('detector', 2, 13)).toBe(10_000);
    expect(itemCost('paper', 4, 13)).toBe(45_000);
  });
});

describe('v14 루머 감별기 = 고른 소식 1개만', () => {
  const m = marketFor(21, 10, 14, SALT);
  const todayNews = m.news.filter((n) => n.day === 2 && n.at == null);
  it('고른 뉴스 하나에만 판정이 붙고 나머지 오늘 뉴스·찌라시엔 없음', () => {
    const d = game(14);
    own(d, 'detector');
    const pick = todayNews[0].headline;
    d.items.push({ player_id: 'a', day: 2, kind: 'detector', action: 'use', cost: 0, payload: { pick }, created_at: '2' });
    const v = buildView(d, 'a', T0);
    const today = v.market!.news.filter((n) => n.day === 2);
    expect(today.find((n) => n.headline === pick)?.verdict).toBeDefined();
    expect(today.filter((n) => n.headline !== pick).every((n) => n.verdict === undefined)).toBe(true);
    expect((v.rumors ?? []).every((r) => r.verdict === undefined)).toBe(true);
    // 상대 화면엔 아무 판정도 없음
    const vb = buildView(d, 'b', T0);
    expect(vb.market!.news.filter((n) => n.day === 2).every((n) => n.verdict === undefined)).toBe(true);
  });
  it('고른 찌라시 하나에만 판정', () => {
    const d = game(14);
    own(d, 'detector');
    const rs = preRumors(m, 2, SALT);
    d.items.push({ player_id: 'a', day: 2, kind: 'detector', action: 'use', cost: 0, payload: { pick: rs[0].text }, created_at: '2' });
    const v = buildView(d, 'a', T0);
    const withVerdict = (v.rumors ?? []).filter((r) => r.verdict !== undefined);
    expect(withVerdict.map((r) => r.text)).toEqual([rs[0].text]);
    expect(v.market!.news.filter((n) => n.day === 2).every((n) => n.verdict === undefined)).toBe(true);
  });
  it('쓸 때 오늘 보이는 소식 하나를 꼭 골라야 함 (없는 것·빈 값은 거절)', () => {
    const d = game(14);
    own(d, 'detector');
    expect(err(() => validateUseItem(d, 'a', T0, { kind: 'detector' }))).toMatch(/확인할 소식/);
    expect(err(() => validateUseItem(d, 'a', T0, { kind: 'detector', payload: { pick: '없는 기사' } }))).toMatch(/확인할 소식/);
    expect(validateUseItem(d, 'a', T0, { kind: 'detector', payload: { pick: todayNews[0].headline } }).payload).toEqual({ pick: todayNews[0].headline });
  });
  it('v13 방은 예전처럼 오늘 소식 전부 판정', () => {
    const d = game(13);
    own(d, 'detector');
    d.items.push({ player_id: 'a', day: 2, kind: 'detector', action: 'use', cost: 0, payload: null, created_at: '2' });
    const v = buildView(d, 'a', T0);
    expect(v.market!.news.filter((n) => n.day === 2).every((n) => n.verdict !== undefined)).toBe(true);
  });
});

describe('v14 정보 카드는 하루 1장', () => {
  it('같은 날 두 번째 정보 카드는 거절 (카드는 그대로)', () => {
    const d = game(14);
    own(d, 'analyst');
    own(d, 'paper');
    d.items.push({ player_id: 'a', day: 2, kind: 'analyst', action: 'use', cost: 0, payload: null, created_at: '3' });
    expect(err(() => validateUseItem(d, 'a', T0, { kind: 'paper' }))).toMatch(/정보 카드는 하루에 1장/);
    // 다음 날은 됨
    const d2 = game(14, 3);
    d2.items = d.items.map((x) => ({ ...x }));
    expect(err(() => validateUseItem(d2, 'a', T0, { kind: 'paper' }))).toBeNull();
    // v13 은 같은 날 여러 장 가능
    const d13 = game(13);
    d13.items = d.items.map((x) => ({ ...x }));
    expect(err(() => validateUseItem(d13, 'a', T0, { kind: 'paper' }))).toBeNull();
  });
});

describe('v14 첫날 장 전 시간', () => {
  /** 방을 막 시작한 첫날 (시작 지점처럼 마감 = now + (하루 + 앞당김 + 4초)) */
  const started = (version: number): GameData => {
    const d = game(version, 0);
    const dl = T0 + (60 + firstDayLead(version, 60) + 4) * 1000;
    d.room = { ...d.room, deadline: dl, day_deadline: dl };
    d.players = d.players.map((p) => ({ ...p, ended_day: -1 }));
    return d;
  };
  it('v14 는 첫날도 장 전 시간(신속 20초)이 있고 v13 은 없음', () => {
    expect(firstDayLead(14, 60)).toBe(preSeconds(60));
    expect(firstDayLead(13, 60)).toBe(0);
    expect(inPremarket(started(14).room, T0 + 1000)).toBe(true);
    expect(inPremarket(started(13).room, T0 + 1000)).toBe(false);
  });
  it('첫날 장 전에도 찌라시가 보이고, 지금 가격 거래는 장이 열린 뒤에', () => {
    const d = started(14);
    const v = buildView(d, 'a', T0 + 1000);
    expect((v.rumors ?? []).length).toBeGreaterThan(0);
    expect(v.room.preUntil).toBeGreaterThan(T0);
    expect(err(() => validateTrade(d, 'a', T0 + 1000, { symbol: 'CORE', side: 'buy', qty: 1 }))).toMatch(/장이 열리지/);
    // 진위는 감별기 없이 안 보임
    expect((v.rumors ?? []).every((r) => r.verdict === undefined)).toBe(true);
  });
});

describe('봇전·오늘의 도전은 장 전이 무제한 (장 시작을 눌러야)', () => {
  it('첫날·다음 날 모두 장 전이 6시간 (대결은 그대로 20초)', () => {
    expect(firstDayLead(14, 60, 'bot')).toBe(SOLO_PRE_SECONDS);
    expect(firstDayLead(14, 60, 'daily')).toBe(SOLO_PRE_SECONDS);
    expect(firstDayLead(14, 60, 'match')).toBe(preSeconds(60));
    const d = game(14, 2);
    d.room = { ...d.room, kind: 'bot' };
    d.players = d.players.map((p) => ({ ...p, ended_day: 2 }));
    const next = nextRoomState(d, T0)!;
    expect(next.deadline! - T0).toBe((60 + SOLO_PRE_SECONDS + 4) * 1000);
    const dm = game(14, 2);
    dm.players = dm.players.map((p) => ({ ...p, ended_day: 2 }));
    expect(nextRoomState(dm, T0)!.deadline! - T0).toBe((60 + preSeconds(60) + 4) * 1000);
  });
});
