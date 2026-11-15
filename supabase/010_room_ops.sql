-- 추가 마이그레이션 010: 대기실 내보내기·방장 나가기를 한 번에(트랜잭션 + 방 잠금) 처리
-- 게임 시작과 동시에 일어나도 꼬이지 않게. 서버(비밀 키)만 호출 가능
-- `npm run db -- apply supabase/010_room_ops.sql` (여러 번 실행해도 안전)

create or replace function public.kick_player(p_room uuid, p_host uuid, p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select status, host_id into r from rooms where id = p_room for update;
  if not found or r.status <> 'waiting' or r.host_id <> p_host or p_target = p_host then
    return false;
  end if;
  delete from players where id = p_target and room_id = p_room;
  if not found then
    return false;
  end if;
  update rooms set rev = floor(random() * 2000000000)::int where id = p_room;
  return true;
end $$;

-- 방장이 대기실에서 나감: 다음 사람에게 방장(준비 완료로), 아무도 없으면 방 삭제
-- 반환: 'deleted' | 'moved' | 'not_host' | 'not_waiting'
create or replace function public.host_leave(p_room uuid, p_host uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  nxt uuid;
begin
  select status, host_id into r from rooms where id = p_room for update;
  if not found then return 'deleted'; end if;
  if r.status <> 'waiting' then return 'not_waiting'; end if;
  if r.host_id <> p_host then return 'not_host'; end if;
  select id into nxt from players where room_id = p_room and id <> p_host order by created_at limit 1;
  if nxt is null then
    delete from rooms where id = p_room;
    return 'deleted';
  end if;
  delete from players where id = p_host;
  update players set ready = true where id = nxt;
  update rooms set host_id = nxt, rev = floor(random() * 2000000000)::int where id = p_room;
  return 'moved';
end $$;

revoke all on function public.kick_player(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.host_leave(uuid, uuid) from public, anon, authenticated;
