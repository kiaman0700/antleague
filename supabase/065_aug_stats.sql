-- 065: 판 기록(game_stats)에 증강 자세히 — 차례마다 보기 3개·고른 것·자동 여부·다시 뽑기 수·그 증강으로 받은 돈.
-- '떴는데 다른 걸 고른 사람'과 비교해 증강 밸런스를 봄. 계정 id 없음. 여러 번 실행해도 안전
alter table public.game_stats add column if not exists aug_log jsonb;
