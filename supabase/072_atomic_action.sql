-- 072: 행동(거래·카드·예약 주문·증강)을 넣을 때 자리 버전 올리기와 줄 넣기를 한 트랜잭션으로.
-- 예전엔 버전을 올린 뒤 따로 넣어서, 그 사이에 온 두 번째 요청이 첫 거래를 못 본 채 검증을 통과해
-- 가진 현금보다 많이 사거나 레버리지 한도를 넘길 수 있었음. 서버(비밀 키)만 부름. 여러 번 실행해도 안전
create or replace function public.bump_insert(p_player uuid, p_version integer, p_table text, p_row jsonb)
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
  exception when unique_violation then
    -- 같은 요청 번호(또는 같은 증강 차례)가 이미 있음 → 버전 올리기도 함께 되돌려짐
    return 'dup';
  end;
  return 'ok';
end;
$$;

revoke all on function public.bump_insert(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.bump_insert(uuid, integer, text, jsonb) to service_role;
