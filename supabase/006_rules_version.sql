-- 추가 마이그레이션: 방마다 시장·카드 규칙 버전 저장
-- 예전 방 = 1 (가격·카드 그대로), 새로 만드는 방 = 2 (지수 시가총액 가중·공급망·미국장→다음 날 한국·장세)
-- SQL Editor 또는 `npm run db -- apply supabase/006_rules_version.sql` (여러 번 실행해도 안전)

-- 서버만 읽고 쓰는 room_secrets 에 둠 (클라이언트 권한 없음 — 시드와 같은 곳)
alter table public.room_secrets add column if not exists rules_version integer not null default 1;

do $$
begin
  begin
    alter table public.room_secrets add constraint room_secrets_rules_version_check check (rules_version between 1 and 9);
  exception when duplicate_object then null;
  end;
end $$;
