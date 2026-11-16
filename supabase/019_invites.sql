-- 추가 마이그레이션 019: 친구 초대 (커스텀 방 초대 · 1대1 신청)
-- `npm run db -- apply supabase/019_invites.sql` (여러 번 실행해도 안전)

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  -- room: 대기 중인 커스텀 방으로 초대 / duel: 친구에게 1대1 신청(수락하면 바로 시작)
  kind text not null check (kind in ('room', 'duel')),
  room_id uuid references public.rooms(id) on delete cascade,
  speed text check (speed in ('quick', 'normal')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  -- 1대1 수락 뒤 신청한 사람이 들어갈 자리 (신청한 사람만 받아 감)
  from_player uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists invites_to_idx on public.invites (to_user, status);
create index if not exists invites_from_idx on public.invites (from_user, status);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
