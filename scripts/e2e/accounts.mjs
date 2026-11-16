// 회원: 가입(게스트 → 정식) · 로그인 · 프로필 · 닉네임 강제 · 회원 표시 · 랭킹 점수 · 비밀번호 찾기 · 탈퇴
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ok, done, BASE } from './lib.mjs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
/** 새 게스트 (서버 손님 계정 경로) */
async function guest() {
  const g = await post({ action: 'guest' });
  const sb = client();
  const { data } = await sb.auth.signInWithPassword(g.b);
  const tok = data.session.access_token;
  return (body) => post(body, tok);
}
const rnd = Math.random().toString(36).slice(2, 7);
let A = await guest();
let B = await guest();
const ua = 'e2ea' + rnd;
const ub = 'e2eb' + rnd;
const pw = 'test' + rnd + '123';

// ---- 가입 ----
const bad = await A({ action: 'signup', username: ua, password: pw, nickname: 'A' + rnd, agree14: false, agreePrivacy: true });
ok('만 14세 확인 없이는 가입 불가', bad.s === 400, bad.b?.error);
const weak = await A({ action: 'signup', username: ua, password: 'short', nickname: 'A' + rnd, agree14: true, agreePrivacy: true });
ok('약한 비밀번호 거절', weak.s === 400, weak.b?.error);
const sa = await A({ action: 'signup', username: ua, password: pw, nickname: 'A' + rnd, agree14: true, agreePrivacy: true });
ok('A 가입 (복구 코드 받음)', sa.s === 200 && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(sa.b?.recoveryCode ?? ''), sa.b?.error ?? '');
const dupU = await B({ action: 'signup', username: ua, password: pw, nickname: 'B' + rnd, agree14: true, agreePrivacy: true });
ok('같은 아이디는 거절', dupU.s === 409, dupU.b?.error);
const dupN = await B({ action: 'signup', username: ub, password: pw, nickname: 'A' + rnd, agree14: true, agreePrivacy: true });
ok('같은 닉네임은 거절', dupN.s === 409, dupN.b?.error);
const sb2 = await B({ action: 'signup', username: ub, password: pw, nickname: 'B' + rnd, agree14: true, agreePrivacy: true });
ok('B 가입', sb2.s === 200, sb2.b?.error ?? '');
// 가입하면 예전 세션이 끝나므로(비밀번호 설정) 새 아이디로 다시 로그인 — 화면도 같은 흐름
const relog = async (u) => {
  const { data } = await client().auth.signInWithPassword({ email: `${u}@u.stockduel.invalid`, password: pw });
  const tok = data.session.access_token;
  return (body) => post(body, tok);
};
A = await relog(ua);
B = await relog(ub);
const again = await A({ action: 'signup', username: 'x' + ua, password: pw, nickname: 'Z' + rnd, agree14: true, agreePrivacy: true });
ok('이미 가입한 계정은 다시 가입 불가', again.s === 409, JSON.stringify(again));

// ---- 다른 기기에서 로그인 ----
const c2 = client();
const li = await c2.auth.signInWithPassword({ email: `${ua}@u.stockduel.invalid`, password: pw });
ok('아이디·비밀번호로 로그인', !li.error, li.error?.message ?? '');
const A2 = (body) => post(body, li.data.session.access_token);
const prof = await A2({ action: 'profile' });
ok('프로필 (아이디·닉네임·점수 1000)', prof.b?.profile?.username === ua && prof.b.profile.nickname === 'A' + rnd && prof.b.profile.rating === 1000, JSON.stringify(prof.b?.profile));
ok('프로필에 내부 id 없음', !JSON.stringify(prof.b).includes('user_id') && !JSON.stringify(prof.b).includes('recovery'));
const t = await A2({ action: 'updateProfile', title: 'winner' });
ok('얻지 않은 업적은 칭호로 못 고름', t.s === 400, t.b?.error);
const nn = await A2({ action: 'updateProfile', nickname: 'B' + rnd });
ok('남의 닉네임으로 바꾸기 거절', nn.s === 409);

