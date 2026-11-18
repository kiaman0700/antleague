-- 056: 티어 점수 2판 (사용자 '딱 맞아떨어지게' 2026-11-18) — 단계 100점 · 티어 300점
--   실버 1000 · 골드 1300 · 플래티넘 1600 · 다이아몬드 1900 · 마스터 2200 · 챌린저 2500+
--   지금 점수는 1000 을 기준으로 두 배로 넓힘(새 = 1000 + 2×(예전 − 1000)) → 같은 티어·단계 그대로. 한 번만 (rating_scale 표)
--   점수 감소(054)도 새 기준: 다이아 1900 · 마스터 2200, 하루 다이아 50점 · 마스터 75점(롤과 같음), 바닥 1900

create table if not exists public.rating_scale (id smallint primary key, done_at timestamptz not null default now());
alter table public.rating_scale enable row level security;
revoke all on public.rating_scale from anon, authenticated;

do $$
begin
  if not exists (select 1 from public.rating_scale where id = 2) then
    update public.profiles set rating = 1000 + 2 * (rating - 1000);
    update public.match_players set rating_before = 1000 + 2 * (rating_before - 1000) where rating_before is not null;
    update public.match_players set rating_after = 1000 + 2 * (rating_after - 1000) where rating_after is not null;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_stats' and column_name = 'rating') then
      execute 'update public.game_stats set rating = 1000 + 2 * (rating - 1000) where rating is not null';
    end if;
    insert into public.rating_scale (id) values (2);
  end if;
end;
$$;

create or replace function public.decay_cap(p_rating integer)
returns smallint language sql immutable as $$
  select (case when p_rating >= 2200 then 14 when p_rating >= 1900 then 28 else 0 end)::smallint;
$$;
revoke all on function public.decay_cap(integer) from public, anon, authenticated;

create or replace function public.apply_rating2(p_user uuid, p_delta integer, p_win boolean, p_ret real, p_ranked boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
     set rating = rating + p_delta,
         games = games + 1,
         wins = wins + (case when p_win then 1 else 0 end),
         ranked_games = ranked_games + (case when p_ranked then 1 else 0 end),
         best_ret = greatest(coalesce(best_ret, p_ret), p_ret),
         decay_bank = case
           when not p_ranked then decay_bank
           when rating + p_delta >= 1900 then least(
             public.decay_cap(rating + p_delta),
             coalesce(decay_bank, public.decay_cap(rating + p_delta)) + (case when rating + p_delta >= 2200 then 1 else 7 end)
           )::smallint
           else null
         end,
         updated_at = now()
   where user_id = p_user;
$$;
revoke all on function public.apply_rating2(uuid, integer, boolean, real, boolean) from public, anon, authenticated;

create or replace function public.rank_decay()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  n integer;
begin
  update profiles set decay_bank = null where rating < 1900 and decay_bank is not null;
  update profiles set decay_bank = public.decay_cap(rating), decay_last = today
   where rating >= 1900 and decay_bank is null and ranked_games >= 2;
  update profiles set decay_bank = public.decay_cap(rating)
   where rating >= 1900 and decay_bank > public.decay_cap(rating);
  with d as (
    update profiles
       set decay_bank = greatest(decay_bank - 1, 0),
           rating = case when decay_bank > 0 then rating
                         else greatest(1900, rating - (case when rating >= 2200 then 75 else 50 end)) end,
           decay_last = today
     where rating >= 1900 and ranked_games >= 2 and decay_bank is not null
       and coalesce(is_test, false) = false
       and (decay_last is null or decay_last < today)
    returning 1
  )
  select count(*) into n from d;
  return n;
end;
$$;
revoke all on function public.rank_decay() from public, anon, authenticated;
