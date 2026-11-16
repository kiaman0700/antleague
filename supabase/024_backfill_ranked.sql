-- 추가 마이그레이션 024: 배치 도입 전에 이미 랭킹전을 한 회원은 그 판 수를 채워 넣음
-- (안 채우면 기존 회원이 다시 '배치 중'이 되고 랭킹 목록이 비어 보임). 여러 번 실행해도 안전
update public.profiles p
   set ranked_games = sub.n
  from (select user_id, count(*)::int as n from public.match_players where rated group by user_id) sub
 where sub.user_id = p.user_id
   and p.ranked_games < sub.n;
