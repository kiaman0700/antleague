import { startCashFor } from '../game/portfolio.js';
import { describe, expect, it } from 'vitest';
import { BADGES, computeAchievements } from '../game/achievements.js';
import { generateMarket } from '../game/market.js';
import { computePortfolio } from '../game/portfolio.js';
import { dayTicks } from '../game/intraday.js';
import { buildView, GameError, resolveOrders, validatePlaceOrder, type GameData } from './engine.js';

const SEED = 777;
const now = Date.now();
function game(day = 3): GameData {
  return {
    room: { id: 'r', code: 'AAAAAA', seed: SEED, status: 'playing', total_days: 20, turn_seconds: 0, day, deadline: null, host_id: 'a' },
    players: [{ id: 'a', room_id: 'r', nickname: 'A', mode: 'pro', ready: true, ended_day: -1, created_at: '1', version: 0 }],
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
    return e instanceof GameError ? e.message : 'other';
  }
};

describe('일정·배당', () => {
  const m = generateMarket(SEED, 20);
  it('연준·금통위·실적 시즌·배당 기준일이 미리 공지된다', () => {
    const kinds = new Set(m.events.map((e) => e.kind));
    for (const k of ['fomc', 'bok', 'earnings', 'dividend']) expect(kinds.has(k as never)).toBe(true);
    const fomc = m.events.find((e) => e.kind === 'fomc')!;
    expect(m.news.some((n) => n.day === fomc.day && n.macro === 'fed')).toBe(true);
  });
  it('배당금은 기준일이 지나기 전엔 숨겨진다', () => {
    const dv = m.dividends[0];
    const before = buildView(game(dv.day), 'a', now).market!;
    expect(before.dividends.find((x) => x.day === dv.day && x.symbol === dv.symbol)!.perShare).toBe(0);
    const after = buildView(game(dv.day + 1), 'a', now).market!;
    expect(after.dividends.find((x) => x.day === dv.day && x.symbol === dv.symbol)!.perShare).toBe(dv.perShare);
  });
  it('기준일 마감에 들고 있으면 배당을 받는다', () => {
    const dv = m.dividends[0];
    const trades = [{ player_id: 'a', day: 0, symbol: dv.symbol, side: 'buy' as const, qty: 10, price: 1000, fee: 0.001 }];
    expect(computePortfolio(trades, [], dv.day - 1, m.dividends).dividendIncome).toBe(0);
    expect(computePortfolio(trades, [], dv.day, m.dividends).dividendIncome).toBe(10 * dv.perShare);
    // 기준일 전에 팔면 못 받음
    const sold = [...trades, { player_id: 'a', day: dv.day, symbol: dv.symbol, side: 'sell' as const, qty: 10, price: 1000, fee: 0.001 }];
    expect(computePortfolio(sold, [], dv.day, m.dividends).dividendIncome).toBe(0);
  });
});

describe('지정가 주문', () => {
  const m = generateMarket(SEED, 20);
  it('가격 범위·현금·보유 수량을 검증한다', () => {
    const d = game();
    const open = m.bars.NEOT[3].open;
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, limit: open + 100 }))).toMatch(/낮고/);
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, limit: open * 0.5 }))).toMatch(/30%/);
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'sell', qty: 1, limit: open * 1.1 }))).toMatch(/수량/);
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 9999, limit: open * 0.9 }))).toMatch(/현금/);
    const o = validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, limit: open * 0.95 });
    expect(o.status).toBe('open');
  });
  it('장중 가격이 닿으면 예약 가격에 체결, 아니면 만료', () => {
    const d = game();
    // 장중 5초 칸 기준 (시계가 없는 방은 3분 = 36칸으로 계산)
    const low = Math.min(...dayTicks(m, 'NEOT', 3, 36).slice(1));
    d.orders.push({ id: 'o1', player_id: 'a', day: 3, symbol: 'NEOT', side: 'buy', qty: 1, limit_price: low, fee: 0.001, status: 'open' });
    d.orders.push({ id: 'o2', player_id: 'a', day: 3, symbol: 'NEOT', side: 'buy', qty: 1, limit_price: Math.round(low * 0.9), fee: 0.001, status: 'open' });
    const r = resolveOrders(d, 3, 36, true);
    expect(r.find((x) => x.id === 'o1')!.status).toBe('filled');
    expect(r.find((x) => x.id === 'o1')!.trade!.price).toBe(low);
    expect(r.find((x) => x.id === 'o2')!.status).toBe('expired');
  });
  it('상대 주문과 장중 가격 흐름은 화면 데이터에 없다', () => {
    const d = game();
    d.players.push({ id: 'b', room_id: 'r', nickname: 'B', mode: 'pro', ready: true, ended_day: -1, created_at: '2', version: 0 });
    d.orders.push({ id: 'ob', player_id: 'b', day: 3, symbol: 'CORE', side: 'buy', qty: 1, limit_price: 1, fee: 0.001, status: 'open' });
    const v = buildView(d, 'a', now);
    expect(v.myOrders.length).toBe(0);
    expect(Object.values(v.market!.bars).every((bars) => bars.every((b) => b.path.length === 0))).toBe(true);
  });
});

