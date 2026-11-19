-- 064: 증강(규칙 v27) — 고르기·다시 뽑기·쓰기 줄. 보기·돈은 서버가 이 줄과 시장으로 다시 계산하므로 금액은 저장하지 않음.
-- 같은 요청이 동시에 두 번 와도 한 번만 들어가게 DB 유니크로 막음. 여러 번 실행해도 안전
create table if not exists public.augments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  n smallint not null check (n between -1 and 9),
  day smallint not null check (day between 0 and 99),
  action text not null check (action in ('pick', 'reroll', 'use')),
  aug text not null check (aug ~ '^[a-z0-9]{1,16}$'),
  slot smallint check (slot between 0 and 2),
  payload jsonb,
  req_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists augments_room_idx on public.augments (room_id);
-- 고르기는 차례마다 한 번
create unique index if not exists augments_pick_uidx on public.augments (player_id, n) where action = 'pick';
-- 다시 뽑기: 같은 칸·같은 보기를 두 번 다시 뽑지 않음 (동시에 두 번 눌러도 한 번)
create unique index if not exists augments_reroll_uidx on public.augments (player_id, n, slot, aug) where action = 'reroll';
-- 정보 쓰기는 종류마다 하루 한 번, 타이밍·되돌리기는 판에 한 번
create unique index if not exists augments_info_uidx on public.augments (player_id, aug, day) where action = 'use' and aug in ('detector', 'scout', 'paper', 'analyst');
create unique index if not exists augments_once_uidx on public.augments (player_id, aug) where action = 'use' and aug in ('timing', 'undo');
create unique index if not exists augments_player_req_uidx on public.augments (player_id, req_id) where req_id is not null;

alter table public.augments enable row level security;
revoke all on public.augments from anon, authenticated;
