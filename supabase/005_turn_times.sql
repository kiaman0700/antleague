-- 추가 마이그레이션: 하루 제한 시간 1·3·5·10분 + 카운트다운 후 원래 시간 복구용 컬럼
-- SQL Editor 에서 이 파일만 실행하세요. (기존 데이터 유지, 여러 번 실행해도 안전)

-- 예전 선택지(0=무제한, 90초)도 기존 방을 위해 허용
alter table public.rooms drop constraint if exists rooms_turn_seconds_check;
do $$
begin
  begin
    alter table public.rooms add constraint rooms_turn_seconds_check check (turn_seconds in (0, 60, 90, 180, 300, 600));
  exception when duplicate_object then null;
  end;
end $$;

-- 오늘 원래 마감 시각. 카운트다운(30초/90초)이 시작돼 turn_deadline 이 당겨졌다가,
-- 누가 마감을 취소하면 이 시각으로 되돌린다. 서버만 씀(클라이언트 권한 없음)
alter table public.rooms add column if not exists day_deadline timestamptz;
