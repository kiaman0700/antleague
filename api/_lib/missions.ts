/**
 * 미션 서버 (설계서 design/missions.md)
 * - 고르기: HMAC(서버 비밀 키, 'mission:'+계정+기간) → 계정마다 다르고 미리 알 수 없음. 비밀값·HMAC 은 화면에 안 보냄
 * - 판정: 판이 끝날 때(maybeAdvance) 서버가 그 판의 거래·카드·주문·결과로만. 화면이 '했어요'라고 보내는 요청은 없음
 * - (계정, 판) 기록(mission_rooms)으로 같은 판은 한 번만, 하루 경험치 상한
 */
import { countsForStreak, myStreak, recordPlayDay } from './streaks.js';
import { leagueAdd, leagueRank } from './league.js';
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finalResults, GameError, marketFor, playedLastDay, portfolioOf, PREMARKET_VERSION, type GameData } from '../../src/engine/engine.js';
import { gameSkill } from '../../src/game/skill.js';
import { BADGE_XP, DAILY_XP_CAP, levelNeed, FIRST_WIN_XP, GAME_XP_CAP, MISSION_MAP, MODE_LABEL, REROLLS, capXp, firstWinEligible, gameXp, levelOf, missionGain, missionPeriods, pickMissions, rerollPick, type MissionGame } from '../../src/game/missions.js';
import { KR_INDEX_BASE } from '../../src/game/market.js';
import { preRumors } from '../../src/game/rumors.js';
import { COMMUNITY_VERSION, communityPosts } from '../../src/game/community.js';
import { STOCK_MAP } from '../../src/game/stocks.js';
import { earnedBadges } from './accounts.js';

function pickHex(uid: string, period: string) {
  return createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('mission:' + uid + ':' + period).digest('hex');
}
export function missionsFor(uid: string, now = Date.now()) {
  const p = missionPeriods(now);
  return { ...p, dayIds: pickMissions(pickHex(uid, p.day), 'day'), weekIds: pickMissions(pickHex(uid, p.week), 'week') };
}

/* ---- 미션 바꾸기: mission_rerolls(계정, 기간)에 바꾼 횟수와 칸별로 바뀐 미션 ---- */
interface Rerolls {
  ok: boolean;
  day: { count: number; slots: Record<string, string> };
  week: { count: number; slots: Record<string, string> };
}
async function loadRerolls(sb: SupabaseClient, uid: string, day: string, week: string): Promise<Rerolls> {
  const empty = { count: 0, slots: {} };
  const r = await sb.from('mission_rerolls').select('period, count, slots').eq('user_id', uid).in('period', [day, week]);
  if (r.error) return { ok: false, day: empty, week: empty }; // 041 적용 전: 바꾸기만 꺼짐
  const rows = (r.data ?? []) as { period: string; count: number; slots: Record<string, string> | null }[];
  const of = (period: string) => {
    const x = rows.find((y) => y.period === period);
    return x ? { count: x.count ?? 0, slots: x.slots ?? {} } : empty;
  };
  return { ok: true, day: of(day), week: of(week) };
}
const applySlots = (ids: string[], slots: Record<string, string>) => ids.map((id, i) => (slots[String(i)] && MISSION_MAP[slots[String(i)]] ? slots[String(i)] : id));
/** 바꾼 것까지 반영한 그 사람의 일일·주간 미션 */
async function missionsForUser(sb: SupabaseClient, uid: string, now = Date.now()) {
  const ms = missionsFor(uid, now);
  const rr = await loadRerolls(sb, uid, ms.day, ms.week);
  return { ...ms, dayIds: applySlots(ms.dayIds, rr.day.slots), weekIds: applySlots(ms.weekIds, rr.week.slots), rerolls: rr };
}

