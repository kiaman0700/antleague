import { describe, expect, it } from 'vitest';
import { generateMarket } from './market.js';
import { buildView, sliceMarket, type GameData } from '../engine/engine.js';
import { dayTicks } from './intraday.js';

const SALT_A = '0123456789abcdef0123456789abcdef';
const SALT_B = 'fedcba9876543210fedcba9876543210';

describe('v4 시장 비밀값', () => {
  it('같은 시드라도 비밀값이 다르면 완전히 다른 시장 (시드만으로는 알 수 없음)', () => {
    const a = generateMarket(42, 10, 4, SALT_A);
    const b = generateMarket(42, 10, 4, SALT_B);
    expect(a.macro0).not.toEqual(b.macro0);
    expect(a.news.filter((n) => n.day === 0).map((n) => n.headline)).not.toEqual(b.news.filter((n) => n.day === 0).map((n) => n.headline));
    expect(a.bars.CORE[0].open).not.toBe(b.bars.CORE[0].open);
    // 같은 비밀값이면 항상 같음 (모든 기기·서버가 같은 시장)
    expect(generateMarket(42, 10, 4, SALT_A).bars.CORE[5].close).toBe(a.bars.CORE[5].close);
  });

  it('장중 흐름도 비밀값으로', () => {
    const a = generateMarket(7, 5, 4, SALT_A);
    const b = generateMarket(7, 5, 4, SALT_B);
    expect(dayTicks(a, 'CORE', 1, 36)).not.toEqual(dayTicks(b, 'CORE', 1, 36));
  });

  it('화면 데이터에는 비밀값·시드가 없음 (진행 중·끝난 뒤 모두)', () => {
    const m = generateMarket(9, 10, 4, SALT_A);
    for (const s of [sliceMarket(m, 3, false, { rumorCheck: false, fakes: [] }), sliceMarket(m, 9, true, { rumorCheck: false, fakes: [] })]) {
      const j = JSON.stringify(s);
      expect(j).not.toContain(SALT_A);
      expect(s.seed).toBe(0);
    }
    const d: GameData = {
      room: { id: 'r', code: 'AAAAAA', seed: 9, salt: SALT_A, status: 'playing', total_days: 10, turn_seconds: 180, day: 2, deadline: Date.now() + 100000, day_deadline: Date.now() + 100000, host_id: 'a', version: 4 },
      players: [{ id: 'a', room_id: 'r', nickname: 'A', mode: 'pro', ready: true, ended_day: -1, created_at: '1', version: 0 }],
      trades: [],
      items: [],
      orders: [],
    };
    expect(JSON.stringify(buildView(d, 'a', Date.now()))).not.toContain(SALT_A);
  });

  it('v4 에서도 갭 방향이 그날 방향을 거의 알려주지 않음', () => {
    let same = 0;
    let n = 0;
    for (const salt of [SALT_A, SALT_B, 'aa'.repeat(16), 'bb'.repeat(16), 'cc'.repeat(16)]) {
      const m = generateMarket(1, 20, 4, salt);
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
});

describe('v5 갭 메우기', () => {
  it('뉴스 없는 큰 갭은 장중에 계속 같은 방향으로 갈 확률이 거의 반반', () => {
    let same = 0;
    let n = 0;
    for (const salt of [SALT_A, SALT_B, 'cd'.repeat(16), 'ef'.repeat(16)]) {
      const m = generateMarket(3, 20, 5, salt);
      for (const sym of Object.keys(m.bars)) {
        const b = m.bars[sym];
        for (let d = 1; d < 20; d++) {
          if (m.news.some((x) => x.day === d && x.symbol === sym)) continue;
          const gap = b[d].open / b[d - 1].close - 1;
          const intra = b[d].close / b[d].open - 1;
          if (Math.abs(gap) < 0.02 || intra === 0) continue;
          n++;
          if (Math.sign(gap) === Math.sign(intra)) same++;
        }
      }
    }
    expect(n).toBeGreaterThan(40);
    expect(same / n).toBeLessThan(0.6);
  });
});
