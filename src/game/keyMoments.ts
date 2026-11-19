/**
 * 판이 끝난 뒤 '나의 결정적 순간' (체스 게임 리뷰처럼 이긴 이유·진 이유를 장면으로).
 * 판이 끝나 모두 공개된 정보(뉴스·속보·진위 판정·내 거래·종가)만 씀 → 새로 새는 정보 없음.
 * 말투는 혼내지 않고 다음 판 힌트처럼
 */
import type { Market } from './market.js';
import type { Trade } from './portfolio.js';
import { STOCK_MAP } from './stocks.js';

export interface KeyMoment {
  kind: 'caught' | 'dodged' | 'fooled' | 'missed';
  day: number;
  symbol: string;
  title: string;
  text: string;
  /** 원 (잡은·피한 돈은 +, 잃은 돈은 −, 놓친 건 0) */
  amount: number;
}

const name = (s: string) => STOCK_MAP[s]?.name ?? s;
// 거래 가격은 원화(미국 종목도 원화로 바꾼 값) → m.bars 로 같은 단위
const barOf = (m: Market, s: string, d: number) => m.bars[s]?.[d];
const closeOf = (m: Market, s: string, d: number) => barOf(m, s, d)?.close;
const openOf = (m: Market, s: string, d: number) => barOf(m, s, d)?.open;
const short = (h: string) => (h.length > 26 ? h.slice(0, 25) + '…' : h).replace(/^\[[^\]]+\]\s*/, '');

/** 내 거래로 판 전체에서 결정적 순간을 최대 3개 (잡은·피한·속은·놓친 순서로 하나씩, 큰 것 먼저) */
export function keyMoments(m: Market, myTrades: Trade[], lastDay = m.totalDays - 1): KeyMoment[] {
  const caught: KeyMoment[] = [];
  const dodged: KeyMoment[] = [];
  const fooled: KeyMoment[] = [];
  const missed: KeyMoment[] = [];
  // 날마다 들고 있던 수량 (그날 장 시작 때)
  const held = (s: string, d: number) => myTrades.filter((t) => t.symbol === s && t.day < d).reduce((q, t) => q + (t.side === 'buy' ? t.qty : -t.qty), 0);
  for (let d = 0; d <= lastDay; d++) {
    for (const n of m.news.filter((x) => x.day === d && x.symbol)) {
      const s = n.symbol!;
      const o = openOf(m, s, d);
      const c = closeOf(m, s, d);
      if (!o || !c) continue;
      const move = c / o - 1;
      const buys = myTrades.filter((t) => t.day === d && t.symbol === s && t.side === 'buy');
      const sells = myTrades.filter((t) => t.day === d && t.symbol === s && t.side === 'sell');
      const breaking = n.at != null && n.verdict !== 'false' && !n.rumor;
      // 가짜·헛소문 기사를 믿고 그날 사서 그날 종가가 산 값보다 낮음
      if (n.verdict === 'false' && n.tone === 'good' && buys.length) {
        const loss = buys.reduce((a, t) => a + (c - t.price) * t.qty, 0);
        if (loss < 0) fooled.push({ kind: 'fooled', day: d, symbol: s, title: `${d + 1}일차, 가짜 소식에 속았어요`, text: `'${short(n.headline)}'는 가짜였어요. ${name(s)}를 산 뒤 ${Math.round(loss).toLocaleString('ko-KR')}원. 다음엔 감별기나 인증 글로 한 번 더 확인해요`, amount: Math.round(loss) });
      }
      if (!breaking) continue;
      // 속보로 오른 날: 미리 들고 있었거나 그날 종가보다 싸게 삼
      if (n.tone === 'good' && move > 0.04) {
        const gain = held(s, d) * (c - o) + buys.reduce((a, t) => a + (c - t.price) * t.qty, 0);
        if (gain > 0) caught.push({ kind: 'caught', day: d, symbol: s, title: `${d + 1}일차, 속보를 잡았어요`, text: `'${short(n.headline)}' — ${name(s)} 하루 +${(move * 100).toFixed(1)}%. 이 종목으로 +${Math.round(gain).toLocaleString('ko-KR')}원`, amount: Math.round(gain) });
        else if (held(s, d) <= 0 && !buys.length && move > 0.08) missed.push({ kind: 'missed', day: d, symbol: s, title: `${d + 1}일차, 놓친 속보`, text: `'${short(n.headline)}' — ${name(s)} 하루 +${(move * 100).toFixed(1)}%. 장 전 커뮤니티 글에 단서가 있었는지 복기해 봐요`, amount: 0 });
      }
      // 나쁜 속보 날: 그날 종가보다 비싸게 팔아서 피함
      if (n.tone === 'bad' && move < -0.04 && sells.length) {
        const saved = sells.reduce((a, t) => a + (t.price - c) * t.qty, 0);
        if (saved > 0) dodged.push({ kind: 'dodged', day: d, symbol: s, title: `${d + 1}일차, 악재를 피했어요`, text: `'${short(n.headline)}' — ${name(s)} 하루 ${(move * 100).toFixed(1)}%. 미리 팔아 ${Math.round(saved).toLocaleString('ko-KR')}원 아꼈어요`, amount: Math.round(saved) });
      }
    }
  }
  const pick = (a: KeyMoment[]) => a.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))[0];
  return [pick(caught), pick(dodged), pick(fooled), pick(missed)].filter((x): x is KeyMoment => !!x).slice(0, 3);
}
