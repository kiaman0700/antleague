-- 030: 파티원이 로비(파티 칸이 있는 화면)로 돌아왔는지 — 롤처럼 판이 끝나면 파티로 돌아와 다시 찾기
-- 서버(`party` 요청)만 씀. 브라우저는 이 표에 직접 읽기·쓰기 못 함 (기존 권한 그대로)
-- 여러 번 실행해도 안전
alter table public.party_members add column if not exists lobby_at timestamptz;