/** 미완료 미션 하나를 다른 것으로 (일일 하루 3번 · 주간 한 주 1번, 서버가 횟수·완료 여부 확인, 동시 요청은 한 번만) */
export async function rerollMission(sb: SupabaseClient, uid: string, b: { kind?: unknown; slot?: unknown }, now = Date.now()) {
  const kind = b.kind === 'day' || b.kind === 'week' ? b.kind : null;
  const slot = typeof b.slot === 'number' && Number.isInteger(b.slot) ? b.slot : -1;
  if (!kind || slot < 0 || slot >= (kind === 'day' ? 6 : 3)) throw new GameError('바꿀 미션을 다시 골라 주세요.');
  const prof = await sb.from('profiles').select('user_id').eq('user_id', uid).maybeSingle();
  if (prof.error || !prof.data) throw new GameError('미션은 회원만 바꿀 수 있어요.', 403);
  const st = await missionsForUser(sb, uid, now);
  if (!st.rerolls.ok) throw new GameError('지금은 미션을 바꿀 수 없어요. 잠시 뒤에 다시 해 주세요.', 503);
  const period = kind === 'day' ? st.day : st.week;
  const ids = kind === 'day' ? st.dayIds : st.weekIds;
  const cur = st.rerolls[kind];
  if (cur.count >= REROLLS[kind]) throw new GameError(kind === 'day' ? '오늘은 일일 미션을 더 바꿀 수 없어요.' : '이번 주는 주간 미션을 더 바꿀 수 없어요.', 409);
  const pr = await sb.from('mission_progress').select('done').eq('user_id', uid).eq('period', period).eq('mission', ids[slot]).maybeSingle();
  if ((pr.data as { done?: boolean } | null)?.done) throw new GameError('이미 완료한 미션은 바꿀 수 없어요.', 409);
  const next = rerollPick(pickHex(uid, period + ':reroll:' + cur.count + ':' + slot), kind, slot, ids);
  if (!next) throw new GameError('바꿀 수 있는 미션이 없어요.', 409);
  const slots = { ...cur.slots, [String(slot)]: next };
  // 횟수가 그대로일 때만 바꿈 (연타·동시 요청은 한 번만)
  const w =
    cur.count === 0 && !Object.keys(cur.slots).length
      ? await sb.from('mission_rerolls').insert({ user_id: uid, period, count: 1, slots }).select('period')
      : await sb.from('mission_rerolls').update({ count: cur.count + 1, slots }).eq('user_id', uid).eq('period', period).eq('count', cur.count).select('period');
  if (w.error || !(w.data ?? []).length) throw new GameError('잠시 뒤에 다시 해 주세요.', 409);
  // 바꾸는 사이 판이 끝나 원래 미션이 완료됐으면 되돌림 (같은 칸에서 경험치를 두 번 받지 않게)
  const again = await sb.from('mission_progress').select('done').eq('user_id', uid).eq('period', period).eq('mission', ids[slot]).maybeSingle();
  if ((again.data as { done?: boolean } | null)?.done) {
    if (cur.count === 0 && !Object.keys(cur.slots).length) await sb.from('mission_rerolls').delete().eq('user_id', uid).eq('period', period).eq('count', 1);
    else await sb.from('mission_rerolls').update({ count: cur.count, slots: cur.slots }).eq('user_id', uid).eq('period', period).eq('count', cur.count + 1);
    throw new GameError('이미 완료한 미션은 바꿀 수 없어요.', 409);
  }
  return missionState(sb, uid, now);
}

interface ProgressRow {
  period: string;
  mission: string;
  progress: number;
  goal: number;
  xp: number;
  done: boolean;
  done_at: string | null;
}
const missing = (msg: string) => /mission_|xp|add_xp/.test(msg);

