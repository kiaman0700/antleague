import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FIRST_WIN_XP, GAME_XP_CAP, LEVEL_BADGES, MAX_LEVEL, levelNeed, MISSIONS, MISSION_MAP, capXp, firstWinEligible, gameXp, levelBadges, levelOf, missionGain, missionPeriods, pickMissions, REROLLS, rerollPick, type MissionGame } from './missions.js';
import { BADGE_MAP } from './achievements.js';
import { AVATARS } from './avatars.js';

const hex = (uid: string, period: string) => createHmac('sha256', 'test-secret').update('mission:' + uid + ':' + period).digest('hex');
const game = (g: Partial<MissionGame> = {}): MissionGame => ({
  kind: 'match',
  finished: true,
  ret: 0,
  rank: 2,
  players: 2,
  won: false,
  botLevels: [],
  trades: 3,
  boughtBreaking: false,
  detectorUses: 0,
  cardUses: 0,
  filledOrders: 0,
  ...g,
});

describe('미션 고르기 (2판: 일일 6 · 주간 3)', () => {
  it('일일: 쉬움 3 + 보통 3, 주간: 보통 1 + 어려움 2 — 겹치지 않고 각자 목록에서만', () => {
    for (let i = 0; i < 300; i++) {
      const day = pickMissions(hex('u' + i, 'd2:2026-11-18'), 'day');
      expect(day).toHaveLength(6);
      expect(new Set(day).size).toBe(6);
      expect(day.map((id) => MISSION_MAP[id].tier)).toEqual(['easy', 'easy', 'easy', 'normal', 'normal', 'normal']);
      expect(day.every((id) => MISSION_MAP[id].scope === 'day')).toBe(true);
      const week = pickMissions(hex('u' + i, 'w2:2026-11-16'), 'week');
      expect(week).toHaveLength(3);
      expect(new Set(week).size).toBe(3);
      expect(week.map((id) => MISSION_MAP[id].tier)).toEqual(['normal', 'hard', 'hard']);
      expect(week.every((id) => MISSION_MAP[id].scope === 'week')).toBe(true);
    }
  });
  it('같은 계정·같은 날은 같은 미션, 사람·날짜마다 여러 가지, 모든 미션이 나올 수 있음', () => {
    expect(pickMissions(hex('a', 'd2:2026-11-17'), 'day')).toEqual(pickMissions(hex('a', 'd2:2026-11-17'), 'day'));
    const people = new Set<string>();
    for (let i = 0; i < 50; i++) people.add(pickMissions(hex('p' + i, 'd2:2026-11-17'), 'day').join());
    expect(people.size).toBeGreaterThan(30);
    const all = new Set<string>();
    for (let i = 0; i < 600; i++) {
      pickMissions(hex('x' + i, 'd2:2026-11-17'), 'day').forEach((id) => all.add(id));
      pickMissions(hex('x' + i, 'w2:2026-11-16'), 'week').forEach((id) => all.add(id));
    }
    expect(all.size).toBe(MISSIONS.length);
  });
  it('일일·주간 목록은 겹치지 않음, 모든 미션에 게임 종류가 있음', () => {
    const ids = MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MISSIONS) expect(m.modes.length).toBeGreaterThan(0);
  });
  it('바꾸기: 같은 칸 등급·같은 목록에서, 지금 목록에 없는 것', () => {
    const cur = pickMissions(hex('r', 'd2:2026-11-18'), 'day');
    for (let n = 0; n < 50; n++) {
      const slot = n % 6;
      const id = rerollPick(hex('r', 'reroll:' + n), 'day', slot, cur)!;
      expect(cur.includes(id)).toBe(false);
      expect(MISSION_MAP[id].scope).toBe('day');
      expect(MISSION_MAP[id].tier).toBe(MISSION_MAP[cur[slot]].tier);
    }
    expect(REROLLS).toEqual({ day: 3, week: 1 });
  });
});

