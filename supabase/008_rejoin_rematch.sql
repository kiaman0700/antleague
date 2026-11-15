-- 추가 마이그레이션 008: 기기 바꿔 이어하기 · 한 판 더
-- `npm run db -- apply supabase/008_rejoin_rematch.sql` (여러 번 실행해도 안전)

-- 1) 이어하기 코드: 비밀값의 scrypt 해시만 저장 (서버만 읽음 — players 는 브라우저 읽기 권한 없음)
alter table public.players add column if not exists rejoin_hash text;

-- 2) 한 판 더: 끝난 방에서 만든 새 방의 코드 (같은 방 사람들만 읽음 — 방 읽기 정책 그대로)
alter table public.rooms add column if not exists next_code text;
grant select (next_code) on public.rooms to authenticated;
