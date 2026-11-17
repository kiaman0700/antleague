import { describe, expect, it } from 'vitest';
import { storyEvents } from './storyDates.js';
import type { NewsEvent } from './market.js';

const n = (day: number, headline: string, extra: Partial<NewsEvent> = {}): NewsEvent => ({
  day,
  kind: 'company',
  symbol: 'CORE',
  sector: 'semi',
  headline,
  rumor: false,
  tone: 'good',
  realTone: 'good',
  related: [],
  label: '단독',
  ...extra,
});

describe('사건 발표 날짜를 일정에 (보이는 예고 기사만)', () => {
  it("'(n일차 발표 예정)'과 'n일차에' 둘 다 읽는다", () => {
    const ev = storyEvents({ news: [n(2, '코어반도체, 인수합병 추진설 (6일차 발표 예정)'), n(3, '스트림리, 기대작 신작 8일차에 정식 출시', { symbol: 'STRM' })] }, 3);
    expect(ev.map((e) => [e.day, e.symbol])).toEqual([
      [5, 'CORE'],
      [7, 'STRM'],
    ]);
    expect(ev[0].kind).toBe('story');
  });
  it('아직 안 나온(미래) 기사·지난 발표·단독이 아닌 기사는 넣지 않는다', () => {
    const ev = storyEvents(
      {
        news: [
          n(5, '코어반도체 (9일차 발표 예정)'), // 오늘(3일) 이후 기사 — 화면에 없어야 할 정보
          n(0, '코어반도체 (2일차 발표 예정)'), // 이미 지난 발표
          n(1, '코어반도체 (7일차 발표 예정)', { label: '특징주' }),
        ],
      },
      3,
    );
    expect(ev).toEqual([]);
  });
});
