-- 042: 전적에 판 종류 — 롤·배그 전적처럼 줄마다 '랭킹전·일반전·봇전·오늘의 도전·커스텀·친구 1대1'
-- match_players.kind / ranked 를 기록 (방이 나중에 지워져도 남게). 여러 번 실행해도 안전
alter table public.match_players add column if not exists kind text check (kind is null or kind in ('custom', 'match', 'friend', 'bot', 'daily'));
alter table public.match_players add column if not exists ranked boolean;
-- 예전 기록은 아직 남아 있는 방에서 채움
update public.match_players mp
   set kind = r.kind, ranked = coalesce(r.ranked, false)
  from public.rooms r
 where r.id = mp.room_id and mp.kind is null;
