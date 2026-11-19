-- 043: 공지사항 — 운영자만 쓰고·고치고·지움, 모두 읽기만. 읽기·쓰기 모두 서버(/api/game)만 (RLS + 권한 회수)
-- 여러 번 실행해도 안전
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notices_list_idx on public.notices (pinned desc, created_at desc);
alter table public.notices enable row level security;
revoke all on public.notices from anon, authenticated;
