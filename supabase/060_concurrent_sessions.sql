-- 060: 동시 접속 (FC온라인 방식, design/v26-batch.md) — 여러 번 실행해도 안전
-- 로그인은 여러 기기에서 할 수 있음. 다른 기기가 '지금 접속 중'(90초 안에 화면을 보며 씀)일 때만 이 기기에 먼저 묻고,
-- '여기서 접속'을 고르면(p_take) 그 기기를 로그아웃(세션 삭제). 다른 기기가 쉬는 중이면 묻지 않고 바꾸며 그 기기도 로그아웃하지 않음.
-- (051 방식은 다른 기기에서 로그인만 해도 쉬던 기기가 바로 끊김)
-- 서버(비밀 키)만 실행.

alter table public.active_sessions add column if not exists seen_at timestamptz;

/**
 * 반환: 'ok'(이 세션으로 계속) · 'concurrent'(다른 기기가 지금 접속 중 — 물어봐야 함, 아무것도 안 바꿈) · 'gone'(이 세션은 로그아웃됨)
 * p_active: 화면이 보이는 상태의 요청(접속 중 시각을 새로 씀). 뒤에 숨은 창의 요청은 false.
 * p_take: '여기서 접속'을 고름 → 다른 기기 세션을 지우고 이 세션으로.
 */
create or replace function public.session_check2(p_user uuid, p_sid uuid, p_active boolean, p_take boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  mine timestamptz;
  cur public.active_sessions%rowtype;
  other_active boolean;
begin
  select s.created_at into mine from auth.sessions s where s.id = p_sid and s.user_id = p_user;
  if mine is null then
    return 'gone';
  end if;
  select * into cur from public.active_sessions where user_id = p_user for update;
  if not found then
    insert into public.active_sessions (user_id, session_id, created_at, seen_at)
      values (p_user, p_sid, mine, case when p_active then now() else null end)
      on conflict (user_id) do nothing;
    return 'ok';
  end if;
  if cur.session_id = p_sid then
    if p_active then
      update public.active_sessions set seen_at = now(), updated_at = now() where user_id = p_user;
    end if;
    return 'ok';
  end if;
  other_active := cur.seen_at is not null and cur.seen_at > now() - interval '90 seconds'
    and exists (select 1 from auth.sessions s where s.id = cur.session_id);
  if other_active and not p_take then
    return 'concurrent';
  end if;
  if other_active and p_take then
    -- '여기서 접속' → 지금 접속 중인 다른 기기는 동시 접속으로 로그아웃
    delete from auth.refresh_tokens where session_id = cur.session_id;
    delete from auth.sessions where id = cur.session_id;
  end if;
  -- 다른 기기가 쉬는 중(또는 방금 로그아웃시킴) → 이 세션이 '지금 세션'. 쉬던 기기는 로그아웃하지 않음
  update public.active_sessions
    set session_id = p_sid, created_at = mine, seen_at = case when p_active or p_take then now() else null end, updated_at = now()
    where user_id = p_user;
  return 'ok';
end;
$$;
revoke all on function public.session_check2(uuid, uuid, boolean, boolean) from public;
revoke all on function public.session_check2(uuid, uuid, boolean, boolean) from anon, authenticated;
grant execute on function public.session_check2(uuid, uuid, boolean, boolean) to service_role;

/** 창을 닫을 때(pagehide): 이 세션이 '지금 세션'이면 '쉬는 중'으로 — 다음 기기가 묻지 않고 바로 접속 */
create or replace function public.session_idle(p_user uuid, p_sid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.active_sessions set seen_at = null, updated_at = now() where user_id = p_user and session_id = p_sid;
$$;
revoke all on function public.session_idle(uuid, uuid) from public;
revoke all on function public.session_idle(uuid, uuid) from anon, authenticated;
grant execute on function public.session_idle(uuid, uuid) to service_role;
