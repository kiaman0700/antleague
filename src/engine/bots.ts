/**
 * 봇(설계서 design/bots-daily.md): 쉬움 · 보통 · 어려움.
 * 봇은 사람과 똑같이 자기 화면 데이터(buildView(봇))와 자기 포트폴리오만 본다 — 미래 가격·뉴스 진실·상대 거래는 모름.
 * 모든 행동은 validate* 를 거쳐 실제 규칙(카드 제한·거래 정지·수수료 폭탄·레버리지 제한)이 그대로 적용된다.
 * 서버(커스텀 방)와 브라우저(봇전)가 같은 코드를 쓴다. 무작위는 봇 전용 난수(seeded) — 시장 난수와 섞이지 않음.
 */
import { buildView, dayClock, GameError, graceSecondsFor, inPremarket, portfolioOf, validateBuyItem, validateTrade, validateUseItem, type GameData, type View } from './engine.js';
import { ITEM_MAP, itemCost, type ItemKind, type ItemRow } from '../game/items.js';
import type { Market, NewsEvent } from '../game/market.js';
import { maxBuyQty, FEE_RATE, startCashFor, type Holding, type Trade } from '../game/portfolio.js';
import { COMPANIES, STOCK_MAP, STOCKS } from '../game/stocks.js';
import { seeded } from '../lib/rng.js';

export { BOT_LEVELS, botInfo, isBot, MAX_BOTS, type BotLevel } from './botInfo.js';

/** 봇이 화면을 보고 움직이는 칸: 기본 하루 3번(장 시작 · 중간 · 끝 무렵), times 를 늘리면 장중 속보에 더 빨리 반응 */
export function botCheckpoints(n: number, times = 3): number[] {
  if (times <= 3) return [0, Math.max(1, Math.round(n * 0.45)), Math.max(2, n - 3)];
  const out: number[] = [];
  for (let i = 0; i < times - 1; i++) out.push(Math.round(((n - 3) * i) / (times - 1)));
  out.push(Math.max(2, n - 3));
  return [...new Set(out)];
}
/** 난이도별 하루에 화면을 보는 횟수 (실험으로 바꿀 수 있게 내보냄) */
export const BOT_TIMES: Record<number, number> = { 1: 18, 2: 3, 3: 10 };

/* ---------------- 봇이 보는 세상 (시뮬레이터 Ctx 와 같은 모양) ---------------- */
export interface BotCtx {
  me: string;
  day: number;
  tick: number;
  totalDays: number;
  nPlayers: number;
  /** 규칙 버전 (카드 값·시작 돈) */
  version: number;
  view: View;
  market: Market;
  rng: () => number;
  isLast: boolean;
  cash(): number;
  holdings(): Record<string, Holding>;
  price(sym: string): number;
  feeRate(): number;
  trade(sym: string, side: 'buy' | 'sell', qty: number): boolean;
  buyCash(sym: string, krw: number): boolean;
  sellAll(sym?: string): void;
  buyCard(kind: ItemKind): boolean;
  useCard(kind: ItemKind, payload?: Record<string, unknown>): boolean;
  refresh(): void;
  others(): { id: string; equity: number }[];
}
type Strategy = (c: BotCtx) => void;

const has = (c: BotCtx, k: ItemKind) => (c.view.myItems.inventory[k] ?? 0) > 0;
const usedToday = (c: BotCtx, k: ItemKind) => c.view.myItemRows.some((r) => r.action === 'use' && r.kind === k && r.day === c.day);
const ATTACKS: ItemKind[] = ['freeze', 'blackout', 'fake', 'fee'];

function useBonus(c: BotCtx) {
  if (c.tick === 0 && has(c, 'bonus') && !usedToday(c, 'bonus')) c.useCard('bonus');
}

