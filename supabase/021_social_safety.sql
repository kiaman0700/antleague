-- 추가 마이그레이션 021: 친구·파티 안전장치
-- `npm run db -- apply supabase/021_social_safety.sql` (여러 번 실행해도 안전)

-- 거절한 친구 신청은 지우지 않고 숨김 상태로 (보낸 사람에게는 7일 동안 '대기 중'으로 보임 → 거절 사실을 알 수 없게)
alter table public.friendships drop constraint if exists friendships_status_check;
alter table public.friendships add constraint friendships_status_check check (status in ('pending', 'accepted', 'declined'));

-- 파티 들어가기를 한 번에(잠금): 두 사람이 동시에 수락해도 2명을 넘지 않게. 서버만 호출
create or replace function public.join_party(p_party uuid, p_user uuid, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform 1 from parties where id = p_party for update;
  if not found then
    return false;
  end if;
  select count(*) into n from party_members where party_id = p_party;
  if n >= p_max then
    return false;
  end if;
  insert into party_members (party_id, user_id) values (p_party, p_user);
  return true;
end;
$$;
revoke all on function public.join_party(uuid, uuid, integer) from public, anon, authenticated;
