/**
 * 연속 기록 (design/v26-batch.md A, DB 061 play_days).
 * 인정되는 판: 랭킹전·일반전(rooms.kind 'match')·오늘의 도전('daily')을 끝까지 하고(기권 X) 거래 1번 이상.
 * 판이 끝난 날(한국 날짜)에 계정마다 한 줄 — 기본키라 같은 날 여러 판이어도 한 번. 연속·최고는 이 표로만 계산.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { streakOf } from '../../src/game/streak.js';

export const STREAK_KINDS = new Set(['match', 'daily']);
const kst = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

/** 이 판이 연속 기록으로 인정되는지 */
export function countsForStreak(kind: string | null | undefined, leftGame: boolean, trades: number) {
  return STREAK_KINDS.has(kind ?? '') && !leftGame && trades > 0;
}

/**
 * 한 날로 적기. 자정을 넘겨 끝난 판은 시작한 날(startedAt)에 먼저 적고, 그날이 이미 적혀 있으면 끝난 날에 —
 * 밤 11시 50분에 시작해 0시 5분에 끝낸 판 때문에 매일 했는데도 연속이 끊기지 않게
 */
export async function recordPlayDay(sb: SupabaseClient, uid: string, roomId: string, now = Date.now(), startedAt?: number) {
  const days = [...new Set([startedAt && startedAt < now ? kst(startedAt) : null, kst(now)].filter((x): x is string => !!x))];
  for (const day of days) {
    const r = await sb.from('play_days').insert({ user_id: uid, day, room_id: roomId });
    if (!r.error) return;
    // 같은 날 두 번째 판(기본키 충돌)이면 다음 날짜로, 061 적용 전이면 조용히 넘어감
    if (!/duplicate|unique|play_days/i.test(r.error.message)) console.error('[api] play day', r.error.message);
    if (!/duplicate|unique/i.test(r.error.message)) return;
  }
}

/** 내 연속 기록 (최근 400일만 봄) — 숫자만 돌려줌 */
export async function myStreak(sb: SupabaseClient, uid: string, now = Date.now()) {
  const today = kst(now);
  const since = kst(now - 400 * 86_400_000);
  const r = await sb.from('play_days').select('day').eq('user_id', uid).gte('day', since).limit(500);
  if (r.error) return null;
  return streakOf(((r.data ?? []) as { day: string }[]).map((x) => String(x.day).slice(0, 10)), today);
}
