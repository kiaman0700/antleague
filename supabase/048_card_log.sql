-- 048: 판 기록에 카드 자세히 (2026-11-18) — 카드마다 쓴 날·그때 내 순위·대상 순위(그때·마지막)·막힘/튕김·그 뒤 하루 결과,
-- 그리고 자리마다 맞은 방해 수·방패로 막은 수·거울로 튕긴 수. 계정 id 없음. 서버만. 여러 번 실행해도 안전
alter table public.game_stats add column if not exists card_log jsonb not null default '[]'::jsonb;
alter table public.game_stats add column if not exists cards_hit jsonb not null default '{}'::jsonb;
alter table public.game_stats add column if not exists shield_blocks int not null default 0;
alter table public.game_stats add column if not exists mirror_hits int not null default 0;
