-- 034: 오늘의 도전 (설계서 design/bots-daily.md) — 여러 번 실행해도 안전
-- 하루(한국 날짜)에 계정마다 한 번. 점수는 서버가 마지막 재산으로 계산. 브라우저는 읽기·쓰기 모두 못 함(서버만)
create table if not exists public.daily_runs (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  nickname text not null check (char_length(nickname) between 1 and 20),
  -- 회원이면 점수표에 오름 (게스트는 해도 안 오름), 시험 회원은 빼고 보여 줌
  member boolean not null default false,
  ret real,
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (day, user_id)
);
create index if not exists daily_runs_board_idx on public.daily_runs (day, finished, ret desc);
create index if not exists daily_runs_room_idx on public.daily_runs (room_id);
alter table public.daily_runs enable row level security;
revoke all on public.daily_runs from anon, authenticated;
