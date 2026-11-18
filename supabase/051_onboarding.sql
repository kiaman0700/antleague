-- 051: 처음 온 사람 안내 (design/onboarding.md) — 여러 번 실행해도 안전
-- 1) 동시 접속 막기: 한 계정은 한 곳(세션)에서만. 나중에 로그인한 곳이 이기고 예전 세션은 끊음
-- 2) 게스트 이어하기 코드: 계속 쓰는 코드(암호화 보관 — 본인은 언제든 다시 봄) + 찾기용 HMAC
-- 3) 튜토리얼 진행 기록 (단계별)
-- 모두 서버(비밀 키)만 — 브라우저는 읽기·쓰기·실행 불가

create table if not exists public.active_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.active_sessions enable row level security;
revoke all on public.active_sessions from anon, authenticated;

/**
 * 요청의 세션이 이 계정의 '지금 세션'인지. 처음이면 기록, 더 새 세션이면 바꾸고 예전 세션은 끊음, 더 예전 세션이면 false.
 * 세션이 auth.sessions 에 없으면(로그아웃·끊긴 세션) false.
 */
create or replace function public.session_check(p_user uuid, p_sid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  mine timestamptz;
  cur public.active_sessions%rowtype;
begin
  select s.created_at into mine from auth.sessions s where s.id = p_sid and s.user_id = p_user;
  if mine is null then
    return false;
  end if;
  select * into cur from public.active_sessions where user_id = p_user for update;
  if not found then
    insert into public.active_sessions (user_id, session_id, created_at) values (p_user, p_sid, mine)
      on conflict (user_id) do nothing;
    return true;
  end if;
  if cur.session_id = p_sid then
    return true;
  end if;
  -- 더 새 로그인이거나, 기록된 세션이 이미 끝났으면 이 세션이 '지금 세션'
  if mine > cur.created_at or not exists (select 1 from auth.sessions s where s.id = cur.session_id) then
    update public.active_sessions set session_id = p_sid, created_at = mine, updated_at = now() where user_id = p_user;
    delete from auth.refresh_tokens where session_id = cur.session_id;
    delete from auth.sessions where id = cur.session_id;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function public.session_check(uuid, uuid) from public;
revoke all on function public.session_check(uuid, uuid) from anon, authenticated;
grant execute on function public.session_check(uuid, uuid) to service_role;

create table if not exists public.guest_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hmac text not null unique,
  code_enc text not null,
  created_at timestamptz not null default now()
);
alter table public.guest_codes enable row level security;
revoke all on public.guest_codes from anon, authenticated;

-- 코드 불러오기 실패 기록 (IP 해시) — 10분 5번
create table if not exists public.guest_code_fails (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists guest_code_fails_ip on public.guest_code_fails (ip_hash, created_at);
alter table public.guest_code_fails enable row level security;
revoke all on public.guest_code_fails from anon, authenticated;

create table if not exists public.tutorial_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  done text[] not null default '{}',
  skipped boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.tutorial_progress enable row level security;
revoke all on public.tutorial_progress from anon, authenticated;