/* ---- 판 경험치 (설계서 design/game-xp.md): xp_log 의 (계정, key) 기본키로 한 번만, 하루 상한 ---- */
/** 오늘(한국 0시 뒤) 받은 판 경험치 (판·오늘 첫 승. 업적 보너스는 상한에 안 셈) */
async function gameXpToday(sb: SupabaseClient, uid: string, dayEndsAt: number) {
  const since = new Date(dayEndsAt - 86_400_000).toISOString();
  const r = await sb.from('xp_log').select('key, xp').eq('user_id', uid).gte('created_at', since);
  if (r.error) return null;
  return ((r.data ?? []) as { key: string; xp: number }[]).filter((x) => !x.key.startsWith('badge:') && !x.key.startsWith('league:') && x.key !== 'tutorial').reduce((s, x) => s + (x.xp ?? 0), 0);
}
/** 기록 한 줄을 먼저 넣고(이미 있으면 안 줌) 그만큼 경험치를 더함 */
async function grant(sb: SupabaseClient, uid: string, key: string, xp: number, detail: string) {
  const ins = await sb.from('xp_log').insert({ user_id: uid, key, xp, detail: detail.slice(0, 80) });
  if (ins.error) {
    if (!/duplicate|unique/i.test(ins.error.message) && !missing(ins.error.message)) console.error('[api] xp_log', ins.error.message);
    return false;
  }
  if (xp > 0) {
    const add = await sb.rpc('add_xp', { p_user: uid, p_xp: xp });
    if (add.error) console.error('[api] add_xp', add.error.message);
    else await leagueAdd(sb, uid, xp);
  }
  return true;
}
/*
 * (051) 튜토리얼 완료하기 미션 — 일일·주간과 따로, 계정마다 한 번:
 * 게임 기초(②)를 끝내면 레벨 1 → 2 에 필요한 경험치(levelNeed(1) = 100)만큼. 하루 상한 밖.
 * 튜토리얼은 브라우저 판이라 서버는 '끝냈다'는 기록만 믿음 → 계정마다 한 번, 큰 보상 아님
 */
export const TUTORIAL_XP = levelNeed(1);
async function tutorialDone(sb: SupabaseClient, uid: string) {
  const t = await sb.from('tutorial_progress').select('done').eq('user_id', uid).maybeSingle();
  return !t.error && !!(t.data as { done?: string[] } | null)?.done?.includes('game');
}
/** 회원이고 튜토리얼(게임 기초)을 끝냈으면 한 번 경험치 (게스트로 끝내고 나중에 가입해도 여기서 받음) */
export async function grantTutorialXp(sb: SupabaseClient, uid: string) {
  const prof = await sb.from('profiles').select('user_id').eq('user_id', uid).maybeSingle();
  if (prof.error || !prof.data) return false;
  if (!(await tutorialDone(sb, uid))) return false;
  return grant(sb, uid, 'tutorial', TUTORIAL_XP, '튜토리얼 완료');
}

/** 끝난 판 하나로 판 경험치·오늘 첫 승·새 업적 보너스 */
async function grantGameXp(sb: SupabaseClient, uid: string, roomId: string, game: MissionGame, day: string, dayEndsAt: number) {
  const used = await gameXpToday(sb, uid, dayEndsAt);
  if (used === null) return; // 039 적용 전: 판 경험치만 건너뜀
  let budget = GAME_XP_CAP - used;
  const parts = gameXp(game);
  if (parts.length) {
    let want = parts.reduce((s, x) => s + x.xp, 0);
    let label = parts.map((x) => `${x.label} ${x.xp}`).join(' · ');
    // 봇전 판 경험치는 하루 첫 판만 (30초 번개 봇전 반복으로 리그 점수를 올리지 못하게).
    // (계정, 'botday:날짜') 기본키라 두 판이 동시에 끝나도 한 판만 받음
    if (game.kind === 'bot') {
      const first = await sb.from('xp_log').insert({ user_id: uid, key: 'botday:' + day, xp: 0, detail: 'room:' + roomId });
      if (first.error) {
        want = 0;
        label = '봇전 경험치는 하루 첫 판만 — 오늘은 이미 받았어요';
      }
    }
    const xp = capXp(want, budget);
    if (await grant(sb, uid, 'game:' + roomId, xp, label)) budget -= xp;
  }
  if (firstWinEligible(game) && budget > 0) await grant(sb, uid, 'firstwin:' + day, capXp(FIRST_WIN_XP, budget), 'room:' + roomId); // 어느 판에서 받았는지 (결과 화면 표시용)
  // 새로 딴 업적: 처음 보는 계정은 지금까지 딴 것을 0 으로 적어 두기만 (예전 업적으로 한꺼번에 받지 않게)
  try {
    const ids = Object.keys(await earnedBadges(sb, uid)).filter((id) => !id.startsWith('lv'));
    if (!ids.length) return;
    const seen = await sb.from('xp_log').select('key').eq('user_id', uid).like('key', 'badge:%');
    if (seen.error) return;
    const have = new Set(((seen.data ?? []) as { key: string }[]).map((x) => x.key.slice(6)));
    const fresh = ids.filter((id) => !have.has(id));
    const first = have.size === 0;
    for (const id of fresh) await grant(sb, uid, 'badge:' + id, first ? 0 : BADGE_XP, first ? '이전 업적' : '새 업적');
  } catch (e) {
    console.error('[api] badge xp', e instanceof Error ? e.message : e);
  }
}

