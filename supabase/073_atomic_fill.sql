-- 073: 예약 체결과 '되돌리기' 증강도 자리 버전 올리기와 한 트랜잭션으로 (072 와 같은 까닭).
-- 예전엔 체결이 버전 올리기 → 주문 상태 바꾸기 → 체결 거래 넣기를 따로 해서, 그 사이 직접 거래가 같은 현금을 또 쓸 수 있었고,
-- 되돌리기 증강은 반대 거래를 증강 줄과 따로 넣어 같은 틈이 있었음. 서버(비밀 키)만 부름. 여러 번 실행해도 안전

-- 예약 체결: 'ok' | 'conflict'(버전이 이미 바뀜) | 'gone'(주문이 이미 처리됨 — 버전 올리기도 되돌림)
create or replace function public.fill_order(p_player uuid, p_version integer, p_order uuid, p_status text, p_fill numeric, p_trade jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cols text;
begin
  if p_status not in ('filled', 'expired', 'cancelled') then
    raise exception 'fill_order: bad status';
  end if;
  begin
    if p_trade is not null then
      update public.players set version = version + 1, updated_at = now()
       where id = p_player and version = p_version;
      if not found then
        return 'conflict';
      end if;
    end if;
    update public.orders set status = p_status, fill_price = p_fill
     where id = p_order and player_id = p_player and status = 'open';
    if not found then
      raise exception using errcode = 'P0002', message = 'order gone';
    end if;
    if p_trade is not null then
      select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(p_trade) as k;
      execute format('insert into public.trades (%s) select %s from jsonb_populate_record(null::public.trades, $1)', cols, cols) using p_trade;
    end if;
  exception when no_data_found then
    return 'gone';
  end;
  return 'ok';
end;
$$;

revoke all on function public.fill_order(uuid, integer, uuid, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.fill_order(uuid, integer, uuid, text, numeric, jsonb) to service_role;

-- bump_insert 에 같은 트랜잭션으로 넣을 거래 한 줄(되돌리기 증강의 반대 거래)을 더할 수 있게
drop function if exists public.bump_insert(uuid, integer, text, jsonb);
create or replace function public.bump_insert(p_player uuid, p_version integer, p_table text, p_row jsonb, p_trade jsonb default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cols text;
begin
  if p_table not in ('trades', 'items', 'orders', 'augments') then
    raise exception 'bump_insert: table not allowed';
  end if;
  select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(p_row) as k;
  begin
    update public.players set version = version + 1, updated_at = now()
     where id = p_player and version = p_version;
    if not found then
      return 'conflict';
    end if;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_table, cols, cols, p_table) using p_row;
    if p_trade is not null then
      select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(p_trade) as k;
      execute format('insert into public.trades (%s) select %s from jsonb_populate_record(null::public.trades, $1)', cols, cols) using p_trade;
    end if;
  exception when unique_violation then
    -- 같은 요청 번호(또는 같은 증강 차례)가 이미 있음 → 버전 올리기도 함께 되돌려짐
    return 'dup';
  end;
  return 'ok';
end;
$$;

revoke all on function public.bump_insert(uuid, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bump_insert(uuid, integer, text, jsonb, jsonb) to service_role;
