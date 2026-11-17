// 브라우저 열쇠(공개 키 + 로그인 토큰)로 DB 에 직접 접근해도 비밀은 못 읽고, 쓰지도 못하고, 서버 전용 함수도 못 부름
import { createClient } from '@supabase/supabase-js';
import { user, ok, done, env } from './lib.mjs';

const A = await user();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: 'Bearer ' + A.token } },
});
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// 내 방 하나 (rooms 는 그 방 사람만 일부 칸 읽기 가능)
const made = await A({ action: 'create', nickname: 'DB점검', mode: 'pro', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: 'DB 점검' });
const roomId = made.b?.roomId;

const TABLES = ['blocks', 'daily_runs', 'feedback', 'friendships', 'guest_log', 'invites', 'items', 'match_history', 'match_players', 'match_tickets', 'orders', 'parties', 'party_members', 'players', 'profiles', 'room_secrets', 'trades'];
for (const [who, c] of [
  ['로그인한 사람', sb],
  ['로그인 안 한 사람', anon],
]) {
  for (const t of TABLES) {
    const r = await c.from(t).select('*').limit(5);
    ok(`${who}: ${t} 읽기 막힘`, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? `${r.data?.length}줄`);
  }
  const rr = await c.from('rooms').select('*').limit(5);
  ok(`${who}: rooms 전체 칸 읽기 막힘`, !!rr.error || (rr.data ?? []).length === 0, rr.error?.message ?? `${rr.data?.length}줄`);
}
// 내 방이라도 시드·비밀값·코드·비밀번호 칸은 못 읽음
// (방 코드는 방 사람에게 원래 보여 줌 — 초대용이라 검사에서 뺌)
for (const col of ['seed', 'salt', 'pw_hash', 'password_hash']) {
  const r = await sb.from('rooms').select(col).eq('id', roomId);
  ok(`내 방의 ${col} 칸 못 읽음`, !!r.error || (r.data ?? []).every((x) => x[col] == null), r.error?.message ?? JSON.stringify(r.data));
}
// 쓰기
const w1 = await sb.from('trades').insert({ room_id: roomId, player_id: roomId, day: 0, symbol: 'CORE', side: 'buy', qty: 1, price: 1, fee: 0 });
ok('거래 직접 쓰기 막힘', !!w1.error, w1.error?.message);
const w2 = await sb.from('rooms').update({ status: 'finished' }).eq('id', roomId).select();
ok('방 상태 직접 바꾸기 막힘', !!w2.error || (w2.data ?? []).length === 0, w2.error?.message ?? JSON.stringify(w2.data));
const w3 = await sb.from('profiles').update({ rating: 3000 }).neq('user_id', '00000000-0000-0000-0000-000000000000').select();
ok('점수 직접 바꾸기 막힘', !!w3.error || (w3.data ?? []).length === 0, w3.error?.message ?? JSON.stringify(w3.data));
// 서버 전용 함수
const fake = '00000000-0000-0000-0000-000000000000';
for (const [fn, args] of [
  ['cleanup_stale', {}],
  ['revoke_user_sessions', { target: fake }],
  ['apply_rating', { p_user: fake, p_delta: 100 }],
  ['apply_rating2', { p_user: fake, p_delta: 100 }],
  ['kick_player', { p_room: fake, p_player: fake }],
  ['host_leave', { p_room: fake, p_player: fake }],
  ['join_party', { p_party: fake, p_user: fake }],
]) {
  const r = await sb.rpc(fn, args);
  ok(`서버 전용 함수 ${fn} 못 부름`, !!r.error, r.error?.message ?? 'no error');
}
// 운영자 권한 직접 만들기
const up = await sb.auth.updateUser({ data: { role: 'admin' } });
const me = (await A({ action: 'adminUnread' })).s;
ok('사용자 정보에 role 을 넣어도 운영자가 아님', me === 403 || me === 401, `status=${me} ${up.error?.message ?? ''}`);
await A({ action: 'leave', roomId });
done();
process.exit(0);
