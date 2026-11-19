-- 059: '나의 투자 감각' 판별 기록 — 서버만, 회원 본인에게만 평균으로 보여 줌. 여러 번 실행해도 안전
create table if not exists public.skill_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null,
  catches smallint not null default 0,
  news_buys smallint not null default 0,
  news_true smallint not null default 0,
  max_weight real not null default 0,
  beat real not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
create index if not exists skill_log_user_time on public.skill_log (user_id, created_at desc);
alter table public.skill_log enable row level security;
revoke all on public.skill_log from anon, authenticated;
