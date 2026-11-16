/**
 * 주식 대결 밸런스 시뮬레이션.
 *   npx esbuild sim/run.ts --bundle --platform=node --format=esm --outfile=sim/.out/run.mjs && node sim/.out/run.mjs [실험...] [--n=배수]
 * 실험: news, duel, multi, cards, gang, length (기본: 전부)
 * src/ 는 고치지 않고, 실제 엔진을 그대로 돌린다.
 */
import { marketFor } from '../src/engine/engine.js';
import { SIM_V } from './version.js';
import { ITEM_MAP, itemCost, type ItemKind } from '../src/game/items.js';
import { startCashFor } from '../src/game/portfolio.js';
const START0 = startCashFor(SIM_V);
import { dayTicks, releaseTick } from '../src/game/intraday.js';
import { COMPANIES } from '../src/game/stocks.js';
import { ARCHETYPES, newsBot } from './bots.js';
import { N_TICKS, playGame, type Bot, type GameLog } from './harness.js';

const args = process.argv.slice(2);
const scale = Number(args.find((a) => a.startsWith('--n='))?.slice(4) ?? 1);
const want = args.filter((a) => !a.startsWith('--'));
const run = (k: string) => want.length === 0 || want.includes(k);
const N = (x: number) => Math.max(10, Math.round(x * scale));

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const man = (x: number) => (x / 10_000).toFixed(1) + '만';
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const quant = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const se = (p: number, n: number) => Math.sqrt((p * (1 - p)) / n);
const table = (head: string[], rows: (string | number)[][]) => {
  console.log('| ' + head.join(' | ') + ' |');
  console.log('|' + head.map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
  console.log();
};
const SEED0 = 424242;

/* ===================== 1. 뉴스 신호 세기 ===================== */
if (run('news')) {
  console.log('## 뉴스 신호 (시장만 분석, 20일 × ' + N(600) + '판)\n');
  type Acc = { n: number; hit: number; intra: number[]; gap: number[] };
  const acc: Record<string, Acc> = {};
  const A = (k: string) => (acc[k] ??= { n: 0, hit: 0, intra: [], gap: [] });
  let shownCompany = 0;
  let falseCompany = 0;
  let daysWithFake = 0;
  let totalDays = 0;
  const kidx: number[] = [];
  const klev: number[] = [];
  const kidxGame: number[] = [];
  const klevGame: number[] = [];
  const bestStockDay: number[] = [];
  for (let g = 0; g < N(600); g++) {
    const seed = SEED0 + g;
    const m = marketFor(seed, 20, SIM_V);
    kidxGame.push(m.bars.KIDX[19].close / m.bars.KIDX[0].open - 1);
    klevGame.push(m.bars.KLEV[19].close / m.bars.KLEV[0].open - 1);
    for (let day = 0; day < 20; day++) {
      totalDays++;
      kidx.push(m.bars.KIDX[day].close / m.bars.KIDX[day].open - 1);
      klev.push(m.bars.KLEV[day].close / m.bars.KLEV[day].open - 1);
      bestStockDay.push(Math.max(...COMPANIES.map((c) => m.bars[c.symbol][day].close / m.bars[c.symbol][day].open - 1)));
      const today = m.news.filter((n) => n.day === day);
      if (today.some((n) => n.fake)) daysWithFake++;
      for (const n of today) {
        const sign = n.tone === 'good' ? 1 : -1;
        let key: string;
        if (n.label === '시황' || n.label === '특징주') key = `정리기사(${n.label})`;
        else if (n.fake) key = '표시 없는 가짜 기사';
        else if (n.rumor) key = `[루머] ${n.kind === 'company' ? '기업' : '업종'} (헤드라인 기준)`;
        else if (n.kind === 'company') key = n.at != null ? '기업 장중 속보' : '기업 아침 뉴스';
        else if (n.kind === 'sector') key = '업종 뉴스';
        else key = `거시 ${n.macro}`;
        if (n.kind === 'company') {
          shownCompany++;
          if (n.fake || (n.rumor && n.tone !== n.realTone)) falseCompany++;
        }
        let syms: string[] = [];
        if (n.kind === 'company' && n.symbol) syms = [n.symbol];
        else if (n.kind === 'sector' && n.sector) syms = COMPANIES.filter((c) => c.sector === n.sector).map((c) => c.symbol);
        else if (n.macro === 'kr' || n.macro === 'us') syms = ['KIDX'];
        if (!syms.length) continue;
        let from = 0;
        if (n.at != null) from = releaseTick(n.at, N_TICKS);
        const intra = mean(syms.map((s) => dayTicks(m, s, day, N_TICKS)[N_TICKS] / dayTicks(m, s, day, N_TICKS)[from] - 1)) * sign;
        const prev = (s: string) => (day === 0 ? m.base[s] : m.bars[s][day - 1].close);
        const gap = mean(syms.map((s) => m.bars[s][day].open / prev(s) - 1)) * sign;
        const a = A(key);
        a.n++;
        if (intra > 0) a.hit++;
        a.intra.push(intra);
        a.gap.push(gap);
      }
    }
  }
  table(
    ['뉴스 종류', '건수/판', '방향 적중(시가→종가)', '평균 수익(방향대로 샀을 때, 시가/속보→종가)', '평균 갭(전일종가→시가)'],
    Object.entries(acc)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, a]) => [k, (a.n / N(600)).toFixed(1), pct(a.hit / a.n), pct(mean(a.intra)), pct(mean(a.gap))]),
  );
  console.log(`- 화면에 보이는 기업 기사 중 거짓(표시 없는 가짜 + 틀린 루머): ${pct(falseCompany / shownCompany)}, 표시 없는 가짜가 있는 날: ${pct(daysWithFake / totalDays)}`);
  console.log(`- KIDX 하루(시가→종가) 평균 ${pct(mean(kidx))}, KLEV ${pct(mean(klev))}; 한 판(20일) KIDX 평균 ${pct(mean(kidxGame))} (10%~90%: ${pct(quant(kidxGame, 0.1))}~${pct(quant(kidxGame, 0.9))}), KLEV 평균 ${pct(mean(klevGame))} (${pct(quant(klevGame, 0.1))}~${pct(quant(klevGame, 0.9))})`);
  console.log(`- 하루 최고 상승 종목(시가→종가) 평균 ${pct(mean(bestStockDay))}\n`);
}

