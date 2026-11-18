import type { SupabaseClient } from '@supabase/supabase-js';
import { skillSummary, type GameSkill } from '../../src/game/skill.js';

/** 마이프로필 '나의 투자 감각': 최근 20판 평균 (내 기록만, 숫자만) — 059 전이면 null */
export async function mySkills(sb: SupabaseClient, uid: string) {
  const r = await sb.from('skill_log').select('catches, news_buys, news_true, max_weight, beat').eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
  if (r.error) return null;
  const rows: GameSkill[] = ((r.data ?? []) as { catches: number; news_buys: number; news_true: number; max_weight: number; beat: number }[]).map((x) => ({ catches: x.catches, newsBuys: x.news_buys, newsTrue: x.news_true, maxWeight: x.max_weight, beat: x.beat }));
  // 앞 10판과 뒤 10판을 비교해 나아졌는지 (판이 12판 넘을 때만)
  const recent = skillSummary(rows.slice(0, 10));
  const older = rows.length >= 12 ? skillSummary(rows.slice(10)) : null;
  return { all: skillSummary(rows), recent, older };
}
