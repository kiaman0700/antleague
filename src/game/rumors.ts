/**
 * (v7) 장 전 찌라시: 장이 열리기 전 떠도는 소문 3~5개.
 * - 약 40%는 그날 장중 속보(아직 공개 전)를 업종·방향만 흐릿하게 알려 주는 **진짜 단서**
 * - 나머지는 가격과 아무 상관 없는 **헛소문**
 * 진짜/가짜는 같은 문구 틀을 써서 겉으로 구분할 수 없고, 진위는 서버에만 있다 (감별기를 쓴 사람에게만 판정).
 * 난수는 가격과 다른 전용 흐름(방 비밀값 + ':pre:' + 날짜) → 가격은 그대로.
 */
import { seeded } from '../lib/rng.js';
import type { Market } from './market.js';
import { SECTOR_MAP, STOCK_SECTORS } from './stocks.js';

export interface Rumor {
  text: string;
  sector: string;
  tone: 'good' | 'bad';
  /** 서버에만 — 화면 데이터에는 감별기를 쓴 사람에게 verdict 로만 */
  real: boolean;
}
export interface PublicRumor {
  text: string;
  sector: string;
  tone: 'good' | 'bad';
  verdict?: 'true' | 'false';
}

const GOOD = [
  (s: string) => `${s} 쪽에 오늘 큰 호재가 터진다는 얘기가 돌아요`,
  (s: string) => `${s} 업계에 깜짝 발표가 준비 중이라는 소문이에요`,
  (s: string) => `큰손들이 오늘 ${s} 주식을 쓸어 담을 거라는 말이 있어요`,
  (s: string) => `${s} 실적이 예상보다 훨씬 좋다는 얘기가 새어 나왔대요`,
];
const BAD = [
  (s: string) => `${s} 쪽에 오늘 악재가 나온다는 얘기가 돌아요`,
  (s: string) => `${s} 업계에 안 좋은 발표가 있을 거라는 소문이에요`,
  (s: string) => `큰손들이 오늘 ${s} 주식을 던질 거라는 말이 있어요`,
  (s: string) => `${s} 실적이 생각보다 나쁘다는 얘기가 새어 나왔대요`,
];

/** 그날 장 전 찌라시 (서버 전용: real 포함) */
export function preRumors(m: Market, day: number, key: string): Rumor[] {
  const rng = seeded(`${key}:pre:${day}`);
  // 진짜 단서의 재료: 오늘 장중 속보 중 업종이 있는 것 (가짜 기사 제외)
  const sources = m.news.filter((n) => n.day === day && n.at != null && !n.fake && n.sector && SECTOR_MAP[n.sector]);
  const total = 3 + Math.floor(rng() * 3); // 3~5개
  const nReal = Math.min(sources.length, Math.round(total * 0.4));
  const out: Rumor[] = [];
  const used = new Set<string>();
  const shuffledSrc = shuffle([...sources], rng);
  for (const n of shuffledSrc.slice(0, nReal)) {
    used.add(n.sector!);
    out.push({ text: '', sector: n.sector!, tone: n.tone, real: true });
  }
  const pool = STOCK_SECTORS.filter((s) => !used.has(s.id));
  while (out.length < total && pool.length) {
    const s = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    out.push({ text: '', sector: s.id, tone: rng() < 0.5 ? 'good' : 'bad', real: false });
  }
  // 같은 문구 틀에서 고르고 순서를 섞음 → 겉모습으로 진위를 알 수 없음
  for (const r of out) {
    const t = r.tone === 'good' ? GOOD : BAD;
    r.text = t[Math.floor(rng() * t.length)](SECTOR_MAP[r.sector].name);
  }
  return shuffle(out, rng);
}

/** 고르게 섞기 (Fisher–Yates) — 자리로 진위를 짐작할 수 없게 */
function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 화면에 보낼 찌라시 — 진위는 감별기를 쓴 사람에게만 */
export function publicRumors(rs: Rumor[], rumorCheck: boolean): PublicRumor[] {
  return rs.map((r) => ({ text: r.text, sector: r.sector, tone: r.tone, ...(rumorCheck ? { verdict: r.real ? ('true' as const) : ('false' as const) } : {}) }));
}
