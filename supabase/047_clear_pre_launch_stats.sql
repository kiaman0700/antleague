-- 047: 판 기록(game_stats) 중 이 기능을 배포하기 전 로컬 시험에서 생긴 줄을 지움
-- 그 시각 전 줄은 기록 기능 배포 전이라 모두 시험 판. 날짜로 막아 두어 나중에 다시 실행해도 실제 기록은 안 지워짐
delete from public.game_stats where created_at < timestamptz '2026-11-18 02:00:00+09';
