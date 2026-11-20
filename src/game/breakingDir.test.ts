import { describe, expect, it } from 'vitest';
import { dayTicks, releaseTick } from './intraday.js';
import { generateMarket } from './market.js';
import { CURRENT_RULES_VERSION } from '../engine/engine.js';

// 지금 규칙의 시장: 진짜 장중 속보가 나오면 그 순간 가격이 속보 방향으로 움직여야 함 (나쁜 속보인데 뛰면 뉴스를 읽는 재미가 깨짐)
describe('장중 속보 방향', () => {
  it('진짜 속보 직후 가격은 속보 방향으로 (여러 판)', () => {
    let checked = 0;
    let wrong = 0;
    const bad: string[] = [];
    for (let s = 1; s <= 40; s++) {
      const m = generateMarket(1000 + s, 10, CURRENT_RULES_VERSION, 'salt-' + s);
      for (const n of m.news) {
        if (n.at == null || !n.symbol || n.fake || n.rumor || n.label === '시황') continue;
        if (!m.bars[n.symbol]) continue;
        const N = 60;
        const t = dayTicks(m, n.symbol, n.day, N);
        const rel = releaseTick(n.at, N);
        if (rel < 1 || rel + 2 >= t.length) continue;
        const d = (t[rel + 2] - t[rel - 1]) / t[rel - 1];
        checked++;
        if ((n.tone === 'good' && d < 0) || (n.tone === 'bad' && d > 0)) {
          wrong++;
          if (bad.length < 5) bad.push(`${n.symbol} ${n.tone} ${(d * 100).toFixed(2)}% ${n.headline}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(wrong / checked, bad.join('\n')).toBeLessThan(0.05);
  });
});

describe('v30 속보 튐 값은 서버에만', () => {
  it('화면 데이터(sliceMarket)에 spike·span 이 없고, 예전 판(v29)엔 spike 자체가 없음', async () => {
    const { sliceMarket } = await import('../engine/engine.js');
    let found = 0;
    for (let s = 1; s <= 20; s++) {
      const m = generateMarket(1000 + s, 10, CURRENT_RULES_VERSION, 'salt-' + s);
      found += Object.values(m.bars).flat().filter((b) => b.spike).length;
      const v = sliceMarket(m, 9, true, { rumorCheck: false, fakes: [] });
      expect(JSON.stringify(v)).not.toMatch(/"spike"|"span"/);
      const old = generateMarket(1000 + s, 10, 29, 'salt-' + s);
      expect(Object.values(old.bars).flat().some((b) => b.spike !== undefined)).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });
});
