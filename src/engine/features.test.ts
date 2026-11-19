import { startCashFor } from '../game/portfolio.js';
import { describe, expect, it } from 'vitest';
import { BADGES, computeAchievements, givesTitle, titleOf } from '../game/achievements.js';
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
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, limit: open + 100 }))).toMatch(/낮게/);
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'buy', qty: 1, limit: open * 0.5 }))).toMatch(/30%/);
    expect(err(() => validatePlaceOrder(d, 'a', now, { symbol: 'NEOT', side: 'sell', qty: 1, limit: open * 1.1 }))).toMatch(/가진 주식/);
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
  it('새 업적: 첫 거래·ETF 입문·몰빵, 고수봇이 있는 판에서 1위면 고수봇 사냥꾼', () => {
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
    // 웃픈 업적은 맨 뒤 묶음 (칭호로 저절로 고르지 않게), 그 앞은 귀한 순서
    const normal = BADGES.filter((b) => !b.funny);
    const r = normal.map((b) => b.rarity);
    expect([...r].sort((a, b) => b - a)).toEqual(r);
    expect(BADGES.findIndex((b) => b.funny)).toBe(normal.length);
    expect(BADGES.length).toBeGreaterThanOrEqual(50);
  });
  it('보상: 사진만 주는 업적은 칭호가 아님, 웃픈 업적은 대표 칭호로 저절로 안 고름', () => {
    expect(givesTitle('lv5')).toBe(false);
    expect(givesTitle('winner')).toBe(true);
    expect(givesTitle('big_loss')).toBe(true);
    expect(givesTitle('nope')).toBe(false);
    expect(titleOf(['lv5', 'big_loss', 'plus'])?.id).toBe('plus');
  });
});

describe('기권한 사람은 업적 없음 (현금만 들고 기권해 투자왕·존버의 미학을 받지 않게)', () => {
  it('기권한 사람은 재산이 더 많아도 투자왕이 아니고 업적을 하나도 못 받음, 남은 사람이 1위', () => {
    const m = generateMarket(SEED, 10);
    const px = m.bars.CORE[0].open;
    const res = computeAchievements({
      market: m,
      seed: SEED,
      items: [],
      players: [
        { id: 'quit', trades: [], spends: [], filledOrders: 0, left: true },
        // 남은 사람은 비싸게 사서 손해 (재산은 기권한 사람보다 적음)
        { id: 'stay', trades: [{ player_id: 'stay', day: 0, symbol: 'CORE', side: 'buy', qty: 3, price: px * 3, fee: 0.001 }], spends: [], filledOrders: 0 },
      ],
    });
    expect(res.quit).toEqual([]);
    expect(res.stay).toContain('winner');
  });
});