/** 오늘 0시(한국) 뒤에 받은 미션 경험치 */
async function xpToday(sb: SupabaseClient, uid: string, dayEndsAt: number) {
  const since = new Date(dayEndsAt - 86_400_000).toISOString();
  const r = await sb.from('mission_progress').select('xp, mission').eq('user_id', uid).eq('done', true).gte('done_at', since);
  return ((r.data ?? []) as { xp: number; mission: string }[]).filter((x) => MISSION_MAP[x.mission]?.scope !== 'week').reduce((s, x) => s + (x.xp ?? 0), 0);
}

/** 끝난 판 하나로 그 판 회원들의 미션 진행 (서버만, 한 번만) */
export async function evaluateMissions(sb: SupabaseClient, d: GameData, fin: ReturnType<typeof finalResults>, now = Date.now()) {
  // 게임 데이터에는 계정 id 가 없음 → 자리 표에서 따로 (서버 안에서만)
  const seats = ((await sb.from('players').select('id, user_id').eq('room_id', d.room.id)).data ?? []) as { id: string; user_id: string | null }[];
  const uidOf = new Map(seats.filter((s) => s.user_id).map((s) => [s.id, s.user_id as string]));
  const humans = d.players.filter((p) => uidOf.has(p.id) && !p.bot_level).map((p) => ({ ...p, user_id: uidOf.get(p.id)! }));
  if (!humans.length) return;
  const uids = humans.map((p) => p.user_id);
  const prof = await sb.from('profiles').select('user_id').in('user_id', uids);
  if (prof.error) return;
  const members = new Set(((prof.data ?? []) as { user_id: string }[]).map((x) => x.user_id));
  let market: ReturnType<typeof marketFor> | null = null;
  const botLevels = d.players.filter((p) => p.bot_level).map((p) => p.bot_level as number);
  for (const p of humans) {
    const uid = p.user_id;
    // 연속 기록은 손님도 (랭킹전·일반전·오늘의 도전을 끝까지 + 거래 1번 이상)
    if (countsForStreak(d.room.kind, !!p.left_game, d.trades.filter((t) => t.player_id === p.id).length)) await recordPlayDay(sb, uid, d.room.id, now);
    if (!members.has(uid) || p.left_game) continue;
    // 같은 판은 한 번만 (기본키) — 먼저 넣은 요청만 진행
    const claim = await sb.from('mission_rooms').insert({ user_id: uid, room_id: d.room.id });
    if (claim.error) {
      if (!/duplicate|unique/i.test(claim.error.message) && !missing(claim.error.message)) console.error('[api] mission claim', claim.error.message);
      continue;
    }
    const trades = d.trades.filter((t) => t.player_id === p.id);
    const uses = d.items.filter((i) => i.player_id === p.id && i.action === 'use');
    const idx = fin.results.findIndex((r) => r.nickname === p.nickname);
    const res = fin.results[idx];
    if (!res) continue;
    market ??= marketFor(d.room.seed, d.room.total_days, d.room.version ?? 1, d.room.salt);
    const m = market;
    const game: MissionGame = {
      kind: d.room.kind ?? 'custom',
      // 끝까지 하고 거래를 1번 이상 (짜고 바로 끝내는 판 막기)
      finished: !p.left_game && trades.length > 0,
      ret: res.ret,
      rank: idx + 1,
      players: d.players.length,
      won: fin.winner === p.nickname,
      botLevels,
      trades: trades.length,
      boughtBreaking: trades.some((t) => t.side === 'buy' && m.news.some((n) => n.day === t.day && n.symbol === t.symbol && n.at != null)),
      detectorUses: uses.filter((i) => i.kind === 'detector').length,
      cardUses: uses.length,
      filledOrders: d.orders.filter((o) => o.player_id === p.id && o.status === 'filled').length,
      ranked: !!d.room.ranked,
      boughtKr: trades.some((t) => t.side === 'buy' && STOCK_MAP[t.symbol]?.currency !== 'USD' && !STOCK_MAP[t.symbol]?.etf),
      boughtUs: trades.some((t) => t.side === 'buy' && STOCK_MAP[t.symbol]?.currency === 'USD'),
      boughtEtf: trades.some((t) => t.side === 'buy' && !!STOCK_MAP[t.symbol]?.etf),
      // 그날 장 전 커뮤니티 글(진짜·헛소문 모두)이나 (v20+) 그날 장중 커뮤니티 글에 나온 업종의 종목을 그날 삼
      boughtRumorSector:
        (d.room.version ?? 1) >= PREMARKET_VERSION &&
        trades.some((t) => {
          if (t.side !== 'buy') return false;
          const sec = STOCK_MAP[t.symbol]?.sector;
          if (preRumors(m, t.day, d.room.salt ?? String(d.room.seed)).some((r) => r.sector === sec)) return true;
          return (d.room.version ?? 1) >= COMMUNITY_VERSION && !!d.room.salt && communityPosts(m, t.day, d.room.salt).some((p) => p.sector === sec);
        }),
      indexRet: m.index.length ? m.index[m.index.length - 1].close / KR_INDEX_BASE - 1 : undefined,
      ...gameExtras(d, p.id, trades, uses.map((i) => i.kind)),
    };
    // '나의 투자 감각' 기록 (059) — 끝까지 하고 거래한 판만, 실패해도 미션엔 영향 없음
    if (game.finished) {
      try {
        const sk = gameSkill(m, trades, res.ret, playedLastDay(d) ?? d.room.total_days - 1);
        const ins = await sb.from('skill_log').insert({ user_id: uid, room_id: d.room.id, catches: sk.catches, news_buys: sk.newsBuys, news_true: sk.newsTrue, max_weight: Math.round(sk.maxWeight * 1000) / 1000, beat: Math.round(sk.beat * 10000) / 10000 });
        if (ins.error && !/duplicate|unique|skill_log/i.test(ins.error.message)) console.error('[api] skill_log', ins.error.message);
      } catch (e) {
        console.error('[api] skill', e instanceof Error ? e.message : e);
      }
    }
    const ms = await missionsForUser(sb, uid, now);
    // 오늘 첫 승은 'd:' 날짜 열쇠 (미션 기간 이름 'd2:' 와 상관없이 하루 한 번)
    await grantGameXp(sb, uid, d.room.id, game, ms.day.replace(/^d2:/, 'd:'), ms.dayEndsAt);
    const todo = [...ms.dayIds.map((id) => ({ id, period: ms.day })), ...ms.weekIds.map((id) => ({ id, period: ms.week }))].filter((x) => missionGain(x.id, game) > 0);
    if (!todo.length) continue;
    let budget = DAILY_XP_CAP - (await xpToday(sb, uid, ms.dayEndsAt));
    for (const t of todo) {
      const def = MISSION_MAP[t.id];
      const cur = (await sb.from('mission_progress').select('progress, done').eq('user_id', uid).eq('period', t.period).eq('mission', t.id).maybeSingle()).data as { progress: number; done: boolean } | null;
      if (cur?.done) continue;
      const progress = Math.min(def.goal, (cur?.progress ?? 0) + missionGain(t.id, game));
      const done = progress >= def.goal;
      // 하루 상한은 일일 미션만 (주간 미션은 따로)
      const xp = done ? (def.scope === 'week' ? def.xp : Math.max(0, Math.min(def.xp, budget))) : 0;
      const row = { user_id: uid, period: t.period, mission: t.id, progress, goal: def.goal, xp, done, done_at: done ? new Date(now).toISOString() : null };
      // 동시에 다른 판이 같은 줄을 바꿨으면(진행이 달라졌으면) 이번 칸은 건너뜀 → 경험치를 두 번 주지 않음
      const w = cur
        ? await sb.from('mission_progress').update(row).eq('user_id', uid).eq('period', t.period).eq('mission', t.id).eq('progress', cur.progress).eq('done', false).select('mission')
        : await sb.from('mission_progress').insert(row).select('mission');
      if (w.error || !(w.data ?? []).length) continue;
      if (done && xp > 0) {
        if (def.scope === 'day') budget -= xp;
        const add = await sb.rpc('add_xp', { p_user: uid, p_xp: xp });
        if (add.error) console.error('[api] add_xp', add.error.message);
        else await leagueAdd(sb, uid, xp);
      }
    }
  }
}

