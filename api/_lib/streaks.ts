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

export async function recordPlayDay(sb: SupabaseClient, uid: string, roomId: string, now = Date.now()) {
  const r = await sb.from('play_days').insert({ user_id: uid, day: kst(now), room_id: roomId });
  // 같은 날 두 번째 판(기본키 충돌)·061 적용 전이면 조용히 넘어감
  if (r.error && !/duplicate|unique|play_days/i.test(r.error.message)) console.error('[api] play day', r.error.message);
}

/** 내 연속 기록 (최근 400일만 봄) — 숫자만 돌려줌 */
export async function myStreak(sb: SupabaseClient, uid: string, now = Date.now()) {
  const today = kst(now);
  const since = kst(now - 400 * 86_400_000);
  const r = await sb.from('play_days').select('day').eq('user_id', uid).gte('day', since).limit(500);
  if (r.error) return null;
  return streakOf(((r.data ?? []) as { day: string }[]).map((x) => String(x.day).slice(0, 10)), today);
}
