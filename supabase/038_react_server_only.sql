-- 038: 이모지 반응은 서버만 보냄 — 여러 번 실행해도 안전
-- 예전(029)엔 방 사람이 채널에 직접 보낼 수 있어서, 보낸 사람 칸(from)을 바꿔 다른 사람 이름으로 보낼 수 있었음.
-- 이제 /api/game 'react' 가 방 사람인지 확인하고 보낸 사람을 붙여 서버 비밀 키로 방송. 브라우저는 듣기만.
drop policy if exists "room members send reactions" on realtime.messages;
