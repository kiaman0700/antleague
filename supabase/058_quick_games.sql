-- 058: 번개전 (가장 짧은 판이 10~14분이라 짧은 틈에 하기 어려움)
-- 판 길이 5일, 하루 45초를 허용 (지금은 봇전에서만 고를 수 있음). 여러 번 실행해도 안전
alter table public.rooms drop constraint if exists rooms_total_days_check;
alter table public.rooms add constraint rooms_total_days_check check (total_days in (5, 10, 20, 30));
alter table public.rooms drop constraint if exists rooms_turn_seconds_check;
alter table public.rooms add constraint rooms_turn_seconds_check check (turn_seconds in (0, 45, 60, 90, 180, 300, 600));
