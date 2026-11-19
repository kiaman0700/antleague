/**
 * 증강(augment) 값 재기: 게임 봇끼리 판을 돌려 수수료·배당·현금·하루 손익·오래 든 종목 이익·거래 수·레버리지·1·2위 차이를 잰다.
 *   node sim/buildcap.mjs sim/levers.ts && node sim/.out/levers.mjs [판 수=300] [days=10]
 *   레버리지 제한 비교: SIM_CAP=0.6 node sim/.out/levers.mjs ... (LEV=1 이면 레버리지 실험만)
 * 모든 금액은 시작 돈 대비 % (판마다·사람마다).
 */
import { dayClock, nextRoomState, CURRENT_RULES_VERSION, finalResults, marketFor, portfolioOf, type GameData, LEVERAGE_CAP } from '../src/engine/engine.js';
import { BOT_TIMES, runBots, STRATEGY, type BotCtx } from '../src/engine/bots.js';
import { computePortfolio, equityWith, startCashFor, type Trade } from '../src/game/portfolio.js';
import { spendsFromRows } from '../src/game/items.js';
import { STOCKS } from '../src/game/stocks.js';

const N = Number(process.argv[2] ?? 300);
const DAYS = Number(process.argv[3] ?? 10);
const T0 = 1_900_000_000_000;
const START = startCashFor(CURRENT_RULES_VERSION);

interface PStat {
  level: number;
  fee: number;
  div: number;
  cashClose: number; // 하루 마감 현금 평균
  cashMin: number; // 하루 중 가장 적은 현금 평균 (장중 칸마다 본 것)
  cashAvg: number; // 장중 칸 평균 현금
  daily: number[]; // 하루 수익률
  refund3: number; // 3% 넘는 하루 손실 합 (원) — 환급 100% 일 때
  refund5: number;
  hold3Gain: number; // 끝날 때 3일+ 연속 든 종목 평가이익 (+만)
  hold3Any: boolean;
  hold3RealGain: number; // 3일+ 들다 판 것의 실현이익 (+만)
  trades: number;
  levShare: number; // 산 금액 중 레버리지 비율
  eq: number;
}

function newGame(seed: number, levels: number[]): GameData {
  const dl = T0 + 63_000;
  return {
    room: { id: 'r' + seed, code: 'SIM000', seed, salt: ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(4), status: 'playing', total_days: DAYS, turn_seconds: 60, day: 0, deadline: dl, day_deadline: dl, host_id: 'h', version: CURRENT_RULES_VERSION },
    players: [
      { id: 'h', room_id: 'r', nickname: 'h', mode: 'pro', ready: true, ended_day: -1, created_at: '0', version: 0, left_game: false },
      ...levels.map((lv, i) => ({ id: 'P' + i, room_id: 'r', nickname: 'P' + i, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i + 1), version: 0, bot_level: lv })),
    ],
    trades: [],
    items: [],
    orders: [],
  };
}

