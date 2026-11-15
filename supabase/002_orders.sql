-- 추가 마이그레이션: 지정가(예약) 주문 테이블
-- 이미 schema.sql 을 실행했다면 이 파일만 SQL Editor 에서 실행하세요. (기존 데이터 유지)

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
