-- 068: 오늘의 도전 기록에 거래 횟수 — 한 번도 거래하지 않은 기록(0%)은 점수표에서 뺌
-- (폭락 테마 날에 아무것도 안 한 0% 가 상위권이 되던 것). 예전 줄(null)은 그대로 보임. 여러 번 실행해도 안전
alter table public.daily_runs add column if not exists trades integer;
