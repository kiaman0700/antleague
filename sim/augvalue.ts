/**
 * 증강(v27) 하나가 실제로 얼마를 주는지 재기.
 *   node sim/buildaug.mjs && node sim/.out/augvalue.mjs [판 수=1000] [--workers=6]
 * 같은 시장(같은 salt)에서 두 판을 돌림:
 *   - 기준 판: 4명 모두 효과 없는 정보 증강만 (봇은 정보 증강을 안 씀)
 *   - 실험 판: 자리마다 증강 하나를 정한 차례에 억지로 줌 (나머지 차례는 기준 판과 같은 정보 증강)
 * 봇(보통 2·어려움 2)은 정해진 난수로 움직이므로 두 판의 재산 차이 = 그 증강의 효과 (돈 + 돈 때문에 바뀐 거래 + 수수료·한도·늦잠 같은 행동 효과).
 * SIM_HOLD=1 이면 봇이 날마다 다 팔지 않고 들고 넘어감 (들고 있어야 나오는 증강 확인용).
 * 목표: 실버 ≈ 1.2만 · 골드 ≈ 3만 · 프리즘 ≈ 6만 (10일 판, 시작 100만원)
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dayClock, CURRENT_RULES_VERSION, finalResults, marketFor, type GameData } from '../src/engine/engine.js';
import { runBots, STRATEGY } from '../src/engine/bots.js';
import { deriveAugs } from '../src/engine/augs.js';
import { augIncomeAll, AUG_CAP } from '../src/engine/augEffects.js';
import { AUGMENTS, AUG_MAP, augmentDays, stageOf, type AugTier } from '../src/game/augments.js';
import { NEUTRAL } from './patched/augforce.js';

const DAYS = 10;
// 게임 봇은 날마다 장 마감 때 거의 다 현금으로 바꿈 → 오래 들고 있어야 나오는 증강(존버·배당·물타기·분산·업종 II)은 0 이 됨.
// SIM_HOLD=1 이면 봇이 마감 때 팔지 않고 들고 넘어가게(낮처럼 판단) 바꿔 '들고 가는 사람' 기준으로도 잼
if (process.env.SIM_HOLD === '1') {
  for (const lv of [2, 3]) {
    const orig = STRATEGY[lv];
    STRATEGY[lv] = (c) => {
      c.isLast = false;
      orig(c);
    };
  }
}
const LEVELS = [2, 3, 2, 3];
const T0 = 1_900_000_000_000;
const SLOTS = augmentDays(DAYS); // [0, 3, 6]
const TARGET: Record<AugTier, number> = { silver: 12_000, gold: 30_000, prism: 60_000 };

/** 이 증강을 줄 수 있는 차례 (차례·남은 날 조건만 — 업종 조건은 판에서 확인) */
function slotsFor(id: string): number[] {
  const a = AUG_MAP[id];
  return SLOTS.map((day, n) => ({ day, n })).filter(({ day, n }) => a.when.includes(stageOf(n, SLOTS.length)) && !(a.needDays && DAYS - day < a.needDays) && !(a.family === 'tierShift' && n >= SLOTS.length - 1)).map((x) => x.n);
}
const COMBOS: { aug: string; n: number }[] = AUGMENTS.flatMap((a) => slotsFor(a.id).map((n) => ({ aug: a.id, n })));

interface Rec {
  aug: string;
  n: number;
  level: number;
  applied: boolean;
  income: number;
  capHit: boolean;
  eqT: number;
  eqB: number;
  rankT: number;
  rankB: number;
}

type Plan = Record<string, Record<number, string>>; // seat → 차례 → 증강

