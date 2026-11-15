-- 추가 마이그레이션 011: 시장 난수 비밀값 (v4)
-- 시드(31비트)만으로는 첫날 공개 정보로 역산할 수 있어서, 방마다 128비트 비밀값을 섞음. 서버만 읽음
-- `npm run db -- apply supabase/011_market_salt.sql` (여러 번 실행해도 안전)
alter table public.room_secrets add column if not exists salt text;
