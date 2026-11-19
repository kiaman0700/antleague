-- 046: 시험 계정 표시 — 자동 시험 도구(e2e)가 보낸 요청의 계정을 적어 두고, 밸런스용 판 기록(game_stats)에서 뺌.
-- 누가 일부러 표시를 붙여도 자기 판이 통계에서 빠질 뿐. 서버만 읽고 씀. 여러 번 실행해도 안전
create table if not exists public.test_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.test_users enable row level security;
revoke all on public.test_users from anon, authenticated;