/** 화면용: 내 오늘·이번 주 미션, 레벨 (비밀값·다른 사람 정보 없음) */
export async function missionState(sb: SupabaseClient, uid: string, now = Date.now(), roomId?: string) {
  const ms = await missionsForUser(sb, uid, now);
  const prof = await sb.from('profiles').select('xp').eq('user_id', uid).maybeSingle();
  const member = !prof.error && !!prof.data;
  let xp = member ? ((prof.data as { xp?: number }).xp ?? 0) : 0;
  let rows: ProgressRow[] = [];
  if (member) {
    const r = await sb.from('mission_progress').select('period, mission, progress, goal, xp, done, done_at').eq('user_id', uid).in('period', [ms.day, ms.week]);
    if (!r.error) rows = (r.data ?? []) as ProgressRow[];
  }
  const view = (id: string, period: string) => {
    const def = MISSION_MAP[id];
    const row = rows.find((x) => x.period === period && x.mission === id);
    return { id, title: def.title, tier: def.tier, xp: row?.done ? row.xp : def.xp, goal: def.goal, progress: row?.progress ?? 0, done: !!row?.done, modes: def.modes.map((m) => MODE_LABEL[m]) };
  };
  // 튜토리얼 완료하기 미션: 끝냈는데 아직 못 받았으면(게스트 때 끝내고 가입 등) 지금 받음
  const tutDone = await tutorialDone(sb, uid);
  let tutGot = false;
  if (member) {
    const g = await sb.from('xp_log').select('key').eq('user_id', uid).eq('key', 'tutorial').maybeSingle();
    tutGot = !g.error && !!g.data;
    if (!tutGot && tutDone && (await grantTutorialXp(sb, uid))) {
      tutGot = true;
      xp += TUTORIAL_XP; // 방금 받은 만큼 (위에서 읽은 값은 받기 전)
    }
  }
  const todayXp = member ? await xpToday(sb, uid, ms.dayEndsAt) : 0;
  const gameToday = member ? ((await gameXpToday(sb, uid, ms.dayEndsAt)) ?? 0) : 0;
  // 결과 화면: 이 판에서 받은 판 경험치 (내 것만)
  let thisGame: { xp: number; detail: string; firstWin: number } | null = null;
  let league: Awaited<ReturnType<typeof leagueRank>> = null;
  if (member && roomId) {
    const g = await sb.from('xp_log').select('xp, detail').eq('user_id', uid).eq('key', 'game:' + roomId).maybeSingle();
    if (!g.error && g.data) {
      const fw = await sb.from('xp_log').select('xp').eq('user_id', uid).eq('key', 'firstwin:' + ms.day.replace(/^d2:/, 'd:')).eq('detail', 'room:' + roomId).maybeSingle();
      const row = g.data as { xp: number; detail: string | null };
      thisGame = { xp: row.xp, detail: row.detail ?? '', firstWin: !fw.error && fw.data ? (fw.data as { xp: number }).xp : 0 };
    }
    league = await leagueRank(sb, uid);
  }
  return {
    member,
    xp,
    level: levelOf(xp),
    today: { endsAt: ms.dayEndsAt, list: ms.dayIds.map((id) => view(id, ms.day)) },
    week: { endsAt: ms.weekEndsAt, list: ms.weekIds.map((id) => view(id, ms.week)) },
    todayXp,
    cap: DAILY_XP_CAP,
    gameToday,
    gameCap: GAME_XP_CAP,
    thisGame,
    // 결과 화면: 이번 주 리그 내 순위
    league,
    // 연속 기록 (손님도) — 숫자만
    streak: await myStreak(sb, uid, now),
    // 튜토리얼 완료하기 (한 번) — 회원은 받았는지, 게스트는 끝냈는지
    tutorial: { done: member ? tutGot : tutDone, xp: TUTORIAL_XP },
    // 남은 바꾸기 횟수 (회원·041 적용 뒤에만)
    rerolls: member && ms.rerolls.ok ? { day: Math.max(0, REROLLS.day - ms.rerolls.day.count), week: Math.max(0, REROLLS.week - ms.rerolls.week.count) } : null,
  };
}
export type MissionState = Awaited<ReturnType<typeof missionState>>;

