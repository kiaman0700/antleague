-- 062: 오늘의 시장 테마 (design/v26-batch.md B) — 여러 번 실행해도 안전
-- 오늘의 도전 방에 그날 테마 id 를 적음. 테마 이름은 공개 정보(모두 같은 시장), 어느 종목·몇 일차인지는 시장 비밀값으로만 정함.
alter table public.rooms add column if not exists theme text;
do $$ begin
  alter table public.rooms add constraint rooms_theme_chk check (theme is null or theme ~ '^[a-z]{2,12}$');
exception when duplicate_object then null; end $$;
