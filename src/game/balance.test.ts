import { describe, expect, it } from 'vitest';
import { deriveItems, activeEffects, type ItemRow } from './items.js';
import { generateMarket } from './market.js';

describe('밸런스 v3', () => {
  it('무료 카드는 모두 같은 날 같은 종류 (v3), 예전 방은 그대로 사람마다 다름', () => {
    const v3 = deriveItems(12345, ['a', 'b', 'c'], [], 19, 20, false, 3);
    const ka = v3.players.a.grants.map((g) => g.kind).join();
    expect(v3.players.b.grants.map((g) => g.kind).join()).toBe(ka);
    expect(v3.players.c.grants.map((g) => g.kind).join()).toBe(ka);
    let differ = false;
    for (let seed = 1; seed < 30 && !differ; seed++) {
      const v1 = deriveItems(seed, ['a', 'b'], [], 19, 20, false, 1);
      differ = v1.players.a.grants.map((g) => g.kind).join() !== v1.players.b.grants.map((g) => g.kind).join();
    }
    expect(differ).toBe(true);
  });

  it('같은 날 한 사람에게 두 번째 방해는 효과 없음 (v3)', () => {
    const rows: ItemRow[] = [
      { player_id: 'a', day: 2, kind: 'freeze', action: 'buy', cost: 1, created_at: '1' },
      { player_id: 'b', day: 2, kind: 'fee', action: 'buy', cost: 1, created_at: '2' },
      { player_id: 'a', day: 2, kind: 'freeze', action: 'use', cost: 0, payload: { target: 'c' }, created_at: '3' },
      { player_id: 'b', day: 2, kind: 'fee', action: 'use', cost: 0, payload: { target: 'c' }, created_at: '4' },
    ];
    // 무료 카드(방패 등) 영향을 없애려고 방패·거울이 안 나오는 시드를 찾음
    let seed = 1;
    for (; seed < 500; seed++) {
      const st = deriveItems(seed, ['a', 'b', 'c'], [], 2, 20, false, 3);
      const c = st.players.c.inventory;
      if (!c.shield && !c.mirror) break;
    }
    const v3 = deriveItems(seed, ['a', 'b', 'c'], rows, 3, 20, false, 3);
    const onC = activeEffects(v3, 'c', 3).map((e) => e.kind);
    expect(onC).toEqual(['freeze']);
    expect(v3.effects.find((e) => e.from === 'b')?.crowded).toBe(true);
    const v1 = deriveItems(seed, ['a', 'b', 'c'], rows, 3, 20, false, 1);
    expect(v1.effects.some((e) => e.crowded)).toBe(false);
  });

  it('v3: 아침 갭 방향이 그날 장중 방향을 거의 알려주지 않음', () => {
    let same = 0;
    let n = 0;
    for (const seed of [11, 22, 33, 44, 55]) {
      const m = generateMarket(seed, 20, 3);
      for (const sym of Object.keys(m.bars)) {
        const b = m.bars[sym];
        for (let d = 1; d < 20; d++) {
          const gap = b[d].open / b[d - 1].close - 1;
          const intra = b[d].close / b[d].open - 1;
          if (Math.abs(gap) < 0.015 || intra === 0) continue;
          n++;
          if (Math.sign(gap) === Math.sign(intra)) same++;
        }
      }
    }
    expect(n).toBeGreaterThan(200);
    expect(same / n).toBeLessThan(0.66);
  });

  it('v3: 장중 속보 종목은 속보 전(시가)에 크게 움직이지 않음', () => {
    const gaps: number[] = [];
    for (const seed of [3, 5, 8, 13, 21, 34]) {
      const m = generateMarket(seed, 20, 3);
      for (const n of m.news) {
        if (n.at == null || !n.symbol || n.day === 0 || n.fake) continue;
        const b = m.bars[n.symbol];
        gaps.push(Math.abs(b[n.day].open / b[n.day - 1].close - 1));
      }
    }
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(gaps.length).toBeGreaterThan(10);
    expect(avg).toBeLessThan(0.03);
  });
});
