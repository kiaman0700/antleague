-- 061: 연속 기록 (design/v26-batch.md A) — 여러 번 실행해도 안전
-- 인정되는 판(랭킹전·일반전·오늘의 도전을 끝까지 하고 거래 1번 이상)을 한 날을 계정마다 하루 한 줄.
-- 연속·최고 기록은 서버가 이 표로만 계산. 얼리기 없음. 서버(비밀 키)만 읽고 씀.

create table if not exists public.play_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  room_id uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.play_days enable row level security;
revoke all on public.play_days from anon, authenticated;

-- 지금까지 끝낸 오늘의 도전 날은 그대로 옮겨 이어 온 연속이 끊기지 않게
insert into public.play_days (user_id, day, room_id, created_at)
select user_id, day, room_id, coalesce(finished_at, created_at)
from public.daily_runs
where finished
on conflict (user_id, day) do nothing;
