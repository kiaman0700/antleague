/**
 * 시뮬레이션 봇. 모두 화면 데이터(View/Market 조각)와 자기 포트폴리오만 사용한다.
 *  - 오늘 뉴스: 헤드라인 방향(tone)·[루머] 표시·머리말(label). 진실(fake/realTone)은 화면에 없음
 *  - 루머 감별기를 쓴 날만 verdict, 내일 신문은 reveals.tomorrow, 애널리스트는 reveals.bestSector
 *  - 상대: 총자산(view.players[].equity)만
 */
import type { Bot, Ctx } from './harness.js';
import type { ItemKind } from '../src/game/items.js';
import { ITEM_MAP } from '../src/game/items.js';
import type { NewsEvent } from '../src/game/market.js';
import { COMPANIES, STOCK_MAP, STOCKS } from '../src/game/stocks.js';

const has = (c: Ctx, k: ItemKind) => (c.view.myItems.inventory[k] ?? 0) > 0;
const usedToday = (c: Ctx, k: ItemKind) => c.view.myItemRows.some((r) => r.action === 'use' && r.kind === k && r.day === c.day);

/** 공짜 용돈 봉투는 모두 바로 씀 */
function useBonus(c: Ctx) {
  if (c.tick === 0 && has(c, 'bonus')) c.useCard('bonus');
}

/* ---------------- 단순 전략 ---------------- */

export const cashBot = (): Bot => ({ name: 'cash', act: (c) => useBonus(c) });

export const holdBot = (sym = 'KIDX', name = 'hold'): Bot => ({
  name,
  act: (c) => {
    useBonus(c);
    if (c.tick === 0 && c.cash() > 200_000) c.buyCash(sym, c.cash());
  },
});

export const randomBot = (): Bot => ({
  name: 'random',
  act: (c) => {
    useBonus(c);
    if (c.tick !== 0 && c.tick !== 18) return;
    const h = Object.keys(c.holdings());
    if (h.length && c.rng() < 0.5) c.sellAll(h[Math.floor(c.rng() * h.length)]);
    if (c.rng() < 0.6) c.buyCash(STOCKS[Math.floor(c.rng() * STOCKS.length)].symbol, c.cash() * 0.35);
  },
});

/* ---------------- 뉴스 점수 ---------------- */

export interface NewsOpts {
  /** 감별기 판정을 씀 (false=버림, true=루머라도 믿음) */
  verdict: boolean;
  /** 시황·특징주(어제 정리 기사) 무시 */
  skipRecap: boolean;
  /** 판정 없는 루머 가중치 */
  rumorW: number;
}

export function scoreNews(news: NewsEvent[], o: NewsOpts): Record<string, number> {
  const s: Record<string, number> = {};
  const add = (k: string, v: number) => (s[k] = (s[k] ?? 0) + v);
  for (const n of news) {
    if (o.verdict && n.verdict === 'false') continue;
    if (o.skipRecap && (n.label === '시황' || n.label === '특징주')) continue;
    const w = n.rumor && !(o.verdict && n.verdict === 'true') ? o.rumorW : 1;
    const dir = (n.tone === 'good' ? 1 : -1) * w;
    if (n.kind === 'company' && n.symbol && !STOCK_MAP[n.symbol].etf) {
      add(n.symbol, dir);
      for (const p of COMPANIES) if (p.sector === n.sector && p.symbol !== n.symbol) add(p.symbol, 0.25 * dir);
    } else if (n.kind === 'sector' && n.sector) {
      for (const p of COMPANIES) if (p.sector === n.sector) add(p.symbol, 0.6 * dir);
    } else if (n.kind === 'macro' && (n.macro === 'kr' || n.macro === 'us')) {
      add('KIDX', (n.macro === 'kr' ? 0.6 : 0.4) * dir);
    }
  }
  return s;
}

/* ---------------- 뉴스 따라가기 (데이트레이딩) ---------------- */

export interface NewsBotOpts {
  name: string;
  news: NewsOpts;
  /** 매수 기준 점수 */
  threshold: number;
  maxPicks: number;
  /** 받은/산 정보 카드를 씀 (감별기·신문·애널리스트·차트) */
  useInfo: boolean;
  /** 상점에서 정보 카드를 사는 목록 (우선순위) */
  buyInfo: ItemKind[];
  /** 방해 카드를 사서 1등(나 빼고)에게 씀 */
  attack: ItemKind[];
  /** 받은 방해 카드도 씀 */
  useFreeAttacks: boolean;
  /** 방어 카드 사기 */
  buyDefense: ItemKind[];
  /** 정해진 날에 반드시 이 카드를 사서 씀 (카드 가치 실험용) */
  plan?: { kind: ItemKind; days: number[]; target?: 'leader' | 'last' | string };
  /** 수수료 폭탄을 맞으면 거래를 줄임 */
  feeAware: boolean;
  /** 방해 카드를 사도 남겨 둘 최소 현금 */
  reserve: number;
}

const ATTACKS: ItemKind[] = ['freeze', 'blackout', 'fake', 'fee'];

