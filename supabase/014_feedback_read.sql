-- 추가 마이그레이션 014: 의견함 읽음 표시 (운영자 화면)
-- `npm run db -- apply supabase/014_feedback_read.sql` (여러 번 실행해도 안전)
alter table public.feedback add column if not exists read_at timestamptz;
create index if not exists feedback_unread_idx on public.feedback(created_at) where read_at is null;
