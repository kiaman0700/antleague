-- 추가 마이그레이션: 새 찬스 카드 (차트 분석 · 정보 차단 · 반사 거울 · 용돈 봉투)
-- SQL Editor 에서 이 파일만 실행하세요. (기존 데이터 유지, 여러 번 실행해도 안전)

alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('paper', 'detector', 'spy', 'analyst', 'scout', 'freeze', 'fake', 'fee', 'blackout', 'shield', 'mirror', 'bonus'));