function play(seed: number, tag: string, plan: Plan) {
  const salt = ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(4);
  (globalThis as { __AUGFORCE?: unknown }).__AUGFORCE = (c: { seat: string; n: number }) => plan[c.seat]?.[c.n] ?? null;
  const dl = T0 + 63_000;
  const d: GameData = {
    room: { id: `r${seed}${tag}`, code: 'SIM000', seed, salt, status: 'playing', total_days: DAYS, turn_seconds: 60, day: 0, deadline: dl, day_deadline: dl, host_id: 'P0', version: CURRENT_RULES_VERSION },
    players: LEVELS.map((lv, i) => ({ id: 'P' + i, room_id: 'r', nickname: 'P' + i, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i + 1), version: 0, bot_level: lv })),
    trades: [],
    items: [],
    orders: [],
    augs: [],
  };
  for (let day = 0; day < DAYS; day++) {
    const clk = dayClock(d.room, T0);
    const at = (t: number) => clk.startAt + t * clk.tickMs + 1;
    for (let t = 0; t <= 58; t += 2) {
      const run = runBots(d, at(t), { salt });
      d.trades.push(...run.trades);
      d.items.push(...run.items);
      d.augs!.push(...run.augs);
      d.players = d.players.map((p) => (run.steps[p.id] !== undefined ? { ...p, bot_step: run.steps[p.id] } : p));
    }
    const next = day + 1;
    if (next >= DAYS) {
      d.room = { ...d.room, day: DAYS, status: 'finished', deadline: null, day_deadline: null };
      break;
    }
    const nd = clk.endAt + 1 + 64_000;
    d.room = { ...d.room, day: next, deadline: nd, day_deadline: nd };
  }
  const st = deriveAugs(d);
  const m = marketFor(d.room.seed, DAYS, CURRENT_RULES_VERSION, salt);
  const inc = augIncomeAll(d, m, m.dividends, st);
  const res = finalResults(d).results as { nickname: string; equity: number; rank?: number }[];
  const eq: Record<string, number> = Object.fromEntries(res.map((r) => [r.nickname, r.equity]));
  const rank = (id: string) => 1 + res.filter((r) => r.equity > eq[id]).length;
  return { st, inc, eq, rank };
}

function runSeeds(jobs: [number, number][]): Rec[] {
  const out: Rec[] = [];
  for (const [idx, seed] of jobs) {
    const neutralPlan = (): Plan => Object.fromEntries(LEVELS.map((_, i) => ['P' + i, {}]));
    const base = play(seed, 'b', neutralPlan());
    const plan = neutralPlan();
    const want: { seat: string; aug: string; n: number; level: number }[] = [];
    LEVELS.forEach((lv, i) => {
      const c = COMBOS[(idx * 4 + i) % COMBOS.length];
      plan['P' + i][c.n] = c.aug;
      want.push({ seat: 'P' + i, aug: c.aug, n: c.n, level: lv });
    });
    const tr = play(seed, 't', plan);
    for (const w of want) {
      const picked = tr.st.players[w.seat]?.[w.n]?.picked;
      const applied = picked === w.aug;
      const income = (tr.inc[w.seat] ?? []).filter((x) => x.aug === w.aug).reduce((s, x) => s + x.amount, 0);
      const cap = AUG_CAP[w.aug];
      out.push({ aug: w.aug, n: w.n, level: w.level, applied, income, capHit: cap !== undefined && income >= cap - 1, eqT: tr.eq[w.seat], eqB: base.eq[w.seat], rankT: tr.rank(w.seat), rankB: base.rank(w.seat) });
    }
  }
  return out;
}

const NO_MONEY: Record<string, string> = {
  verdict1: '정보(봇 안 씀)', verdict3: '정보(봇 안 씀)', verdict6: '정보(봇 안 씀)', scout1: '정보(봇 안 씀)', scout3: '정보(봇 안 씀)', scout6: '정보(봇 안 씀)',
  paper1: '정보(봇 안 씀)', paper2: '정보(봇 안 씀)', analyst1: '정보(봇 안 씀)', analyst2: '정보(봇 안 씀)', timing: '쓰기 필요(봇 안 씀)', undo: '쓰기 필요(봇 안 씀)',
  eye: '다음 증강 등급↑(이 시뮬에선 없음)', lev: '한도 효과', sleepy: '거래 막힘', nofee: '수수료', orders: '예약',
};