export function newsBot(o: Partial<NewsBotOpts> & { name: string }): Bot {
  const opt: NewsBotOpts = {
    news: { verdict: true, skipRecap: false, rumorW: 1 },
    threshold: 0.9,
    maxPicks: 3,
    useInfo: false,
    buyInfo: [],
    attack: [],
    useFreeAttacks: false,
    buyDefense: [],
    feeAware: true,
    reserve: 2_000_000,
    ...o,
  };
  let overnight = new Set<string>();
  let analystSector: string | null = null;
  let scoutBan = new Set<string>();

  const pickTarget = (c: Ctx, how: string | undefined) => {
    const o2 = c.others();
    if (!o2.length) return undefined;
    if (!how || how === 'leader') return o2[0].id;
    if (how === 'last') return o2[o2.length - 1].id;
    return how;
  };

  const tryUse = (c: Ctx, kind: ItemKind, target?: string) => {
    if (!has(c, kind) || usedToday(c, kind)) return false;
    const def = ITEM_MAP[kind];
    let payload: Record<string, unknown> | undefined;
    if (def.type === 'attack' || kind === 'spy') payload = { target };
    if (kind === 'fake') {
      // 아무 회사에 '호재' 가짜 속보 — 뉴스를 따라가는 상대가 근거 없는 종목을 사게
      const co = COMPANIES[Math.floor(c.rng() * COMPANIES.length)];
      payload = { target, symbol: co.symbol, tone: 'good' };
    }
    if (kind === 'scout') {
      const sc = scores(c);
      const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] < opt.threshold) return false;
      payload = { symbol: top[0] };
    }
    const ok = c.useCard(kind, payload);
    if (ok) c.refresh();
    return ok;
  };

  function scores(c: Ctx) {
    const today = c.market.news.filter((n) => n.day === c.day);
    const s = scoreNews(today, opt.news);
    if (analystSector) for (const p of COMPANIES) if (p.sector === analystSector) s[p.symbol] = (s[p.symbol] ?? 0) + 1.0;
    for (const b of scoutBan) s[b] = -1;
    return s;
  }

  return {
    name: opt.name,
    act(c) {
      useBonus(c);
      const lastDay = c.day >= c.totalDays - 1;
      if (c.tick === 0) {
        analystSector = null;
        scoutBan = new Set();
        // ---- 카드: 계획된 사용 ----
        if (opt.plan && opt.plan.days.includes(c.day)) {
          if (!has(c, opt.plan.kind)) c.buyCard(opt.plan.kind);
          tryUse(c, opt.plan.kind, pickTarget(c, opt.plan.target));
        }
        // ---- 방어 ----
        for (const k of opt.buyDefense) if (!has(c, k) && c.cash() > opt.reserve + ITEM_MAP[k].cost) c.buyCard(k);
        // ---- 방해 ----
        if (!lastDay && c.nPlayers > 1) {
          const target = pickTarget(c, 'leader');
          const usable = opt.useFreeAttacks || opt.attack.length ? ATTACKS : [];
          let used = false;
          for (const k of usable) if (!used && has(c, k)) used = tryUse(c, k, target);
          if (!used)
            for (const k of opt.attack) {
              if (c.cash() < opt.reserve + ITEM_MAP[k].cost) continue;
              if (c.buyCard(k)) {
                tryUse(c, k, target);
                break;
              }
            }
        }
        // ---- 정보 ----
        if (opt.useInfo) {
          const todays = c.market.news.filter((n) => n.day === c.day);
          const companyN = todays.filter((n) => n.kind === 'company').length;
          for (const k of opt.buyInfo) {
            if (has(c, k)) continue;
            if (k === 'detector' && companyN < 2) continue;
            if (k === 'paper' && lastDay) continue;
            if (c.cash() < ITEM_MAP[k].cost + 1_000_000) continue;
            c.buyCard(k);
          }
          if (has(c, 'detector') && companyN >= 2) tryUse(c, 'detector');
          if (has(c, 'analyst')) {
            tryUse(c, 'analyst');
          }
          if (has(c, 'paper') && !lastDay && c.day < c.totalDays - 1) tryUse(c, 'paper');
          if (has(c, 'scout')) {
            if (tryUse(c, 'scout')) {
              const r = c.view.reveals.scout;
              if (r && !r.up) scoutBan.add(r.symbol);
            }
          }
        }
        if (c.view.reveals.bestSector) analystSector = c.view.reveals.bestSector;
      }
      if (c.view.effectsToday.includes('freeze')) return;
      const fee = c.feeRate();
      const thr = opt.feeAware && fee > 0.002 ? opt.threshold * 2.2 : opt.threshold;
      const s = scores(c);
      const h = c.holdings();
      // 어제 신문 보고 산 종목은 오늘 아침 시가까지 들고 있었음 → 오늘 점수로 다시 판단
      // 나쁜 점수 종목 팔기
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
      // ---- 장 마감 직전: 내일 신문이 있으면 내일 호재 종목으로 갈아타고 들고 넘어감, 아니면 전부 현금화 ----
      const tmr = c.view.reveals.tomorrow;
      overnight = new Set();
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
        overnight = new Set(picks);
        return;
      }
      c.sellAll();
    },
  };
}

/* ---------------- 기본 원형 ---------------- */

export const ARCHETYPES: Record<string, () => Bot> = {
  cash: cashBot,
  hold: () => holdBot('KIDX', 'hold'),
  lev: () => holdBot('KLEV', 'lev'),
  random: randomBot,
  news: () => newsBot({ name: 'news', news: { verdict: false, skipRecap: false, rumorW: 1 } }),
  smart: () => newsBot({ name: 'smart', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, buyInfo: ['detector', 'paper', 'analyst'] }),
  aggro: () => newsBot({ name: 'aggro', news: { verdict: true, skipRecap: true, rumorW: 0.4 }, useInfo: true, attack: ['fee', 'freeze', 'blackout', 'fake'], useFreeAttacks: true }),
};