describe('미션 판정 (서버가 끝난 판으로만, 게임 종류별)', () => {
  it('기권했거나 거래가 없으면(끝까지 안 함) 아무것도 안 셈', () => {
    for (const m of MISSIONS) expect(missionGain(m.id, game({ finished: false, won: true, ret: 0.5, detectorUses: 3, kind: 'daily' }))).toBe(0);
  });
  it('게임 종류가 맞아야 셈', () => {
    expect(missionGain('bot1', game({ kind: 'bot' }))).toBe(1);
    expect(missionGain('bot1', game({ kind: 'match' }))).toBe(0);
    expect(missionGain('match1', game({ kind: 'match' }))).toBe(1);
    expect(missionGain('match1', game({ kind: 'custom' }))).toBe(0);
    expect(missionGain('custom1', game({ kind: 'friend' }))).toBe(1); // 친구 1대1 = 커스텀
    expect(missionGain('finish1', game({ kind: 'daily' }))).toBe(0);
    expect(missionGain('daily', game({ kind: 'daily' }))).toBe(1);
    expect(missionGain('daily', game({ kind: 'bot' }))).toBe(0);
    expect(missionGain('win1', game({ kind: 'bot', won: true }))).toBe(0);
    expect(missionGain('win1', game({ kind: 'match', won: true }))).toBe(1);
    expect(missionGain('w_ranked2', game({ kind: 'match', won: true, ranked: false }))).toBe(0);
    expect(missionGain('w_ranked2', game({ kind: 'match', won: true, ranked: true }))).toBe(1);
  });
  it('조건별', () => {
    expect(missionGain('ret3', game({ ret: 0.029 }))).toBe(0);
    expect(missionGain('ret3', game({ ret: 0.031 }))).toBe(1);
    expect(missionGain('beatbot', game({ kind: 'bot', won: true, botLevels: [1] }))).toBe(0);
    expect(missionGain('beatbot', game({ kind: 'bot', won: true, botLevels: [2] }))).toBe(1);
    expect(missionGain('beathard', game({ kind: 'bot', won: true, botLevels: [2, 3] }))).toBe(1);
    expect(missionGain('top3', game({ players: 3, rank: 1 }))).toBe(0);
    expect(missionGain('top3', game({ players: 4, rank: 3 }))).toBe(1);
    expect(missionGain('card2', game({ cardUses: 2 }))).toBe(1);
    expect(missionGain('trade5', game({ trades: 5 }))).toBe(0);
    expect(missionGain('krus', game({ boughtKr: true, boughtUs: false }))).toBe(0);
    expect(missionGain('krus', game({ boughtKr: true, boughtUs: true }))).toBe(1);
    expect(missionGain('beatidx', game({ ret: 0.01, indexRet: 0.02 }))).toBe(0);
    expect(missionGain('beatidx', game({ ret: 0.03, indexRet: 0.02 }))).toBe(1);
    expect(missionGain('w_trade30', game({ trades: 7 }))).toBe(7);
    expect(missionGain('w_multi1', game({ players: 2, won: true }))).toBe(0);
    expect(missionGain('w_multi1', game({ players: 3, won: true }))).toBe(1);
  });
});

describe('레벨', () => {
  it('레벨마다 필요한 경험치 100 + 20×(레벨−1)', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, into: 0, need: levelNeed(2) });
    // 레벨마다 필요한 경험치가 늘어남 (4.5%씩)
    for (let l = 2; l < MAX_LEVEL; l++) expect(levelNeed(l)).toBeGreaterThanOrEqual(levelNeed(l - 1));
    expect(levelNeed(50)).toBeGreaterThan(levelNeed(10) * 4);
    // 최대 레벨 100, 거기까지 약 17만 (매일 400씩이면 1년쯤)
    let total = 0;
    for (let l = 1; l < MAX_LEVEL; l++) total += levelNeed(l);
    expect(total).toBeGreaterThan(150_000);
    expect(total).toBeLessThan(200_000);
    expect(levelOf(total).level).toBe(MAX_LEVEL);
    expect(levelOf(total * 3)).toEqual({ level: MAX_LEVEL, into: 0, need: 0 });
    expect(levelOf(-50).level).toBe(1);
  });
  it('레벨 업적은 업적 목록·사진에 있음', () => {
    for (const b of LEVEL_BADGES) {
      expect(BADGE_MAP[b.id]).toBeTruthy();
      expect(AVATARS.some((a) => a.need === b.id)).toBe(true);
    }
    expect(levelBadges(0)).toEqual([]);
    const xp5 = [1, 2, 3, 4].reduce((s, l) => s + levelNeed(l), 0);
    expect(levelBadges(xp5)).toEqual(['lv5']);
    expect(levelBadges(xp5 - 1)).toEqual([]);
  });
});