/* ===================== 공통 ===================== */
function summarize(games: GameLog[]) {
  const by: Record<string, { win: number; games: number; ret: number[] }> = {};
  for (const g of games)
    g.ids.forEach((id, i) => {
      const b = (by[g.bots[i]] ??= { win: 0, games: 0, ret: [] });
      b.games++;
      b.win += g.winShare[id];
      b.ret.push(g.final[id] / START0 - 1);
    });
  return by;
}

/* ===================== 2. 1대1 상성표 ===================== */
const names = Object.keys(ARCHETYPES);
if (run('duel')) {
  const n = N(150);
  console.log(`## 1대1 (20일, 조합마다 ${n}판) — 행 봇의 승률\n`);
  const wr: Record<string, Record<string, number>> = {};
  const all: GameLog[] = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      let w = 0;
      for (let s = 0; s < n; s++) {
        // 자리 바꿔가며
        const swap = s % 2 === 1;
        const bots = swap ? [ARCHETYPES[names[j]](), ARCHETYPES[names[i]]()] : [ARCHETYPES[names[i]](), ARCHETYPES[names[j]]()];
        const g = playGame(SEED0 + 1000 + s, 20, bots);
        all.push(g);
        w += g.winShare[swap ? 'p1' : 'p0'];
      }
      (wr[names[i]] ??= {})[names[j]] = w / n;
      (wr[names[j]] ??= {})[names[i]] = 1 - w / n;
    }
  table(
    ['', ...names, '평균'],
    names.map((a) => [a, ...names.map((b) => (a === b ? '-' : pct(wr[a][b]))), pct(mean(names.filter((b) => b !== a).map((b) => wr[a][b])))]),
  );
  const s = summarize(all);
  table(
    ['봇', '평균 수익률', '중앙값', '10%', '90%'],
    names.map((k) => [k, pct(mean(s[k].ret)), pct(quant(s[k].ret, 0.5)), pct(quant(s[k].ret, 0.1)), pct(quant(s[k].ret, 0.9))]),
  );
}