interface NewsOpts {
  verdict: boolean;
  skipRecap: boolean;
  rumorW: number;
  /** (v17) 기사 아래 관계(거래처·경쟁사)를 읽음 — 경쟁사는 반대로, 거래처는 같은 쪽으로 (고수봇) */
  rel?: boolean;
}
function scoreNews(news: NewsEvent[], o: NewsOpts): Record<string, number> {
  const s: Record<string, number> = {};
  const add = (k: string, v: number) => (s[k] = (s[k] ?? 0) + v);
  for (const n of news) {
    if (o.verdict && n.verdict === 'false') continue;
    if (o.skipRecap && (n.label === '시황' || n.label === '특징주')) continue;
    const w = n.rumor && !(o.verdict && n.verdict === 'true') ? o.rumorW : 1;
    const dir = (n.tone === 'good' ? 1 : -1) * w;
    if (n.kind === 'company' && n.symbol && STOCK_MAP[n.symbol] && !STOCK_MAP[n.symbol].etf) {
      add(n.symbol, dir);
      if (o.rel && n.rel) {
        // 화면에 보이는 관계 이름표만 씀 (고정 정보 + 기사 방향)
        for (const [sym, r] of Object.entries(n.rel)) if (STOCK_MAP[sym] && !STOCK_MAP[sym].etf) add(sym, (r === 'rival' ? -0.45 : r === 'link' ? 0.4 : r === 'peer' ? 0.25 : 0.1) * dir);
      } else for (const p of COMPANIES) if (p.sector === n.sector && p.symbol !== n.symbol) add(p.symbol, 0.25 * dir);
    } else if (n.kind === 'sector' && n.sector) {
      for (const p of COMPANIES) if (p.sector === n.sector) add(p.symbol, 0.6 * dir);
    } else if (n.kind === 'macro' && (n.macro === 'kr' || n.macro === 'us')) {
      add('KIDX', (n.macro === 'kr' ? 0.6 : 0.4) * dir);
    }
  }
  return s;
}

/**
 * 쉬움: 초보가 흔히 하는 실수를 그대로 — 뉴스를 거꾸로 읽고(악재 종목을 '싸다'며 삼), 자주 사고팔아 수수료를 내고,
 * 떨어진 종목은 못 팔고 오른 종목은 금방 팜. 초보도 대부분 이길 수 있게 (시뮬 평균 수익률 마이너스)
 */
const easyBot: Strategy = (c) => {
  useBonus(c);
  if (c.view.effectsToday.includes('freeze')) return;
  // 조금만 오르면 바로 팔고, 이것저것 자주 갈아탐 (수수료가 쌓임). 떨어진 건 들고 버팀
  for (const [sym, x] of Object.entries(c.holdings())) {
    const p = c.price(sym);
    if (p >= x.avgCost * 1.003 || c.rng() < 0.35) c.trade(sym, 'sell', x.qty);
  }
  if (c.isLast) return;
  if (c.rng() < 0.85) {
    // 악재 뉴스(▼) 종목을 '싸졌다'며 크게 삼 — 장중 속보 악재도 따라 들어감
    const news = c.market.news.filter((n) => n.day === c.day && n.symbol && STOCK_MAP[n.symbol] && !STOCK_MAP[n.symbol].etf);
    const bad = news.filter((n) => n.tone === 'bad').map((n) => n.symbol!);
    const pool = bad.length ? bad : STOCKS.filter((s) => !s.etf || s.etf.lev === 1).map((s) => s.symbol);
    c.buyCash(pool[Math.floor(c.rng() * pool.length)], c.cash() * (0.45 + c.rng() * 0.35));
  }
};

export interface NewsBotOpts {
  news: NewsOpts;
  threshold: number;
  maxPicks: number;
  /** 가진 정보 카드(감별기·신문·애널리스트·차트)를 씀 */
  useInfo: boolean;
  /** 사서 쓰는 정보 카드 */
  buyInfo: ItemKind[];
  /** 가진 방해 카드를 1등에게 씀 */
  useFreeAttacks: boolean;
  /** 사서 쓰는 방해 카드 */
  attack: ItemKind[];
  buyDefense: ItemKind[];
  feeAware: boolean;
  /** 카드를 사도 남길 현금 (시작 돈 대비 비율) */
  reserve: number;
  /**
   * 사건 찌라시 따라가기(고수 전략): 며칠 걸친 사건의 찌라시가 좋은 쪽이면 발표 속보가 뜰 때까지 들고 넘어가고,
   * 나쁜 쪽이면 피함. 발표 속보(장중)가 뜨면 그날 장 마감에 정리 (다음 날 되돌림 피하기)
   */
  storyHold?: boolean;
  /**
   * (v20) 커뮤니티·SNS 글을 얼마나 믿는지 (화면에 보이는 글만 — 진위는 모름):
   * 쉬움 = 다 믿음(헛소문에 자주 물림) · 보통 = 반쯤 + 검증 글 · 어려움 = 검증 글만
   */
  trustPosts?: number;
  trustVerified?: number;
}

