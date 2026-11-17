import { describe, expect, it } from 'vitest';
import { buildView, CURRENT_RULES_VERSION, dayClock, graceDeadline, nextRoomState, preAllReadyDeadline, validateEndTurn, type GameData } from './engine.js';
import { BOT_TIMES, botCheckpoints, runBots, stepKey } from './bots.js';

const T0 = 1_900_000_000_000;
/** 사람 a + 봇들 (첫날 장이 열린 상태, 하루 60초) */
function game(levels: number[], humans = ['a']): GameData {
  const deadline = T0 + 63_000;
  return {
    room: { id: 'r', code: 'AAAAAA', seed: 7, salt: 'cd'.repeat(16), status: 'playing', total_days: 10, turn_seconds: 60, day: 0, deadline, day_deadline: deadline, host_id: 'a', version: CURRENT_RULES_VERSION },
    players: [
      ...humans.map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
      ...levels.map((lv, i) => ({ id: 'bot' + i, room_id: 'r', nickname: '봇' + i, mode: 'pro' as const, ready: true, ended_day: -1, created_at: String(10 + i), version: 0, bot_level: lv })),
    ],
    trades: [],
    items: [],
    orders: [],
  };
}
/** 봇이 한 일을 데이터에 반영 (서버·브라우저가 하는 일) */
function apply(d: GameData, run: ReturnType<typeof runBots>) {
  d.trades.push(...run.trades);
  d.items.push(...run.items);
  d.players = d.players.map((p) => (run.steps[p.id] !== undefined ? { ...p, bot_step: run.steps[p.id] } : p));
}
const tickAt = (d: GameData, tick: number) => dayClock(d.room, T0).startAt + tick * dayClock(d.room, T0).tickMs + 1;

