-- 031: 가입 동의 기록 + 시험용 회원 표시 (여러 번 실행해도 안전)
-- terms_version: 가입할 때 동의한 이용약관·개인정보처리방침 판(版)
-- is_test: 자동 시험(e2e)이 만든 회원 — 공개 랭킹·순위에서 뺌 (데이터는 지우지 않음)
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists is_test boolean not null default false;

-- 지금까지 자동 시험이 만든 회원 (아이디 규칙: e2e… · xe2e… · mm…(매칭 시험) · fra/frb/frc…(친구 시험) · pwtest…)
update public.profiles set is_test = true
where is_test = false
  and username ~ '^(x?e2e|mm[a-z0-9]|fr[abc][a-z0-9]{5}$|pwtest)';

create index if not exists profiles_rank_idx on public.profiles (is_test, ranked_games, rating desc);
