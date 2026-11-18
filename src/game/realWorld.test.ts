import { describe, expect, it } from 'vitest';
import { realLessons } from './realWorld';
import type { NewsEvent } from './market';

const n = (day: number, headline: string) => ({ day, headline, kind: 'company', symbol: null, sector: null, rumor: false, tone: 'bad', realTone: 'bad', related: [] }) as unknown as NewsEvent;

describe('실제 시장에서는?', () => {
  it('사건 뉴스로 설명을 고르고 드문 것부터 2개', () => {
    const out = realLessons([n(1, '[단독] 가나, 대규모 유상증자 결정… 주식 수 늘어'), n(3, '[속보] 다라 상장폐지 결정… 오늘부터 정리매매'), n(4, '[시황] 마바 배당락')]);
    expect(out.map((x) => x.kind)).toEqual(['delist', 'rights']);
    expect(out[0].day).toBe(3);
  });
  it('마지막 날 뒤 뉴스는 안 봄, 없으면 빈 목록', () => {
    expect(realLessons([n(5, '[속보] 가나 승인 통과… 주가 폭등')], 4)).toEqual([]);
    expect(realLessons([n(0, '평범한 기사')])).toEqual([]);
  });
});
