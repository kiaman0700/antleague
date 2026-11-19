-- 055: 주간 리그 보상 — 여러 번 실행해도 안전, 서버만
-- 주가 끝나고 처음 정산할 때(league_settle) 한 번:
--   순위 경험치 (조 5명 이상일 때) 1위 100 · 2위 70 · 3위 50, 승급하면 +30 — 높은 단계일수록 ×(1 + 0.2×단계) (황금개미 1위 200)
--   xp_log 'league:<주>' 로 한 번만, 하루 경험치 상한과 따로, 리그 점수엔 안 들어감(노가다 방지)
--   업적용 기록: best_tier(올라가 본 가장 높은 단계) · firsts(조 1위 횟수, 5명 이상 조만)

alter table public.league_tiers add column if not exists best_tier smallint not null default 0;
alter table public.league_tiers add column if not exists firsts integer not null default 0;
alter table public.league_tiers add column if not exists last_reward integer;

create or replace function public.league_settle(p_user uuid, p_week date)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.league_tiers%rowtype;
  m public.league_members%rowtype;
  n integer;
  r integer;
  up integer;
  dn integer;
  ch smallint := 0;
  nt smallint;
  rw integer := 0;
  got integer := 0;
begin
  insert into public.league_tiers (user_id, tier, updated_week) values (p_user, 0, p_week) on conflict (user_id) do nothing;
  select * into t from public.league_tiers where user_id = p_user for update;
  if t.updated_week is not null and t.updated_week >= p_week then
    return t.tier;
  end if;
  select * into m from public.league_members where user_id = p_user and week < p_week order by week desc limit 1;
  nt := t.tier;
  if found and (t.updated_week is null or m.week >= t.updated_week) then
    select count(*) into n from public.league_members where group_id = m.group_id;
    select count(*) + 1 into r from public.league_members where group_id = m.group_id and (score > m.score or (score = m.score and joined_at < m.joined_at));
    up := case when n >= 10 then 5 else 2 end;
    dn := case when n >= 10 then 5 else 1 end;
    if r <= up and n >= 2 and nt < 5 then ch := 1;
    elsif r > n - dn and n >= 3 and nt > 0 then ch := -1;
    end if;
    -- 보상 경험치 (그 주 단계 기준)
    rw := (case when n >= 5 then (case r when 1 then 100 when 2 then 70 when 3 then 50 else 0 end) else 0 end) + (case when ch = 1 then 30 else 0 end);
    rw := round(rw * (1 + 0.2 * m.tier));
    if rw > 0 then
      insert into public.xp_log (user_id, key, xp, detail)
      values (p_user, 'league:' || m.week::text, least(rw, 1000), '주간 리그 ' || r || '위')
      on conflict (user_id, key) do nothing;
      get diagnostics got = row_count;
      if got > 0 then
        update public.profiles set xp = coalesce(xp, 0) + least(rw, 1000) where user_id = p_user;
      else
        rw := 0;
      end if;
    end if;
    nt := nt + ch;
    update public.league_tiers
       set tier = nt, updated_week = p_week, last_week = m.week, last_rank = r, last_size = n, last_change = ch,
           last_reward = rw,
           best_tier = greatest(best_tier, nt),
           firsts = firsts + (case when r = 1 and n >= 5 then 1 else 0 end)
     where user_id = p_user;
  else
    update public.league_tiers set updated_week = p_week where user_id = p_user;
  end if;
  return nt;
end;
$$;
revoke all on function public.league_settle(uuid, date) from public, anon, authenticated;
