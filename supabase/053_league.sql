-- 053: 주간 개미리그 (설계서 design/weekly-league.md) — 여러 번 실행해도 안전, 모두 서버만
-- 단계 0 알개미 · 1 일개미 · 2 병정개미 · 3 정찰개미 · 4 여왕개미 · 5 황금개미
-- 매주(한국 월요일 0시) 그 주에 처음 경험치를 얻으면 같은 단계의 빈 조(최대 30명)에 들어가고, 얻은 경험치가 점수

create table if not exists public.league_tiers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier smallint not null default 0 check (tier between 0 and 5),
  updated_week date,
  -- 지난주 결과 (화면 팝업 한 번): 순위·조 인원·변화(-1 강등 · 0 그대로 · 1 승급)
  last_week date,
  last_rank smallint,
  last_size smallint,
  last_change smallint,
  last_seen_week date
);
create table if not exists public.league_groups (
  id uuid primary key default gen_random_uuid(),
  week date not null,
  tier smallint not null check (tier between 0 and 5),
  size integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists league_groups_find on public.league_groups (week, tier, size);
create table if not exists public.league_members (
  week date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.league_groups(id) on delete cascade,
  tier smallint not null,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  primary key (week, user_id)
);
create index if not exists league_members_group on public.league_members (group_id, score desc);
create index if not exists league_members_user on public.league_members (user_id, week desc);
alter table public.league_tiers enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_members enable row level security;
revoke all on public.league_tiers, public.league_groups, public.league_members from anon, authenticated;

-- 지난 주 결과로 단계 정하기 (이번 주에 처음 쓸 때 한 번)
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
    nt := nt + ch;
    update public.league_tiers set tier = nt, updated_week = p_week, last_week = m.week, last_rank = r, last_size = n, last_change = ch where user_id = p_user;
  else
    update public.league_tiers set updated_week = p_week where user_id = p_user;
  end if;
  return nt;
end;
$$;

-- 경험치를 얻으면: (지난주 정산) → 이번 주 조에 들어가기(한 번만, 잠금) → 점수 더하기
create or replace function public.league_add(p_user uuid, p_week date, p_xp integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tr smallint;
  g uuid;
begin
  if p_xp is null or p_xp <= 0 then return; end if;
  if not exists (select 1 from public.profiles where user_id = p_user and coalesce(is_test, false) = false) then return; end if;
  if exists (select 1 from public.league_members where week = p_week and user_id = p_user) then
    update public.league_members set score = score + p_xp where week = p_week and user_id = p_user;
    return;
  end if;
  tr := public.league_settle(p_user, p_week);
  perform pg_advisory_xact_lock(hashtext('league:' || p_week::text || ':' || tr::text));
  if exists (select 1 from public.league_members where week = p_week and user_id = p_user) then
    update public.league_members set score = score + p_xp where week = p_week and user_id = p_user;
    return;
  end if;
  select id into g from public.league_groups where week = p_week and tier = tr and size < 30 order by created_at limit 1 for update;
  if g is null then
    insert into public.league_groups (week, tier, size) values (p_week, tr, 0) returning id into g;
  end if;
  insert into public.league_members (week, user_id, group_id, tier, score) values (p_week, p_user, g, tr, p_xp);
  update public.league_groups set size = size + 1 where id = g;
end;
$$;
revoke all on function public.league_settle(uuid, date) from public, anon, authenticated;
revoke all on function public.league_add(uuid, date, integer) from public, anon, authenticated;
