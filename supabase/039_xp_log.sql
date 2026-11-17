-- 039: 판 경험치 기록 (설계서 design/game-xp.md) — 여러 번 실행해도 안전
-- key 로 한 번만: 'game:<방 id>' 판 끝내기·순위 · 'firstwin:<한국 날짜>' 오늘 첫 승 · 'badge:<업적 id>' 처음 딴 업적
-- 경험치는 서버만 씀. 브라우저는 읽기·쓰기 모두 못 함
create table if not exists public.xp_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) <= 64),
  xp integer not null default 0 check (xp >= 0 and xp <= 1000),
  detail text check (char_length(detail) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists xp_log_user_time on public.xp_log (user_id, created_at);
alter table public.xp_log enable row level security;
revoke all on public.xp_log from anon, authenticated;