describe('웃픈 업적 (design/achievements-v2.md)', () => {
  const m = generateMarket(SEED, 10);
  const start = startCashFor(m.version);
  const T = (id: string, day: number, symbol: string, side: 'buy' | 'sell', qty: number, price: number, at = '') => ({ player_id: id, day, symbol, side, qty, price, fee: 0.001, created_at: at || String(day).padStart(3, '0') });
  const run = (players: { id: string; trades: ReturnType<typeof T>[] }[]) =>
    computeAchievements({ market: m, seed: SEED, items: [], players: players.map((p) => ({ ...p, spends: [], filledOrders: 0 })) });

  it('깡통 계좌: −20% 아래, 바닥 체험: 3명 이상 꼴찌', () => {
    const px = m.bars.CORE[0].open;
    const qty = Math.floor((start * 0.9) / (px * 3));
    // 실제 값의 3배에 사서 큰 손해
    const res = run([
      { id: 'a', trades: [T('a', 0, 'CORE', 'buy', qty, px * 3)] },
      { id: 'b', trades: [] },
      { id: 'c', trades: [] },
    ]);
    expect(res.a).toEqual(expect.arrayContaining(['big_loss', 'last_place']));
    expect(res.b).not.toContain('last_place');
    // 2명 판 꼴찌는 아님
    expect(run([{ id: 'a', trades: [T('a', 0, 'CORE', 'buy', qty, px * 3)] }, { id: 'b', trades: [] }]).a).not.toContain('last_place');
  });
  it('꼭지에서 산 개미: 게임 중 최고가 근처에서 매수 (최저가 근처는 아님)', () => {
    const hi = Math.max(...m.bars.CORE.map((b) => b.high));
    const lo = Math.min(...m.bars.CORE.map((b) => b.low));
    expect(run([{ id: 'a', trades: [T('a', 0, 'CORE', 'buy', 1, hi)] }]).a).toContain('buy_high');
    expect(run([{ id: 'a', trades: [T('a', 0, 'CORE', 'buy', 1, lo)] }]).a).not.toContain('buy_high');
  });
  it('팔고 나니 급등: 판 뒤 종가가 판 값보다 15% 넘게', () => {
    const p0 = m.bars.CORE[0].open;
    const later = Math.max(...m.bars.CORE.slice(2).map((b) => b.close));
    const res = run([{ id: 'a', trades: [T('a', 0, 'CORE', 'buy', 1, p0), T('a', 1, 'CORE', 'sell', 1, later / 1.2)] }]);
    expect(res.a).toContain('paper_hands');
    const res2 = run([{ id: 'a', trades: [T('a', 0, 'CORE', 'buy', 1, p0), T('a', 1, 'CORE', 'sell', 1, later * 2)] }]);
    expect(res2.a).not.toContain('paper_hands');
  });
  it('수수료 기부왕: 거래 30번 넘게 + 마이너스', () => {
    const px = m.bars.CORE[0].open;
    const trades = Array.from({ length: 32 }, (_, i) => T('a', 0, 'CORE', i % 2 ? 'sell' : 'buy', 1, i % 2 ? px * 0.9 : px, String(i).padStart(3, '0')));
    expect(run([{ id: 'a', trades }]).a).toContain('fee_donor');
    expect(run([{ id: 'a', trades: trades.slice(0, 10) }]).a).not.toContain('fee_donor');
  });
  it('레버리지의 쓴맛: 레버리지 ETF를 10% 넘게 손해 보고 팖', () => {
    const px = m.bars.KLEV[0].open;
    expect(run([{ id: 'a', trades: [T('a', 0, 'KLEV', 'buy', 1, px), T('a', 1, 'KLEV', 'sell', 1, px * 0.8)] }]).a).toContain('lev_burn');
    expect(run([{ id: 'a', trades: [T('a', 0, 'KIDX', 'buy', 1, px), T('a', 1, 'KIDX', 'sell', 1, px * 0.8)] }]).a).not.toContain('lev_burn');
  });
  it('찌라시에 속은 개미: 거짓 호재 찌라시 날 사서 손해', () => {
    // 거짓 호재 찌라시가 있는 시장 찾기
    let seed = SEED;
    let mm = generateMarket(seed, 10);
    const fake = () => mm.news.find((n) => n.rumor && n.symbol && n.tone === 'good' && n.realTone === 'bad');
    for (let i = 1; i < 300 && !fake(); i++) mm = generateMarket((seed = SEED + i), 10);
    const n = fake()!;
    expect(n).toBeTruthy();
    const px = mm.bars[n.symbol!][n.day].open;
    const r = computeAchievements({ market: mm, seed, items: [], players: [{ id: 'a', trades: [T('a', n.day, n.symbol!, 'buy', 1, px * 5)], spends: [], filledOrders: 0 }] });
    expect(r.a).toContain('fooled');
    const r2 = computeAchievements({ market: mm, seed, items: [], players: [{ id: 'a', trades: [T('a', n.day, n.symbol!, 'buy', 1, px * 0.01)], spends: [], filledOrders: 0 }] });
    expect(r2.a).not.toContain('fooled');
  });
});
