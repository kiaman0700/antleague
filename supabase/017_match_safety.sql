-- 추가 마이그레이션 017: 매칭·랭킹 안전장치
-- `npm run db -- apply supabase/017_match_safety.sql` (여러 번 실행해도 안전)

-- 잡은 시각: 서버가 중간에 멈춰 '잡힌 채'로 남은 대기표를 풀어 주려고
alter table public.match_tickets add column if not exists claimed_at timestamptz;
alter table public.match_tickets add column if not exists matched_at timestamptz;

-- 랭킹 점수·전적을 한 번에(원자적으로) 더함 — 두 판이 동시에 끝나도 값이 사라지지 않게. 서버만 호출
create or replace function public.apply_rating(p_user uuid, p_delta integer, p_win boolean, p_ret real)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
     set rating = rating + p_delta,
         games = games + 1,
         wins = wins + (case when p_win then 1 else 0 end),
         best_ret = greatest(coalesce(best_ret, p_ret), p_ret),
         updated_at = now()
   where user_id = p_user;
$$;
revoke all on function public.apply_rating(uuid, integer, boolean, real) from public, anon, authenticated;
