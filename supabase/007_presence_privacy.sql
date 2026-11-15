-- 추가 마이그레이션 007: 나감·자리 비움, 정보 노출 줄이기, 비밀번호 시도 제한
-- `npm run db -- apply supabase/007_presence_privacy.sql` (여러 번 실행해도 안전)

-- 1) 나간 사람(기권)·마지막 접속 시각 — 서버만 쓰고 읽음
alter table public.players add column if not exists left_game boolean not null default false;
alter table public.players add column if not exists last_seen timestamptz;

-- 2) 방 변경 신호: 마감·준비·입장 같은 '공개된' 변화만 rooms.rev 로 알림.
--    players 행은 거래·카드마다 바뀌므로, 브라우저가 그 변화를 보면 상대가 언제 무엇을 했는지 알 수 있음 → 읽기 권한 회수
alter table public.rooms add column if not exists rev integer not null default 0;
grant select (rev) on public.rooms to authenticated;
revoke select on public.players from anon, authenticated;
do $$
begin
  begin alter publication supabase_realtime drop table public.players; exception when undefined_object then null; end;
end $$;

-- 3) 비밀방 비밀번호 틀린 횟수(방 기준, 모든 사용자 합산) — 서버만
alter table public.rooms add column if not exists pw_fails integer not null default 0;
alter table public.rooms add column if not exists pw_fail_at timestamptz;
revoke select (pw_fails, pw_fail_at) on public.rooms from anon, authenticated;

-- 4) 같은 방 같은 닉네임 동시 입장 방지 (이미 겹친 방이 있으면 건너뜀)
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'players_room_nick_uq') then
    if not exists (select 1 from public.players group by room_id, nickname having count(*) > 1) then
      create unique index players_room_nick_uq on public.players(room_id, nickname);
    end if;
  end if;
end $$;