describe('기간', () => {
  it('한국 0시 기준 날짜와 그 주 월요일', () => {
    // 2026-11-17(화) 08:59 KST = 11-16 23:59 UTC
    const p = missionPeriods(Date.UTC(2026, 10, 16, 23, 59));
    expect(p.day).toBe('d2:2026-11-17');
    expect(p.week).toBe('w2:2026-11-16');
    expect(p.dayEndsAt).toBe(Date.UTC(2026, 10, 17, 15, 0)); // 11-18 0시 KST
    expect(p.weekEndsAt).toBe(Date.UTC(2026, 10, 22, 15, 0)); // 11-23(월) 0시 KST
    // 월요일 0시 KST 바로 뒤
    const m = missionPeriods(Date.UTC(2026, 10, 22, 15, 1));
    expect(m.week).toBe('w2:2026-11-23');
    expect(m.weekEndsAt).toBe(Date.UTC(2026, 10, 29, 15, 0));
  });
});

describe('미션: 정보가 새지 않는다', () => {
  it('화면에 보내는 미션 정보에 고르는 비밀값(HMAC)이 없음', async () => {
    const { missionsFor } = await import('../../api/_lib/missions.js');
    const s = JSON.stringify(missionsFor('user-1', Date.UTC(2026, 10, 17, 3)));
    expect(/[0-9a-f]{16,}/.test(s)).toBe(false);
    expect(s.includes('user-1')).toBe(false);
  });
});

describe('판 경험치 (설계서 design/game-xp.md)', () => {
  const sum = (g: MissionGame) => gameXp(g).reduce((s, x) => s + x.xp, 0);
  it('랭킹전·일반전(매칭)은 같음: 끝내기 40, 1위 +30', () => {
    expect(sum(game({ kind: 'match' }))).toBe(40);
    expect(sum(game({ kind: 'match', won: true, rank: 1 }))).toBe(70);
  });
  it('3인 이상 2위 +10, 1대1 2위는 없음', () => {
    expect(sum(game({ kind: 'match', players: 4, rank: 2 }))).toBe(50);
    expect(sum(game({ kind: 'match', players: 2, rank: 2 }))).toBe(40);
  });
  it('봇전은 작게: 10, 이기면 +5, 어려움 봇을 이기면 +10', () => {
    expect(sum(game({ kind: 'bot', botLevels: [1] }))).toBe(10);
    expect(sum(game({ kind: 'bot', botLevels: [1, 2], won: true, rank: 1 }))).toBe(15);
    expect(sum(game({ kind: 'bot', botLevels: [3], won: true, rank: 1 }))).toBe(20);
  });
  it('오늘의 도전 20', () => {
    expect(sum(game({ kind: 'daily', players: 1, rank: 1, won: true }))).toBe(20);
  });
  it('커스텀·친구 1대1·기권·거래 없음은 0', () => {
    expect(gameXp(game({ kind: 'custom', won: true }))).toEqual([]);
    expect(gameXp(game({ kind: 'friend', won: true }))).toEqual([]);
    expect(gameXp(game({ finished: false }))).toEqual([]);
    expect(gameXp(game({ trades: 0 }))).toEqual([]);
  });
  it('오늘 첫 승 보너스는 매칭 판 1위만', () => {
    expect(firstWinEligible(game({ kind: 'match', won: true }))).toBe(true);
    expect(firstWinEligible(game({ kind: 'bot', won: true }))).toBe(false);
    expect(firstWinEligible(game({ kind: 'match', won: false }))).toBe(false);
    expect(FIRST_WIN_XP).toBe(50);
  });
  it('하루 상한: 남은 만큼만', () => {
    expect(capXp(70, 30)).toBe(30);
    expect(GAME_XP_CAP).toBe(600);
    expect(capXp(70, 0)).toBe(0);
    expect(capXp(70, 500)).toBe(70);
  });
});
