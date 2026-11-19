// 시험 계정 표시 머리글은 서버 비밀 키로 만든 값만 통함 — 아무 값('1' 등)을 붙여 랭킹·통계에서 빠지는 일이 없게
import { createClient } from '@supabase/supabase-js';
import { ok, done, env, BASE, TEST_KEY } from './lib.mjs';

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const s = await anon.auth.signInAnonymously();
if (s.error || !s.data.session) {
  console.log('ℹ️ 새 익명 계정을 못 만들어(요청 제한) 이번엔 건너뜀', s.error?.message ?? '');
  done();
} else {
  const tok = s.data.session.access_token;
  const uid = s.data.user.id;
  for (const fake of ['1', 'true', '0'.repeat(32), 'a'.repeat(32), 'x'.repeat(300)]) {
    await fetch(BASE + '/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-stockduel-test': fake, 'x-stockduel-vis': '0', authorization: 'Bearer ' + tok },
      body: JSON.stringify({ action: 'profile' }),
    });
  }
  await new Promise((r) => setTimeout(r, 1500));
  const r = await admin.from('test_users').select('user_id').eq('user_id', uid);
  ok('가짜 시험 머리글로는 시험 계정이 되지 않음', !r.error && (r.data ?? []).length === 0, r.error?.message ?? `${r.data?.length}줄`);
  // 비교: 진짜 값이면 시험 계정으로 적힘 (이 시험이 실제로 잡아낼 수 있는지)
  await fetch(BASE + '/api/game', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': '0', authorization: 'Bearer ' + tok },
    body: JSON.stringify({ action: 'profile' }),
  });
  await new Promise((r) => setTimeout(r, 1500));
  const r2 = await admin.from('test_users').select('user_id').eq('user_id', uid);
  ok('진짜 시험 값이면 시험 계정으로 적힘', (r2.data ?? []).length === 1);
  await admin.from('test_users').delete().eq('user_id', uid);
  // 만든 익명 계정은 지움 (시험이 남긴 계정이 쌓이지 않게)
  await admin.auth.admin.deleteUser(uid).catch(() => {});
  done();
}
