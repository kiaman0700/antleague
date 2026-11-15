import { beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage 대신 메모리
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });

const { newSolo, soloAct, soloSync } = await import('./local.js');

describe('혼자 연습: 실시간 장', () => {
  beforeEach(() => store.clear());

  it('시간이 다 되면 다음 날로 넘어가고, 다음 날 장은 내가 시작할 때까지 멈춰 있다', () => {
    const s = newSolo('나', 10, 60);
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
    const s = newSolo('나', 10, 60);
    const s1 = soloAct(s, 'endTurn', {});
    expect(s1.data.room.day).toBe(1);
    expect(s1.data.room.deadline).toBeNull();
  });

  it('이미 진행 중인 날에 시작을 또 눌러도 시간이 늘지 않는다', () => {
    const s = newSolo('나', 10, 60);
    const again = soloAct(s, 'startDay', {});
    expect(again.data.room.deadline).toBe(s.data.room.deadline);
  });
});
