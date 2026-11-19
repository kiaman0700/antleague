import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage 대신 메모리
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });

const { newSolo, soloAct: rawAct, soloSync } = await import('./local.js');
const { deriveAugs, pendingSlot } = await import('./augs.js');
/** 증강 고르는 날이면 먼저 하나 고르고 마감 (v27 — 고르기 전엔 마감 불가) */
const soloAct: typeof rawAct = (s, action, payload) => {
  if (action === 'endTurn') {
    const p = pendingSlot(deriveAugs(s.data), 'me', s.data.room.day);
    if (p) s = rawAct(s, 'pickAug', { aug: p.offer[0] });
  }
  return rawAct(s, action, payload);
};

describe('혼자 연습: 실시간 장', () => {
  beforeEach(() => store.clear());

  it('시간이 다 되면 다음 날로 넘어가고, 다음 날 장은 내가 시작할 때까지 멈춰 있다', () => {
    // 새 연습은 장 전(멈춤)으로 시작 → 장 시작
    const s = soloAct(newSolo('나', 10, 60), 'startDay', {});
    const end = s.data.room.deadline!;
    const s1 = soloSync(s, end + 1);
    expect(s1.data.room.day).toBe(1);
    expect(s1.data.room.deadline).toBeNull(); // 결산을 보는 동안 시간이 흐르지 않음
    // 몇 분이 지나도 그대로
    expect(soloSync(s1, end + 10 * 60_000)).toBe(s1);
    const s2 = soloAct(s1, 'startDay', {});
    expect(s2.data.room.deadline).toBeGreaterThan(Date.now());
    expect(s2.data.room.day).toBe(1);
  });

  it('장 마감을 누르면 바로 다음 날, 역시 멈춘 채로', () => {
    // 새 연습은 장 전(멈춤)으로 시작 → 장 시작
    const s = soloAct(newSolo('나', 10, 60), 'startDay', {});
    const s1 = soloAct(s, 'endTurn', {});
    expect(s1.data.room.day).toBe(1);
    expect(s1.data.room.deadline).toBeNull();
  });

  it('이미 진행 중인 날에 시작을 또 눌러도 시간이 늘지 않는다', () => {
    // 새 연습은 장 전(멈춤)으로 시작 → 장 시작
    const s = soloAct(newSolo('나', 10, 60), 'startDay', {});
    const again = soloAct(s, 'startDay', {});
    expect(again.data.room.deadline).toBe(s.data.room.deadline);
  });
});

describe('혼자 연습: 무제한', () => {
  beforeEach(() => store.clear());
  it('시간이 끝나도 다음 날로 안 넘어가고, 종가로 계속 거래, 장 마감을 눌러야 다음 날', () => {
    const s = soloAct(newSolo('나', 10, 0), 'startDay', {});
    expect(s.unlimited).toBe(true);
    const priceEnd = s.data.room.day_deadline!;
    expect(s.data.room.deadline! - priceEnd).toBeGreaterThan(86_400_000);
    // 가격 시계가 끝나고 한참 지나도 그대로 첫날
    const later = priceEnd + 10 * 60_000;
    const s1 = soloSync(s, later);
    expect(s1.data.room.day).toBe(0);
    // 장 마감을 누르면 다음 날 (멈춘 채)
    const s2 = soloAct(s1, 'endTurn', {});
    expect(s2.data.room.day).toBe(1);
    // 다음 날을 시작해도 다시 무제한
    const s3 = soloAct(s2, 'startDay', {});
    expect(s3.data.room.deadline! - s3.data.room.day_deadline!).toBeGreaterThan(86_400_000);
  });
});

describe('혼자 연습: 장 전은 무제한', () => {
  beforeEach(() => store.clear());
  it('새 판·새 날은 장 전으로 멈춰 있고, 장 시작 전엔 지금 가격 거래가 안 되며 몇 시간이 지나도 그대로', () => {
    const s = newSolo('나', 10, 60);
    expect(s.data.room.deadline).toBeNull();
    expect(soloSync(s, Date.now() + 5 * 3_600_000)).toBe(s);
    expect(() => soloAct(s, 'trade', { symbol: 'CORE', side: 'buy', qty: 1 })).toThrow(/장 시작/);
    const open = soloAct(s, 'startDay', {});
    expect(open.data.room.deadline).not.toBeNull();
    expect(() => soloAct(open, 'trade', { symbol: 'CORE', side: 'buy', qty: 1 })).not.toThrow();
  });
});
