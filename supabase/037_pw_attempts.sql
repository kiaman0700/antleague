-- 037: 비밀방 비밀번호 시도 — 사람·방마다 10분에 5번 (서버가 여러 대여도 같은 횟수) — 여러 번 실행해도 안전
-- 서버 메모리에만 세면 요청이 다른 서버로 갈 때 횟수가 안 쌓이므로 DB 에서 셈
create table if not exists public.pw_attempts (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  n integer not null default 0,
  first_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.pw_attempts enable row level security;
revoke all on public.pw_attempts from anon, authenticated;

-- 한 번에 안전하게 하나 더하기 (10분 지난 기록은 새로 시작). 서버만
create or replace function public.pw_attempt_fail(p_room uuid, p_user uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into pw_attempts (room_id, user_id, n, first_at) values (p_room, p_user, 1, now())
  on conflict (room_id, user_id) do update
    set n = case when pw_attempts.first_at < now() - interval '10 minutes' then 1 else pw_attempts.n + 1 end,
        first_at = case when pw_attempts.first_at < now() - interval '10 minutes' then now() else pw_attempts.first_at end
  returning n;
$$;
revoke all on function public.pw_attempt_fail(uuid, uuid) from public, anon, authenticated;
