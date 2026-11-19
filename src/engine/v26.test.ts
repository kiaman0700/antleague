import { describe, expect, it } from 'vitest';
import { generateMarket } from '../game/market';
import { realLessons } from '../game/realWorld';
import { sliceMarket } from './engine';
import { THEMES, themeForDay, type ThemeId } from '../game/themes';
import { createHash } from 'node:crypto';

// 가격·일정·거래정지·뉴스 시각 (v26 은 사건 기사 제목을 '경쟁사 모양'으로 바꾸지 않으므로 제목만 다를 수 있음)
const fp = (m: ReturnType<typeof generateMarket>) => JSON.stringify([m.bars, m.index, m.news.map((n) => [n.day, n.at ?? null, n.symbol, n.tone]), m.macro, m.events, m.halts ?? null]);

describe('v26 오늘의 시장', () => {
  it('테마가 없으면 v25 와 같은 시장 (가격·뉴스 시각·일정·거래정지)', () => {
    for (let i = 0; i < 12; i++) for (const days of [5, 10, 20]) expect(fp(generateMarket(900 + i, days, 26, 'v26-' + i))).toBe(fp(generateMarket(900 + i, days, 25, 'v26-' + i)));
  });
  it('테마가 있어도 v25 판(예전 방)은 그대로', () => {
    for (let i = 0; i < 5; i++) expect(fp(generateMarket(900 + i, 10, 25, 'v26-' + i, 'pump'))).toBe(fp(generateMarket(900 + i, 10, 25, 'v26-' + i)));
  });
  // 결과 화면 '실제 시장에서는?' 이 알아보는 뉴스로 사건이 들어갔는지 확인
  const sign: Record<Exclude<ThemeId, 'rate'>, string> = { pump: 'pump', war: 'war', delist: 'delist', binary: 'binary', short: 'short', rights: 'rights' };
  it('테마마다 그 사건이 반드시 나옴 (오늘의 도전 10일, 여러 시드)', () => {
    for (const t of THEMES) {
      for (let i = 0; i < 25; i++) {
        const m = generateMarket(4000 + i * 7, 10, 26, 'th-' + t.id + i, t.id);
        if (t.id === 'rate') {
          // 금통위 날 기준금리 0.5%p 변경 소식 (동결 없음)
          const bok = m.events.find((e) => e.kind === 'bok');
          expect(bok, '금통위 일정').toBeTruthy();
          expect(m.news.some((n) => n.day === bok!.day && n.macro === 'rate' && /0\.50%p/.test(n.headline)), `seed ${i}`).toBe(true);
          continue;
        }
        const kinds = realLessons(m.news, Infinity, 9).map((x) => x.kind as string);
        expect(kinds, `${t.id} seed ${i}`).toContain(sign[t.id]);
      }
    }
  });
  it('화면 데이터(오늘까지)에 테마 사건의 미래 날짜·종목이 미리 나오지 않음', () => {
    const m = generateMarket(4321, 10, 26, 'leak-26', 'delist');
    for (let day = 0; day < 10; day++) {
      const v = sliceMarket(m, day, false, { rumorCheck: false, fakes: [] });
      expect(v.news.every((n) => n.day <= day)).toBe(true);
      expect((v.halts ?? []).every((h) => h.day <= day)).toBe(true);
    }
  });
  it('테마 고르기: 7일마다 7개가 한 번씩, 이틀 연속 같은 테마 없음', () => {
    const keyOf = (b: number) => createHash('sha256').update('test-key:' + b).digest('hex');
    const days = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 10, 1) + i * 86_400_000).toISOString().slice(0, 10));
    const ts = days.map((d) => themeForDay(d, keyOf));
    for (let i = 1; i < ts.length; i++) expect(ts[i], days[i]).not.toBe(ts[i - 1]);
    const n0 = Math.round(Date.UTC(2026, 10, 1) / 86_400_000);
    const start = (7 - (n0 % 7)) % 7;
    expect(new Set(ts.slice(start, start + 7)).size).toBe(7);
  });
});

describe('v26 사건 기사 제목은 그대로', () => {
  it('공매도 보고서 속보는 오보여도 제목이 바뀌지 않음 (v25 에선 30% 가 경쟁사 기사 모양으로 바뀌어 이유 모를 급락이 됐음)', () => {
    let fakes = 0;
    for (let i = 0; i < 40; i++) {
      const m = generateMarket(7000 + i, 10, 26, 'sh-' + i, 'short');
      const brk = m.news.find((n) => /공매도 업체/.test(n.headline));
      expect(brk, 'seed ' + i).toBeTruthy();
      if (brk?.fake) fakes++;
    }
    expect(fakes).toBeGreaterThan(3);
  });
});