/* ===================== 3. 여러 명 ===================== */
if (run('multi')) {
  for (const P of [3, 4, 6]) {
    const n = N(P === 4 ? 500 : 250);
    const games: GameLog[] = [];
    for (let s = 0; s < n; s++) {
      const r = mulberry(SEED0 + 77 + s);
      const pick = [...names].sort(() => r() - 0.5).slice(0, P);
      while (pick.length < P) pick.push(names[Math.floor(r() * names.length)]);
      games.push(playGame(SEED0 + 5000 + s, 20, pick.map((k) => ARCHETYPES[k]())));
    }
    const s = summarize(games);
    console.log(`## ${P}인 (20일, 무작위 조합 ${n}판) — 기대 승률 ${pct(1 / P)}\n`);
    table(
      ['봇', '판 수', '승률', '평균 수익률', '10%~90%'],
      names.filter((k) => s[k]).map((k) => [k, s[k].games, pct(s[k].win / s[k].games), pct(mean(s[k].ret)), `${pct(quant(s[k].ret, 0.1))} ~ ${pct(quant(s[k].ret, 0.9))}`]),
    );
  }
}

/* ===================== 3-2. 실력 있는 사람들끼리 (약한 봇 없이) ===================== */
if (run('strong')) {
  const pool = ['hold', 'lev', 'news', 'smart', 'aggro'];
  for (const P of [2, 3, 4, 6]) {
    const n = N(P === 2 ? 400 : 300);
    const games: GameLog[] = [];
    for (let s = 0; s < n; s++) {
      const r = mulberry(SEED0 + 911 + s);
      const pick = [...pool].sort(() => r() - 0.5).slice(0, Math.min(P, pool.length));
      while (pick.length < P) pick.push(pool[Math.floor(r() * pool.length)]);
      games.push(playGame(SEED0 + 9000 + s, 20, pick.map((k) => ARCHETYPES[k]())));
    }
    const s = summarize(games);
    console.log(`## 실력형끼리 ${P}인 (${n}판) — 기대 승률 ${pct(1 / P)}
`);
    table(
      ['봇', '판 수', '승률', '평균 수익률', '10%~90%'],
      pool.filter((k) => s[k]).map((k) => [k, s[k].games, pct(s[k].win / s[k].games), pct(mean(s[k].ret)), `${pct(quant(s[k].ret, 0.1))} ~ ${pct(quant(s[k].ret, 0.9))}`]),
    );
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===================== 4. 카드 하나의 가치 (같은 시드로 쓴 판 vs 안 쓴 판) ===================== */
if (run('cards')) {
  const n = N(250);
  const base = (name: string) => newsBot({ name, news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true });
  const days = [3, 11];
  const baseBy: Record<number, GameLog[]> = {};
  const kinds: ItemKind[] = ['paper', 'analyst', 'scout', 'detector', 'freeze', 'blackout', 'fake', 'fee', 'shield'];
  for (const P of [2, 4]) {
    console.log(`## 카드 1장의 가치 — ${P}인, 뉴스봇끼리, 3·11일차에 1장씩(총 2장) 사서 사용 (${n}판, 20일)\n`);
    const rows: (string | number)[][] = [];
    const baseGames: GameLog[] = [];
    for (let s = 0; s < n; s++) baseGames.push(playGame(SEED0 + 9000 + s, 20, Array.from({ length: P }, (_, i) => base('b' + i))));
    baseBy[P] = baseGames;
    for (const kind of kinds) {
      let gain = 0;
      let dmg = 0;
      let spend = 0;
      let uses = 0;
      let bad = 0;
      let winB = 0;
      let winV = 0;
      const spent = (g: GameLog) => g.buys.filter((x) => x.pid === 'p0').reduce((t, x) => t + x.cost, 0);
      const used = (g: GameLog) => g.uses.filter((x) => x.pid === 'p0' && x.kind === kind).length;
      for (let s = 0; s < n; s++) {
        const b = baseGames[s];
        const v = playGame(SEED0 + 9000 + s, 20, [newsBot({ name: 'x', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, plan: { kind, days, target: 'leader' } }), ...Array.from({ length: P - 1 }, (_, i) => base('b' + (i + 1)))]);
        gain += v.final.p0 - b.final.p0;
        spend += spent(v) - spent(b);
        uses += used(v) - used(b);
        bad += v.effects.filter((e) => e.from === 'p0' && e.kind === kind && (e.blocked || e.reflected)).length;
        // 공격 대상이 된 사람들의 손해 합
        for (const id of b.ids.slice(1)) dmg += b.final[id] - v.final[id];
        winB += b.winShare.p0;
        winV += v.winShare.p0;
      }
      const u = Math.max(1, uses);
      rows.push([`${ITEM_MAP[kind].name} (${man(itemCost(kind, 2, SIM_V))})`, (uses / n).toFixed(2), man(gain / u), man((gain + spend) / u), man(dmg / u), ITEM_MAP[kind].type === 'attack' ? pct(bad / u) : '-', `${pct(winB / n)} → ${pct(winV / n)}`]);
    }
    table(['카드 (1장 값)', '판당 추가 사용', '1장당 순이익(값 포함)', '1장당 총이익(값 빼고)', '1장당 상대들 손해', '막힘/반사', '쓴 사람 승률'], rows);
    console.log('※ 기준 판은 똑같은 봇끼리라 대부분 비김(0.5승) — 작은 금액 차이도 승률을 크게 흔듦. 카드 가치는 '순이익' 칸으로 볼 것
');
  }

  // 방해 카드는 상대 전략에 따라 효과가 다름
  console.log(`## 방해 카드 vs 상대 유형 (1대1, ${n}판, 3·11일차 2장)\n`);
  const rows: (string | number)[][] = [];
  for (const [label, mk] of [
    ['뉴스봇', () => base('t')],
    ['지수 보유', () => ARCHETYPES.hold()],
  ] as [string, () => Bot][]) {
    for (const kind of ['freeze', 'blackout', 'fee', 'fake'] as ItemKind[]) {
      const dmg: number[] = [];
      for (let s = 0; s < n; s++) {
        const b = playGame(SEED0 + 9000 + s, 20, [base('x'), mk()]);
        const v = playGame(SEED0 + 9000 + s, 20, [newsBot({ name: 'x', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, plan: { kind, days } }), mk()]);
        dmg.push(b.final.p1 - v.final.p1);
      }
      rows.push([label, ITEM_MAP[kind].name, man(2 * itemCost(kind, 2, SIM_V)), man(mean(dmg))]);
    }
  }
  table(['대상', '카드', '2장 비용', '대상 손해(평균)'], rows);

  // 공짜 용돈 봉투 운
  const bon: number[] = [];
  let more = 0;
  let moreWin = 0;
  for (const g of baseBy[2]) {
    const c0 = g.uses.filter((u) => u.pid === 'p0' && u.kind === 'bonus').length;
    const c1 = g.uses.filter((u) => u.pid === 'p1' && u.kind === 'bonus').length;
    bon.push(c0 + c1);
    if (c0 !== c1) {
      more++;
      moreWin += c0 > c1 ? g.winShare.p0 : g.winShare.p1;
    }
  }
  console.log(`- (1대1 뉴스봇 기본판) 용돈 봉투를 더 받은 쪽(${more}판)의 승률: ${pct(moreWin / Math.max(1, more))}\n`);
}

/* ===================== 5. 몰매·역전 ===================== */
function leaderStats(games: GameLog[], at: number) {
  let lead = 0;
  let last = 0;
  for (const g of games) {
    const eq = g.eqByDay[at];
    const iL = eq.indexOf(Math.max(...eq));
    const iT = eq.indexOf(Math.min(...eq));
    lead += g.winShare[g.ids[iL]];
    last += g.winShare[g.ids[iT]];
  }
  return { lead: lead / games.length, last: last / games.length };
}
if (run('gang')) {
  const n = N(300);
  for (const P of [2, 4]) {
    console.log(`## 몰매·역전 — ${P}인, 20일, ${n}판\n`);
    const rows: (string | number)[][] = [];
    const setups: [string, () => Bot[]][] = [
      ['뉴스봇만 (카드 안 씀)', () => Array.from({ length: P }, (_, i) => newsBot({ name: 'n' + i, news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true }))],
      ['공격봇만 (1등 공격)', () => Array.from({ length: P }, () => ARCHETYPES.aggro())],
      ['뉴스+지수+현금+공격', () => [ARCHETYPES.smart(), ARCHETYPES.hold(), ARCHETYPES.cash(), ARCHETYPES.aggro()].slice(0, P)],
    ];
    for (const [label, mk] of setups) {
      const games: GameLog[] = [];
      for (let s = 0; s < n; s++) games.push(playGame(SEED0 + 13000 + s, 20, mk()));
      const l10 = leaderStats(games, 9);
      const l15 = leaderStats(games, 14);
      // 공격이 1등에게 몰리는지: 사용 전날 마감 순위
      const byRank = Array(P).fill(0);
      let att = 0;
      let blocked = 0;
      let refl = 0;
      for (const g of games)
        for (const e of g.effects) {
          att++;
          if (e.blocked) blocked++;
          if (e.reflected) refl++;
          const target = e.reflected ? e.by! : e.to;
          const prev = g.eqByDay[Math.max(0, e.usedDay - 1)];
          const rank = [...prev].sort((a, b) => b - a).indexOf(prev[g.ids.indexOf(target)]);
          byRank[rank]++;
        }
      const spread = mean(games.map((g) => (Math.max(...Object.values(g.final)) - Math.min(...Object.values(g.final))) / START0));
      rows.push([label, pct(l10.lead), pct(l15.lead), pct(l10.last), (att / n).toFixed(1), att ? byRank.map((x) => pct(x / att)).join(' / ') : '-', att ? pct(blocked / att) + ' / ' + pct(refl / att) : '-', pct(spread)]);
      if (label.startsWith('뉴스+')) {
        const s = summarize(games);
        console.log('  조합 승률: ' + Object.entries(s).map(([k, v]) => `${k} ${pct(v.win / v.games)}`).join(', ') + '\n');
      }
    }
    table(['조합', '10일차 1등 최종 우승', '15일차 1등 최종 우승', '10일차 꼴찌 최종 우승', '판당 공격 수', '공격 대상 순위(1등/2등/…)', '방패/거울에 막힘', '1등-꼴찌 격차'], rows);
  }
}

/* ===================== 6. 게임 길이 ===================== */
if (run('length')) {
  const n = N(200);
  console.log(`## 게임 길이별 1대1 승률 (${n}판씩)\n`);
  const pairs: [string, string][] = [
    ['news', 'hold'],
    ['news', 'cash'],
    ['smart', 'news'],
    ['aggro', 'smart'],
    ['lev', 'hold'],
    ['random', 'cash'],
  ];
  const rows: (string | number)[][] = [];
  for (const [a, b] of pairs) {
    const r: string[] = [];
    for (const days of [10, 20, 30]) {
      let w = 0;
      for (let s = 0; s < n; s++) {
        const swap = s % 2 === 1;
        const g = playGame(SEED0 + 20000 + s, days, swap ? [ARCHETYPES[b](), ARCHETYPES[a]()] : [ARCHETYPES[a](), ARCHETYPES[b]()]);
        w += g.winShare[swap ? 'p1' : 'p0'];
      }
      r.push(pct(w / n));
    }
    rows.push([`${a} vs ${b}`, ...r]);
  }
  table(['대결 (앞쪽 승률)', '10일', '20일', '30일'], rows);
  void se;
}
