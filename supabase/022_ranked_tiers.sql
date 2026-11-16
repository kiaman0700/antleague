-- 추가 마이그레이션 022: 랭킹전 배치(2판)·티어
-- `npm run db -- apply supabase/022_ranked_tiers.sql` (여러 번 실행해도 안전)

-- 랭킹전으로 점수가 반영된 판 수 (2판까지는 배치: 점수를 숨기고 빨리 움직임)
alter table public.profiles add column if not exists ranked_games integer not null default 0;

-- 점수·전적 반영 (랭킹전이면 ranked_games 도 +1). 서버만 호출
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
         updated_at = now()
   where user_id = p_user;
$$;
revoke all on function public.apply_rating2(uuid, integer, boolean, real, boolean) from public, anon, authenticated;
