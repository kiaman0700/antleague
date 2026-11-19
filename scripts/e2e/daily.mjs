// 오늘의 도전 (설계서 design/bots-daily.md 3단계): 하루 한 번, 모두 같은 시장, 비밀값 안 샘, 재대결 불가, 나가도 기록, 회원만(손님 403), 시험 회원은 점수표 제외
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { user, ok, done, BASE, TEST_KEY, VIS, env } from './lib.mjs';

// 오늘의 도전은 회원만 — 시험 회원(.members.json 의 dailyA·dailyB, 깃에 안 올라감)을 만들어 두고 다시 씀
const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': VIS, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const loginEmail = async (u) => (await post({ action: 'loginEmail', username: u })).b.email;
const SAVE = 'scripts/e2e/.members.json';
const saved = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};
async function member(tag) {
  tag = (process.env.DAILY_TAG ?? '') + tag; // 같은 날 다시 끝까지 시험하려면 DAILY_TAG=x 로 다른 시험 회원
  let m = saved['daily' + tag];
  let data = null;
  if (m) data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
  if (!data?.session) {
    const G = await user();
    const r5 = Math.random().toString(36).slice(2, 7);
    m = { u: 'e2edy' + tag.toLowerCase() + r5, pw: 'pw' + r5 + '123', nick: 'D' + tag + r5 };
    const r = await G({ action: 'signup', username: m.u, password: m.pw, nickname: m.nick, agree14: true, agreePrivacy: true, agreeTerms: true });
    if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
    data = (await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw })).data;
    saved['daily' + tag] = m;
    fs.writeFileSync(SAVE, JSON.stringify(saved));
  }
  const tok = data.session.access_token;
  return (body) => post(body, tok);
}

const G0 = await user();
const g0 = await G0({ action: 'dailyStart', nickname: '손님', mode: 'easy' });
ok('손님은 오늘의 도전을 못 함 (403)', g0.s === 403, g0.b?.error);
const [A, B] = [await member('A'), await member('B')];

const i0 = await A({ action: 'dailyInfo' });
ok('오늘의 도전 정보', i0.s === 200 && i0.b?.ready === true && /^\d{4}-\d{2}-\d{2}$/.test(i0.b?.day ?? ''), i0.b?.error ?? i0.b?.day);
const raw0 = JSON.stringify(i0.b);
ok('친구 기록 칸은 목록(친구만, 계정 id 없음)', Array.isArray(i0.b?.friends) && !/user_id/.test(JSON.stringify(i0.b?.friends)), JSON.stringify(i0.b?.friends).slice(0, 80));
ok('점수표에 계정 id 없음 (내 이어하기 방 번호 resume 은 내 방이라 빼고 봄)', !/user_id|[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify({ ...i0.b, resume: null })), JSON.stringify(i0.b?.resume ?? null).slice(0, 60));

// 이미 오늘 한 계정(다시 쓰는 시험 계정)은 409 — 그래도 아래 검사는 그 방이 있으면 진행
let sa = await A({ action: 'dailyStart', nickname: '도전A', mode: 'easy' });
const already = sa.s === 409;
ok('도전 시작 (또는 오늘 이미 함)', sa.s === 200 || already, sa.b?.error);
if (sa.s === 200) {
  const again = await A({ action: 'dailyStart', nickname: '도전A', mode: 'easy' });
  ok('하루에 두 번은 안 됨 (409)', again.s === 409, again.b?.error);
}
const sb = await B({ action: 'dailyStart', nickname: '도전B', mode: 'easy' });
ok('다른 계정도 시작 (또는 오늘 이미 함)', sb.s === 200 || sb.s === 409, sb.b?.error);

