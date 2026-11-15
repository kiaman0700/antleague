-- 추가 마이그레이션 009: '내 데이터 지우기'가 다른 사람의 게임 기록을 바꾸지 않게
-- 계정을 지워도 참가 자리(거래·카드 기록)는 남기고 계정 연결만 끊음 (on delete set null)
-- `npm run db -- apply supabase/009_forget_keep_games.sql` (여러 번 실행해도 안전)

alter table public.players alter column user_id drop not null;

do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.players'::regclass and contype = 'f' and pg_get_constraintdef(oid) like '%auth.users%';
  if c is not null then
    execute format('alter table public.players drop constraint %I', c);
  end if;
  alter table public.players add constraint players_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
exception when duplicate_object then null;
end $$;
