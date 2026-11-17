import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LEVEL_BADGES, MISSIONS, MISSION_MAP, levelBadges, levelOf, missionGain, missionPeriods, pickMissions, type MissionGame } from './missions.js';
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

describe('미션 고르기', () => {
  it('오늘: 쉬움 2 + 보통 1 (겹치지 않음), 이번 주: 어려움 1', () => {
    for (let i = 0; i < 200; i++) {
      const day = pickMissions(hex('u' + i, 'd:2026-11-17'), 'day');
      expect(day).toHaveLength(3);
      expect(new Set(day).size).toBe(3);
      expect(day.map((id) => MISSION_MAP[id].tier)).toEqual(['easy', 'easy', 'normal']);
      const week = pickMissions(hex('u' + i, 'w:2026-11-16'), 'week');
      expect(week).toHaveLength(1);
      expect(MISSION_MAP[week[0]].tier).toBe('hard');
    }
  });
  it('같은 계정·같은 날은 같은 미션, 계정·날짜가 바뀌면 여러 가지가 나옴', () => {
    expect(pickMissions(hex('a', 'd:2026-11-17'), 'day')).toEqual(pickMissions(hex('a', 'd:2026-11-17'), 'day'));
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(pickMissions(hex('a', 'd:2026-11-' + (10 + i)), 'day').join());
    expect(seen.size).toBeGreaterThan(10);
    const all = new Set<string>();
    for (let i = 0; i < 300; i++) pickMissions(hex('x' + i, 'd:2026-11-17'), 'day').forEach((id) => all.add(id));
    expect(all.size).toBe(MISSIONS.filter((m) => m.tier !== 'hard').length); // 모든 미션이 나올 수 있음
  });
});

describe('미션 판정 (서버가 끝난 판으로만)', () => {
  it('기권했거나 거래가 없으면(끝까지 안 함) 아무것도 안 셈', () => {
    for (const m of MISSIONS) expect(missionGain(m.id, game({ finished: false, won: true, ret: 0.5, detectorUses: 3, kind: 'daily' }))).toBe(0);
  });
  it('조건별', () => {
    expect(missionGain('finish1', game())).toBe(1);
    expect(missionGain('finish1', game({ kind: 'daily' }))).toBe(0);
    expect(missionGain('daily', game({ kind: 'daily' }))).toBe(1);
    expect(missionGain('ret3', game({ ret: 0.029 }))).toBe(0);
    expect(missionGain('ret3', game({ ret: 0.031 }))).toBe(1);
    expect(missionGain('beatbot', game({ won: true, botLevels: [1] }))).toBe(0);
    expect(missionGain('beatbot', game({ won: true, botLevels: [2] }))).toBe(1);
    expect(missionGain('beathard', game({ won: true, botLevels: [2, 3] }))).toBe(1);
    expect(missionGain('top3', game({ players: 3, rank: 1 }))).toBe(0);
    expect(missionGain('top3', game({ players: 4, rank: 3 }))).toBe(1);
    expect(missionGain('win3', game({ won: true, players: 1 }))).toBe(0);
    expect(missionGain('card2', game({ cardUses: 2 }))).toBe(1);
    expect(missionGain('trade5', game({ trades: 5 }))).toBe(0);
  });
});

describe('레벨', () => {
  it('레벨마다 필요한 경험치 100 + 20×(레벨−1)', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(levelOf(99).level).toBe(1);
    expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 120 });
    expect(levelOf(220).level).toBe(3);
    expect(levelOf(-50).level).toBe(1);
  });
  it('레벨 업적은 업적 목록·사진에 있음', () => {
    for (const b of LEVEL_BADGES) {
      expect(BADGE_MAP[b.id]).toBeTruthy();
      expect(AVATARS.some((a) => a.need === b.id)).toBe(true);
    }
    expect(levelBadges(0)).toEqual([]);
    const xp5 = [1, 2, 3, 4].reduce((s, l) => s + 100 + 20 * (l - 1), 0);
    expect(levelBadges(xp5)).toEqual(['lv5']);
    expect(levelBadges(xp5 - 1)).toEqual([]);
  });
});

describe('기간', () => {
  it('한국 0시 기준 날짜와 그 주 월요일', () => {
    // 2026-11-17(화) 08:59 KST = 11-16 23:59 UTC
    const p = missionPeriods(Date.UTC(2026, 10, 16, 23, 59));
    expect(p.day).toBe('d:2026-11-17');
    expect(p.week).toBe('w:2026-11-16');
    expect(p.dayEndsAt).toBe(Date.UTC(2026, 10, 17, 15, 0)); // 11-18 0시 KST
    expect(p.weekEndsAt).toBe(Date.UTC(2026, 10, 22, 15, 0)); // 11-23(월) 0시 KST
    // 월요일 0시 KST 바로 뒤
    const m = missionPeriods(Date.UTC(2026, 10, 22, 15, 1));
    expect(m.week).toBe('w:2026-11-23');
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