// ---- 회원끼리 대결 → 닉네임은 프로필 것으로, 회원 표시, 끝나면 점수 반영 ----
const made = await A({ action: 'create', nickname: '가짜이름', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '회원전' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: '아무거나', mode: 'easy' });
await B({ action: 'ready', roomId, ready: true });
await A({ action: 'start', roomId });
let s = (await A({ action: 'state', roomId })).b;
ok('닉네임은 프로필 닉네임으로 (입력값 무시)', s.players.map((p) => p.nickname).sort().join() === ['A' + rnd, 'B' + rnd].sort().join(), s.players.map((p) => p.nickname).join());
ok('회원 표시', s.players.every((p) => p.verified === true));
await B({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 5 });
for (let d = 0; d < 10; d++) {
  await A({ action: 'endTurn', roomId });
  await B({ action: 'endTurn', roomId });
  await A({ action: 'state', roomId });
}
s = (await A({ action: 'state', roomId })).b;
ok('게임 끝', s.room.status === 'finished');
const ma = (await A({ action: 'myMatch', roomId })).b;
const mb = (await B({ action: 'myMatch', roomId })).b;
ok('회원끼리 판은 점수 반영', ma?.rated === true && mb?.rated === true, JSON.stringify([ma, mb]));
ok('이긴 쪽 +, 진 쪽 − (합은 0)', ma.rating_after - ma.rating_before === -(mb.rating_after - mb.rating_before) && ma.rating_after !== ma.rating_before, JSON.stringify([ma, mb]));
const rank = (await A({ action: 'ranking' })).b;
ok('랭킹에 닉네임으로 나옴 (아이디는 안 나옴)', rank.top.some((x) => x.nickname === 'A' + rnd) && !JSON.stringify(rank).includes(ua), '');
ok('내 순위 표시', typeof rank.me?.rank === 'number');
const pa = (await A({ action: 'profile' })).b.profile;
ok('전적 1판', pa.games === 1);

// ---- 게스트는 랭킹에 없음 ----
const G = await guest();
const gp = (await G({ action: 'profile' })).b;
ok('게스트는 프로필 없음', gp.profile === null);
const gr = (await G({ action: 'ranking' })).b;
ok('게스트도 랭킹은 볼 수 있음 (내 순위는 없음)', Array.isArray(gr.top) && gr.me === null);

// ---- 비밀번호 찾기 ----
const wrong = await post({ action: 'resetPassword', username: ua, code: 'AAAA-AAAA-AAAA', password: 'newpass' + rnd + '9' });
ok('틀린 복구 코드 거절', wrong.s === 403, wrong.b?.error);
const pw2 = 'newpass' + rnd + '9';
const rs = await post({ action: 'resetPassword', username: ua, code: sa.b.recoveryCode, password: pw2 });
ok('복구 코드로 새 비밀번호 (새 복구 코드 받음)', rs.s === 200 && rs.b.recoveryCode && rs.b.recoveryCode !== sa.b.recoveryCode, rs.b?.error ?? '');
const old = await client().auth.signInWithPassword({ email: `${ua}@u.stockduel.invalid`, password: pw });
ok('예전 비밀번호로는 로그인 안 됨', !!old.error);
const neu = await client().auth.signInWithPassword({ email: `${ua}@u.stockduel.invalid`, password: pw2 });
ok('새 비밀번호로 로그인', !neu.error);
const reuse = await post({ action: 'resetPassword', username: ua, code: sa.b.recoveryCode, password: pw });
ok('쓴 복구 코드는 다시 못 씀', reuse.s === 403);

// ---- 정리: 탈퇴 ----
// 비밀번호를 바꾸면 예전 세션이 끝나므로 새 비밀번호로 로그인해서 탈퇴
const A3 = (body) => post(body, neu.data.session.access_token);
ok('A 탈퇴', (await A3({ action: 'forgetMe' })).s === 200);
ok('B 탈퇴', (await B({ action: 'forgetMe' })).s === 200);
done();
