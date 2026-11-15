-- 추가 마이그레이션: 여러 명(최대 6명) · 방 제목 · 비밀방
-- SQL Editor 에서 이 파일만 실행하세요. (기존 데이터 유지, 여러 번 실행해도 안전)

alter table public.rooms add column if not exists title text not null default '주식 대결';
alter table public.rooms add column if not exists max_players integer not null default 2;
alter table public.rooms add column if not exists is_private boolean not null default false;

do $$
begin
  begin
    alter table public.rooms add constraint rooms_title_len check (char_length(title) between 1 and 20);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.rooms add constraint rooms_max_players check (max_players between 2 and 6);
  exception when duplicate_object then null;
  end;
end $$;

-- 비밀번호는 해시로만, 클라이언트가 볼 수 없는 room_secrets 에 저장
alter table public.room_secrets add column if not exists password_hash text;

-- 참가자에게 보이는 방 정보에 제목·인원·비밀방 여부 추가 (비밀번호·시드는 여전히 비공개)
grant select (title, max_players, is_private) on public.rooms to authenticated;

create index if not exists rooms_waiting_idx on public.rooms(status, created_at desc);
