-- 041: 미완료 미션 바꾸기 (설계서 design/missions-v2.md)
-- (계정, 기간) 한 줄: 바꾼 횟수(일일 하루 3번 · 주간 한 주 1번)와 칸별로 바뀐 미션 id. 서버만 읽고 씀.
-- 여러 번 실행해도 안전
create table if not exists public.mission_rerolls (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (char_length(period) <= 20),
  count int not null default 0 check (count between 0 and 10),
  slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);
alter table public.mission_rerolls enable row level security;
revoke all on public.mission_rerolls from anon, authenticated;
