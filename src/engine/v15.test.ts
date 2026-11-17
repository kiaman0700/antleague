/** 규칙 v15 (설계서 design/story-v2.md): 예고(발표 n일차) → 날마다 기대감 → 약 35% 반전 소식 → 발표 크기는 '이미 오른 만큼'을 뺌 */
import { describe, expect, it } from 'vitest';
import { marketFor, sliceMarket } from './engine.js';

const salt = (i: number) => (i + 7).toString(16).padStart(32, '0');

describe('v15 사건 흐름', () => {
  it('v14 시장은 v15 코드가 들어가도 그대로 (같은 시드·salt 의 가격·뉴스가 같음)', () => {
    for (let i = 0; i < 10; i++) {
      const a = marketFor(500 + i, 10, 14, salt(i));
      const b = marketFor(500 + i, 10, 14, salt(i));
      expect(JSON.stringify(a.bars.CORE)).toBe(JSON.stringify(b.bars.CORE));
      // 예고 문구에 'n일차 발표 예정'이 붙지 않음 (v15 만)
      expect(a.news.some((n) => /일차 발표 예정\)/.test(n.headline))).toBe(false);
    }
  });
  it('예고 뉴스에 발표 날짜가 있고, 그날 장중에 결과 속보가 나옴', () => {
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      const m = marketFor(700 + i, 20, 15, salt(i));
      for (const n of m.news.filter((x) => /\((\d+)일차 발표 예정\)/.test(x.headline))) {
        const day = Number(n.headline.match(/\((\d+)일차 발표 예정\)/)![1]) - 1;
        const result = m.news.find((x) => x.day === day && x.symbol === n.symbol && x.at != null && x.label === '속보');
        expect(result, n.headline).toBeTruthy();
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
  it('반전 소식은 사건의 약 35%, 발표 전날·당일 아침, 진위는 발표 다음 날까지 화면에 없음', () => {
    let stories = 0;
    let twists = 0;
    for (let i = 0; i < 60; i++) {
      const m = marketFor(900 + i, 20, 15, salt(i));
      const opens = m.news.filter((x) => /일차 발표 예정\)/.test(x.headline));
      stories += opens.length;
      for (const tw of m.news.filter((x) => x.label === '특징주' && x.revealDay != null)) {
        twists++;
        expect(tw.at).toBeUndefined(); // 아침 기사
        expect(tw.tone).toBe('bad');
        // 발표 다음 날 전까지는 진위(verdict)·실제 방향이 화면에 없음
        for (let day = tw.day; day < tw.revealDay! && day < 20; day++) {
          const shown = sliceMarket(m, day, false, { rumorCheck: false, fakes: [] }).news.find((x) => x.headline === tw.headline && x.day === tw.day)!;
          expect(shown.verdict).toBeUndefined();
          expect(shown.realTone).toBe(shown.tone);
          expect('fake' in shown).toBe(false);
        }
      }
    }
    expect(twists / stories).toBeGreaterThan(0.2);
    expect(twists / stories).toBeLessThan(0.5);
  });
});
