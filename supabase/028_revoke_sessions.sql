-- 028: 비밀번호를 바꾸거나 찾으면 그 계정의 다른 기기 로그인을 모두 끊음 (여러 번 실행해도 안전)
-- 서버(비밀 키)만 부를 수 있음 — 브라우저는 실행 권한 없음.
create or replace function public.revoke_user_sessions(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public;
revoke all on function public.revoke_user_sessions(uuid) from anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
