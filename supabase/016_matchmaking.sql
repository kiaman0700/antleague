-- 추가 마이그레이션 016: 매칭 (랭킹전·일반전 × 신속·일반 × 1대1·다인전)
-- `npm run db -- apply supabase/016_matchmaking.sql` (여러 번 실행해도 안전)

-- 방 종류: custom(친구와 방 만들기) / match(매칭으로 만든 방), 랭킹전 여부
alter table public.rooms add column if not exists kind text not null default 'custom';
alter table public.rooms add column if not exists ranked boolean not null default false;
grant select (kind, ranked) on public.rooms to authenticated;

-- 매칭 대기표 (한 사람에 하나). 서버만 읽고 씀
create table if not exists public.match_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  queue text not null check (queue ~ '^(ranked|casual)_(duel|multi)_(quick|normal)$'),
  rating integer not null default 1000,
  nickname text not null check (char_length(nickname) between 1 and 10),
  mode text not null default 'easy' check (mode in ('easy', 'pro')),
  claim uuid,
  room_id uuid,
  player_id uuid,
  created_at timestamptz not null default now(),
  last_poll timestamptz not null default now()
);
create index if not exists match_tickets_queue_idx on public.match_tickets (queue, created_at) where room_id is null;
alter table public.match_tickets enable row level security;
revoke all on public.match_tickets from anon, authenticated;
