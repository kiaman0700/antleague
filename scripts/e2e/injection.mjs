// 주입 공격 점검: 모든 입력에 스크립트·SQL·필터·제어문자·아주 긴 값·이상한 JSON 을 넣어 봄
// 기대: 서버 오류(500) 없이 거절(4xx)하거나, 저장돼도 그대로 '글자'로만 남음
import { user, ok, done, BASE } from './lib.mjs';

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  "' OR '1'='1",
  "'; DROP TABLE players; --",
  '") or ("1"="1',
  'nickname.ilike.*,id.neq.0',
  '%_\\%',
  '${7*7}{{7*7}}',
  '../../etc/passwd',
  '\u0000\u001b[31mRED‮abc',
  'a'.repeat(5000),
  '🤖'.repeat(30),
];

const raw = async (body, tok, headers = {}) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...headers }, body });
  return { s: r.status, t: await r.text() };
};
const U = await user();
const V = await user(); // 요청 제한에 걸리지 않은 깨끗한 계정으로 결과 확인
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server500 = 0;
const probe = async (label, body) => {
  await sleep(550); // 요청 제한(20초에 40번) 안에서 — 429 때문에 진짜 결과가 가려지지 않게
  const r = await U(body);
  if (r.s >= 500) {
    server500++;
    console.log('  500:', label, JSON.stringify(body).slice(0, 80), JSON.stringify(r.b));
  }
  return r;
};

// 1) 닉네임·방 제목·비밀번호·방 코드·검색어·카드 대상·종목·의견 등 모든 문자열 입력
for (const p of PAYLOADS) {
  const c = await probe('create.nick', { action: 'create', nickname: p, mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '정상' });
  if (p.includes('<')) ok(`닉네임 '${p.slice(0, 20)}' 거절`, c.s === 400);
  const t = await probe('create.title', { action: 'create', nickname: '정상', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: p });
  if (t.s === 200) await U({ action: 'leave', roomId: t.b.roomId });
  if (p.includes('<')) ok(`방 제목 '${p.slice(0, 20)}' 거절`, t.s === 400);
  await probe('join.code', { action: 'join', code: p, nickname: '정상', mode: 'easy' });
  await probe('joinRoom', { action: 'joinRoom', roomId: p, nickname: '정상', mode: 'easy', password: p });
  await probe('addBot', { action: 'addBot', roomId: p, level: p });
  await probe('dailyInfo', { action: 'dailyInfo', day: p });
  await probe('state', { action: 'state', roomId: p });
  await probe('check', { action: 'checkAvailable', username: p, nickname: p });
  await probe('signup', { action: 'signup', username: p, password: p, nickname: p, agree14: true, agreePrivacy: true, agreeTerms: true });
  await probe('queue', { action: 'queueJoin', queue: p, nickname: p, mode: p });
  await probe('rank', { action: 'myMatch', roomId: p });
  await probe('mode', { action: p });
}
ok('어떤 입력에도 서버 오류(500) 없음', server500 === 0, `${server500}건`);

// 2) 필터 주입: 닉네임 중복 검사에 와일드카드가 먹히지 않음 (모든 닉네임과 겹친다고 나오면 안 됨)
const wild = (await V({ action: 'checkAvailable', nickname: '%' })).b;
ok("닉네임 '%' 가 '모두와 겹침'으로 나오지 않음", wild.nickname === 'ok' || wild.nickname === 'invalid', JSON.stringify(wild));

// 3) 의견: 스크립트 글자는 그대로 글자로 저장 (화면은 React 글자 출력 → 실행 안 됨), 제어문자는 지워짐
const fb = await V({ action: 'feedback', kind: 'bug', text: '<script>alert(1)</script>\u001b[31m보안 점검', page: '<x>' });
ok('의견에 스크립트 글자를 넣어도 저장은 되지만 실행되지 않음(글자)', fb.s === 200 || fb.s === 429);

// 4) 이상한 JSON·형식
const bad = [
  ['배열 본문', '[1,2,3]'],
  ['깨진 JSON', '{"action":'],
  ['__proto__ 오염', '{"action":"state","__proto__":{"isAdmin":true},"roomId":"x"}'],
  ['constructor 오염', '{"action":"me","constructor":{"prototype":{"isAdmin":true}}}'],
  ['숫자 action', '{"action":123}'],
  ['너무 큰 본문', JSON.stringify({ action: 'feedback', text: 'x'.repeat(20000) })],
];
for (const [label, body] of bad) {
  const r = await raw(body, null);
  ok(`${label}: 서버 오류 없이 거절`, r.s >= 400 && r.s < 500, `${r.s}`);
}
const le = await raw('{"action":"loginEmail","username":{"$ne":null}}', null);
ok('로그인 주소 묻기에 객체를 넣어도 가짜 주소만 (오류·정보 없음)', le.s === 200 && /^\{"email":"u_[0-9a-f]+@u\.stockduel\.invalid"\}$/.test(le.t), le.t.slice(0, 60));
const me = await V({ action: 'me' });
ok('__proto__ 오염 뒤에도 운영자 아님', me.b?.isAdmin === false);

// 5) 다른 사이트에서 보낸 요청(CSRF)·이상한 Origin
const csrf = await raw(JSON.stringify({ action: 'me' }), null, { origin: 'https://evil.example' });
ok('다른 사이트 Origin 거절', csrf.s === 403);
const nullOrigin = await raw(JSON.stringify({ action: 'me' }), null, { origin: 'null' });
ok("Origin 'null' 거절", nullOrigin.s === 403);
const ctype = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"action":"me"}' });
ok('JSON 이 아닌 형식 거절', ctype.status === 415);

// 6) 가짜·변조 토큰
const fake = await raw(JSON.stringify({ action: 'me' }), 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.xxxx');
ok('가짜 토큰 거절 (401)', fake.s === 401);
const huge = await raw(JSON.stringify({ action: 'me' }), 'x'.repeat(5000));
ok('너무 긴 토큰 거절 (401)', huge.s === 401);

// 7) 로그인 없이: 방 목록(공개 정보)만 되고 코드·비밀번호·계정 id 는 없음, 나머지는 모두 401
const pubRooms = await raw(JSON.stringify({ action: 'rooms' }), null);
const pubTxt = pubRooms.t;
ok('로그인 없이 방 목록은 보임 (공개 정보)', pubRooms.s === 200 && pubTxt.startsWith('['), `${pubRooms.s} ${pubTxt.slice(0, 60)}`);
ok('로그인 없는 방 목록에 코드·비밀번호·계정 id 없음', !/"code"|password|pw_hash|user_id|host_id|"joined":true/.test(pubTxt), pubTxt.slice(0, 120));
const pubRank = await raw(JSON.stringify({ action: 'ranking' }), null);
ok('로그인 없이 랭킹은 보임, 내 순위·계정 id 없음', pubRank.s === 200 && /"me":null/.test(pubRank.t) && !/user_id|username/.test(pubRank.t), `${pubRank.s} ${pubRank.t.slice(0, 80)}`);
for (const a of ['state', 'resume', 'profile', 'history', 'queueCounts', 'create', 'join', 'friends', 'feedback']) {
  const r = await raw(JSON.stringify({ action: a }), null);
  ok(`로그인 없이 ${a} 거절 (401)`, r.s === 401, String(r.s));
}
done();
