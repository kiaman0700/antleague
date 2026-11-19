-- 튜토리얼 단계별 이탈 보기: 날짜·단계·사건(보임/끝냄/그만둠)마다 숫자만 (계정 정보 없음)
create table if not exists public.tutorial_steps (
  day date not null,
  step int not null check (step between 0 and 40),
  ev text not null check (ev in ('show', 'quit', 'done')),
  n int not null default 0,
  primary key (day, step, ev)
);
alter table public.tutorial_steps enable row level security;
revoke all on public.tutorial_steps from anon, authenticated;

create or replace function public.tutorial_step_hit(p_step int, p_ev text)
returns void language sql security definer set search_path = public as $$
  insert into public.tutorial_steps (day, step, ev, n)
  values ((now() at time zone 'Asia/Seoul')::date, p_step, p_ev, 1)
  on conflict (day, step, ev) do update set n = public.tutorial_steps.n + 1;
$$;
revoke all on function public.tutorial_step_hit(int, text) from public, anon, authenticated;
grant execute on function public.tutorial_step_hit(int, text) to service_role;
