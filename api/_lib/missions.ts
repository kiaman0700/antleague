/**
 * 미션 서버 (설계서 design/missions.md)
 * - 고르기: HMAC(서버 비밀 키, 'mission:'+계정+기간) → 계정마다 다르고 미리 알 수 없음. 비밀값·HMAC 은 화면에 안 보냄
 * - 판정: 판이 끝날 때(maybeAdvance) 서버가 그 판의 거래·카드·주문·결과로만. 화면이 '했어요'라고 보내는 요청은 없음
 * - (계정, 판) 기록(mission_rooms)으로 같은 판은 한 번만, 하루 경험치 상한
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { finalResults, marketFor, type GameData } from '../../src/engine/engine.js';
import { BADGE_XP, DAILY_XP_CAP, FIRST_WIN_XP, GAME_XP_CAP, MISSION_MAP, capXp, firstWinEligible, gameXp, levelOf, missionGain, missionPeriods, pickMissions, type MissionGame } from '../../src/game/missions.js';
import { earnedBadges } from './accounts.js';

function pickHex(uid: string, period: string) {
  return createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('mission:' + uid + ':' + period).digest('hex');
}
export function missionsFor(uid: string, now = Date.now()) {
  const p = missionPeriods(now);
  return { ...p, dayIds: pickMissions(pickHex(uid, p.day), 'day'), weekIds: pickMissions(pickHex(uid, p.week), 'week') };
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
  return ((r.data ?? []) as { key: string; xp: number }[]).filter((x) => !x.key.startsWith('badge:')).reduce((s, x) => s + (x.xp ?? 0), 0);
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
  }
  return true;
}
/** 끝난 판 하나로 판 경험치·오늘 첫 승·새 업적 보너스 */
async function grantGameXp(sb: SupabaseClient, uid: string, roomId: string, game: MissionGame, day: string, dayEndsAt: number) {
  const used = await gameXpToday(sb, uid, dayEndsAt);
  if (used === null) return; // 039 적용 전: 판 경험치만 건너뜀
  let budget = GAME_XP_CAP - used;
  const parts = gameXp(game);
  if (parts.length) {
    const want = parts.reduce((s, x) => s + x.xp, 0);
    const xp = capXp(want, budget);
    if (await grant(sb, uid, 'game:' + roomId, xp, parts.map((x) => `${x.label} ${x.xp}`).join(' · '))) budget -= xp;
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
  const r = await sb.from('mission_progress').select('xp').eq('user_id', uid).eq('done', true).gte('done_at', since);
  return ((r.data ?? []) as { xp: number }[]).reduce((s, x) => s + (x.xp ?? 0), 0);
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
    };
    const ms = missionsFor(uid, now);
    await grantGameXp(sb, uid, d.room.id, game, ms.day, ms.dayEndsAt);
    const todo = [...ms.dayIds.map((id) => ({ id, period: ms.day })), ...ms.weekIds.map((id) => ({ id, period: ms.week }))].filter((x) => missionGain(x.id, game) > 0);
    if (!todo.length) continue;
    let budget = DAILY_XP_CAP - (await xpToday(sb, uid, ms.dayEndsAt));
    for (const t of todo) {
      const def = MISSION_MAP[t.id];
      const cur = (await sb.from('mission_progress').select('progress, done').eq('user_id', uid).eq('period', t.period).eq('mission', t.id).maybeSingle()).data as { progress: number; done: boolean } | null;
      if (cur?.done) continue;
      const progress = Math.min(def.goal, (cur?.progress ?? 0) + missionGain(t.id, game));
      const done = progress >= def.goal;
      const xp = done ? Math.max(0, Math.min(def.xp, budget)) : 0;
      const row = { user_id: uid, period: t.period, mission: t.id, progress, goal: def.goal, xp, done, done_at: done ? new Date(now).toISOString() : null };
      // 동시에 다른 판이 같은 줄을 바꿨으면(진행이 달라졌으면) 이번 칸은 건너뜀 → 경험치를 두 번 주지 않음
      const w = cur
        ? await sb.from('mission_progress').update(row).eq('user_id', uid).eq('period', t.period).eq('mission', t.id).eq('progress', cur.progress).eq('done', false).select('mission')
        : await sb.from('mission_progress').insert(row).select('mission');
      if (w.error || !(w.data ?? []).length) continue;
      if (done && xp > 0) {
        budget -= xp;
        const add = await sb.rpc('add_xp', { p_user: uid, p_xp: xp });
        if (add.error) console.error('[api] add_xp', add.error.message);
      }
    }
  }
}

/** 화면용: 내 오늘·이번 주 미션, 레벨 (비밀값·다른 사람 정보 없음) */
export async function missionState(sb: SupabaseClient, uid: string, now = Date.now(), roomId?: string) {
  const ms = missionsFor(uid, now);
  const prof = await sb.from('profiles').select('xp').eq('user_id', uid).maybeSingle();
  const member = !prof.error && !!prof.data;
  const xp = member ? ((prof.data as { xp?: number }).xp ?? 0) : 0;
  let rows: ProgressRow[] = [];
  if (member) {
    const r = await sb.from('mission_progress').select('period, mission, progress, goal, xp, done, done_at').eq('user_id', uid).in('period', [ms.day, ms.week]);
    if (!r.error) rows = (r.data ?? []) as ProgressRow[];
  }
  const view = (id: string, period: string) => {
    const def = MISSION_MAP[id];
    const row = rows.find((x) => x.period === period && x.mission === id);
    return { id, title: def.title, tier: def.tier, xp: row?.done ? row.xp : def.xp, goal: def.goal, progress: row?.progress ?? 0, done: !!row?.done };
  };
  const todayXp = member ? await xpToday(sb, uid, ms.dayEndsAt) : 0;
  const gameToday = member ? ((await gameXpToday(sb, uid, ms.dayEndsAt)) ?? 0) : 0;
  // 결과 화면: 이 판에서 받은 판 경험치 (내 것만)
  let thisGame: { xp: number; detail: string; firstWin: number } | null = null;
  if (member && roomId) {
    const g = await sb.from('xp_log').select('xp, detail').eq('user_id', uid).eq('key', 'game:' + roomId).maybeSingle();
    if (!g.error && g.data) {
      const fw = await sb.from('xp_log').select('xp').eq('user_id', uid).eq('key', 'firstwin:' + ms.day).eq('detail', 'room:' + roomId).maybeSingle();
      const row = g.data as { xp: number; detail: string | null };
      thisGame = { xp: row.xp, detail: row.detail ?? '', firstWin: !fw.error && fw.data ? (fw.data as { xp: number }).xp : 0 };
    }
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
  };
}
export type MissionState = Awaited<ReturnType<typeof missionState>>;
