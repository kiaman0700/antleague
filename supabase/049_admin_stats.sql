-- 049: 운영자 현황 집계 — 서버(비밀 키)만 부름. 숫자·종목 코드·카드 종류만 돌려줌 (계정 id·닉네임 없음).
-- 시험 계정(test_users, profiles.is_test)과 봇 자리(user_id 없음)는 빼고 셈. 여러 번 실행해도 안전
create or replace function public.admin_stats(days int default 14)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
  since as (select now() - make_interval(days => greatest(1, least(days, 90))) as t),
  kst_today as (select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul' as t),
  testers as (
    select user_id from public.test_users
    union select user_id from public.profiles where is_test
  ),
  -- 사람 자리 (봇·시험 계정 제외)
  seats as (
    select p.id, p.room_id, p.user_id, p.created_at, p.left_game
    from public.players p
    where p.user_id is not null and p.user_id not in (select user_id from testers)
  ),
  recent_seats as (select s.* from seats s, since where s.created_at > since.t),
  recent_trades as (
    select t.* from public.trades t join recent_seats s on s.id = t.player_id
  ),
  recent_items as (
    select i.* from public.items i join recent_seats s on s.id = i.player_id
  )
select jsonb_build_object(
  'users', jsonb_build_object(
    'members', (select count(*) from public.profiles where not is_test),
    'membersToday', (select count(*) from public.profiles, kst_today where not is_test and created_at > kst_today.t),
    'members7', (select count(*) from public.profiles where not is_test and created_at > now() - interval '7 days'),
    'guests', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id) and u.id not in (select user_id from testers)),
    'active1', (select count(distinct user_id) from seats where created_at > now() - interval '1 day'),
    'active7', (select count(distinct user_id) from seats where created_at > now() - interval '7 days'),
    'activeMembers7', (select count(distinct s.user_id) from seats s join public.profiles p on p.user_id = s.user_id where s.created_at > now() - interval '7 days'),
    -- 재방문: 지난주(7~14일 전)에 한 판이라도 한 사람 중 이번 주에도 한 사람
    'prevWeek', (select count(distinct user_id) from seats where created_at between now() - interval '14 days' and now() - interval '7 days'),
    'returned', (select count(distinct a.user_id) from seats a where a.created_at between now() - interval '14 days' and now() - interval '7 days'
                   and exists (select 1 from seats b where b.user_id = a.user_id and b.created_at > now() - interval '7 days'))
  ),
  'tiers', (
    select jsonb_build_object(
      'unplaced', count(*) filter (where coalesce(ranked_games, 0) < 2),
      'bronze', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating < 1000),
      'silver', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating >= 1000 and rating < 1150),
      'gold', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating >= 1150 and rating < 1300),
      'platinum', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating >= 1300 and rating < 1450),
      'diamond', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating >= 1450 and rating < 1600),
      'master', count(*) filter (where coalesce(ranked_games, 0) >= 2 and rating >= 1600)
    ) from public.profiles where not is_test
  ),
  'started', (
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
      select case when r.ranked then 'ranked' else coalesce(r.kind, 'custom') end as k, count(distinct r.id) as n
      from public.rooms r join recent_seats s on s.room_id = r.id
      where r.status <> 'waiting'
      group by 1
    ) x
  ),
  'startedToday', (select count(distinct s.room_id) from seats s join public.rooms r on r.id = s.room_id, kst_today where s.created_at > kst_today.t and r.status <> 'waiting'),
  'trades', jsonb_build_object(
    'total', (select count(*) from recent_trades),
    'buyAmount', (select coalesce(sum(qty * price), 0)::bigint from recent_trades where side = 'buy'),
    'topBought', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
      select symbol as s, count(*) as n, sum(qty * price)::bigint as amt, count(distinct player_id) as people
      from recent_trades where side = 'buy' group by symbol order by count(*) desc limit 12) x),
    'topAmount', (select coalesce(jsonb_agg(x order by x.amt desc), '[]'::jsonb) from (
      select symbol as s, sum(qty * price)::bigint as amt from recent_trades where side = 'buy' group by symbol order by 2 desc limit 8) x),
    'topSold', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (
      select symbol as s, count(*) as n from recent_trades where side = 'sell' group by symbol order by count(*) desc limit 8) x),
    'byDay', (select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
      select to_char(created_at at time zone 'Asia/Seoul', 'MM-DD') as d, count(*) as n from recent_trades group by 1) x)
  ),
  'cards', jsonb_build_object(
    'bought', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from recent_items where action = 'buy' group by kind) x),
    'used', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from recent_items where action = 'use' group by kind) x),
    'spent', (select coalesce(sum(cost), 0)::bigint from recent_items where action = 'buy')
  ),
  'daily', jsonb_build_object(
    'today', (select count(*) from public.daily_runs d where d.day = (now() at time zone 'Asia/Seoul')::date and d.user_id not in (select user_id from testers)),
    'week', (select count(*) from public.daily_runs d where d.created_at > now() - interval '7 days' and d.user_id not in (select user_id from testers)),
    'avgRetToday', (select avg(ret) from public.daily_runs d where d.finished and d.day = (now() at time zone 'Asia/Seoul')::date and d.user_id not in (select user_id from testers))
  ),
  'missions', jsonb_build_object(
    'doneToday', (select count(*) from public.mission_progress m, kst_today where m.done and m.done_at > kst_today.t and m.user_id not in (select user_id from testers))
  ),
  'feedback', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from public.feedback, since where created_at > since.t and user_id is not null and user_id not in (select user_id from testers) group by kind) x)
);
$$;
revoke all on function public.admin_stats(int) from public, anon, authenticated;
grant execute on function public.admin_stats(int) to service_role;
