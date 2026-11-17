/**
 * 봇 난이도 확인: 게임 봇(src/engine/bots.ts)끼리, 그리고 '보통 사람' 기준 봇(시뮬 news 봇)과 1대1.
 *   node sim/build.mjs sim/levels.ts && node sim/.out/levels.mjs [판 수]
 * 기준: 사람(news) 이 쉬움에겐 많이 이기고(≈75%), 보통과 비슷(≈50%), 어려움에겐 지는 편(≈30%)
 */
import { dayClock, nextRoomState, CURRENT_RULES_VERSION, finalResults, type GameData } from '../src/engine/engine.js';
import { BOT_TIMES, newsBot, runBots, STRATEGY } from '../src/engine/bots.js';

const N = Number(process.argv[2] ?? 120);
const T0 = 1_900_000_000_000;

function play(seed: number, a: number, b: number) {
  const dl = T0 + 63_000;
  const d: GameData = {
    room: { id: 'r' + seed, code: 'SIM000', seed, salt: (seed * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4), status: 'playing', total_days: 10, turn_seconds: 60, day: 0, deadline: dl, day_deadline: dl, host_id: 'h', version: CURRENT_RULES_VERSION },
    players: [
      { id: 'h', room_id: 'r', nickname: 'h', mode: 'pro', ready: true, ended_day: -1, created_at: '0', version: 0, left_game: true },
      { id: 'A', room_id: 'r', nickname: 'A', mode: 'pro', ready: true, ended_day: -1, created_at: '1', version: 0, bot_level: a },
      { id: 'B', room_id: 'r', nickname: 'B', mode: 'pro', ready: true, ended_day: -1, created_at: '2', version: 0, bot_level: b },
    ],
    trades: [],
    items: [],
    orders: [],
  };
  // 사람 자리 h 는 '나간' 것으로 두면 판이 바로 끝나므로, 마지막까지 사람처럼 둠
  d.players[0].left_game = false;
  for (let day = 0; day < 10; day++) {
    const clk = dayClock(d.room, T0);
    const at = (t: number) => clk.startAt + t * clk.tickMs + 1;
    for (let t = 0; t <= 58; t += 2) {
      const run = runBots(d, at(t), { salt: d.room.salt });
      d.trades.push(...run.trades);
      d.items.push(...run.items);
      d.players = d.players.map((p) => (run.steps[p.id] !== undefined ? { ...p, bot_step: run.steps[p.id] } : p));
    }
    d.players[0].ended_day = day;
    // 봇이 마감 안 했어도 하루 시간이 끝나면 넘어감
    const next = nextRoomState(d, clk.endAt + 1)!;
    d.room = { ...d.room, ...next };
    if (d.room.status === 'finished') break;
    const nd = clk.endAt + 1 + 64_000;
    d.room = { ...d.room, deadline: nd, day_deadline: nd };
  }
  const f = finalResults(d).results;
  const eq = (id: string) => f.find((r: { id?: string; nickname: string }) => r.nickname === id)!.equity;
  return [eq('A'), eq('B')];
}

const pairs: [number, number][] = [[1, 2], [2, 3], [1, 3], [2, 2]];
for (const [a, b] of pairs) {
  let wa = 0, ea = 0, eb = 0;
  for (let s = 1; s <= N; s++) {
    const [x, y] = play(s * 7919, a, b);
    if (x > y) wa++;
    else if (x === y) wa += 0.5;
    ea += x;
    eb += y;
  }
  console.log(`난이도 ${a} vs ${b}: ${a} 승률 ${((wa / N) * 100).toFixed(0)}% · 평균 재산 ${Math.round(ea / N).toLocaleString()} vs ${Math.round(eb / N).toLocaleString()}`);
}

// ---- 어려움 후보 실험: SIM_HARD=1 ----
if (process.env.SIM_HARD) {
  const base = { threshold: 0.9, maxPicks: 3, useFreeAttacks: true, feeAware: true, reserve: 0.2 };
  const nb = { news: { verdict: false, skipRecap: false, rumorW: 1 }, threshold: 0.9, maxPicks: 3, useInfo: true, buyInfo: [] as never[], useFreeAttacks: true, attack: [] as never[], buyDefense: [] as never[], feeAware: false, reserve: 0.2 };
  const cands: Record<string, Parameters<typeof newsBot>[0] & { times?: number }> = {
    'Q 현재 어려움': { ...nb, news: { ...nb.news, skipRecap: true }, times: 10, feeAware: true },
    'T Q+사건 찌라시': { ...nb, news: { ...nb.news, skipRecap: true }, times: 10, feeAware: true, storyHold: true },
    'U T+2종목': { ...nb, news: { ...nb.news, skipRecap: true }, times: 10, feeAware: true, storyHold: true, maxPicks: 2 },
  };
  for (const [name, o] of Object.entries(cands)) {
    STRATEGY[9] = newsBot(o);
    BOT_TIMES[9] = o.times ?? 3;
    let w = 0, e9 = 0;
    for (let s = 1; s <= N; s++) {
      const [x, y] = play(s * 7919, 9, 2);
      w += x > y ? 1 : x === y ? 0.5 : 0;
      e9 += x;
    }
    console.log(`${name} vs 보통: 승률 ${((w / N) * 100).toFixed(0)}% · 평균 ${Math.round(e9 / N).toLocaleString()}`);
  }
}

// ---- 초보 기준과 비교: SIM_BASE=1 ----
// 8: 첫날 지수 ETF 를 사서 끝까지 들고 있기 (가장 단순한 초보), 7: 아무 종목 3개를 사서 들고 있기
if (process.env.SIM_BASE) {
  STRATEGY[8] = (c) => {
    if (c.day === 0 && c.tick === 0) c.buyCash('KIDX', c.cash() * 0.98);
  };
  STRATEGY[7] = (c) => {
    if (c.day === 0 && c.tick === 0) for (const sym of ['CORE', 'NEOT', 'DAEH']) c.buyCash(sym, c.cash() * 0.32);
  };
  for (const [a, b, label] of [[8, 1, '지수 들고 있기 vs 쉬움'], [7, 1, '아무 종목 들고 있기 vs 쉬움'], [8, 2, '지수 들고 있기 vs 보통'], [8, 3, '지수 들고 있기 vs 어려움']] as const) {
    let w = 0, ea = 0;
    for (let s = 1; s <= N; s++) {
      const [x, y] = play(s * 7919, a, b);
      w += x > y ? 1 : x === y ? 0.5 : 0;
      ea += x;
    }
    console.log(`${label}: 승률 ${((w / N) * 100).toFixed(0)}% · 평균 ${Math.round(ea / N).toLocaleString()}`);
  }
}

// ---- 예전 시뮬의 가장 강한 전략(smart: 감별기·신문·애널리스트를 사서 씀)과 비교: SIM_SMART=1 ----
if (process.env.SIM_SMART) {
  STRATEGY[9] = newsBot({ news: { verdict: true, skipRecap: true, rumorW: 0.4 }, threshold: 0.9, maxPicks: 3, useInfo: true, buyInfo: ['detector', 'paper', 'analyst'], useFreeAttacks: false, attack: [], buyDefense: [], feeAware: true, reserve: 0.2 });
  BOT_TIMES[9] = 6;
  for (const lv of [2, 3]) {
    let w = 0;
    for (let s = 1; s <= N; s++) {
      const [x, y] = play(s * 7919, 9, lv);
      w += x > y ? 1 : x === y ? 0.5 : 0;
    }
    console.log(`smart 전략 vs 난이도 ${lv}: smart 승률 ${((w / N) * 100).toFixed(0)}%`);
  }
}
