-- 추가 마이그레이션 026: 규칙 버전 칸 제한을 넓힘 (1~9 → 1~99). 여러 번 실행해도 안전
-- 9 를 넘는 버전(v10 카드 5장, v11 1초 가격)이 1~9 제한에 걸리면 서버가 v1 규칙으로 내려 저장함
alter table public.room_secrets drop constraint if exists room_secrets_rules_version_check;
alter table public.room_secrets add constraint room_secrets_rules_version_check check (rules_version between 1 and 99);
