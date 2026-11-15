-- 주식 대결 게임 스키마 (턴제 + 아이템)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다. (기존 게임 데이터는 지워집니다)

drop table if exists public.match_history cascade;
drop table if exists public.items cascade;
drop table if exists public.trades cascade;
drop table if exists public.players cascade;
drop table if exists public.rooms cascade;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  seed integer not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  total_days integer not null default 20,
  turn_seconds integer not null default 90,   -- 0 = 시간 제한 없음
  day integer not null default 0,             -- 현재 진행 중인 날 (0부터)
  turn_deadline timestamptz,
  host_id uuid,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  mode text not null default 'easy' check (mode in ('easy', 'pro')),
  ready boolean not null default false,
  ended_day integer not null default -1,      -- '장 마감'을 누른 마지막 날
  cash numeric not null default 10000000,
  equity numeric not null default 10000000,
  trade_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_room_idx on public.players(room_id);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day integer not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty > 0),
  price numeric not null,
  fee numeric not null default 0.001,
  created_at timestamptz not null default now()
);
create index trades_room_idx on public.trades(room_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day integer not null,
  kind text not null,
  action text not null check (action in ('buy', 'use')),
  cost numeric not null default 0,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index items_room_idx on public.items(room_id);

create table public.match_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms(id) on delete set null,
  winner_nickname text,
  results jsonb not null,
  created_at timestamptz not null default now()
);

-- 서버 시각 (두 기기의 타이머 보정용)
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;

-- 게임 시작
create or replace function public.start_room(p_room uuid)
returns public.rooms language sql as $$
  update public.rooms
     set status = 'playing', day = 0,
         turn_deadline = case when turn_seconds > 0 then now() + make_interval(secs => turn_seconds + 3) else null end
   where id = p_room and status = 'waiting'
  returning *;
$$;

-- 다음 날로: 두 사람 모두 '장 마감'을 눌렀거나 제한 시간이 지났을 때만. 여러 번 불려도 한 번만 진행됨
create or replace function public.advance_day(p_room uuid, p_day integer)
returns public.rooms language sql as $$
  update public.rooms r
     set day = r.day + 1,
         status = case when r.day + 1 >= r.total_days then 'finished' else r.status end,
         turn_deadline = case when r.turn_seconds > 0 then now() + make_interval(secs => r.turn_seconds + 4) else null end
   where r.id = p_room
     and r.day = p_day
     and r.status = 'playing'
     and (
       (select count(*) from public.players p where p.room_id = p_room and p.ended_day >= p_day)
         >= (select count(*) from public.players p where p.room_id = p_room)
       or (r.turn_deadline is not null and now() >= r.turn_deadline)
     )
  returning *;
$$;

-- RLS: 로그인 없이 둘이서 하는 게임이라 anon 에게 읽기/쓰기 허용
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.trades enable row level security;
alter table public.items enable row level security;
alter table public.match_history enable row level security;

create policy "anon all rooms" on public.rooms for all to anon, authenticated using (true) with check (true);
create policy "anon all players" on public.players for all to anon, authenticated using (true) with check (true);
create policy "anon all trades" on public.trades for all to anon, authenticated using (true) with check (true);
create policy "anon all items" on public.items for all to anon, authenticated using (true) with check (true);
create policy "anon all history" on public.match_history for all to anon, authenticated using (true) with check (true);

grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.start_room(uuid) to anon, authenticated;
grant execute on function public.advance_day(uuid, integer) to anon, authenticated;

-- Realtime
do $$
begin
  begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
end $$;
