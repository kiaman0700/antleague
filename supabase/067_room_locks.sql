-- 067: 방 입장·봇 추가·시작·대기실 나가기를 방 줄을 잠근 뒤 한 번에 — 동시에 눌러도 꼬이지 않게.
--  · 마지막 한 자리에 둘이 동시에 들어와 정원을 넘기던 것, 방장이 시작하는 순간 끼어들던 것
--  · 시작과 나가기가 겹쳐 혼자 남은 판이 되던 것
-- 서버(비밀 키)만 실행. 여러 번 실행해도 안전

-- 반환: 새 자리 id(글자) | 'started' | 'full'
create or replace function public.join_room(p_room uuid, p_user uuid, p_nick text, p_mode text, p_bot smallint default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int;
  new_id uuid;
begin
  select status, max_players into r from rooms where id = p_room for update;
  if not found or r.status <> 'waiting' then
    return 'started';
  end if;
  select count(*) into n from players where room_id = p_room;
  if n >= r.max_players then
    return 'full';
  end if;
  insert into players (room_id, user_id, nickname, mode, ready, bot_level, last_seen)
  values (p_room, p_user, p_nick, p_mode, p_bot is not null, p_bot, now())
  returning id into new_id;
  update rooms set rev = floor(random() * 2000000000)::int where id = p_room;
  return new_id::text;
end $$;

-- 반환: 'ok' | 'not_host' | 'started' | 'few' | 'not_ready'
create or replace function public.start_room(p_room uuid, p_host uuid, p_deadline timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int;
  waiting int;
begin
  select status, host_id into r from rooms where id = p_room for update;
  if not found or r.status <> 'waiting' then
    return 'started';
  end if;
  if r.host_id <> p_host then
    return 'not_host';
  end if;
  select count(*), count(*) filter (where not ready and id <> p_host) into n, waiting from players where room_id = p_room;
  if n < 2 then
    return 'few';
  end if;
  if waiting > 0 then
    return 'not_ready';
  end if;
  update rooms set status = 'playing', day = 0, turn_deadline = p_deadline, day_deadline = p_deadline where id = p_room;
  return 'ok';
end $$;

-- 대기실에서 (방장이 아닌) 사람이 나감. 반환: 'left' | 'playing'(그사이 시작됨 — 기권으로 처리해야 함) | 'gone'
create or replace function public.leave_waiting(p_room uuid, p_player uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select status into r from rooms where id = p_room for update;
  if not found then
    return 'gone';
  end if;
  if r.status <> 'waiting' then
    return 'playing';
  end if;
  delete from players where id = p_player and room_id = p_room;
  update rooms set rev = floor(random() * 2000000000)::int where id = p_room;
  return 'left';
end $$;

revoke all on function public.join_room(uuid, uuid, text, text, smallint) from public, anon, authenticated;
revoke all on function public.start_room(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.leave_waiting(uuid, uuid) from public, anon, authenticated;