describe('업적', () => {
  it('오래 보유하면 다이아몬드 핸드, 승리하면 투자왕', () => {
    const m = generateMarket(SEED, 10);
    const res = computeAchievements({
      market: m,
      seed: SEED,
      items: [],
      players: [
        { id: 'a', trades: [{ player_id: 'a', day: 0, symbol: 'KIDX', side: 'buy', qty: 100, price: m.bars.KIDX[0].open, fee: 0.001 }], spends: [], filledOrders: 0 },
        { id: 'b', trades: [], spends: [], filledOrders: 0 },
      ],
    });
    expect(res.a).toContain('diamond');
    const aWins = res.a.includes('winner');
    expect(aWins || res.b.includes('winner')).toBe(true);
  });
  it("'시장을 이긴 자'는 한 번이라도 거래해야 받음 (현금만 들고 시장이 내린 판에서 거저 받지 않게)", () => {
    // 지수가 떨어진 시장을 찾음 → 현금만 든 사람(0%)이 지수보다 높은 경우
    let seed = SEED;
    let m = generateMarket(seed, 10);
    for (let i = 1; i < 200 && m.index[9].close >= m.index[0].open; i++) m = generateMarket((seed = SEED + i), 10);
    expect(m.index[9].close).toBeLessThan(m.index[0].open);
    const res = computeAchievements({
      market: m,
      seed,
      items: [],
      players: [{ id: 'cash', trades: [], spends: [], filledOrders: 0 }],
    });
    expect(res.cash ?? []).not.toContain('beat_market');
  });
  it('새 업적: 첫 거래·ETF 입문·몰빵, 고수봇이 있는 판에서 1위면 고수봇 사냥꾼 (2026-11-17)', () => {
    const m = generateMarket(SEED, 10);
    const buy = (id: string, sym: string, qty: number) => ({ player_id: id, day: 0, symbol: sym, side: 'buy' as const, qty, price: m.bars[sym][0].open, fee: 0.001 });
    const qty = Math.floor((startCashFor(m.version) * 0.9) / m.bars.KIDX[0].open);
    const res = computeAchievements({
      market: m,
      seed: SEED,
      items: [],
      players: [
        { id: 'me', trades: [buy('me', 'KIDX', qty)], spends: [], filledOrders: 0 },
        { id: 'bot', trades: [], spends: [], filledOrders: 0, bot: 3 },
      ],
    });
    expect(res.me).toEqual(expect.arrayContaining(['first_trade', 'etf_fan', 'all_in']));
    expect(res.bot ?? []).not.toContain('first_trade');
    // 1위였다면 고수봇 사냥꾼도
    if (res.me.includes('winner')) expect(res.me).toContain('bot_slayer');
    else expect(res.me).not.toContain('bot_slayer');
  });
  it('업적 id 는 겹치지 않고, 귀한 것부터 순서대로 (칭호는 가장 앞의 것)', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const r = BADGES.map((b) => b.rarity);
    expect([...r].sort((a, b) => b - a)).toEqual(r);
    expect(BADGES.length).toBeGreaterThanOrEqual(35);
  });
});
