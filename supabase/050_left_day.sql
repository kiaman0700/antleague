-- 050: 기권한 날 (players.left_day) — 상대가 모두 기권해 판이 바로 끝나면, 업적은 실제로 한 날(마지막 기권 날)까지만 계산
-- 여러 번 실행해도 안전
alter table public.players add column if not exists left_day integer;
alter table public.players drop constraint if exists players_left_day_range;
alter table public.players add constraint players_left_day_range check (left_day is null or (left_day >= 0 and left_day <= 200));
