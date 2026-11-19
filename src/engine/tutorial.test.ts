import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
const { makeTutorial, soloAct: rawAct, soloView, TUTORIAL_BOT } = await import('./local.js');
const { deriveAugs, pendingSlot } = await import('./augs.js');
/** 안내대로 첫 증강은 추천(귀동냥), 그 뒤는 첫 보기 — 고른 뒤 마감 */
const soloAct: typeof rawAct = (s, action, payload) => {
  if (action === 'endTurn') {
    const p = pendingSlot(deriveAugs(s.data), 'me', s.data.room.day);
    if (p) s = rawAct(s, 'pickAug', { aug: p.offer[0] });
  }
  return rawAct(s, action, payload);
};

describe('튜토리얼 게임', () => {
  beforeEach(() => store.clear());
  it('첫날 아침에 오를 좋은 기업 뉴스가 있고, 봇이 함께 있다', () => {
    const t = makeTutorial('나');
    const v = soloView(t);
    expect(v.players.map((p) => p.nickname)).toContain(TUTORIAL_BOT.nickname);
    expect(v.market!.news.some((n) => n.day === 0 && n.symbol === t.tutorial!.symbol && n.tone === 'good')).toBe(true);
    // 첫 증강 보기는 늘 같은 쉬운 실버 3개, 다시 뽑기 없음
    expect(v.aug?.offer?.ids).toEqual(['verdict1', 'cash1', 'nofee']);
    expect(v.aug?.offer?.tier).toBe('silver');
    expect(v.aug?.offer?.canReroll).toEqual([false, false, false]);
    expect(v.room.deadline).toBeNull(); // 시간이 흐르지 않음
  });
  it('장 마감하면 봇도 같이 마감해 다음 날로, 연습봇은 방해하지 않음', () => {
    const t = soloAct(makeTutorial('나'), 'endTurn', {});
    expect(t.data.room.day).toBe(1);
    const v = soloView(t);
    expect(v.effectsToday).not.toContain('fee');
    expect(v.aug?.mine.map((x) => x.id)).toEqual(['verdict1']);
  });
  it('안내대로 첫날 그 종목을 사서 끝까지 들고 있으면 연습봇을 이긴다 (첫 판이 패배로 끝나지 않게)', () => {
    let t = makeTutorial('나');
    const sym = t.tutorial!.symbol;
    t = soloAct(t, 'startDay', {});
    const v0 = soloView(t);
    const price = v0.live?.krw?.[sym]?.at(-1) ?? v0.market!.bars[sym][0].open;
    const qty = Math.floor(900_000 / price);
    t = soloAct(t, 'trade', { symbol: sym, side: 'buy', qty });
    for (let i = 0; i < 10 && t.data.room.status === 'playing'; i++) t = soloAct(t, 'endTurn', {});
    const v = soloView(t);
    expect(v.room.status).toBe('finished');
    const me = v.players.find((p) => p.id === 'me')!;
    const bot = v.players.find((p) => p.id === TUTORIAL_BOT.id)!;
    expect(me.equity).toBeGreaterThan(bot.equity);
  });
  it('튜토리얼은 하던 연습 게임을 덮어쓰지 않는다', () => {
    soloAct(makeTutorial('나'), 'endTurn', {});
    expect(store.has('stockduel.solo2')).toBe(false);
  });
});

describe('튜토리얼 결과로 넘기기', () => {
  it('고를 증강이 남아 있어도 마지막 날까지 넘어가 끝남 (화면의 finishTutorial 과 같은 순서)', () => {
    let x = makeTutorial('나');
    for (let i = 0; x.data.room.status === 'playing' && i < 40; i++) {
      const offer = soloView(x, Date.now()).aug?.offer;
      x = offer?.ids?.length ? rawAct(x, 'pickAug', { aug: offer.ids[0] }) : rawAct(x, 'endTurn', {});
    }
    expect(x.data.room.status).toBe('finished');
  });
  it('장이 열린 튜토리얼 날은 시간이 다 돼도 저절로 넘어가지 않음', () => {
    const t = rawAct(soloAct(makeTutorial('나'), 'endTurn', {}), 'startDay', {});
    expect(t.data.room.deadline! - Date.now()).toBeGreaterThan(86_400_000);
  });
});
