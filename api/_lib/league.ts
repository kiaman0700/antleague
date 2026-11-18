/**
 * 주간 개미리그 (설계서 design/weekly-league.md, DB 053): 서버만 계산.
 * 화면에는 내 단계·내 조 순위표(닉네임·사진·점수·나인지)·승급/강등 줄·남은 시간·지난주 결과만 — 계정 id 없음
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { missionPeriods } from '../../src/game/missions.js';

export const LEAGUE_NAMES = ['알개미', '일개미', '병정개미', '정찰개미', '여왕개미', '황금개미'];
const weekOf = (now = Date.now()) => missionPeriods(now).week.replace(/^w2:/, '');

/** 경험치를 준 뒤 부름 (회원만 — 시험 회원·게스트는 DB 함수가 건너뜀). 실패해도 경험치에는 영향 없음 */
export async function leagueAdd(sb: SupabaseClient, uid: string, xp: number) {
  if (!(xp > 0)) return;
  const r = await sb.rpc('league_add', { p_user: uid, p_week: weekOf(), p_xp: Math.round(xp) });
  if (r.error && !/league_add|does not exist/.test(r.error.message)) console.error('[api] league_add', r.error.message);
}

export async function leagueInfo(sb: SupabaseClient, uid: string) {
  const week = weekOf();
  const { weekEndsAt } = missionPeriods();
  const isMember = await sb.from('profiles').select('user_id, is_test').eq('user_id', uid).maybeSingle();
  if (isMember.error && /league|relation/.test(isMember.error.message)) return { ready: false };
  if (!isMember.data) return { ready: true, member: false, names: LEAGUE_NAMES, endsAt: weekEndsAt };
  const settle = await sb.rpc('league_settle', { p_user: uid, p_week: week });
  if (settle.error) return { ready: false };
  const t = await sb.from('league_tiers').select('tier, last_week, last_rank, last_size, last_change, last_seen_week, last_reward').eq('user_id', uid).maybeSingle();
  const tier = (t.data as { tier: number } | null)?.tier ?? 0;
  const lt = t.data as { last_week: string | null; last_rank: number | null; last_size: number | null; last_change: number | null; last_seen_week: string | null; last_reward?: number | null } | null;
  // 지난주 결과는 이번 주에 한 번만 팝업
  const last = lt?.last_week && lt.last_seen_week !== week ? { rank: lt.last_rank, size: lt.last_size, change: lt.last_change, reward: lt.last_reward ?? 0 } : null;
  if (last) await sb.from('league_tiers').update({ last_seen_week: week }).eq('user_id', uid);
  const me = await sb.from('league_members').select('group_id, score').eq('week', week).eq('user_id', uid).maybeSingle();
  let group: { nickname: string; avatar: string; score: number; me: boolean }[] = [];
  if (me.data) {
    const rows = ((await sb.from('league_members').select('user_id, score, joined_at').eq('group_id', (me.data as { group_id: string }).group_id).order('score', { ascending: false }).order('joined_at')).data ?? []) as { user_id: string; score: number }[];
    const prof = rows.length ? (((await sb.from('profiles').select('user_id, nickname, avatar').in('user_id', rows.map((r) => r.user_id))).data ?? []) as { user_id: string; nickname: string; avatar?: string }[]) : [];
    const P = new Map(prof.map((p) => [p.user_id, p]));
    group = rows.map((r) => ({ nickname: P.get(r.user_id)?.nickname ?? '개미', avatar: P.get(r.user_id)?.avatar ?? 'default', score: r.score, me: r.user_id === uid }));
  }
  const n = group.length;
  return {
    ready: true,
    member: true,
    names: LEAGUE_NAMES,
    tier,
    endsAt: weekEndsAt,
    group,
    promote: tier < 5 && n >= 2 ? (n >= 10 ? 5 : 2) : 0,
    demote: tier > 0 && n >= 3 ? (n >= 10 ? 5 : 1) : 0,
    last,
  };
}

/** 결과 화면 한 줄: 이번 주 내 조 순위 (조에 없으면 null) — 숫자만 */
export async function leagueRank(sb: SupabaseClient, uid: string): Promise<{ rank: number; size: number; tier: number; name: string } | null> {
  const me = await sb.from('league_members').select('group_id, score, joined_at, tier').eq('week', weekOf()).eq('user_id', uid).maybeSingle();
  if (me.error || !me.data) return null;
  const m = me.data as { group_id: string; score: number; joined_at: string; tier: number };
  const [all, above, tie] = await Promise.all([
    sb.from('league_members').select('user_id', { count: 'exact', head: true }).eq('group_id', m.group_id),
    sb.from('league_members').select('user_id', { count: 'exact', head: true }).eq('group_id', m.group_id).gt('score', m.score),
    sb.from('league_members').select('user_id', { count: 'exact', head: true }).eq('group_id', m.group_id).eq('score', m.score).lt('joined_at', m.joined_at),
  ]);
  if (all.error || above.error || tie.error) return null;
  return { rank: (above.count ?? 0) + (tie.count ?? 0) + 1, size: all.count ?? 1, tier: m.tier, name: LEAGUE_NAMES[m.tier] ?? LEAGUE_NAMES[0] };
}