/** 아직 결과가 안 나온 사건 찌라시: 좋은 쪽(들고 갈 종목) · 나쁜 쪽(피할 종목) — 화면에 보이는 뉴스만 씀 */
function storyRumors(c: BotCtx) {
  const good = new Set<string>();
  const bad = new Set<string>();
  const latest = new Map<string, { day: number; tone: 'good' | 'bad' }>();
  for (const n of c.market.news) {
    if (!n.rumor || n.kind !== 'company' || !n.symbol || n.day > c.day || n.day < c.day - 5) continue;
    if (n.verdict === 'false') continue;
    const prev = latest.get(n.symbol);
    if (!prev || n.day >= prev.day) latest.set(n.symbol, { day: n.day, tone: n.tone });
  }
  for (const [sym, r] of latest) {
    // 그 뒤에 장중 속보가 떴으면 결과가 나온 것
    const resolved = c.market.news.some((n) => n.symbol === sym && n.at != null && n.day >= r.day);
    if (resolved) continue;
    (r.tone === 'good' ? good : bad).add(sym);
  }
  return { good, bad };
}

export function newsBot(opt: NewsBotOpts): Strategy {
  return (c) => {
    useBonus(c);
    const start = startCashFor(c.version);
    const cost = (k: ItemKind) => itemCost(k, c.nPlayers, c.version);
    const reserve = opt.reserve * start;
    const lastDay = c.day >= c.totalDays - 1;
    const tryUse = (kind: ItemKind, target?: string) => {
      if (!has(c, kind) || usedToday(c, kind)) return false;
      const def = ITEM_MAP[kind];
      let payload: Record<string, unknown> | undefined;
      if (def.type === 'attack' || kind === 'spy') {
        if (!target) return false;
        payload = { target };
      }
      if (kind === 'fake') {
        const co = COMPANIES[Math.floor(c.rng() * COMPANIES.length)];
        payload = { target, symbol: co.symbol, tone: 'good' };
      }
      // (v14) 감별기는 오늘 소식 하나를 골라야 함 — 소문 기사(사건 찌라시) → 장 전 찌라시 → 첫 뉴스 순 (고르지 않으면 서버가 거절해 카드가 헛돎)
      if (kind === 'detector' && c.version >= 14) {
        const today = c.market.news.filter((n) => n.day === c.day);
        const pick = today.find((n) => n.rumor && n.kind === 'company')?.headline ?? c.view.rumors?.[0]?.text ?? today[0]?.headline;
        if (!pick) return false;
        payload = { pick };
      }
      if (kind === 'scout') {
        const top = Object.entries(scores()).sort((a, b) => b[1] - a[1])[0];
        if (!top || top[1] < opt.threshold) return false;
        payload = { symbol: top[0] };
      }
      const ok = c.useCard(kind, payload);
      if (ok) c.refresh();
      return ok;
    };
    function scores() {
      const today = c.market.news.filter((n) => n.day === c.day);
      const s = scoreNews(today, opt.news);
      const best = c.view.reveals.bestSector;
      if (best) for (const p of COMPANIES) if (p.sector === best) s[p.symbol] = (s[p.symbol] ?? 0) + 1.0;
      const sc = c.view.reveals.scout;
      if (sc && !sc.up) s[sc.symbol] = -1;
      // (v20) 오늘 올라온 커뮤니티·SNS 글: 회사 이름 글만, 믿는 만큼 점수
      for (const p of c.view.community ?? []) {
        if (!p.symbol) continue;
        const w = p.verified ? opt.trustVerified ?? 0 : opt.trustPosts ?? 0;
        if (w) s[p.symbol] = (s[p.symbol] ?? 0) + (p.tone === 'good' ? w : -w);
      }
      if (opt.storyHold) {
        const st = storyRumors(c);
        for (const sym of st.good) s[sym] = (s[sym] ?? 0) + 1.5;
        for (const sym of st.bad) s[sym] = Math.min(s[sym] ?? 0, -1);
      }
      return s;
    }

    if (c.tick === 0) {
      for (const k of opt.buyDefense) if (!has(c, k) && c.cash() > reserve + cost(k)) c.buyCard(k);
      if (!lastDay && c.nPlayers > 1) {
        const target = c.others()[0]?.id;
        let used = false;
        if (opt.useFreeAttacks) for (const k of ATTACKS) if (!used && has(c, k)) used = tryUse(k, target);
        if (!used)
          for (const k of opt.attack) {
            if (c.cash() < reserve + cost(k)) continue;
            if (c.buyCard(k)) {
              tryUse(k, target);
              break;
            }
          }
      }
      if (opt.useInfo) {
        const todays = c.market.news.filter((n) => n.day === c.day);
        const companyN = todays.filter((n) => n.kind === 'company').length;
        for (const k of opt.buyInfo) {
          if (has(c, k)) continue;
          if (k === 'detector' && companyN < 2) continue;
          if (k === 'paper' && lastDay) continue;
          if (c.cash() < cost(k) + 0.1 * start) continue;
          c.buyCard(k);
        }
        if (has(c, 'detector') && companyN >= 1) tryUse('detector');
        if (has(c, 'analyst')) tryUse('analyst');
        if (has(c, 'paper') && !lastDay) tryUse('paper');
        if (has(c, 'scout')) tryUse('scout');
      }
    }
    if (c.view.effectsToday.includes('freeze')) return;
    const fee = c.feeRate();
    const thr = opt.feeAware && fee > 0.002 ? opt.threshold * 2.2 : opt.threshold;
    const s = scores();
    const h = c.holdings();
    for (const [sym, x] of Object.entries(h)) if ((s[sym] ?? 0) < 0) c.trade(sym, 'sell', x.qty);
    if (!c.isLast) {
      const picks = Object.entries(s)
        .filter(([sym, v]) => v >= thr && STOCK_MAP[sym] && !h[sym])
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.max(0, opt.maxPicks - Object.keys(c.holdings()).length));
      if (picks.length) {
        const per = (c.cash() * 0.98) / picks.length;
        for (const [sym] of picks) c.buyCash(sym, per);
      }
      return;
    }
    // 장 마감 무렵: 내일 신문이 있으면 내일 호재 종목으로 갈아타 들고 넘어가고, 아니면 모두 현금으로
    const tmr = c.view.reveals.tomorrow;
    if (tmr && !lastDay) {
      const ts = scoreNews(tmr, { ...opt.news, verdict: false });
      const picks = Object.entries(ts)
        .filter(([, v]) => v >= opt.threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k);
      for (const [sym, x] of Object.entries(c.holdings())) if (!picks.includes(sym)) c.trade(sym, 'sell', x.qty);
      const held = c.holdings();
      const need = picks.filter((p) => !held[p]);
      for (const p of need) c.buyCash(p, (c.cash() * 0.98) / need.length);
      return;
    }
    if (opt.storyHold && !lastDay) {
      // 결과 발표 전인 좋은 찌라시 종목만 들고 넘어감 (나머지는 현금으로)
      const keep = storyRumors(c).good;
      for (const [sym, x] of Object.entries(c.holdings())) if (!keep.has(sym)) c.trade(sym, 'sell', x.qty);
      const held = c.holdings();
      const need = [...keep].filter((p) => !held[p] && STOCK_MAP[p]);
      for (const p of need) c.buyCash(p, (c.cash() * 0.9) / need.length);
      return;
    }
    c.sellAll();
  };
}

