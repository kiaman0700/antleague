-- 추가 마이그레이션 025: (규칙 v7) 장 전 시간 '준비 완료'를 누른 날. 여러 번 실행해도 안전
-- 없으면 서버는 준비 완료로 장을 일찍 여는 기능만 빼고 그대로 동작 (장 전 시간이 끝나면 자동으로 열림)
alter table public.players add column if not exists pre_day integer not null default -1;
