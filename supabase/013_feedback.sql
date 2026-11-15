-- 추가 마이그레이션 013: 의견 보내기 (문의·버그·삭제 요청). 서버만 쓰고 운영자만 DB 도구로 읽음
-- `npm run db -- apply supabase/013_feedback.sql` (여러 번 실행해도 안전)
create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('bug', 'idea', 'privacy', 'etc')),
  body text not null check (char_length(body) between 2 and 1000),
  page text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_time_idx on public.feedback(created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