/** 미션 50·30가지 판정 재료 (서버 데이터로만): 매도·수익 매도·산 종목/업종 수·미국/바이오 매수·레버리지/인버스·쓴 카드·현금 마감·가장 오래 든 날·배당 */
function gameExtras(d: GameData, playerId: string, trades: GameData['trades'], usedKinds: string[]) {
  const pf = portfolioOf(d, playerId);
  const buys = trades.filter((t) => t.side === 'buy');
  const def = (s: string) => STOCK_MAP[s];
  // 종목마다 들고 있던 날 수 (사서 다 팔 때까지, 끝까지 들고 있으면 마지막 날까지)
  let maxHoldDays = 0;
  const bySym = new Map<string, GameData['trades']>();
  for (const t of [...trades].sort((a, b) => a.day - b.day)) bySym.set(t.symbol, [...(bySym.get(t.symbol) ?? []), t]);
  for (const list of bySym.values()) {
    let qty = 0;
    let since = -1;
    for (const t of list) {
      if (t.side === 'buy') {
        if (qty === 0) since = t.day;
        qty += t.qty;
      } else {
        qty -= t.qty;
        if (qty <= 0 && since >= 0) {
          maxHoldDays = Math.max(maxHoldDays, t.day - since);
          qty = 0;
          since = -1;
        }
      }
    }
    if (qty > 0 && since >= 0) maxHoldDays = Math.max(maxHoldDays, d.room.total_days - 1 - since);
  }
  return {
    sells: trades.filter((t) => t.side === 'sell').length,
    profitSells: pf.closed.filter((c) => c.pnl > 0).length,
    symbolsBought: new Set(buys.map((t) => t.symbol)).size,
    sectorsBought: [...new Set(buys.map((t) => def(t.symbol)?.sector).filter((x): x is string => !!x))],
    usBuys: buys.filter((t) => def(t.symbol)?.currency === 'USD').length,
    bioBuys: buys.filter((t) => def(t.symbol)?.sector === 'bio').length,
    boughtLev: buys.some((t) => (def(t.symbol)?.etf?.lev ?? 1) > 1),
    boughtInverse: buys.some((t) => (def(t.symbol)?.etf?.lev ?? 1) < 0),
    usedKinds: [...new Set(usedKinds)],
    endedCash: Object.keys(pf.holdings).length === 0,
    maxHoldDays,
    dividends: pf.dividendLog.reduce((s, x) => s + x.amount, 0),
    days: d.room.total_days,
  };
}

