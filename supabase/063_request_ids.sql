-- 063: 같은 주문을 두 번 처리하지 않게 — 화면이 버튼 한 번마다 만든 요청 번호(req_id)
-- 응답만 끊겨 다시 보내도 (player_id, req_id) 가 같으면 서버가 처음 결과를 돌려줌. 여러 번 실행해도 안전
alter table public.trades add column if not exists req_id uuid;
alter table public.items add column if not exists req_id uuid;
alter table public.orders add column if not exists req_id uuid;
create unique index if not exists trades_player_req_uidx on public.trades (player_id, req_id) where req_id is not null;
create unique index if not exists items_player_req_uidx on public.items (player_id, req_id) where req_id is not null;
create unique index if not exists orders_player_req_uidx on public.orders (player_id, req_id) where req_id is not null;
