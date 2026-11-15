-- 추가 마이그레이션 012: 손님 계정 생성 기록 (남용 방지 — IP 는 해시로만 저장). 서버만 읽고 씀
-- `npm run db -- apply supabase/012_guest_log.sql` (여러 번 실행해도 안전)
create table if not exists public.guest_log (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists guest_log_ip_idx on public.guest_log(ip_hash, created_at);
create index if not exists guest_log_time_idx on public.guest_log(created_at);
alter table public.guest_log enable row level security;
revoke all on public.guest_log from anon, authenticated;
-- 오래된 기록은 지움 (하루 지난 것)
delete from public.guest_log where created_at < now() - interval '1 day';