describe('봇', () => {
  it('하루 3번 움직이는 칸: 시작 · 중간 · 끝 무렵', () => {
    expect(botCheckpoints(60)).toEqual([0, 27, 57]);
  });

  it('원본 데이터를 바꾸지 않고, 봇의 거래만 새로 돌려줌', () => {
    const d = game([1, 2, 3]);
    const before = JSON.stringify(d);
    const run = runBots(d, tickAt(d, 1));
    expect(JSON.stringify(d)).toBe(before);
    for (const t of run.trades) expect(t.player_id.startsWith('bot')).toBe(true);
    for (const it of run.items) expect(it.player_id.startsWith('bot')).toBe(true);
    expect(Object.keys(run.steps).sort()).toEqual(['bot0', 'bot1', 'bot2']);
  });

  it('같은 칸은 한 번만 (이미 움직인 칸이면 아무것도 안 함)', () => {
    const d = game([2, 2]);
    const t = tickAt(d, 1);
    apply(d, runBots(d, t));
    const again = runBots(d, t);
    expect(again.trades.length + again.items.length).toBe(0);
    expect(again.steps).toEqual({});
  });

  it('같은 상황이면 같은 행동 (서버 요청이 여러 번 와도 결과가 같음)', () => {
    const a = runBots(game([1, 2, 3]), tickAt(game([1]), 1), { salt: 's' });
    const b = runBots(game([1, 2, 3]), tickAt(game([1]), 1), { salt: 's' });
    expect(a.trades.map((t) => [t.player_id, t.symbol, t.side, t.qty])).toEqual(b.trades.map((t) => [t.player_id, t.symbol, t.side, t.qty]));
  });

  it('사람이 모두 마감하면 남은 칸을 한꺼번에 하고 바로 다음 날 (카운트다운 없음)', () => {
    const d = game([3]);
    const now = tickAt(d, 5);
    apply(d, runBots(d, now));
    const end = validateEndTurn(d, 'a', now);
    d.players = d.players.map((p) => (p.id === 'a' ? { ...p, ended_day: end.day } : p));
    // 봇이 마감 안 했어도 사람이 다 마감했으니 넘어감
    expect(graceDeadline(d, now)).toBeNull();
    const run = runBots(d, now, { humansDone: true });
    expect(run.steps.bot0).toBe(stepKey(0, botCheckpoints(60, BOT_TIMES[3]).length - 1));
    apply(d, run);
    expect(nextRoomState(d, now)?.day).toBe(1);
  });

  it('봇은 카운트다운·장 전 준비 기준에서 빠짐 (사람 둘 + 봇: 한 명 마감 → 1대1 처럼 90초)', () => {
    const d = game([2, 2], ['a', 'b']);
    // 하루 3분 (60초 하루는 90초 카운트다운이 원래 안 생김)
    d.room = { ...d.room, turn_seconds: 180, deadline: T0 + 183_000, day_deadline: T0 + 183_000 };
    const now = tickAt(d, 3);
    d.players = d.players.map((p) => (p.id === 'a' ? { ...p, ended_day: 0 } : p));
    const g = graceDeadline(d, now);
    expect(g).not.toBeNull();
    expect(Math.round((g! - now) / 1000)).toBe(90);
    expect(preAllReadyDeadline(d, now)).toBeNull();
  });

  it('사람이 모두 나가면 판이 끝남', () => {
    const d = game([2, 3]);
    d.players = d.players.map((p) => (p.id === 'a' ? { ...p, left_game: true, ended_day: 10 } : p));
    expect(nextRoomState(d, tickAt(d, 2))?.status).toBe('finished');
  });

  it('사람만 있는 판은 예전 그대로 (둘 중 한 명이 나가면 끝, 아니면 계속)', () => {
    const d = game([], ['a', 'b']);
    expect(nextRoomState(d, tickAt(d, 2))).toBeNull();
    d.players = d.players.map((p) => (p.id === 'b' ? { ...p, left_game: true, ended_day: 10 } : p));
    expect(nextRoomState(d, tickAt(d, 2))?.status).toBe('finished');
  });

  it('정보가 새지 않는다: 사람 화면 데이터에 봇의 거래·카드·보유가 없음', () => {
    const d = game([1, 1, 1, 2, 3]);
    apply(d, runBots(d, tickAt(d, 1)));
    apply(d, runBots(d, tickAt(d, 30)));
    expect(d.trades.length).toBeGreaterThan(0);
    const v = buildView(d, 'a', tickAt(d, 2));
    const s = JSON.stringify(v);
    for (const t of d.trades) expect(s.includes(String(t.created_at))).toBe(false);
    expect(v.myItemRows.every((r) => r.player_id === 'a')).toBe(true);
    const bot = v.players.find((p) => p.id === 'bot4')!;
    expect(bot.bot).toBe(3);
    expect(bot.status).toBe('on');
    // 상대(봇) 재산은 정확한 값이 아니라 구간
    expect(bot.band).toBeTruthy();
  });

  it('봇은 미래를 모른다: 봇 판단에 쓰이는 화면 데이터엔 내일 가격이 없음', () => {
    const d = game([3]);
    const v = buildView(d, 'bot0', tickAt(d, 1));
    for (const bars of Object.values(v.market!.bars)) expect(bars.length).toBeLessThanOrEqual(1);
  });

  it('10일 동안 봇끼리 돌려도 오류 없이 끝까지 (난이도 1·2·3)', () => {
    const d = game([1, 2, 3]);
    for (let day = 0; day < 10; day++) {
      for (const tick of [0, 30, 58]) apply(d, runBots(d, tickAt(d, tick)));
      const now = tickAt(d, 59);
      d.players = d.players.map((p) => (p.id === 'a' ? { ...p, ended_day: day } : p));
      apply(d, runBots(d, now, { humansDone: true }));
      const next = nextRoomState(d, now)!;
      d.room = { ...d.room, ...next, ...(next.deadline ? {} : {}) };
      if (d.room.status === 'finished') break;
      // 다음 날 장 전 시간을 건너뛰고 장이 열린 상태로
      const dl = now + 1000 + 63_000;
      d.room = { ...d.room, deadline: dl, day_deadline: dl };
    }
    expect(d.room.status).toBe('finished');
    expect(d.trades.filter((t) => t.player_id.startsWith('bot')).length).toBeGreaterThan(5);
  });
});
