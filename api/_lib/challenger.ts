/**
 * 챌린저 (설계서 design/v24-big-update.md A): 마스터 위, 단계 없음, 정원이 정해진 자리.
 * 조건: 배치 끝난 회원(시험 계정 제외) · 점수 1750 이상 · 최근 7일 안에 랭킹전 1판 이상.
 * 자리 수 = 배치 끝난 회원의 1%(최소 3·최대 50). 조건을 채운 사람 중 점수 순으로 자리까지만, 남으면 비워 둠.
 * 계산은 서버만 — 화면에는 그 사람이 챌린저인지와 #순위(1부터)만 보냄. 5분 기억.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHALLENGER_MIN, PLACEMENT_GAMES } from '../../src/game/tier.js';

let cache: { at: number; map: Map<string, number> } | null = null;

export async function challengerMap(sb: SupabaseClient): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.map;
  const map = new Map<string, number>();
  try {
    let placed = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES).eq('is_test', false);
    if (placed.error) placed = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES);
    const seats = Math.min(50, Math.max(3, Math.ceil((placed.count ?? 0) * 0.01)));
    let top = await sb.from('profiles').select('user_id, rating').gte('ranked_games', PLACEMENT_GAMES).gte('rating', CHALLENGER_MIN).eq('is_test', false).order('rating', { ascending: false }).limit(seats * 3);
    if (top.error) top = await sb.from('profiles').select('user_id, rating').gte('ranked_games', PLACEMENT_GAMES).gte('rating', CHALLENGER_MIN).order('rating', { ascending: false }).limit(seats * 3);
    const cand = (top.data ?? []) as { user_id: string; rating: number }[];
    if (cand.length) {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const act = await sb.from('match_players').select('user_id').in('user_id', cand.map((c) => c.user_id)).eq('rated', true).gte('created_at', since);
      const active = new Set(((act.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
      let n = 0;
      for (const c of cand) {
        if (!active.has(c.user_id)) continue;
        map.set(c.user_id, ++n);
        if (n >= seats) break;
      }
    }
  } catch {
    /* 표시만 빠짐 */
  }
  cache = { at: Date.now(), map };
  return map;
}