if (isMainThread) {
  const N = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
  const W = Math.max(1, Number(process.argv.find((a) => a.startsWith('--workers='))?.split('=')[1] ?? Math.min(8, os.cpus().length - 1)));
  const seeds: [number, number][] = Array.from({ length: N }, (_, i) => [i, (i + 1) * 7919]);
  const t0 = Date.now();
  const file = fileURLToPath(import.meta.url);
  const parts = Array.from({ length: W }, (_, w) => seeds.filter((_, i) => i % W === w));
  const recs: Rec[] = (
    await Promise.all(
      parts.map(
        (p) =>
          new Promise<Rec[]>((res, rej) => {
            const wk = new Worker(file, { workerData: p });
            wk.on('message', res);
            wk.on('error', rej);
          }),
      ),
    )
  ).flat();
  console.log(`${process.env.SIM_HOLD === '1' ? '[들고 가는 봇] ' : '[게임 봇 그대로] '}판 ${N}×2 (기준·실험), 일꾼 ${W}, ${((Date.now() - t0) / 1000).toFixed(0)}초 · 실험 자리 ${recs.length}개 · 증강·차례 조합 ${COMBOS.length}개\n`);
  const man = (x: number) => (x / 10_000).toFixed(2).replace(/\.?0+$/, '') + '만';
  const sgn = (x: number) => (x >= 0 ? '+' : '') + man(x);
  for (const tier of ['silver', 'gold', 'prism'] as AugTier[]) {
    console.log(`── ${tier} (목표 ${man(TARGET[tier])}) ──`);
    console.log('id         이름              표본  적용%  평균 돈   상한%  재산 차이  1위 차이  판정');
    const rows = AUGMENTS.filter((a) => a.tier === tier).map((a) => {
      const all = recs.filter((r) => r.aug === a.id);
      const rs = all.filter((r) => r.applied);
      const k = rs.length || 1;
      const money = rs.reduce((s, r) => s + r.income, 0) / k;
      const cap = rs.filter((r) => r.capHit).length / k;
      const dEq = rs.reduce((s, r) => s + (r.eqT - r.eqB), 0) / k;
      const dWin = rs.reduce((s, r) => s + ((r.rankT === 1 ? 1 : 0) - (r.rankB === 1 ? 1 : 0)), 0) / k;
      const t = TARGET[tier];
      const value = NO_MONEY[a.id] && Math.abs(money) < 1 ? dEq : money;
      const verdict = !rs.length ? '표본 없음' : value < t * 0.7 ? '낮음' : value > t * 1.3 ? '높음' : '적당';
      return { a, n: rs.length, all: all.length, money, cap, dEq, dWin, verdict };
    });
    rows.sort((x, y) => y.money - x.money);
    for (const r of rows) {
      const note = NO_MONEY[r.a.id] && Math.abs(r.money) < 1 ? ` (${NO_MONEY[r.a.id]} — 재산 차이로 판정)` : '';
      console.log(
        `${r.a.id.padEnd(10)} ${r.a.name.padEnd(14)} ${String(r.n).padStart(4)} ${String(Math.round((r.n / (r.all || 1)) * 100)).padStart(5)}% ${man(r.money).padStart(8)} ${String(Math.round(r.cap * 100)).padStart(5)}%  ${sgn(r.dEq).padStart(9)}  ${((r.dWin >= 0 ? '+' : '') + Math.round(r.dWin * 100) + '%p').padStart(7)}  ${r.verdict}${note}`,
      );
    }
    console.log('');
  }
  // 차례별 (같은 증강이라도 언제 고르느냐)
  if (process.argv.includes('--by-slot')) {
    console.log('── 차례별 평균 돈 (0일·3일·6일) ──');
    for (const a of AUGMENTS) {
      const cells = SLOTS.map((_, n) => {
        const rs = recs.filter((r) => r.aug === a.id && r.n === n && r.applied);
        return rs.length ? `${man(rs.reduce((s, r) => s + r.income, 0) / rs.length)}(${rs.length})` : '-';
      });
      console.log(`${a.id.padEnd(10)} ${cells.join('  ')}`);
    }
  }
} else {
  parentPort!.postMessage(runSeeds(workerData as [number, number][]));
}
