/**
 * 규칙 v24: 실제 시장 같은 사건 (설계서 design/v24-big-update.md D — 참고: 상장폐지 절차·정리매매, 테마주 연속 상한가 후 폭락,
 * 미국 종목 하루 +100% 넘는 승인 결과, 전쟁·유가 충격, 유상증자, 공매도 보고서).
 * 한 판에 사건은 최대 3개, 폭락 전에는 1~2일 전 공개 징조(뉴스·소문)가 있음. 전용 난수(ev24)라 v23 이하 가격은 그대로.
 * 계획(어떤 종목이 언제 무엇을)은 서버의 시장 데이터에만 — 화면에는 그날 나온 뉴스와 거래정지 표시(그날까지)만.
 */
import type { Rng } from '../lib/rng.js';
import { COMPANIES, etfMembers, STOCK_MAP, STOCKS } from './stocks.js';

export const EVENTS_VERSION = 24;

export type Ev24 =
  | { kind: 'pump'; symbol: string; start: number; ups: number }
  | { kind: 'binary'; symbol: string; start: number; resolve: number; good: boolean; at: number }
  | { kind: 'delist'; symbol: string; start: number; survive: boolean }
  | { kind: 'war'; day: number; place: string }
  | { kind: 'rights'; symbol: string; day: number }
  | { kind: 'short'; symbol: string; day: number; at: number; trueReport: boolean };

/** 거래 상태 (공개: 그날 아침 공시로 알려짐) */
export interface HaltMark {
  symbol: string;
  day: number;
  /** halt 거래정지 · clear 정리매매(가격 제한 없음) · delisted 상장폐지(거래 불가, 값 거의 0) */
  kind: 'halt' | 'clear' | 'delisted';
}

const range = (r: Rng, a: number, b: number) => a + r() * (b - a);
const pickOne = <T,>(r: Rng, a: T[]) => a[Math.floor(r() * a.length)];

/** 가상의 지역 이름 (실제 나라·사건 이름은 쓰지 않음) */
const PLACES = ['카스펠 해협', '노르단 접경', '아즈라 반도', '셀린 만', '바르텐 고원'];

/** force: (v26 오늘의 시장) 이 종류의 사건은 꼭 넣음 — 확률 굴림을 0으로 두고, 앞 3개 안에 남게 맨 앞으로 */
export function planEvents24(r: Rng, totalDays: number, taken: Set<string>, force?: Ev24['kind']): Ev24[] {
  const T = totalDays;
  const out: Ev24[] = [];
  const used = new Set(taken);
  // 묶음·지수 ETF 에 들어간 종목은 상장 폐지 후보에서 뺌 (ETF 가 같이 무너지지 않게)
  const inBasket = new Set(STOCKS.filter((s) => s.etf && s.etf.track.type === 'basket').flatMap((s) => etfMembers(s.etf!)));
  const kr = COMPANIES.filter((c) => c.currency !== 'USD' && !used.has(c.symbol));
  const free = (list: typeof COMPANIES) => list.filter((c) => !used.has(c.symbol));
  const take = (list: typeof COMPANIES) => {
    const f = free(list);
    if (!f.length) return null;
    const c = pickOne(r, f);
    used.add(c.symbol);
    return c.symbol;
  };
  // 정해진 순서로 굴려서 (뒤 사건이 앞 사건 자리와 겹치지 않게)
  const rolls = { pump: r(), binary: r(), delist: r(), war: r(), rights: r(), short: r() };
  if (force) rolls[force] = 0;
  if (T >= 8 && rolls.pump < 0.5) {
    const sym = take(kr.filter((c) => ['bio', 'crypto', 'ent', 'battery', 'it'].includes(c.sector)));
    if (sym) {
      const ups = 2 + Math.floor(r() * 3); // 상한가 2~4번
      const latest = T - (ups + 3);
      if (latest >= 1) out.push({ kind: 'pump', symbol: sym, start: 1 + Math.floor(r() * latest), ups });
    }
  }
  if (T >= 6 && rolls.binary < 0.35) {
    const sym = take(COMPANIES.filter((c) => c.currency === 'USD' && ['us_ev', 'us_tech', 'us_semi'].includes(c.sector)));
    if (sym) {
      const start = Math.floor(r() * Math.max(1, T - 4));
      const resolve = Math.min(T - 1, start + 2 + Math.floor(r() * 2));
      out.push({ kind: 'binary', symbol: sym, start, resolve, good: r() < 0.5, at: Math.round(range(r, 0.25, 0.7) * 1000) / 1000 });
    }
  }
  if (T >= 10 && rolls.delist < 0.2) {
    const sym = take(kr.filter((c) => !inBasket.has(c.symbol)));
    if (sym) out.push({ kind: 'delist', symbol: sym, start: 1 + Math.floor(r() * (T - 7)), survive: r() < 0.15 });
  }
  if (T >= 6 && rolls.war < 0.15) out.push({ kind: 'war', day: 2 + Math.floor(r() * Math.max(1, T - 4)), place: pickOne(r, PLACES) });
  if (T >= 5 && rolls.rights < 0.35) {
    const sym = take(kr);
    if (sym) out.push({ kind: 'rights', symbol: sym, day: 1 + Math.floor(r() * (T - 2)) });
  }
  if (T >= 5 && rolls.short < 0.15) {
    const sym = take(COMPANIES);
    if (sym) out.push({ kind: 'short', symbol: sym, day: 1 + Math.floor(r() * (T - 3)), at: Math.round(range(r, 0.25, 0.6) * 1000) / 1000, trueReport: r() < 0.7 });
  }
  // 한 판에 최대 3개 (섞어서 앞 3개)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (force) {
    const i = out.findIndex((e) => e.kind === force);
    if (i > 0) out.unshift(...out.splice(i, 1));
  }
  return out.slice(0, 3);
}

export function nameOf(sym: string) {
  return STOCK_MAP[sym]?.name ?? sym;
}

/** 상장 폐지 사건의 날별 단계 */
export function delistStages(e: Extract<Ev24, { kind: 'delist' }>, T: number) {
  const s = e.start;
  return {
    rumor: s,
    disclosure: s + 1,
    halt1: s + 2,
    review: s + 3,
    clear1: e.survive ? -1 : s + 4,
    clear2: e.survive ? -1 : s + 5 < T - 1 ? s + 5 : -1,
    delistFrom: e.survive ? -1 : s + 5 < T - 1 ? s + 6 : s + 5,
    resume: e.survive ? s + 4 : -1,
  };
}

export { range as range24, pickOne as pick24 };
