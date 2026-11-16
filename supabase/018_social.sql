-- 추가 마이그레이션 018: 친구 (신청·수락·차단·접속 상태)
-- `npm run db -- apply supabase/018_social.sql` (여러 번 실행해도 안전)

-- 접속 상태 (친구에게만 보여 줌, 서버가 1분에 한 번 정도 갱신)
alter table public.profiles add column if not exists last_seen timestamptz;

-- 친구 관계: 한 쌍에 한 줄 (user_a < user_b), 신청 중(pending) / 친구(accepted)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);

-- 차단: 차단한 사람의 신청·초대가 오지 않음 (차단당한 쪽에는 알리지 않음)
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker, blocked)
);

alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
revoke all on public.friendships from anon, authenticated;
revoke all on public.blocks from anon, authenticated;