/** 난이도별 전략 (시뮬레이터가 바꿔 끼워 실험할 수 있게 내보냄) */
export const STRATEGY: Record<number, Strategy> = {
  1: easyBot,
  2: newsBot({ news: { verdict: false, skipRecap: false, rumorW: 1 }, threshold: 0.9, maxPicks: 3, useInfo: true, buyInfo: [], useFreeAttacks: true, attack: [], buyDefense: [], feeAware: false, reserve: 0.2, trustPosts: 0.4, trustVerified: 0.8 }),
  // 시뮬(sim/levels.ts, 2026-11-17): 카드를 사는 봇은 카드 값 때문에 오히려 약했음 → 판단으로 강하게:
  // 시황·특징주(지난 정리 기사) 빼기 + 하루 10번 보기 + 수수료 폭탄 조심 + 사건 찌라시 따라 들고 가기 — 평균 +14% (보통 +8%, 쉬움 -8%)
  3: newsBot({ news: { verdict: false, skipRecap: true, rumorW: 1, rel: true }, threshold: 0.9, maxPicks: 3, useInfo: true, buyInfo: [], useFreeAttacks: true, attack: [], buyDefense: [], feeAware: true, reserve: 0.2, storyHold: true, trustPosts: 0, trustVerified: 1 }),
};

