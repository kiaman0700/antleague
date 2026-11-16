-- 027: 오래된 데이터 자동 정리 (여러 번 실행해도 안전)
-- 끝난 초대·오래된 손님 기록·버려진 대기실·아무도 안 하는 진행 중 방을 지움.
-- 함수는 서버(정리 작업)만 부를 수 있음 — 브라우저(anon/authenticated)는 실행 권한 없음.

create or replace function public.cleanup_stale()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_inv int; n_guest int; n_tix int; n_wait int; n_dead int;
begin
  -- 만료된 지 하루 지난 초대 (친구 초대·1대1 신청·파티 부르기)
  delete from invites where expires_at < now() - interval '1 day';
  get diagnostics n_inv = row_count;
  -- 손님 계정 생성 기록: 제한은 1시간 단위라 이틀이면 충분
  delete from guest_log where created_at < now() - interval '2 days';
  get diagnostics n_guest = row_count;
  -- 응답 없는 매칭 대기표
  delete from match_tickets where coalesce(last_poll, created_at) < now() - interval '1 hour';
  get diagnostics n_tix = row_count;
  -- 하루 넘게 시작 안 한 대기실
  delete from rooms where status = 'waiting' and created_at < now() - interval '1 day';
  get diagnostics n_wait = row_count;
  -- 마지막 날 마감이 일주일 넘게 지난 진행 중 방 (모두 떠난 판) — 남은 사람이 새 대결을 못 하던 문제도 풀림
  delete from rooms
   where status = 'playing'
     and coalesce(day_deadline, turn_deadline, created_at) < now() - interval '7 days';
  get diagnostics n_dead = row_count;
  return jsonb_build_object('invites', n_inv, 'guest_log', n_guest, 'tickets', n_tix, 'waiting', n_wait, 'abandoned', n_dead);
end;
$$;

revoke all on function public.cleanup_stale() from public;
revoke all on function public.cleanup_stale() from anon, authenticated;

-- 한 시간마다 자동 실행 (pg_cron 을 쓸 수 없으면 건너뜀 — 그래도 함수는 남음)
do $$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron 사용 불가: %', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule(jobid) from cron.job where jobname = 'stockduel-cleanup';
    perform cron.schedule('stockduel-cleanup', '17 * * * *', 'select public.cleanup_stale()');
  exception when others then
    raise notice '정리 예약 실패: %', sqlerrm;
  end;
end $$;
