/**
 * (v15) 사건 예고 기사에 적힌 발표 날짜를 일정에 넣음 — "(9일차 발표 예정)" · "9일차에 공개 예정" 처럼
 * 이미 화면에 보이는 기사 제목만 읽음 (서버 비밀·미래 정보 없음). 지난 발표·결과는 넣지 않음
 */
import type { Market, MarketEvent } from './market.js';
import { STOCK_MAP } from './stocks.js';

const DUE = /(\d+)일차(?:에| 발표 예정)/;

export function storyEvents(market: Pick<Market, 'news'>, day: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  const seen = new Set<string>();
  for (const n of market.news) {
    if (n.label !== '단독' || !n.symbol || n.day > day) continue;
    const m = n.headline.match(DUE);
    if (!m) continue;
    const due = Number(m[1]) - 1;
    if (!Number.isFinite(due) || due < day || due <= n.day) continue;
    const key = n.symbol + ':' + due;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: due, kind: 'story', title: `${STOCK_MAP[n.symbol]?.name ?? n.symbol} 발표`, desc: n.headline, symbol: n.symbol });
  }
  return out;
}

/** 일정 목록에 사건 발표 날을 끼워 넣은 시장 (날짜순) */
export function withStoryEvents<M extends Market>(market: M, day: number): M {
  const extra = storyEvents(market, day);
  if (!extra.length) return market;
  return { ...market, events: [...market.events, ...extra].sort((a, b) => a.day - b.day) };
}
