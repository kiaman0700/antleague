import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
const { makeTutorial, soloAct, soloView, TUTORIAL_BOT } = await import('./local.js');

describe('튜토리얼 게임', () => {
  beforeEach(() => store.clear());
  it('첫날 아침에 오를 좋은 기업 뉴스가 있고, 봇이 함께 있다', () => {
    const t = makeTutorial('나');
    const v = soloView(t);
    expect(v.players.map((p) => p.nickname)).toContain(TUTORIAL_BOT.nickname);
    expect(v.market!.news.some((n) => n.day === 0 && n.symbol === t.tutorial!.symbol && n.tone === 'good')).toBe(true);
    expect(v.myItems.inventory.detector).toBe(1);
    expect(v.myItems.inventory.shield).toBe(1);
    expect(v.room.deadline).toBeNull(); // 시간이 흐르지 않음
  });
  it('장 마감하면 봇도 같이 마감해 다음 날로, 봇의 수수료 폭탄을 내 방패가 막는다', () => {
    const t = soloAct(makeTutorial('나'), 'endTurn', {});
    expect(t.data.room.day).toBe(1);
    const v = soloView(t);
    expect(v.notices.some((n) => n.text.includes('방패') && n.text.includes(TUTORIAL_BOT.nickname))).toBe(true);
    expect(v.effectsToday).not.toContain('fee');
    expect(v.myItems.inventory.shield ?? 0).toBe(0);
  });
  it('튜토리얼은 하던 연습 게임을 덮어쓰지 않는다', () => {
    soloAct(makeTutorial('나'), 'endTurn', {});
    expect(store.has('stockduel.solo2')).toBe(false);
  });
});
