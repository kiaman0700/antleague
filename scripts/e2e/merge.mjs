// 게스트 기록 가져오기(guestSummary·mergeGuest): 게스트로 하다 회원으로 로그인했을 때 (실제 서버)
// - 남의(회원) 계정 기록은 못 가져옴 · 토큰 없거나 나 자신이면 거절
// - 회원에게 진행·대기 중 자리가 없으면 게스트 자리를 옮기고, 있으면 옮기지 않고 그 자리는 나감 (한 사람 한 방)
// - 가져오고 나면 게스트 계정은 지워짐
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { user, ok, done, BASE, TEST_KEY, env } from './lib.mjs';

const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const loginEmail = async (u) => (await post({ action: 'loginEmail', username: u })).b.email;
const SAVE = 'scripts/e2e/.members.json';
const saved = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};

/** 게스트 하나 만들고 토큰까지 (user() 는 토큰을 숨기므로 손님 계정을 직접) */
async function guestWithToken() {
  for (let i = 0; i < 30; i++) {
    const g = await post({ action: 'guest' });
    if (g.s === 200) {
      const { data } = await client().auth.signInWithPassword(g.b);
      return data.session.access_token;
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('손님 계정을 만들지 못했어요');
}
async function member() {
  let m = saved.mergeM;
  let data = null;
  if (m) data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
  if (!data?.session) {
    const G = await user();
    const r5 = Math.random().toString(36).slice(2, 7);
    m = { u: 'e2emg' + r5, pw: 'pw' + r5 + '123', nick: 'Mg' + r5 };
    const r = await G({ action: 'signup', username: m.u, password: m.pw, nickname: m.nick, agree14: true, agreePrivacy: true, agreeTerms: true });
    if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
    data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
    saved.mergeM = m;
    fs.writeFileSync(SAVE, JSON.stringify(saved));
  }
  return data.session.access_token;
}

const mt = await member();
const M = (b) => post(b, mt);
// 지난 실행에서 남은 자리 정리
for (let i = 0; i < 5; i++) {
  const r = (await M({ action: 'resume' })).b;
  if (!r?.roomId) break;
  await M({ action: 'leave', roomId: r.roomId });
}

// 1) 거절되는 경우
ok('게스트 토큰 없이 요약은 404', (await M({ action: 'guestSummary' })).s === 404);
ok('내 토큰(회원)을 게스트라고 넣으면 404/403', [403, 404].includes((await M({ action: 'guestSummary', guestToken: mt })).s));
const other = saved.socialA ? (await client().auth.signInWithPassword({ email: await loginEmail(saved.socialA.u), password: saved.socialA.pw })).data?.session?.access_token : null;
if (other) ok('다른 회원 계정의 기록은 가져올 수 없음 (403)', (await M({ action: 'mergeGuest', guestToken: other, mode: 'merge' })).s === 403);
ok('이상한 토큰은 404', (await M({ action: 'guestSummary', guestToken: 'abc.def.ghi' })).s === 404);

// 2) 게스트 1: 대기실 자리 하나 → 회원은 비어 있으니 옮겨짐
const g1 = await guestWithToken();
const G1 = (b) => post(b, g1);
const room1 = (await G1({ action: 'create', nickname: '손님1', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '합치기 시험 1' })).b;
const sum1 = await M({ action: 'guestSummary', guestToken: g1 });
ok('게스트 요약: 끝난 판 0 · 진행·대기 1', sum1.s === 200 && sum1.b.games === 0 && sum1.b.playing === 1, JSON.stringify(sum1.b));
const mg1 = await M({ action: 'mergeGuest', guestToken: g1, mode: 'merge' });
ok('가져오기: 대기실 자리 1개가 회원에게', mg1.s === 200 && mg1.b.moved === 1, JSON.stringify(mg1.b));
const res1 = (await M({ action: 'resume' })).b;
ok('회원이 그 대기실에 들어가 있음', res1?.roomId === room1.roomId, JSON.stringify(res1));
ok('옮긴 대기실 자리는 회원 닉네임으로 바뀜', res1?.nickname === saved.mergeM.nick, `${res1?.nickname} / ${saved.mergeM.nick}`);
ok('가져온 뒤 게스트 계정은 지워짐 (그 토큰으로 요청 불가)', (await G1({ action: 'profile' })).s === 401);

// 3) 게스트 2: 대기실 자리 → 회원은 이미 대기실에 있으니 옮기지 않고 게스트 자리는 나감
const g2 = await guestWithToken();
const G2 = (b) => post(b, g2);
const room2 = (await G2({ action: 'create', nickname: '손님2', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '합치기 시험 2' })).b;
const mg2 = await M({ action: 'mergeGuest', guestToken: g2, mode: 'merge' });
ok('회원에게 이미 대기·진행 자리가 있으면 게스트 자리는 안 옮김 (한 사람 한 방)', mg2.s === 200 && mg2.b.moved === 0, JSON.stringify(mg2.b));
const res2 = (await M({ action: 'resume' })).b;
ok('회원은 원래 대기실 그대로', res2?.roomId === room1.roomId && res2?.roomId !== room2.roomId);

// 4) 버리기: 게스트만 지워지고 회원 자리는 그대로
const g3 = await guestWithToken();
const md = await M({ action: 'mergeGuest', guestToken: g3, mode: 'discard' });
ok('버리기: 게스트 계정만 지움', md.s === 200 && md.b.moved === 0 && (await post({ action: 'profile' }, g3)).s === 401, JSON.stringify(md.b));

// 정리
await M({ action: 'leave', roomId: room1.roomId });
done();