/* ---------------- 봇 움직이기 ---------------- */

export interface BotRun {
  /** 새로 생긴 거래·카드 (서버는 DB 에 넣고, 브라우저는 그대로 붙임) */
  trades: Trade[];
  items: ItemRow[];
  /** 봇마다 마지막으로 움직인 칸 (day*100 + 칸 번호, 장 마감했으면 day*100+99) */
  steps: Record<string, number>;
  /** 오늘 장 마감을 누른 봇 */
  ends: string[];
}

/** 봇이 장 마감을 누르는 때 (하루 중 비율) — 쉬움은 일찍 포기, 어려움은 끝까지 지켜봄 */
export const BOT_END_AT: Record<number, [number, number]> = { 1: [0.3, 0.55], 2: [0.85, 0.93], 3: [0.93, 0.97] };
/** 장 마감한 봇의 칸 표시 */
export const END_STEP = 99;

/** 봇 한 명이 마지막으로 움직인 칸 표시 (없으면 -1) */
export const stepKey = (day: number, cp: number) => day * 100 + cp;

/**
 * 지금 시각까지 봇이 해야 할 움직임을 한다. d 는 바뀌지 않음(복사본으로 계산) — 새 줄만 돌려줌.
 * - 봇은 사람처럼 하루 중 몇 번 화면을 보고 움직이고, 판단이 끝나면 스스로 장 마감 (난이도마다 때가 다름, BOT_END_AT)
 * - 카운트다운(누가 먼저 마감)이 시작되면 반응: 쉬움은 바로 마감, 보통은 마지막 정리 후 바로 마감, 어려움은 남은 시간의 절반까지 버티다 정리 후 마감
 * - 지나간 칸만 움직임 (앞으로 올 가격은 절대 안 씀). 카운트다운으로 하루가 일찍 끝나면 못 한 칸은 그냥 지나감
 */
