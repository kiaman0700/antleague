-- 주식 대결 게임 스키마 v3 (보안 강화)
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전합니다. (기존 게임 데이터는 지워집니다)
--
-- 보안 원칙
--  1) 브라우저(anon/authenticated)는 어떤 테이블에도 쓰기 불가. 모든 쓰기는 서버 함수(/api/game)가 비밀 키로 수행.
--  2) 브라우저는 '내가 참가한 방'의 rooms/players 행만 읽을 수 있음 (실시간 알림용). 거래·아이템·시드는 읽기 불가.
--  3) 시장 시드는 room_secrets 에만 있고 어떤 클라이언트 역할에도 권한이 없음 → 미래 가격 계산 불가.

drop table if exists public.match_history cascade;
drop table if exists public.orders cascade;
drop table if exists public.items cascade;
drop table if exists public.trades cascade;
drop table if exists public.players cascade;
drop table if exists public.room_secrets cascade;
drop table if exists public.rooms cascade;
drop function if exists public.server_time();
drop function if exists public.start_room(uuid);
drop function if exists public.advance_day(uuid, integer);
drop function if exists public.is_member(uuid);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  total_days integer not null check (total_days in (10, 20, 30)),
  turn_seconds integer not null check (turn_seconds in (0, 60, 90, 180)),
  day integer not null default 0 check (day >= 0 and day <= 30),
  turn_deadline timestamptz,
  host_id uuid,
  title text not null default '주식 대결' check (char_length(title) between 1 and 20),
  max_players integer not null default 2 check (max_players between 2 and 6),
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index rooms_waiting_idx on public.rooms(status, created_at desc);

create table public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  seed integer not null,
  password_hash text
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 10),
  mode text not null default 'easy' check (mode in ('easy', 'pro')),
  ready boolean not null default false,
  ended_day integer not null default -1,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index players_room_idx on public.players(room_id);
create index players_user_idx on public.players(user_id);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day integer not null,
  symbol text not null check (char_length(symbol) <= 8),
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty between 1 and 1000000),
  price numeric not null check (price > 0),
  fee numeric not null check (fee in (0.001, 0.01)),
  created_at timestamptz not null default now()
);
create index trades_room_idx on public.trades(room_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day integer not null,
  kind text not null check (kind in ('paper', 'detector', 'spy', 'analyst', 'scout', 'freeze', 'fake', 'fee', 'blackout', 'shield', 'mirror', 'bonus')),
  action text not null check (action in ('buy', 'use')),
  cost numeric not null default 0 check (cost >= 0),
  payload jsonb,
  created_at timestamptz not null default now()
);
create index items_room_idx on public.items(room_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  day integer not null,
  symbol text not null check (char_length(symbol) <= 8),
  side text not null check (side in ('buy', 'sell')),
  qty integer not null check (qty between 1 and 1000000),
  limit_price numeric not null check (limit_price > 0),
  fee numeric not null check (fee in (0.001, 0.01)),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled', 'expired')),
  fill_price numeric,
  created_at timestamptz not null default now()
);
create index if not exists orders_room_idx on public.orders(room_id);

-- 클라이언트는 접근 불가 (서버 함수만)
revoke all on public.orders from anon, authenticated;
alter table public.orders enable row level security;

create table public.match_history (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.rooms(id) on delete set null,
  winner_nickname text,
  results jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- 권한: 클라이언트 역할은 기본적으로 아무것도 못 함 ----------
revoke all on public.rooms, public.room_secrets, public.players, public.trades, public.items, public.match_history from anon, authenticated;

alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.players enable row level security;
alter table public.trades enable row level security;
alter table public.items enable row level security;
alter table public.match_history enable row level security;

-- 내가 참가한 방인지 (RLS 정책에서 같은 테이블을 다시 읽어 생기는 무한 재귀를 피하려고 security definer)
create function public.is_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.players where room_id = p_room and user_id = auth.uid());
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

-- 읽기만, 내 방만 (실시간 알림을 받기 위한 최소 권한)
grant select (id, code, status, total_days, turn_seconds, day, turn_deadline, host_id, title, max_players, is_private, created_at) on public.rooms to authenticated;
grant select (id, room_id, nickname, mode, ready, ended_day, version, created_at, updated_at) on public.players to authenticated;
create policy "members read room" on public.rooms for select to authenticated using (public.is_member(id));
create policy "members read players" on public.players for select to authenticated using (public.is_member(room_id));
-- room_secrets / trades / items / match_history: 정책 없음 = 서버(비밀 키)만 접근

-- ---------- Realtime ----------
do $$
begin
  begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end;
end $$;
