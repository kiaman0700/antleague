-- 036: 예상 못 한 서버 오류 기록 (운영 점검용) — 여러 번 실행해도 안전
-- 남기는 것: 행동 이름, 오류 문구(300자), 시각. 토큰·비밀번호·계정 id 는 남기지 않음.
-- 브라우저는 읽기·쓰기 모두 못 함. 서버가 쓸 때 7일 지난 것은 지움. 읽기: npm run db -- errors
create table if not exists public.server_errors (
  id bigint generated always as identity primary key,
  action text not null check (char_length(action) <= 40),
  message text not null check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists server_errors_created_idx on public.server_errors (created_at desc);
alter table public.server_errors enable row level security;
revoke all on public.server_errors from anon, authenticated;
