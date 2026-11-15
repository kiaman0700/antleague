-- 주식 대결 게임 스키마
-- Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 Run 하세요.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  seed integer not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  day_ms integer not null default 15000,
  total_days integer not null default 30,
  started_at timestamptz,
  host_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  nickname text not null,
  cash numeric not null default 10000000,
  equity numeric not null default 10000000,
  ready boolean not null default false,
  trade_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists players_room_idx on public.players(room_id);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  tick integer not null,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty > 0),
  price numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists trades_room_idx on public.trades(room_id);

create table if not exists public.match_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete set null,
  winner_nickname text,
  results jsonb not null,
  created_at timestamptz not null default now()
);

-- 서버 시각 (두 기기의 시계 보정용)
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;

-- 게임 시작: 4초 카운트다운 후 시작하도록 서버 시각 기준으로 기록
create or replace function public.start_room(p_room uuid)
returns public.rooms language sql as $$
  update public.rooms
     set status = 'playing', started_at = now() + interval '4 seconds'
   where id = p_room and status = 'waiting'
  returning *;
$$;

-- RLS: 로그인 없이 둘이서 하는 게임이라 anon 에게 읽기/쓰기 허용
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.trades enable row level security;
alter table public.match_history enable row level security;

drop policy if exists "anon all rooms" on public.rooms;
create policy "anon all rooms" on public.rooms for all to anon, authenticated using (true) with check (true);
drop policy if exists "anon all players" on public.players;
create policy "anon all players" on public.players for all to anon, authenticated using (true) with check (true);
drop policy if exists "anon all trades" on public.trades;
create policy "anon all trades" on public.trades for all to anon, authenticated using (true) with check (true);
drop policy if exists "anon all history" on public.match_history;
create policy "anon all history" on public.match_history for all to anon, authenticated using (true) with check (true);

grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.start_room(uuid) to anon, authenticated;

-- Realtime 활성화
do $$
begin
  begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
end $$;