function play(seed: number, levels: number[]): PStat[] {
  const d = newGame(seed, levels);
  const ids = levels.map((_, i) => 'P' + i);
  const cashSamples: Record<string, number[][]> = Object.fromEntries(ids.map((id) => [id, Array.from({ length: DAYS }, () => [] as number[])]));
  for (let day = 0; day < DAYS; day++) {
    const clk = dayClock(d.room, T0);
    const at = (t: number) => clk.startAt + t * clk.tickMs + 1;
    for (let t = 0; t <= 58; t += 2) {
      const run = runBots(d, at(t), { salt: d.room.salt });
      d.trades.push(...run.trades);
      d.items.push(...run.items);
      d.players = d.players.map((p) => (run.steps[p.id] !== undefined ? { ...p, bot_step: run.steps[p.id] } : p));
      for (const id of ids) cashSamples[id][day].push(portfolioOf(d, id).cash);
    }
    d.players[0].ended_day = day;
    const next = nextRoomState(d, clk.endAt + 1)!;
    d.room = { ...d.room, ...next };
    if (d.room.status === 'finished') break;
    const nd = clk.endAt + 1 + 64_000;
    d.room = { ...d.room, deadline: nd, day_deadline: nd };
  }
  const m = marketFor(d.room.seed, DAYS, CURRENT_RULES_VERSION, d.room.salt);
  const close = (k: number) => Object.fromEntries(STOCKS.map((s) => [s.symbol, m.bars[s.symbol][k].close]));
  const f = finalResults(d).results;
  return ids.map((id, i) => {
    const tr: Trade[] = d.trades.filter((t) => t.player_id === id);
    const spends = spendsFromRows(d.items.filter((r) => r.player_id === id));
    const eq: number[] = [START];
    const cashC: number[] = [];
    const streak: Record<string, number> = {};
    for (let k = 0; k < DAYS; k++) {
      const pf = computePortfolio(tr, spends, k, m.dividends, START);
      eq.push(equityWith(pf, close(k)));
      cashC.push(pf.cash);
      for (const s of Object.keys(streak)) if (!pf.holdings[s]) delete streak[s];
      for (const s of Object.keys(pf.holdings)) streak[s] = (streak[s] ?? 0) + 1;
    }
    const fin = computePortfolio(tr, spends, Infinity, m.dividends, START);
    const cl = close(DAYS - 1);
    let hold3Gain = 0;
    let hold3Any = false;
    for (const [s, h] of Object.entries(fin.holdings)) {
      if ((streak[s] ?? 0) >= 3) {
        hold3Any = true;
        hold3Gain += Math.max(0, h.qty * cl[s] - h.avgCost * h.qty);
      }
    }
    // 3일+ 들다 판 것의 실현이익: 날마다 마감 보유를 보고, 사라진 날 그 전 연속 일수 ≥3 이면 그날 판 이익을 셈
    let hold3RealGain = 0;
    {
      const st: Record<string, number> = {};
      let prev: Record<string, boolean> = {};
      for (let k = 0; k < DAYS; k++) {
        const pf = computePortfolio(tr, spends, k, m.dividends, START);
        for (const s of Object.keys(prev)) {
          if (!pf.holdings[s] && (st[s] ?? 0) >= 3) {
            for (const c of pf.closed) if (c.symbol === s && c.day === k) hold3RealGain += Math.max(0, c.pnl);
          }
          if (!pf.holdings[s]) delete st[s];
        }
        for (const s of Object.keys(pf.holdings)) st[s] = (st[s] ?? 0) + 1;
        prev = Object.fromEntries(Object.keys(pf.holdings).map((s) => [s, true]));
      }
    }
    const daily: number[] = [];
    let refund3 = 0;
    let refund5 = 0;
    for (let k = 1; k <= DAYS; k++) {
      const r = eq[k] / eq[k - 1] - 1;
      daily.push(r);
      refund3 += Math.max(0, -r - 0.03) * eq[k - 1];
      refund5 += Math.max(0, -r - 0.05) * eq[k - 1];
    }
    const buys = tr.filter((t) => t.side === 'buy');
    const buyAmt = buys.reduce((a, t) => a + t.qty * t.price, 0);
    const levAmt = buys.filter((t) => ['KLEV', 'KINV', 'UTEC'].includes(t.symbol)).reduce((a, t) => a + t.qty * t.price, 0);
    const samples = cashSamples[id];
    return {
      level: levels[i],
      fee: tr.reduce((a, t) => a + t.qty * t.price * t.fee, 0),
      div: fin.dividendIncome,
      cashClose: avg(cashC),
      cashMin: avg(samples.filter((x) => x.length).map((x) => Math.min(...x))),
      cashAvg: avg(samples.filter((x) => x.length).map(avg)),
      daily,
      refund3,
      refund5,
      hold3Gain,
      hold3Any,
      hold3RealGain,
      trades: tr.length,
      levShare: buyAmt ? levAmt / buyAmt : 0,
      eq: f.find((r: { nickname: string }) => r.nickname === id)!.equity,
    };
  });
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const P = (x: number) => ((x / START) * 100).toFixed(2) + '%';

/** 승리 확률 변화: 한 사람에게 +b(원)를 더하면 1위 확률이 얼마나 오르나 (사람마다 다 해 보고 평균) */
function bonusDelta(games: number[][], b: number) {
  let base = 0, withB = 0, n = 0;
  for (const g of games) {
    for (let i = 0; i < g.length; i++) {
      const win = (arr: number[]) => {
        const mx = Math.max(...arr);
        const top = arr.filter((x) => x === mx).length;
        return arr[i] === mx ? 1 / top : 0;
      };
      base += win(g);
      withB += win(g.map((x, j) => (j === i ? x + b : x)));
      n++;
    }
  }
  return { base: base / n, withB: withB / n };
}

/* ---------------- 레버리지 실험 봇: 보통 봇 + 아침에 레버리지 ETF 를 (제한까지) 삼, 장 끝 정리에서 같이 팖 ---------------- */
function levOverlay(base: (c: BotCtx) => void, mode: 'news' | 'always') {
  return (c: BotCtx) => {
    if (c.tick === 0 && !c.isLast && !c.view.effectsToday.includes('freeze')) {
      let sym: string | null = mode === 'always' ? 'KLEV' : null;
      if (mode === 'news') {
        let kr = 0, us = 0;
        for (const n of c.market.news.filter((x) => x.day === c.day && x.kind === 'macro')) {
          const v = n.tone === 'good' ? 1 : -1;
          if (n.macro === 'kr') kr += v;
          if (n.macro === 'us') us += v;
        }
        sym = kr > 0 ? 'KLEV' : kr < 0 ? 'KINV' : us > 0 ? 'UTEC' : null;
      }
      if (sym) {
        let eq = c.cash();
        for (const [s, h] of Object.entries(c.holdings())) eq += h.qty * c.price(s);
        c.buyCash(sym, eq * LEVERAGE_CAP * 0.97);
      }
    }
    base(c);
  };
}

// 보유형(사람 같은 장기 보유) 기준: 7 = 첫날 아무 종목 3개 사서 끝까지, 6 = 첫날 지수 ETF 사서 끝까지
STRATEGY[7] = (c) => {
  if (c.day === 0 && c.tick === 0) for (const sym of ['CORE', 'NEOT', 'DAEH']) c.buyCash(sym, c.cash() * 0.32);
};
STRATEGY[6] = (c) => {
  if (c.day === 0 && c.tick === 0) c.buyCash('KIDX', c.cash() * 0.98);
};
BOT_TIMES[7] = BOT_TIMES[6] = 3;

if (process.env.LEV !== '1') {
  {
    // 배당 가능성: 판마다 배당 기준일·종목 수, 수익률 — 기준일에 그 종목을 들고 있으면 받는 비율
    let ev = 0, yl = 0, days = 0, best = 0;
    for (let s = 1; s <= N; s++) {
      const m = marketFor(s * 7919, DAYS, CURRENT_RULES_VERSION, ((s * 7919 * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(4));
      ev += m.dividends.length;
      yl += m.dividends.reduce((a, x) => a + x.yieldPct, 0);
      const byDay = new Map<number, number>();
      for (const x of m.dividends) byDay.set(x.day, Math.max(byDay.get(x.day) ?? 0, x.yieldPct));
      days += byDay.size;
      best += [...byDay.values()].reduce((a, b) => a + b, 0);
    }
    console.log(`배당: 판마다 기준일 ${(days / N).toFixed(2)}번 · 배당 종목 ${(ev / N).toFixed(1)}개 · 평균 배당률 ${(yl / Math.max(1, ev)).toFixed(2)}% · 기준일마다 가장 큰 배당 종목에 전 재산을 걸면 판당 ${(best / N).toFixed(2)}% (배당락으로 다음 날 시가가 그만큼 빠짐)`);
  }
  const configs: [string, number[]][] = [
    ['1대1 쉬움끼리', [1, 1]],
    ['1대1 보통끼리', [2, 2]],
    ['1대1 어려움끼리', [3, 3]],
    ['1대1 쉬움-보통', [1, 2]],
    ['1대1 보통-어려움', [2, 3]],
    ['4인 쉬움', [1, 1, 1, 1]],
    ['4인 보통', [2, 2, 2, 2]],
    ['4인 어려움', [3, 3, 3, 3]],
    ['4인 섞음(1,2,2,3)', [1, 2, 2, 3]],
    ['1대1 종목3개보유(7)-보통', [7, 2]],
    ['4인 지수보유(6)·종목보유(7)·보통·어려움', [6, 7, 2, 3]],
  ];
  const byLevel: Record<string, PStat[]> = {};
  for (const [name, lv] of configs) {
    const all: PStat[] = [];
    const finals: number[][] = [];
    for (let s = 1; s <= N; s++) {
      const r = play(s * 7919 + lv.length * 13 + lv.reduce((a, b) => a * 4 + b, 0) * 101, lv);
      all.push(...r);
      finals.push(r.map((x) => x.eq));
      if (lv.every((x) => x === lv[0])) (byLevel[`${lv.length === 2 ? '1대1' : '4인'} 난이도${lv[0]}`] ??= []).push(...r);
    }
    const gaps = finals.map((g) => {
      const s = [...g].sort((a, b) => b - a);
      return s[0] - s[1];
    });
    const fees = all.map((x) => x.fee), divs = all.map((x) => x.div);
    const daily = all.flatMap((x) => x.daily);
    console.log(`\n== ${name} (${N}판) ==`);
    console.log(`수수료 평균 ${P(avg(fees))} p90 ${P(pct(fees, 0.9))} | 배당 평균 ${P(avg(divs))} p90 ${P(pct(divs, 0.9))} (받은 사람 ${((all.filter((x) => x.div > 0).length / all.length) * 100).toFixed(0)}%)`);
    console.log(`현금: 마감 평균 ${P(avg(all.map((x) => x.cashClose)))} · 장중 평균 ${P(avg(all.map((x) => x.cashAvg)))} · 하루 최저 평균 ${P(avg(all.map((x) => x.cashMin)))}`);
    console.log(`하루 수익률: 평균 ${(avg(daily) * 100).toFixed(2)}% · p5 ${(pct(daily, 0.05) * 100).toFixed(2)}% · p10 ${(pct(daily, 0.1) * 100).toFixed(2)}% · p90 ${(pct(daily, 0.9) * 100).toFixed(2)}% · -3% 넘게 잃은 날 ${((daily.filter((r) => r < -0.03).length / daily.length) * 100).toFixed(1)}% · -5% 넘게 ${((daily.filter((r) => r < -0.05).length / daily.length) * 100).toFixed(1)}%`);
    console.log(`3% 넘는 손실 합(100% 환급 시) 평균 ${P(avg(all.map((x) => x.refund3)))} p90 ${P(pct(all.map((x) => x.refund3), 0.9))} | 5% 넘는 ${P(avg(all.map((x) => x.refund5)))} p90 ${P(pct(all.map((x) => x.refund5), 0.9))}`);
    console.log(`3일+ 든 종목: 끝 평가이익 평균 ${P(avg(all.map((x) => x.hold3Gain)))} p90 ${P(pct(all.map((x) => x.hold3Gain), 0.9))} (가진 사람 ${((all.filter((x) => x.hold3Any).length / all.length) * 100).toFixed(0)}%) · 들다 판 이익 평균 ${P(avg(all.map((x) => x.hold3RealGain)))}`);
    console.log(`거래 수: 판 평균 ${avg(all.map((x) => x.trades)).toFixed(1)} (하루 ${(avg(all.map((x) => x.trades)) / DAYS).toFixed(2)}) p90 ${pct(all.map((x) => x.trades), 0.9)} | 레버리지 산 비율 ${(avg(all.map((x) => x.levShare)) * 100).toFixed(1)}%`);
    console.log(`1·2위 차이: 평균 ${P(avg(gaps))} · 중앙 ${P(pct(gaps, 0.5))} · p25 ${P(pct(gaps, 0.25))} · 1% 안 ${((gaps.filter((g) => g < 0.01 * START).length / gaps.length) * 100).toFixed(0)}% · 3% 안 ${((gaps.filter((g) => g < 0.03 * START).length / gaps.length) * 100).toFixed(0)}% · 6% 안 ${((gaps.filter((g) => g < 0.06 * START).length / gaps.length) * 100).toFixed(0)}%`);
    for (const b of [0.01, 0.025, 0.03, 0.06]) {
      const r = bonusDelta(finals, b * START);
      console.log(`  +${(b * 100).toFixed(1)}% 보너스: 1위 확률 ${(r.base * 100).toFixed(1)}% → ${(r.withB * 100).toFixed(1)}% (+${((r.withB - r.base) * 100).toFixed(1)}%p)`);
    }
    if (lv.some((x) => x !== lv[0])) {
      const finalsLv = lv.map((L, i) => avg(finals.map((g) => g[i])));
      for (const L of [...new Set(lv)]) {
        const ps = all.filter((x) => x.level === L);
        console.log(`  [${L}] 수수료 ${P(avg(ps.map((x) => x.fee)))} · 배당 ${P(avg(ps.map((x) => x.div)))} p90 ${P(pct(ps.map((x) => x.div), 0.9))} · 마감 현금 ${P(avg(ps.map((x) => x.cashClose)))} · 장중 최저 ${P(avg(ps.map((x) => x.cashMin)))} · 3% 넘는 손실 ${P(avg(ps.map((x) => x.refund3)))} · 3일+ 평가이익 ${P(avg(ps.map((x) => x.hold3Gain)))} p90 ${P(pct(ps.map((x) => x.hold3Gain), 0.9))} · 거래 ${avg(ps.map((x) => x.trades)).toFixed(1)}`);
      }
      console.log(`  난이도별 평균 재산: ${lv.map((L, i) => `${L}:${P(finalsLv[i] - START)}`).join(' ')}`);
    }
  }
  console.log('\n== 난이도별(같은 난이도 판) 사람당 요약 ==');
  for (const [k, all] of Object.entries(byLevel)) {
    console.log(`${k}: 수수료 ${P(avg(all.map((x) => x.fee)))} · 배당 ${P(avg(all.map((x) => x.div)))} · 마감 현금 ${P(avg(all.map((x) => x.cashClose)))} · 장중 최저 현금 ${P(avg(all.map((x) => x.cashMin)))} · 최종 수익 ${P(avg(all.map((x) => x.eq)) - START)}`);
  }
} else {
  // 레버리지 실험: 9 = 보통+뉴스 따라 레버리지, 8 = 보통+매일 KLEV 몰빵(제한까지)
  STRATEGY[9] = levOverlay(STRATEGY[2], 'news');
  STRATEGY[8] = levOverlay(STRATEGY[2], 'always');
  BOT_TIMES[9] = BOT_TIMES[8] = BOT_TIMES[2];
  console.log(`레버리지 제한 ${LEVERAGE_CAP * 100}% · ${N}판`);
  for (const [name, lv] of [['1대1 뉴스레버 vs 보통', [9, 2]], ['1대1 매일레버 vs 보통', [8, 2]], ['4인 뉴스레버+보통3', [9, 2, 2, 2]], ['4인 매일레버+보통3', [8, 2, 2, 2]]] as [string, number[]][]) {
    let w = 0;
    const eqs: number[] = [];
    const lvShare: number[] = [];
    const dl: number[] = [];
    for (let s = 1; s <= N; s++) {
      const r = play(s * 7919 + 5, lv);
      const g = r.map((x) => x.eq);
      const mx = Math.max(...g);
      w += g[0] === mx ? 1 / g.filter((x) => x === mx).length : 0;
      eqs.push(g[0]);
      lvShare.push(r[0].levShare);
      dl.push(...r[0].daily);
    }
    const fair = 1 / lv.length;
    console.log(`${name}: 레버 봇 1위 ${((w / N) * 100).toFixed(1)}% (공평 ${(fair * 100).toFixed(0)}%) · 평균 수익 ${P(avg(eqs) - START)} · p10 ${P(pct(eqs, 0.1) - START)} · p90 ${P(pct(eqs, 0.9) - START)} · 산 금액 중 레버 ${(avg(lvShare) * 100).toFixed(0)}% · 하루 p5 ${(pct(dl, 0.05) * 100).toFixed(2)}%`);
  }
}
