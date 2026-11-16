-- 추가 마이그레이션 023: 프로필 사진 (프리셋 id, 처음엔 기본)
-- `npm run db -- apply supabase/023_avatar.sql` (여러 번 실행해도 안전)
alter table public.profiles add column if not exists avatar text not null default 'default' check (char_length(avatar) <= 20);
