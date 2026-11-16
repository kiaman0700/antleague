-- 029: 이모지 반응 채널을 '그 방 사람만' 듣고 보낼 수 있게 (여러 번 실행해도 안전)
-- 예전엔 방 ID 만 알면 누구나 react-<방ID> 채널에 들어와 반응을 보낼 수 있었음.
create or replace function public.react_member(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_topic !~ '^react-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.players
     where room_id = substr(p_topic, 7)::uuid
       and user_id = auth.uid()
       and coalesce(left_game, false) = false
  );
end;
$$;
revoke all on function public.react_member(text) from public, anon;
grant execute on function public.react_member(text) to authenticated;

drop policy if exists "room members read reactions" on realtime.messages;
create policy "room members read reactions" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.react_member(realtime.topic()));

drop policy if exists "room members send reactions" on realtime.messages;
create policy "room members send reactions" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.react_member(realtime.topic()));
