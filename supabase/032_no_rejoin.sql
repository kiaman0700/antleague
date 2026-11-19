-- 032: '다른 기기로 옮기기(이어하기 코드)' 기능을 없앰
-- 남아 있던 이어하기 코드 해시를 지움. 칸(rejoin_hash)은 남겨 둠 (이전 버전 서버 코드가 잠깐 돌아도 오류 없게) — 여러 번 실행해도 안전
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'rejoin_hash') then
    update public.players set rejoin_hash = null where rejoin_hash is not null;
  end if;
end $$;
