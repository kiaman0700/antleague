-- 점검용 계정으로 한 판을 시험 판으로 바로잡기.
-- 이 컴퓨터의 개발 서버로 한 판(화면 점검용 손님 계정)이 시험 표시 없이 운영 통계(game_stats)에 들어갔음.
-- 이제 개발 서버는 모든 요청에 시험 표시를 붙여 그 계정이 test_users 에 적히므로, 그런 계정이 앉았던 자리의 줄을 시험 판으로 표시함 (통계에서 빠짐, 여러 번 실행해도 안전).
update public.game_stats g
set is_test = true
from public.players p
where p.id = g.seat_id
  and p.user_id in (select user_id from public.test_users)
  and g.is_test = false;
