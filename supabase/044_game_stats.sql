-- 044: 밸런스용 판 기록 — 실제 유저 판이 끝날 때 서버가 자리마다 한 줄. 계정 id 없음(자리 id 만), 방이 지워져도 남음.
-- 시험 계정 판은 is_test 로 표시해 분석에서 뺌. 서버만 읽고 씀. 여러 번 실행해도 안전
create table if not exists public.game_stats (
  room_id uuid not null,
  seat_id uuid not null,
  created_at timestamptz not null default now(),
  kind text,
  ranked boolean not null default false,
  version int,
  players int not null,
  days int not null,
  turn_seconds int,
  rank int not null,
  ret real not null,
  won boolean not null default false,
  left_game boolean not null default false,
  idle boolean not null default false,
  bot_level int,
  member boolean not null default false,
  is_test boolean not null default false,
  trades int not null default 0,
  cards jsonb not null default '{}'::jsonb,
  lev boolean not null default false,
  primary key (room_id, seat_id)
);
create index if not exists game_stats_time_idx on public.game_stats (created_at desc);
alter table public.game_stats enable row level security;
revoke all on public.game_stats from anon, authenticated;
