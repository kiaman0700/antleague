-- 035: 미션 (설계서 design/missions.md) — 여러 번 실행해도 안전
-- 경험치는 서버만 올림. 브라우저는 읽기·쓰기 모두 못 함
alter table public.profiles add column if not exists xp integer not null default 0;
create table if not exists public.mission_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'd:2026-11-17' (오늘의 미션) 또는 'w:2026-11-16' (그 주 월요일, 이번 주 미션)
  period text not null check (char_length(period) <= 16),
  mission text not null check (char_length(mission) <= 24),
  progress integer not null default 0,
  goal integer not null default 1,
  xp integer not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  primary key (user_id, period, mission)
);
-- 같은 판으로 같은 미션 진행을 두 번 세지 않게
create table if not exists public.mission_rooms (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
alter table public.mission_progress enable row level security;
alter table public.mission_rooms enable row level security;
revoke all on public.mission_progress from anon, authenticated;
revoke all on public.mission_rooms from anon, authenticated;
-- 경험치를 한 번에 안전하게 더하기 (서버만)
create or replace function public.add_xp(p_user uuid, p_xp integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update profiles set xp = greatest(0, xp + p_xp) where user_id = p_user returning xp;
$$;
revoke all on function public.add_xp(uuid, integer) from public, anon, authenticated;