export function runBots(d: GameData, now: number, opts: { salt?: string; only?: string } = {}): BotRun {
  const out: BotRun = { trades: [], items: [], steps: {}, ends: [] };
  const r = d.room;
  if (r.status !== 'playing' || inPremarket(r, now)) return out;
  const bots = d.players.filter((p) => p.bot_level && !p.left_game && p.ended_day < r.day && (!opts.only || p.id === opts.only));
  if (!bots.length) return out;
  const clk = dayClock(r, now);
  const { n, tick } = clk;
  // 복사본: 봇이 움직이며 생긴 줄을 바로 반영해 다음 판단(다음 봇 포함)에 쓰임
  const w: GameData = { ...d, trades: [...d.trades], items: [...d.items], orders: [...d.orders] };
  let seq = 0;
  const stamp = (at: number) => new Date(at + (seq++ % 900)).toISOString();
  for (const b of bots) {
    const cps = botCheckpoints(n, BOT_TIMES[b.bot_level ?? 2] ?? 3);
    const lastI = cps.length - 1;
    const doneStep = b.bot_step ?? -1;
    const level = STRATEGY[b.bot_level ?? 2] ? (b.bot_level as number) : 2;
    // 오늘 장 마감을 누를 칸 (봇마다·날마다 조금씩 다르게)
    const [lo, hi] = BOT_END_AT[b.bot_level ?? 2] ?? BOT_END_AT[2];
    let endTick = Math.round(n * (lo + (hi - lo) * seeded(`${opts.salt ?? r.id}:bot:${b.id}:${r.day}:end`)()));
    // 누가 먼저 마감해 카운트다운이 시작됐으면 서두름
    const countdown = r.deadline != null && r.day_deadline != null && r.deadline < r.day_deadline;
    if (countdown) {
      const left = (r.deadline! - now) / 1000;
      const grace = graceSecondsFor(d.players.filter((p) => !p.left_game).length, r.turn_seconds);
      if (level <= 2 || left <= grace / 2) endTick = Math.min(endTick, tick);
    }
    const ending = tick >= endTick;
    const due = cps.map((t, i) => ({ t, i })).filter(({ t, i }) => stepKey(r.day, i) > doneStep && t <= Math.min(tick, endTick) && !(ending && i === lastI));
    // 마감할 때는 마지막 정리(isLast: 들고 갈지·현금으로 바꿀지)를 한 번 하고 마감
    if (ending && stepKey(r.day, lastI) > doneStep && level >= 2) due.push({ t: tick, i: lastI });
    if (!due.length && !ending) continue;
    for (const { t, i } of due) {
      const isLast = i === lastI;
      const at = Math.min(now, clk.endAt - 1);
      const rng = seeded(`${opts.salt ?? r.id}:bot:${b.id}:${r.day}:${i}`);
      let view = buildView(w, b.id, at);
      let market = view.market!;
      const ctx: BotCtx = {
        me: b.id,
        day: r.day,
        tick: t, // 전략은 "그날 첫 칸(0)"에서 카드·방어를 정함 — 늦게 처리돼도 칸 번호 기준
        totalDays: r.total_days,
        version: r.version ?? 1,
        nPlayers: d.players.filter((p) => !p.left_game).length,
        view,
        market,
        rng,
        isLast,
        cash: () => portfolioOf(w, b.id).cash,
        holdings: () => portfolioOf(w, b.id).holdings,
        price: (sym) => {
          const arr = ctx.view.live?.krw[sym];
          return arr && arr.length ? arr[arr.length - 1] : ctx.market.bars[sym]?.[r.day]?.open ?? 0;
        },
        feeRate: () => (ctx.view.effectsToday.includes('fee') ? 0.01 : FEE_RATE),
        trade: (symbol, side, qty) => {
          if (!(qty >= 1)) return false;
          try {
            const t = { ...validateTrade(w, b.id, at, { symbol, side, qty }), created_at: stamp(at) };
            w.trades.push(t);
            out.trades.push(t);
            return true;
          } catch (e) {
            if (e instanceof GameError) return false;
            throw e;
          }
        },
        buyCash: (sym, krw) => {
          const p = ctx.price(sym);
          if (!(p > 0)) return false;
          return ctx.trade(sym, 'buy', maxBuyQty(Math.min(krw, ctx.cash()), p, ctx.feeRate()));
        },
        sellAll: (sym) => {
          for (const [s, x] of Object.entries(ctx.holdings())) if (!sym || s === sym) ctx.trade(s, 'sell', x.qty);
        },
        buyCard: (kind) => {
          try {
            const it = { ...validateBuyItem(w, b.id, at, { kind }), created_at: stamp(at) };
            w.items.push(it);
            out.items.push(it);
            return true;
          } catch (e) {
            if (e instanceof GameError) return false;
            throw e;
          }
        },
        useCard: (kind, payload) => {
          try {
            const it = { ...validateUseItem(w, b.id, at, { kind, payload }), created_at: stamp(at) };
            w.items.push(it);
            out.items.push(it);
            return true;
          } catch (e) {
            if (e instanceof GameError) return false;
            throw e;
          }
        },
        refresh: () => {
          view = buildView(w, b.id, at);
          if (view.market) market = view.market;
          ctx.view = view;
          ctx.market = market;
        },
        others: () =>
          ctx.view.players
            .filter((p) => p.id !== b.id)
            .map((p) => ({ id: p.id, equity: p.equity ?? 0 }))
            .sort((a, b2) => b2.equity - a.equity),
      };
      STRATEGY[level](ctx);
      out.steps[b.id] = stepKey(r.day, i);
    }
    if (ending) {
      out.steps[b.id] = stepKey(r.day, END_STEP);
      out.ends.push(b.id);
    }
  }
  return out;
}
