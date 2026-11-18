/**
 * 결과 화면 '실제 시장에서는?' (밤샘 조사 2026-11-19 — 게임 속 사건을 실제 시장 지식과 이어 주기, 청소년·청년 금융 관심 1위가 주식).
 * 판이 끝난 뒤 공개된 뉴스 제목만 보고 그 판에 있었던 사건 종류를 찾음 → 짧은 설명 카드 (최대 2개).
 * 서버 비밀·미래 정보는 쓰지 않음 (끝난 판의 뉴스는 모두 공개된 것).
 */
import type { NewsEvent } from './market.js';

export type RealKind = 'pump' | 'delist' | 'rights' | 'short' | 'war' | 'binary' | 'exdiv' | 'story';

export interface RealLesson {
  kind: RealKind;
  day: number;
  title: string;
  text: string;
}

const RULES: { kind: RealKind; test: RegExp; title: string; text: string }[] = [
  {
    kind: 'delist',
    test: /상장폐지 결정|감사의견 '거절'/,
    title: '상장 폐지는 이렇게 진행돼요',
    text: '감사의견 거절 → 거래정지 → 상장 심사 → 정리매매(가격 제한 없음) → 상장 폐지 순서예요. 실제로는 몇 달이 걸리는데 게임에선 며칠로 줄였어요.',
  },
  {
    kind: 'pump',
    test: /테마 과열|투자경고 종목/,
    title: '테마주는 빨리 오르고 빨리 꺼져요',
    text: '실적과 상관없이 소문으로 오르는 주식을 테마주라고 해요. 거래소가 투자주의·경고·위험 순으로 알리고, 회사가 "관련 없다"고 하면 하루에 크게 떨어지기도 해요.',
  },
  {
    kind: 'short',
    test: /공매도 업체/,
    title: '공매도 보고서',
    text: '회사의 약점을 조사해 발표하고 주가가 떨어지는 쪽에 돈을 거는 업체가 있어요. 보고서가 틀린 것으로 밝혀지면 주가가 다시 오르기도 해요.',
  },
  {
    kind: 'binary',
    test: /승인 (통과|거절)/,
    title: '미국 주식은 가격 제한이 없어요',
    text: '한국은 하루에 ±30%까지만 움직이지만 미국은 제한이 없어요. 신약·제품 승인 결과 하나로 하루에 몇 배가 되거나 대부분을 잃기도 해요.',
  },
  {
    kind: 'rights',
    test: /유상증자/,
    title: '유상증자는 왜 악재일까요',
    text: '회사가 새 주식을 팔아 돈을 모으는 거예요. 주식 수가 늘어 기존 주주의 몫이 줄기 때문에 보통 주가가 내려요.',
  },
  {
    kind: 'war',
    test: /무력 충돌/,
    title: '전쟁 소식과 시장',
    text: '분쟁이 나면 기름값이 뛰고, 항공처럼 기름을 많이 쓰는 업종은 내리고 정유는 오르기 쉬워요. 긴장이 풀리면 며칠 안에 일부 되돌아오는 일이 많아요.',
  },
  {
    kind: 'exdiv',
    test: /배당락/,
    title: '배당락',
    text: '배당 받을 사람이 정해진 다음 날엔 그 배당만큼 주가가 낮게 시작해요. 배당만 받고 바로 팔아도 이득이 거의 없는 이유예요.',
  },
  {
    kind: 'story',
    test: /발표 예정/,
    title: '"소문에 사서 뉴스에 팔아라"',
    text: '좋은 발표를 앞두면 기대감으로 미리 올라요. 막상 발표가 나오면 이미 오른 만큼 오히려 떨어지기도 해요.',
  },
];

/** 판에 있었던 사건 종류마다 하나씩, 앞 순서(더 드문 것)부터 최대 max 개 */
export function realLessons(news: NewsEvent[], lastDay = Infinity, max = 2): RealLesson[] {
  const out: RealLesson[] = [];
  for (const r of RULES) {
    const n = news.find((x) => x.day <= lastDay && r.test.test(x.headline));
    if (n) out.push({ kind: r.kind, day: n.day, title: r.title, text: r.text });
    if (out.length >= max) break;
  }
  return out;
}
