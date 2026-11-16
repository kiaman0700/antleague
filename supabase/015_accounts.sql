-- 추가 마이그레이션 015: 회원 계정(프로필)·대결 기록·랭킹
-- 아이디·비밀번호 계정 (이메일 안 받음). 모든 읽기·쓰기는 서버(/api/game)만 — 브라우저 권한 없음
-- `npm run db -- apply supabase/015_accounts.sql` (여러 번 실행해도 안전)

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{4,16}$'),
  nickname text not null check (char_length(nickname) between 1 and 10),
  title text,
  rating integer not null default 1000,
  games integer not null default 0,
  wins integer not null default 0,
  best_ret real,
  recovery_hash text,
  agreed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_uq on public.profiles (lower(nickname));
create index if not exists profiles_rating_idx on public.profiles (rating desc);

-- 회원이 참가한 대결 결과 (랭킹 점수 변화 기록). 같은 판은 한 번만
create table if not exists public.match_players (
  room_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank integer not null,
  players integer not null,
  ret real not null,
  rated boolean not null default false,
  rating_before integer,
  rating_after integer,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists match_players_user_idx on public.match_players (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.match_players enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.match_players from anon, authenticated;
