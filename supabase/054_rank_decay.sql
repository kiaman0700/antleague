-- 054: 랭크 점수 감소 (롤 방식 참고) — 여러 번 실행해도 안전, 서버·DB 작업만
-- 다이아몬드(1450~1599): 랭킹전 1판마다 쉴 수 있는 날 +7, 최대 28일. 처음 다이아가 되면 28일.
-- 마스터 이상(1600+): 1판마다 +1, 최대 14일. 처음 마스터가 되면 14일.
-- 쉴 수 있는 날을 다 쓰면 매일 한국 0시에 다이아 25점 · 마스터 이상 35점씩 깎임. 다이아몬드 1(1450) 아래로는 안 떨어짐.
-- 배치(랭킹전 2판) 전·시험 회원은 해당 없음. 챌린저는 따로(최근 7일 랭킹전 + 순위, api/_lib/challenger.ts)

alter table public.profiles add column if not exists decay_bank smallint;
alter table public.profiles add column if not exists decay_last date;

create or replace function public.decay_cap(p_rating integer)
returns smallint language sql immutable as $$
  select (case when p_rating >= 1600 then 14 when p_rating >= 1450 then 28 else 0 end)::smallint;
$$;

-- 판이 끝나 점수를 반영할 때 쉴 수 있는 날도 쌓음 (랭킹전만)
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
           when rating + p_delta >= 1450 then least(
             public.decay_cap(rating + p_delta),
             coalesce(decay_bank, public.decay_cap(rating + p_delta)) + (case when rating + p_delta >= 1600 then 1 else 7 end)
           )::smallint
           else null
         end,
         updated_at = now()
   where user_id = p_user;
$$;
revoke all on function public.apply_rating2(uuid, integer, boolean, real, boolean) from public, anon, authenticated;

-- 매일 한국 0시: 하루 쓰거나(남아 있으면) 점수 깎기(다 썼으면). 같은 날 두 번 돌아도 한 번만 (decay_last)
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
  -- 다이아 아래로 내려간 사람은 날 기록 지움
  update profiles set decay_bank = null where rating < 1450 and decay_bank is not null;
  -- 처음 보는 다이아·마스터: 가득 채워 줌
  update profiles set decay_bank = public.decay_cap(rating), decay_last = today
   where rating >= 1450 and decay_bank is null and ranked_games >= 2;
  -- 마스터가 되면 남은 날은 최대 14일
  update profiles set decay_bank = public.decay_cap(rating)
   where rating >= 1450 and decay_bank > public.decay_cap(rating);
  with d as (
    update profiles
       set decay_bank = greatest(decay_bank - 1, 0),
           rating = case when decay_bank > 0 then rating
                         else greatest(1450, rating - (case when rating >= 1600 then 35 else 25 end)) end,
           decay_last = today
     where rating >= 1450 and ranked_games >= 2 and decay_bank is not null
       and coalesce(is_test, false) = false
       and (decay_last is null or decay_last < today)
    returning 1
  )
  select count(*) into n from d;
  return n;
end;
$$;
revoke all on function public.rank_decay() from public, anon, authenticated;
revoke all on function public.decay_cap(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stockduel-rank-decay';
    perform cron.schedule('stockduel-rank-decay', '5 15 * * *', 'select public.rank_decay()');
  end if;
end;
$$;
