import { describe, expect, it } from 'vitest';
import { buildView, marketFor, type GameData } from './engine.js';
import { releaseTick } from '../game/intraday.js';

const SALT = '9a'.repeat(16);
const T0 = 1_900_000_000_000;

describe('v12: 현실 같은 사건 흐름', () => {
  it('판마다 시작 가격이 크게 다름 (같은 시드라도 비밀값이 다르면)', () => {
    const a = marketFor(1, 10, 12, 'aa'.repeat(16)).base.CORE;
    const b = marketFor(1, 10, 12, 'bb'.repeat(16)).base.CORE;
    const ratios: number[] = [];
    for (let i = 0; i < 40; i++) ratios.push(marketFor(1, 10, 12, i.toString(16).padStart(32, '0')).base.HBIO / 38000);
    expect(a).not.toBe(b);
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeGreaterThan(1.8);
  });
  it('예전 버전(v11) 가격은 그대로', () => {
    const m11a = marketFor(7, 10, 11, SALT);
    const m11b = marketFor(7, 10, 11, SALT);
    expect(m11a.bars.CORE.map((x) => x.close)).toEqual(m11b.bars.CORE.map((x) => x.close));
    expect(m11a.news.some((n) => /임상 3상 결과 .*발표 예정/.test(n.headline))).toBe(false);
  });
  it('사건 결과는 장중 속보로, 공개 칸 전에는 화면 데이터에 없음', () => {
    let checked = 0;
    for (let s = 0; s < 30 && checked < 5; s++) {
      const salt = (s + 1).toString(16).padStart(32, '0');
      const m = marketFor(100 + s, 10, 12, salt);
      const res = m.news.find((n) => n.label === '속보' && n.at != null && /성공|실패|체결|무산|확정|불발|탈락|낙찰|호평|혹평|흥행|부진|결렬|철회|승인|불허|획득/.test(n.headline));
      if (!res) continue;
      const day = res.day;
      const d: GameData = {
        room: { id: 'r', code: 'AAAAAA', seed: 100 + s, salt, status: 'playing', total_days: 10, turn_seconds: 60, day, deadline: T0 + 60_000, day_deadline: T0 + 60_000, host_id: 'a', version: 12 },
        players: ['a', 'b'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: day - 1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
        trades: [],
        items: [],
        orders: [],
      };
      const rel = releaseTick(res.at!, 60);
      const before = buildView(d, 'a', T0 + (rel - 1) * 1000 + 100);
      const after = buildView(d, 'a', T0 + rel * 1000 + 100);
      expect(JSON.stringify(before.market?.news ?? [])).not.toContain(res.headline);
      expect(JSON.stringify(after.market?.news ?? [])).toContain(res.headline);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('바이오 임상 결과 날은 크게 움직임 (상·하한가 근처)', () => {
    let big = 0;
    let n = 0;
    for (let s = 0; s < 80; s++) {
      const m = marketFor(500 + s, 20, 12, (s + 7).toString(16).padStart(32, '0'));
      for (const nw of m.news.filter((x) => x.at != null && /임상 3상 (성공|실패)|임상 중단|임상 결과 기대/.test(x.headline))) {
        const b = m.bars[nw.symbol!][nw.day];
        const prev = nw.day > 0 ? m.bars[nw.symbol!][nw.day - 1].close : m.base[nw.symbol!];
        n++;
        if (Math.abs(b.close / prev - 1) > 0.12) big++;
      }
    }
    expect(n).toBeGreaterThan(3);
    expect(big / n).toBeGreaterThan(0.6);
  });
});
