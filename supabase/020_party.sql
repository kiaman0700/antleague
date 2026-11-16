-- 추가 마이그레이션 020: 일반전 파티(2명) · 랭킹전 친구/같은 인터넷 분리
-- `npm run db -- apply supabase/020_party.sql` (여러 번 실행해도 안전)

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
revoke all on public.parties from anon, authenticated;
revoke all on public.party_members from anon, authenticated;

-- 초대 종류에 파티 추가
alter table public.invites add column if not exists party_id uuid references public.parties(id) on delete cascade;
alter table public.invites drop constraint if exists invites_kind_check;
alter table public.invites add constraint invites_kind_check check (kind in ('room', 'duel', 'party'));

-- 대기표: 파티
alter table public.match_tickets add column if not exists party_id uuid;
-- (같은 인터넷 분리는 통신사 공유 IP 때문에 하지 않기로 함 — 쓰지 않는 칸은 지움)
alter table public.match_tickets drop column if exists ip_hash;
