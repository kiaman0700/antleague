-- 033: 커스텀 방 봇 (설계서 design/bots-daily.md) — 여러 번 실행해도 안전
-- 봇 자리 = players 줄, user_id 없음, bot_level 1(쉬움)·2(보통)·3(어려움)
alter table public.players add column if not exists bot_level smallint;
alter table public.players add column if not exists bot_step integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_bot_level_check') then
    alter table public.players add constraint players_bot_level_check check (bot_level is null or bot_level between 1 and 3);
  end if;
  -- 봇은 user_id 가 없어야 하고, 사람은 bot_level 이 없어야 함
  if not exists (select 1 from pg_constraint where conname = 'players_bot_no_user') then
    alter table public.players add constraint players_bot_no_user check (bot_level is null or user_id is null);
  end if;
end $$;

-- 방장이 대기실에서 나감: 다음 '사람'에게 방장 (봇은 방장이 될 수 없음), 사람이 없으면 방 삭제
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
  select id into nxt from players where room_id = p_room and id <> p_host and bot_level is null order by created_at limit 1;
  if nxt is null then
    delete from rooms where id = p_room;
    return 'deleted';
  end if;
  delete from players where id = p_host;
  update players set ready = true where id = nxt;
  update rooms set host_id = nxt, rev = floor(random() * 2000000000)::int where id = p_room;
  return 'moved';
end $$;
revoke all on function public.host_leave(uuid, uuid) from public, anon, authenticated;
