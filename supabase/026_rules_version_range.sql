-- 추가 마이그레이션 026: 규칙 버전 칸 제한을 넓힘 (예전 1~9 → 1~99). 여러 번 실행해도 안전
-- 9 를 넘는 버전(v10 카드 5장, v11 1초 가격)이 이 제한에 걸려 서버가 예전 규칙(v1)으로 저장하던 문제
alter table public.room_secrets drop constraint if exists room_secrets_rules_version_check;
alter table public.room_secrets add constraint room_secrets_rules_version_check check (rules_version between 1 and 99);
