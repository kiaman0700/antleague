-- 052: 게스트 계정 자동 삭제 — 여러 번 실행해도 안전
-- 마지막으로 활동한 날(한국 날짜)이 D 이면, D+1·D+2·D+3 사흘 동안 활동이 없을 때 D+4 0시(한국)에 삭제.
-- 게스트 = 회원 프로필(아이디)이 없는 계정. 회원은 절대 지우지 않음.
-- 계정을 지우면 그 계정의 기록은 함께 지워지고(외래키 cascade), 지난 판 자리는 이름만 남음(009: user_id → null)

create table if not exists public.guest_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_day date not null
);
alter table public.guest_activity enable row level security;
revoke all on public.guest_activity from anon, authenticated;

-- 이 규칙을 처음 넣을 때 이미 있던 게스트는 오늘을 마지막 활동일로 (공지 뒤 사흘을 온전히 갖게 — 첫날 밤에 바로 지워지지 않게)
insert into public.guest_activity (user_id, last_day)
select u.id, (now() at time zone 'Asia/Seoul')::date
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;

-- 서버가 활동한 날을 적음 (같은 날이면 그대로, 더 늦은 날이면 바꿈)
create or replace function public.touch_guest_day(p_user uuid, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.guest_activity (user_id, last_day) values (p_user, p_day)
  on conflict (user_id) do update set last_day = greatest(public.guest_activity.last_day, excluded.last_day);
$$;
revoke all on function public.touch_guest_day(uuid, date) from public, anon, authenticated;

-- 사흘 넘게 활동이 없는 게스트 지우기 (활동 기록이 없으면 계정을 만든 날 기준)
create or replace function public.purge_inactive_guests()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  n integer;
begin
  with gone as (
    delete from auth.users u
    where not exists (select 1 from public.profiles p where p.user_id = u.id)
      and coalesce(
        (select g.last_day from public.guest_activity g where g.user_id = u.id),
        (u.created_at at time zone 'Asia/Seoul')::date
      ) <= today - 4
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;
revoke all on function public.purge_inactive_guests() from public, anon, authenticated;

-- 매일 한국 0시(UTC 15시)에 실행
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stockduel-guest-purge';
    perform cron.schedule('stockduel-guest-purge', '0 15 * * *', 'select public.purge_inactive_guests()');
  end if;
end;
$$;
