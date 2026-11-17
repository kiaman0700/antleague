/**
 * 밸런스용 판 기록 (DB 044 game_stats): 실제 유저 판이 끝날 때 자리마다 한 줄 — 계정 id 없이 자리 id 만.
 * 시험 회원(profiles.is_test) 판은 is_test 로 표시. 실패해도 게임 진행에는 영향 없음
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { cardStats, type finalResults, type GameData } from '../../src/engine/engine.js';
import { STOCK_MAP } from '../../src/game/stocks.js';
import { isPlaced, tierOf } from '../../src/game/tier.js';
import { levelOf } from '../../src/game/missions.js';

export async function recordGameStats(sb: SupabaseClient, d: GameData, fin: ReturnType<typeof finalResults>) {
  const seats = ((await sb.from('players').select('id, user_id').eq('room_id', d.room.id)).data ?? []) as { id: string; user_id: string | null }[];
  const uids = seats.map((s) => s.user_id).filter((x): x is string => !!x);
  // 실력 정보는 이 판의 점수 반영(recordMatch) 전에 읽음 → 그 판 시작 때의 점수·판 수
  let prof = uids.length ? await sb.from('profiles').select('user_id, is_test, rating, ranked_games, games, xp').in('user_id', uids) : { data: [], error: null };
  if (prof.error) prof = uids.length ? ((await sb.from('profiles').select('user_id, rating, games').in('user_id', uids)) as typeof prof) : prof;
  type P = { user_id: string; is_test?: boolean; rating?: number; ranked_games?: number; games?: number; xp?: number };
  const profOf = new Map(((prof.data ?? []) as P[]).map((p) => [p.user_id, p]));
  const uidOf = new Map(seats.map((s) => [s.id, s.user_id]));
  // 시험 계정(시험 회원 is_test · 자동 시험 도구가 쓴 계정 test_users)이 한 명이라도 있으면 그 판 전체를 시험 판으로 (분석에서 뺌)
  const tu = uids.length ? await sb.from('test_users').select('user_id').in('user_id', uids) : { data: [], error: null };
  const testGame = [...profOf.values()].some((p) => p.is_test) || ((tu.data ?? []) as unknown[]).length > 0;
  // 카드 자세히(048): 언제·누구에게·막힘·그 뒤 결과. 계산이 실패해도 판 기록은 남김
  let cs: ReturnType<typeof cardStats> = {};
  try {
    cs = cardStats(d);
  } catch (e) {
    console.error('[api] cardStats', (e as Error).message);
  }
  const rows = d.players.map((p) => {
    const idx = fin.results.findIndex((r) => r.nickname === p.nickname);
    const res = fin.results[idx];
    const cards: Record<string, number> = {};
    for (const i of d.items) if (i.player_id === p.id && i.action === 'use') cards[i.kind] = (cards[i.kind] ?? 0) + 1;
    const trades = d.trades.filter((t) => t.player_id === p.id);
    const uid = uidOf.get(p.id) ?? null;
    const pr = uid ? profOf.get(uid) : undefined;
    // 같은 판 다른 회원들의 평균 점수와의 차 (상대가 더 셌는지)
    const others = d.players.filter((o) => o.id !== p.id).map((o) => profOf.get(uidOf.get(o.id) ?? '')?.rating).filter((x): x is number => typeof x === 'number');
    const tier = p.bot_level ? 'bot' : !pr ? 'guest' : !isPlaced(pr.ranked_games) ? 'unplaced' : tierOf(pr.rating ?? 1000).id;
    return {
      room_id: d.room.id,
      seat_id: p.id,
      kind: d.room.kind ?? 'custom',
      ranked: !!d.room.ranked,
      version: d.room.version ?? 1,
      players: d.players.length,
      days: d.room.total_days,
      turn_seconds: d.room.turn_seconds,
      rank: idx + 1,
      ret: res?.ret ?? 0,
      won: fin.winner === p.nickname,
      left_game: !!p.left_game,
      idle: !!res?.idle,
      bot_level: p.bot_level ?? null,
      member: !!(uid && profOf.has(uid)),
      is_test: testGame,
      trades: trades.length,
      cards,
      lev: trades.some((t) => t.side === 'buy' && (STOCK_MAP[t.symbol]?.etf?.lev ?? 1) !== 1),
      rating: pr?.rating ?? null,
      tier,
      games_before: pr?.games ?? null,
      level: pr ? levelOf(pr.xp ?? 0).level : null,
      card_log: cs[p.id]?.uses ?? [],
      cards_hit: cs[p.id]?.hit ?? {},
      shield_blocks: cs[p.id]?.blocked ?? 0,
      mirror_hits: cs[p.id]?.mirrored ?? 0,
      opp_diff: pr?.rating != null && others.length ? Math.round(pr.rating - others.reduce((a, b) => a + b, 0) / others.length) : null,
    };
  });
  let r = await sb.from('game_stats').upsert(rows, { onConflict: 'room_id,seat_id', ignoreDuplicates: true });
  // 048 적용 전이면 카드 자세히 칸 없이
  if (r.error && /card_log|cards_hit|shield_blocks|mirror_hits/.test(r.error.message)) {
    const slim = rows.map(({ card_log: _a, cards_hit: _b, shield_blocks: _c, mirror_hits: _d, ...x }) => x);
    r = await sb.from('game_stats').upsert(slim, { onConflict: 'room_id,seat_id', ignoreDuplicates: true });
  }
  if (r.error && !/game_stats/.test(r.error.message)) console.error('[api] game_stats', r.error.message);
}
