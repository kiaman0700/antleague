-- 066: 수수료 칸 제한을 0~5% 범위로 — 증강(v27)으로 수수료 0(면제·되돌리기)·0.2%(단타·올인 2배)가 생김.
-- 예전 제한은 0.1%·1%(수수료 폭탄)만 받아서 그런 거래·예약이 DB 에서 거절됐음. 여러 번 실행해도 안전
alter table public.trades drop constraint if exists trades_fee_check;
alter table public.trades add constraint trades_fee_check check (fee >= 0 and fee <= 0.05);
alter table public.orders drop constraint if exists orders_fee_check;
alter table public.orders add constraint orders_fee_check check (fee >= 0 and fee <= 0.05);
