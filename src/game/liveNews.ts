/**
 * (v21) 장중에 나오는 기사 (design/realism-v21.md) — 가격 영향 없음, 서버·혼자 연습에서만 만들고 화면에는 공개 칸이 된 것만
 * - 시황 기사 1~3개: 그 시각까지 **이미 움직인** 가격으로 "[시황] 11:20 기준 코어반도체 +3.1%…" (미래 정보 없음)
 * - 소문 기사 0~2개: 반응이 큰 커뮤니티 글을 인용 — 글이 올라오고 조금 뒤. 진위는 인용한 글과 같음(다음 날 공개)
 * 난수는 가격과 다른 전용 흐름(방 비밀값 + ':art21:')
 */
import { seeded } from '../lib/rng.js';
import type { Market, NewsEvent } from './market.js';
import { clockOf, communityPosts, PLATFORMS } from './community.js';
import { dayTicks } from './intraday.js';
import { COMPANIES, SECTOR_MAP, STOCK_MAP } from './stocks.js';

export const LIVE_NEWS_VERSION = 21;
const cache = new Map<string, NewsEvent[]>();
const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

/** n = 그 방의 하루 칸 수 (화면이 본 장중 가격과 같은 칸으로) */
export function liveNews(m: Market, day: number, key: string, n: number): NewsEvent[] {
  const ck = `${key}:${m.totalDays}:${day}:${n}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const rng = seeded(`${key}:art21:${day}`);
  const out: NewsEvent[] = [];
  const N = Math.max(10, n);
  // 시황: 그 시각까지 가장 많이 움직인 회사 (공개된 칸만)
  const nMarket = 1 + Math.floor(rng() * 3);
  const used = new Set<string>();
  for (let i = 0; i < nMarket; i++) {
    const at = 0.18 + rng() * 0.72;
    const j = Math.floor(at * N);
    let best: { sym: string; ch: number } | null = null;
    for (const c of COMPANIES) {
      if (used.has(c.symbol)) continue;
      const t = dayTicks(m, c.symbol, day, N);
      const ch = t[j] / t[0] - 1;
      if (!best || Math.abs(ch) > Math.abs(best.ch)) best = { sym: c.symbol, ch };
    }
    if (!best || Math.abs(best.ch) < 0.01) continue;
    used.add(best.sym);
    const def = STOCK_MAP[best.sym];
    const up = best.ch > 0;
    const who = ['외국인', '기관', '개인'][Math.floor(rng() * 3)];
    out.push({
      day,
      kind: 'company',
      symbol: best.sym,
      sector: def.sector,
      headline: `${clockOf(j / N)} 기준 ${def.name} ${pct(best.ch)}… ${who} ${up ? '사자' : '팔자'}에 ${SECTOR_MAP[def.sector]?.name ?? ''} ${up ? '강세' : '약세'}`,
      rumor: false,
      tone: up ? 'good' : 'bad',
      realTone: up ? 'good' : 'bad',
      related: [best.sym],
      label: '시황',
      at: Math.min(0.97, (j + 1) / N),
    });
  }
  // 소문 기사: 반응이 큰 커뮤니티 글 (회사 이름 글만)
  const posts = communityPosts(m, day, key)
    .filter((p) => p.symbol && !p.verified && p.at < 0.9)
    .sort((a, b) => b.likes - a.likes);
  const nRumor = Math.floor(rng() * 3);
  for (const p of posts.slice(0, nRumor)) {
    const def = STOCK_MAP[p.symbol!];
    const pf = PLATFORMS[p.platform];
    out.push({
      day,
      kind: 'company',
      symbol: p.symbol!,
      sector: def.sector,
      headline: `[루머] '${pf.name}'서 ${def.name} ${p.tone === 'good' ? '호재설' : '악재설'} 확산… 회사 측 "확인해 줄 수 없다"`,
      rumor: true,
      tone: p.tone,
      // 진위는 인용한 글과 같음 (서버만)
      realTone: p.real ? p.tone : p.tone === 'good' ? 'bad' : 'good',
      related: [p.symbol!],
      at: Math.min(0.97, p.at + 0.03 + rng() * 0.04),
    });
  }
  if (cache.size > 2000) cache.clear();
  cache.set(ck, out);
  return out;
}
