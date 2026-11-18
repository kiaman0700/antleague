// 친구: 신청·수락·거절·삭제·차단·상태, 그리고 정보가 새지 않는지
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ok, done, BASE, user, TEST_KEY } from './lib.mjs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const loginEmail = async (u) => (await post({ action: 'loginEmail', username: u })).b.email;
async function guest() {
  // 손님 계정 생성 제한(같은 IP 시간당 60)에 걸리면 1분마다 다시 (최대 60분)
  for (let i = 0; i < 60; i++) {
    const g = await post({ action: 'guest' });
    if (g.s === 200) {
      const { data } = await client().auth.signInWithPassword(g.b);
      const tok = data.session.access_token;
      return (body) => post(body, tok);
    }
    if (i === 0) console.log('  (손님 계정 생성 제한 — 풀릴 때까지 1분마다 다시 시도)');
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('손님 계정을 만들지 못했어요');
}
// 테스트 회원은 만들어 두고 다시 씀(.members.json, 깃에 안 올라감) — 손님 계정 생성 제한(IP 시간당 60) 아끼기
const SAVE = 'scripts/e2e/.members.json';
const saved = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};
const users = {};
async function member(tag) {
  let m = saved['social' + tag];
  let data = null;
  if (m) data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
  if (!data?.session) {
    const G = await guest();
    const r5 = Math.random().toString(36).slice(2, 7);
    m = { u: 'e2efr' + tag.toLowerCase() + r5, pw: 'pw' + r5 + '123', nick: tag + r5 };
    const r = await G({ action: 'signup', username: m.u, password: m.pw, nickname: m.nick, agree14: true, agreePrivacy: true, agreeTerms: true });
    if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
    data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
    saved['social' + tag] = m;
    fs.writeFileSync(SAVE, JSON.stringify(saved));
  }
  const tok = data.session.access_token;
  users[tag] = { u: m.u, uid: data.user.id, nick: m.nick };
  const U = (body) => post(body, tok);
  // 지난 실행에서 남은 친구·신청·차단 정리
  const f = (await U({ action: 'friends' })).b;
  for (const x of [...(f?.friends ?? []), ...(f?.outgoing ?? []), ...(f?.incoming ?? [])]) await U({ action: 'friendRemove', id: x.id });
  for (const x of f?.blocked ?? []) await U({ action: 'unblock', id: x.id });
  await U({ action: 'partyLeave' });
  await U({ action: 'queueLeave' });
  // 지난 실행에서 남은 방·대결에서 나가기
  for (let i = 0; i < 5; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
  return U;
}

const A = await member('A');
const B = await member('B');
const C = await member('C');
const nA = users.A.nick, nB = users.B.nick, nC = users.C.nick;
const rnd = Math.random().toString(36).slice(2, 7);

// 게스트는 못 씀
const G = await user();
const g = await G({ action: 'friends' });
ok('게스트는 친구 기능 불가 (403)', g.s === 403, g.b?.error);

// 신청
const self = await A({ action: 'friendRequest', nickname: nA });
ok('나에게는 신청 불가', self.s === 400, self.b?.error);
const none = await A({ action: 'friendRequest', nickname: '없는닉' + rnd });
ok('없는 닉네임은 못 찾음', none.s === 404);
const wild = await A({ action: 'friendRequest', nickname: '%' });
ok("'%' 같은 와일드카드로 아무나 찾을 수 없음", wild.s === 404 || wild.s === 400, String(wild.s));
// 거절은 보낸 사람에게 티 나지 않음 (계속 '대기 중')
await C({ action: 'friendRequest', nickname: nA });
const cIn = (await A({ action: 'friends' })).b.incoming.find((x) => x.nickname === nC);
await A({ action: 'friendRespond', id: cIn.id, accept: false });
const cOut = (await C({ action: 'friends' })).b.outgoing;
ok('거절당해도 보낸 사람에게는 대기 중으로 보임', cOut.some((x) => x.nickname === nA), JSON.stringify(cOut));
ok('거절한 신청은 받은 사람 목록에서 사라짐', !(await A({ action: 'friends' })).b.incoming.some((x) => x.nickname === nC));
await C({ action: 'friendRemove', id: cOut.find((x) => x.nickname === nA).id });

const r1 = await A({ action: 'friendRequest', nickname: nB.toLowerCase() });
ok('A → B 신청 (대소문자 무시)', r1.s === 200 && r1.b.status === 'pending', JSON.stringify(r1.b));
const r1b = await A({ action: 'friendRequest', nickname: nB });
ok('같은 신청 두 번은 그대로 대기', r1b.s === 200 && r1b.b.status === 'pending', JSON.stringify([r1b.s, r1b.b]));

const fb = (await B({ action: 'friends' })).b;
ok('B 에게 받은 신청 1개', fb.incoming.length === 1 && fb.incoming[0].nickname === nA, JSON.stringify(fb.incoming));
const fa = (await A({ action: 'friends' })).b;
ok('A 에게 보낸 신청 1개', fa.outgoing.length === 1 && fa.outgoing[0].nickname === nB);

// 정보가 새지 않는다: user id·아이디·로그인 주소가 응답 어디에도 없음
const all = JSON.stringify([fa, fb]);
ok('친구 응답에 user id·아이디·로그인 주소 없음', !all.includes(users.A.uid) && !all.includes(users.B.uid) && !all.includes(users.A.u) && !all.includes(users.B.u) && !all.includes('stockduel.invalid') && !all.includes('user_'));
// 신청 중에는 상태가 안 보임
ok('친구가 되기 전엔 접속 상태 없음', fb.incoming.every((x) => x.status === undefined) && fa.outgoing.every((x) => x.status === undefined));

// 남의 신청을 C 가 수락하려 하면 안 됨
const steal = await C({ action: 'friendRespond', id: fb.incoming[0].id, accept: true });
ok('남에게 온 신청은 수락 불가', steal.s === 404);
const selfAccept = await A({ action: 'friendRespond', id: fa.outgoing[0].id, accept: true });
ok('내가 보낸 신청을 내가 수락 불가', selfAccept.s === 404);
const badId = await B({ action: 'friendRespond', id: "1' or '1'='1", accept: true });
ok('이상한 id 는 거절', badId.s === 400);

// 수락 → 친구, 상태 보임
const acc = await B({ action: 'friendRespond', id: fb.incoming[0].id, accept: true });
ok('B 수락', acc.s === 200 && acc.b.status === 'accepted');
const fa2 = (await A({ action: 'friends' })).b;
ok('A 친구 목록에 B (접속 중)', fa2.friends.length === 1 && fa2.friends[0].nickname === nB && fa2.friends[0].status === 'online', JSON.stringify(fa2.friends));
// ---- 방 초대 ----
const abId = fa2.friends[0].id;
const room = (await A({ action: 'create', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 3, title: '초대방', isPrivate: true, password: 'pw1234' })).b;
ok('A 비밀방 만들기', !!room?.roomId, JSON.stringify(room));
const fakeInv = await C({ action: 'inviteRoom', roomId: room.roomId, friendId: abId });
ok('친구가 아닌 C 는 남의 관계 id 로 초대 불가', fakeInv.s === 404 || fakeInv.s === 403, String(fakeInv.s));
const inv = await A({ action: 'inviteRoom', roomId: room.roomId, friendId: abId });
ok('A → B 방 초대', inv.s === 200, inv.b?.error ?? '');
const ib = (await B({ action: 'invites' })).b;
ok('B 에게 방 초대가 보임 (보낸 사람 닉네임·방 제목)', ib.incoming.length === 1 && ib.incoming[0].from === nA && ib.incoming[0].title === '초대방', JSON.stringify(ib));
ok('초대 응답에 user id·방 id 없음', !JSON.stringify(ib).includes(users.A.uid) && !JSON.stringify(ib).includes(room.roomId));
const steal2 = await C({ action: 'inviteRespond', id: ib.incoming[0].id, accept: true });
ok('남에게 온 초대로 입장 불가', steal2.s === 404);
const accRoom = await B({ action: 'inviteRespond', id: ib.incoming[0].id, accept: true, mode: 'easy' });
ok('B 초대 수락 → 비밀번호 없이 입장', accRoom.s === 200 && accRoom.b.roomId === room.roomId, JSON.stringify(accRoom.b));
const reuse = await B({ action: 'inviteRespond', id: ib.incoming[0].id, accept: true });
ok('같은 초대는 한 번만', reuse.s === 404);
await B({ action: 'leave', roomId: room.roomId });
await A({ action: 'leave', roomId: room.roomId });

// ---- 1대1 신청 ----
const ch1 = await A({ action: 'challenge', friendId: abId, speed: 'quick' });
ok('A → B 1대1 신청', ch1.s === 200, ch1.b?.error ?? '');
const ib2 = (await B({ action: 'invites' })).b;
const duelInv = ib2.incoming.find((x) => x.kind === 'duel');
ok('B 에게 1대1 신청이 보임', !!duelInv && duelInv.from === nA && duelInv.speed === 'quick', JSON.stringify(ib2));
await B({ action: 'inviteRespond', id: duelInv.id, accept: false });
const ia = (await A({ action: 'invites' })).b;
ok('거절하면 A 에게 거절로 보임', ia.duel?.status === 'declined', JSON.stringify(ia.duel));
await A({ action: 'challenge', friendId: abId, speed: 'normal' });
const duelInv2 = (await B({ action: 'invites' })).b.incoming.find((x) => x.kind === 'duel');
const accDuel = await B({ action: 'inviteRespond', id: duelInv2.id, accept: true, mode: 'pro' });
ok('B 수락 → 둘이 바로 대결 시작', accDuel.s === 200 && accDuel.b.kind === 'duel' && !!accDuel.b.roomId, JSON.stringify(accDuel.b));
const ia2 = (await A({ action: 'invites' })).b;
ok('A 도 같은 방 자리를 받음', ia2.duel?.status === 'accepted' && ia2.duel.roomId === accDuel.b.roomId && !!ia2.duel.playerId, JSON.stringify(ia2.duel));
const dv = (await A({ action: 'state', roomId: accDuel.b.roomId })).b;
ok('친구 1대1: 진행 중 · 2명 · 일반 길이 · 랭킹 아님', dv.room.status === 'playing' && dv.players.length === 2 && dv.room.totalDays === 20 && dv.room.ranked === false && dv.room.kind === 'friend', JSON.stringify(dv.room));
const busy = await A({ action: 'challenge', friendId: abId, speed: 'quick' });
ok('대결 중에는 또 신청 불가', busy.s === 409);
await A({ action: 'leave', roomId: accDuel.b.roomId });
await B({ action: 'leave', roomId: accDuel.b.roomId });

// ---- 일반전 파티 (2명, 다인전만) ----
const pi = await A({ action: 'partyInvite', friendId: abId });
ok('A 가 B 를 파티에 부름', pi.s === 200, pi.b?.error ?? '');
const notFriendParty = await C({ action: 'partyInvite', friendId: abId });
ok('친구 아닌 C 는 남의 관계로 파티 초대 불가', notFriendParty.s === 404 || notFriendParty.s === 403, String(notFriendParty.s));
const pInv = (await B({ action: 'invites' })).b.incoming.find((x) => x.kind === 'party');
ok('B 에게 파티 초대가 보임', !!pInv && pInv.from === nA, JSON.stringify(pInv));
const pj = await B({ action: 'inviteRespond', id: pInv.id, accept: true });
ok('B 파티 들어감', pj.s === 200 && pj.b.kind === 'party', JSON.stringify(pj.b));
const pa = (await A({ action: 'party' })).b.party;
ok('파티 2명 · A 가 파티장', pa?.members.length === 2 && pa.isLeader && pa.members.some((m) => m.nickname === nB), JSON.stringify(pa));
ok('파티 응답에 user id 없음', !JSON.stringify(pa).includes(users.B.uid) && !JSON.stringify(pa).includes(users.A.uid));
const pFull = await A({ action: 'partyInvite', friendId: abId });
ok('파티는 2명까지', pFull.s === 409);
const bSolo = await B({ action: 'queueJoin', queue: 'casual_multi_quick', mode: 'easy' });
ok('파티원은 혼자 찾기 시작 불가', bSolo.s === 409, bSolo.b?.error);
const pRanked = await A({ action: 'queueJoin', queue: 'ranked_multi_quick', mode: 'easy' });
ok('파티로 랭킹전 불가', pRanked.s === 409, pRanked.b?.error);
const pDuel = await A({ action: 'queueJoin', queue: 'casual_duel_quick', mode: 'easy' });
ok('파티로 1대1 불가', pDuel.s === 409, pDuel.b?.error);
const G2 = await user();
for (let i = 0; i < 40; i++) {
  const r = (await G2({ action: 'resume' })).b;
  if (!r?.roomId) break;
  await G2({ action: 'leave', roomId: r.roomId });
}
await G2({ action: 'queueLeave' });
const cj = await C({ action: 'queueJoin', queue: 'casual_multi_quick', mode: 'easy' });
await C({ action: 'queueStatus' }); // 실제 화면처럼 바로바로 확인 (10초 응답 없으면 대기표가 지워짐)
const gj = await G2({ action: 'queueJoin', queue: 'casual_multi_quick', nickname: '혼자' + rnd.slice(0, 3), mode: 'easy' });
await G2({ action: 'queueStatus' });
await C({ action: 'queueStatus' });
ok('혼자 두 명도 같은 대기열에', cj.s === 200 && gj.s === 200, JSON.stringify([cj.b, gj.b]));
// 롤처럼: 파티원이 아직 결과 화면(peek 만)이면 파티장 찾기 거절, 로비로 돌아오면 찾기 가능
await B({ action: 'party', peek: true });
const notBack = await A({ action: 'queueJoin', queue: 'casual_multi_quick', mode: 'easy' });
ok('파티원이 아직 안 돌아오면 파티장 찾기 거절', notBack.s === 409 && /돌아오지/.test(notBack.b?.error ?? ''), notBack.b?.error);
const pa2 = (await A({ action: 'party' })).b.party;
ok('파티장 화면: 파티원 아직 안 돌아옴', pa2?.members.find((m) => !m.me)?.back === false, JSON.stringify(pa2?.members));
await B({ action: 'party' }); // 파티원이 로비로 돌아옴
const pa3 = (await A({ action: 'party' })).b.party;
ok('파티원이 로비로 오면 돌아옴', pa3?.members.find((m) => !m.me)?.back === true, JSON.stringify(pa3?.members));
ok('돌아옴 정보에도 user id 없음', !JSON.stringify(pa3).includes(users.B.uid));
await C({ action: 'queueStatus' });
await G2({ action: 'queueStatus' });
const pq = await A({ action: 'queueJoin', queue: 'casual_multi_quick', mode: 'easy' });
await B({ action: 'queueStatus' });
await C({ action: 'queueStatus' });
await G2({ action: 'queueStatus' });
ok('파티장이 일반전 다인전 찾기 → 파티원도 같이 대기', pq.s === 200 && pq.b.party === true, JSON.stringify(pq.b));
const bp = (await B({ action: 'party' })).b.party;
const bs = (await B({ action: 'queueStatus' })).b;
ok('파티원 화면에도 찾는 중 (또는 벌써 매칭됨)', bp?.searching === true || bs?.status === 'matched', JSON.stringify([bp?.searching, bs?.status]));
const four = [A, B, C, G2];
const got = new Array(4).fill(null);
for (let i = 0; i < 20 && got.some((x) => !x); i++) {
  for (let k = 0; k < 4; k++) if (!got[k]) {
    const st = (await four[k]({ action: 'queueStatus' })).b;
    if (st?.status === 'matched') got[k] = st;
  }
  await new Promise((r) => setTimeout(r, 800));
}
ok('파티 2 + 혼자 2 → 4명이 한 방', got.every((x) => x && x.roomId === got[0].roomId), JSON.stringify(await Promise.all(four.map(async (U) => (await U({ action: 'queueStatus' })).b))));
if (got[0]) {
  const pv = (await A({ action: 'state', roomId: got[0].roomId })).b;
  ok('4인 방 · 일반전 · 진행 중', pv.players.length === 4 && pv.room.ranked === false && pv.room.status === 'playing', JSON.stringify(pv.room));
  for (const U of four) await U({ action: 'leave', roomId: got[0].roomId });
}
await A({ action: 'partyLeave' });
ok('파티장이 나가면 파티 없어짐', (await B({ action: 'party' })).b.party === null);

// ---- 랭킹전: 친구끼리도 같은 판에서 만날 수 있음 (사람이 적을 때 대기가 길어지지 않게) ----
await A({ action: 'queueJoin', queue: 'ranked_duel_normal', mode: 'easy' });
await B({ action: 'queueJoin', queue: 'ranked_duel_normal', mode: 'easy' });
let rm = [null, null];
// 시험 회원끼리 랭킹전을 여러 번 치르면 점수가 벌어짐 → 범위가 넓어질 때까지(10초마다 +50점) 최대 약 60초 기다림
for (let i = 0; i < 70 && (!rm[0] || !rm[1]); i++) {
  const x = (await A({ action: 'queueStatus' })).b;
  const y = (await B({ action: 'queueStatus' })).b;
  if (x?.status === 'matched') rm[0] = x;
  if (y?.status === 'matched') rm[1] = y;
  await new Promise((r) => setTimeout(r, 800));
}
ok('랭킹전: 친구끼리도 매칭됨', rm[0] && rm[1] && rm[0].roomId === rm[1].roomId, JSON.stringify(rm));
if (rm[0]) {
  // 먼저 나간 쪽(기권)이 져서 점수가 내려감 → 점수가 높은 쪽이 먼저 나가 둘의 점수 차이가 벌어지지 않게 (벌어지면 다음 실행에서 매칭이 안 됨)
  const ra = (await A({ action: 'profile' })).b?.profile?.rating ?? 0;
  const rb = (await B({ action: 'profile' })).b?.profile?.rating ?? 0;
  const [first, second] = ra >= rb ? [A, B] : [B, A];
  await first({ action: 'leave', roomId: rm[0].roomId });
  await second({ action: 'leave', roomId: rm[0].roomId });
}
await A({ action: 'queueLeave' });
await B({ action: 'queueLeave' });

const again = await A({ action: 'friendRequest', nickname: nB });
ok('이미 친구면 다시 신청 불가', again.s === 409);

// 서로 신청하면 바로 친구
await C({ action: 'friendRequest', nickname: nA });
const mutual = await A({ action: 'friendRequest', nickname: nC });
ok('서로 신청하면 바로 친구', mutual.s === 200 && mutual.b.status === 'accepted', JSON.stringify(mutual.b));

// 차단: A 가 C 를 차단 → 친구에서 빠지고, C 의 새 신청은 A 에게 안 보임 (C 는 모름)
const fa3 = (await A({ action: 'friends' })).b;
const cRow = fa3.friends.find((x) => x.nickname === nC);
const blk = await A({ action: 'friendBlock', id: cRow.id });
ok('A 가 C 차단', blk.s === 200);
const cReq = await C({ action: 'friendRequest', nickname: nA });
ok('차단당한 C 의 신청도 겉으로는 정상 (차단 사실을 모름)', cReq.s === 200 && cReq.b.status === 'pending', JSON.stringify(cReq.b));
const fa4 = (await A({ action: 'friends' })).b;
ok('A 에게 C 의 신청이 보이지 않음 · 차단 목록에 C', !fa4.incoming.some((x) => x.nickname === nC) && fa4.blocked.some((x) => x.nickname === nC));
const fc = (await C({ action: 'friends' })).b;
ok('C 화면에는 대기 중으로만 보임 (차단 표시 없음)', fc.outgoing.some((x) => x.nickname === nA) && fc.blocked.length === 0 && !fc.outgoing.some((x) => 'blocked' in x || 'status' in x));
const aToC = await A({ action: 'friendRequest', nickname: nC });
// (차단 뒤에는 친구가 아니므로 초대·1대1 신청도 못 함)
ok('차단한 사람에게는 신청 전에 차단 풀기 안내', aToC.s === 409, aToC.b?.error);
const ub = await A({ action: 'unblock', id: fa4.blocked[0].id });
ok('차단 풀기', ub.s === 200);
const cUnblock = await C({ action: 'unblock', id: fa4.blocked[0].id });
ok('남의 차단은 못 풂(아무 일 없음)', cUnblock.s === 200);

// 친구 끊기 (남의 관계는 못 끊음)
const fa5 = (await A({ action: 'friends' })).b;
const bRow = fa5.friends.find((x) => x.nickname === nB);
await C({ action: 'friendRemove', id: bRow.id });
ok('남의 친구 관계는 못 끊음', (await A({ action: 'friends' })).b.friends.some((x) => x.nickname === nB));
await A({ action: 'friendRemove', id: bRow.id });
ok('친구 끊기', !(await A({ action: 'friends' })).b.friends.some((x) => x.nickname === nB));

done();
