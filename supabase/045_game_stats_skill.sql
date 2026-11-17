-- 045: 판 기록에 실력 정보 (2026-11-18) — 티어별·경험별로 밸런스를 볼 수 있게. 계정 id 는 여전히 없음.
-- rating: 그 판 시작 때 랭킹 점수(회원), tier: 배치 뒤 티어 이름 · 'unplaced'(배치 중) · 'guest'(손님) · 'bot'
-- games_before: 그 판 전까지 끝낸 판 수(경험), level: 레벨, opp_diff: 내 점수 − 같은 판 다른 회원 평균 점수. 여러 번 실행해도 안전
alter table public.game_stats add column if not exists rating int;
alter table public.game_stats add column if not exists tier text;
alter table public.game_stats add column if not exists games_before int;
alter table public.game_stats add column if not exists level int;
alter table public.game_stats add column if not exists opp_diff int;
create index if not exists game_stats_tier_idx on public.game_stats (tier);