if (sa.s === 200 && sb.s === 200) {
  const va = (await A({ action: 'state', roomId: sa.b.roomId })).b;
  const vb = (await B({ action: 'state', roomId: sb.b.roomId })).b;
  const sig = (v) => JSON.stringify([v.market.news.map((n) => n.headline), Object.fromEntries(Object.entries(v.market.bars).map(([k, bars]) => [k, bars[0]?.open]))]);
  ok('두 계정의 오늘 시장이 똑같음 (같은 뉴스·시가)', sig(va) === sig(vb));
  ok('방 종류는 daily, 혼자', va.room.kind === 'daily' && va.players.length === 1);
  const raw = JSON.stringify(va);
  // 시장 조각의 seed 칸은 늘 0 으로 지워서 보냄 (sliceMarket) — 진짜 값·비밀값(salt)은 없어야 함
  ok('화면 데이터에 시드·비밀값 없음', va.market.seed === 0 && vb.market.seed === 0 && !raw.includes('"salt"') && va.final === null);
  const add = await A({ action: 'addBot', roomId: sa.b.roomId, level: 2 });
  ok('도전 방엔 봇 못 넣음', add.s === 403 || add.s === 409, add.b?.error);

  // B: 중간에 나가면 그때 재산으로 기록되고 그날은 끝
  const lv = await B({ action: 'leave', roomId: sb.b.roomId });
  const ib = (await B({ action: 'dailyInfo' })).b;
  ok('연속 기록: 오늘 도전하면 1일 이상, 오늘 한 것으로 표시', (ib.streak?.streak ?? 0) >= 1 && ib.streak?.playedToday === true, JSON.stringify(ib.streak));
  ok('중간에 나가도 기록됨 (오늘 끝)', lv.s === 200 && ib.finished === true && typeof ib.myRet === 'number', JSON.stringify({ f: ib.finished, r: ib.myRet }));
  const bAgain = await B({ action: 'dailyStart', nickname: '도전B', mode: 'easy' });
  ok('나간 뒤 다시 시작 불가 (409)', bAgain.s === 409);

  // A: 끝까지
  let s = va;
  for (let i = 0; i < 60 && s.room.status !== 'finished'; i++) {
    // 날마다 장 전 시간(혼자 판은 6시간)이 있어 먼저 '장 시작'(준비 완료) → 장 마감. 요청 제한(20초 40번)에 안 걸리게 천천히
    if (s.room.preUntil) await A({ action: 'preReady', roomId: sa.b.roomId });
    await A({ action: 'endTurn', roomId: sa.b.roomId });
    await new Promise((r) => setTimeout(r, 700));
    s = (await A({ action: 'state', roomId: sa.b.roomId })).b;
  }
  ok('혼자 끝까지 진행', s.room.status === 'finished', `day=${s.room.day}`);
  const ia = (await A({ action: 'dailyInfo' })).b;
  ok('끝나면 점수 기록', ia.finished === true && typeof ia.myRet === 'number', JSON.stringify({ f: ia.finished, r: ia.myRet }));
  ok('시험 회원 기록은 공개 점수표에 안 오름', !(ia.top ?? []).some((r) => r.me) && ia.myRank === null);
  const re = await A({ action: 'rematch', roomId: sa.b.roomId });
  ok('오늘의 도전은 한 판 더 불가 (409)', re.s === 409, re.b?.error);
} else {
  console.log('ℹ️ 시험 계정이 오늘 이미 도전해서 시장 비교·끝까지 진행 검사는 건너뜀 (내일 다시)');
}
const rooms = (await A({ action: 'rooms' })).b ?? [];
ok('도전 방은 방 목록에 안 나옴', !rooms.some((r) => /오늘의 도전/.test(r.title ?? '')));
// 친구들 칸: A·B 를 잠깐 친구로 → 둘 다 오늘 했으니 A 의 친구들에 B (했음·함께 이어 온 날 숫자, 계정 id 없음) → 끝나면 친구 끊기
{
  const pB = (await B({ action: 'profile' })).b;
  const nB = pB?.profile?.nickname ?? pB?.nickname;
  for (const x of [...((await A({ action: 'friends' })).b?.friends ?? [])]) await A({ action: 'friendRemove', id: x.id });
  const req = await A({ action: 'friendRequest', nickname: nB });
  const inc = (await B({ action: 'friends' })).b?.incoming ?? [];
  const mine = inc.find((x) => x.nickname !== undefined);
  if (req.s === 200 && mine) {
    await B({ action: 'friendRespond', id: mine.id, accept: true });
    const fi = (await A({ action: 'dailyInfo' })).b;
    const fB = (fi?.friends ?? []).find((x) => x.nickname === nB);
    ok('친구들 칸에 오늘 한 친구 (함께 n일 없음)', !!fB && fB.together === undefined && fB.played === undefined, JSON.stringify(fi?.friends));
    ok('친구들 칸에 계정 id 없음', !/user_id|[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(fi?.friends)));
    for (const x of [...((await A({ action: 'friends' })).b?.friends ?? [])]) await A({ action: 'friendRemove', id: x.id });
  } else ok('친구 신청 (시험 준비)', false, JSON.stringify(req.b) + ' ' + nB);
}

done();
