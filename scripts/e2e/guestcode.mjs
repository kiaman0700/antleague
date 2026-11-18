// 게스트 이어하기 코드 + 동시 접속 막기 (DB 051, design/onboarding.md) — 실제 서버
// - 게스트만 코드를 받고, 같은 코드를 언제든 다시 봄, 새로 받으면 예전 코드는 못 씀
// - 코드로 불러오면 같은 계정(같은 기록)이고, 예전 기기는 '다른 곳에서 접속' 401(replaced)
// - 틀린 코드는 늘 같은 문구, 회원 계정은 코드로 못 엶, 응답에 계정 id·해시 없음
import { createClient } from '@supabase/supabase-js';
import { ok, done, BASE, TEST_KEY, env } from './lib.mjs';

const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function guest() {
  for (let i = 0; i < 20; i++) {
    const g = await post({ action: 'guest' });
    if (g.s === 200) return (await client().auth.signInWithPassword(g.b)).data.session.access_token;
    await sleep(30_000);
  }
  throw new Error('손님 계정을 만들지 못했어요');
}

// 지난 실행이 남긴 '틀린 코드' 기록 정리 (시험이 일부러 틀리므로 — 시도 제한 자체는 아래에서 따로 확인)
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await admin.from('guest_code_fails').delete().gte('created_at', new Date(Date.now() - 3600_000).toISOString());

// 1) 기기 A: 게스트로 시작, 판 하나(대기실) 만들어 기록 남김
const a = await guest();
const A = (b) => post(b, a);
const made = await A({ action: 'create', nickname: '코드개미', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '코드 시험' });
ok('게스트 A 가 방을 만듦', made.s === 200, made.b?.error);

// 2) 코드 받기 · 다시 보기 · 형식
const c1 = await A({ action: 'guestCode' });
ok('게스트는 이어하기 코드를 받음', c1.s === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c1.b?.code ?? ''), JSON.stringify(c1.b));
const c2 = await A({ action: 'guestCode' });
ok('언제든 다시 보면 같은 코드', c2.b?.code === c1.b?.code);
ok('코드 응답엔 코드만 (계정 id·해시 없음)', Object.keys(c2.b ?? {}).join() === 'code');

// 3) 틀린 코드 · 이상한 값: 늘 같은 문구
const w1 = await post({ action: 'guestResume', code: 'AAAA-AAAA-AAAA' });
const w2 = await post({ action: 'guestResume', code: '<script>' });
ok('틀린 코드는 404 + 같은 문구', w1.s === 404 && w2.s === 404 && w1.b?.error === w2.b?.error, `${w1.s} ${w2.s} ${w1.b?.error}`);

// 4) 기기 B: 코드로 불러오기 → 같은 계정
const res = await post({ action: 'guestResume', code: c1.b.code.toLowerCase() });
ok('코드로 불러오기 (소문자·대시 상관없이)', res.s === 200 && res.b?.email && res.b?.password, JSON.stringify(res.b)?.slice(0, 80));
await sleep(1100); // 세션 시각이 확실히 더 늦게
const sb = (await client().auth.signInWithPassword(res.b)).data.session;
const B = (b) => post(b, sb.access_token);
const resumeB = (await B({ action: 'resume' })).b;
ok('불러온 기기 B 에 A 의 대기실 자리가 그대로', resumeB?.roomId === made.b.roomId, JSON.stringify(resumeB));

// 5) 동시 접속: 기기 A 는 이제 '다른 곳에서 접속' (서버가 같은 세션을 10초 기억하므로 기다림)
await sleep(11_000);
const old = await A({ action: 'profile' });
ok('예전 기기 A 는 401 replaced', old.s === 401 && old.b?.code === 'replaced', JSON.stringify(old.b));
ok('기기 B 는 그대로 됨', (await B({ action: 'profile' })).s === 200);

// 6) 새 코드로 바꾸면 예전 코드는 못 씀
const c3 = await B({ action: 'guestCode', renew: true });
ok('새 코드로 바꾸기', c3.s === 200 && c3.b?.code && c3.b.code !== c1.b.code);
const stale = await post({ action: 'guestResume', code: c1.b.code });
ok('예전 코드는 못 씀', stale.s === 404);

// 7) 회원은 코드 불가 (가입 시 코드도 지워짐 — 서버 dropGuestCode)
const SAVE = await import('node:fs').then((fs) => (fs.existsSync('scripts/e2e/.members.json') ? JSON.parse(fs.readFileSync('scripts/e2e/.members.json', 'utf8')) : {}));
if (SAVE.socialA) {
  const em = (await post({ action: 'loginEmail', username: SAVE.socialA.u })).b.email;
  const m = (await client().auth.signInWithPassword({ email: em, password: SAVE.socialA.pw })).data.session;
  const mc = await post({ action: 'guestCode' }, m.access_token);
  ok('회원은 게스트 코드를 못 받음 (403)', mc.s === 403, JSON.stringify(mc.b));
  // 같은 회원이 다른 브라우저에서 또 로그인 → 먼저 로그인한 곳은 끊김
  await sleep(1100);
  const m2 = (await client().auth.signInWithPassword({ email: em, password: SAVE.socialA.pw })).data.session;
  ok('두 번째 브라우저 로그인은 됨', (await post({ action: 'profile' }, m2.access_token)).s === 200);
  await sleep(11_000);
  const m1 = await post({ action: 'profile' }, m.access_token);
  ok('먼저 로그인한 브라우저는 401 replaced (동시 접속 막기)', m1.s === 401 && m1.b?.code === 'replaced', JSON.stringify(m1.b));
}

// 8) 시도 제한: 10분에 5번 틀리면 막힘 (맞는 코드도 잠깐 안 됨)
for (let i = 0; i < 5; i++) await post({ action: 'guestResume', code: 'ZZZZ-ZZZZ-ZZZ' + i });
const locked = await post({ action: 'guestResume', code: c3.b.code });
ok('5번 틀리면 잠깐 막힘 (429)', locked.s === 429, JSON.stringify(locked.b));
await admin.from('guest_code_fails').delete().gte('created_at', new Date(Date.now() - 3600_000).toISOString());

// 정리
await B({ action: 'leave', roomId: made.b.roomId });
done();
