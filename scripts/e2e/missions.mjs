// 미션 (design/missions.md): 서버가 끝난 판으로만 판정 · 같은 판 두 번 안 셈 · 게스트는 경험치 없음 · 정보가 새지 않음
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ok, done, BASE, user } from './lib.mjs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const loginEmail = async (u) => (await post({ action: 'loginEmail', username: u })).b.email;
const SAVE = 'scripts/e2e/.members.json';
const saved = fs.existsSync(SAVE) ? JSON.parse(fs.readFileSync(SAVE, 'utf8')) : {};

/** 테스트 회원 (social 테스트가 만든 회원을 다시 씀, 없으면 손님 → 가입) */
async function member() {
  const m = saved.socialA ?? saved.missionA;
  if (m) {
    const { data } = await client().auth.signInWithPassword({ email: await loginEmail(m.u), password: m.pw });
    if (data?.session) {
      const tok = data.session.access_token;
      return (body) => post(body, tok);
    }
  }
  const G = await user();
  const r5 = Math.random().toString(36).slice(2, 7);
  const n = { u: 'e2ems' + r5, pw: 'pw' + r5 + '123', nick: 'M' + r5 };
  const r = await G({ action: 'signup', username: n.u, password: n.pw, nickname: n.nick, agree14: true, agreePrivacy: true, agreeTerms: true });
  if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
  saved.missionA = n;
  fs.writeFileSync(SAVE, JSON.stringify(saved));
  const { data } = await client().auth.signInWithPassword({ email: await loginEmail(n.u), password: n.pw });
  const tok = data.session.access_token;
  return (body) => post(body, tok);
}

/** 쉬움 봇 1명과 봇전 한 판을 끝까지 (거래 1번) */
async function playBotGame(U, trade = true) {
  for (let i = 0; i < 5; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
  const bm = await U({ action: 'botMatch', levels: [1], totalDays: 10, turnSeconds: 60, nickname: '미션', mode: 'easy' });
  if (bm.s !== 200) throw new Error('botMatch ' + JSON.stringify(bm.b));
  const roomId = bm.b.roomId;
  const did = { trades: 0, detector: false, cards: 0 };
  if (trade) {
    // 거래 6번(한 판 5번 넘게) + 감별기·차트 분석 카드 2장 → 여러 미션 조건을 채움
    for (const side of ['buy', 'buy', 'buy', 'sell', 'sell', 'sell']) if ((await U({ action: 'trade', roomId, symbol: 'CORE', side, qty: 1 })).s === 200) did.trades++;
    for (const [kind, payload] of [['detector', {}], ['scout', { symbol: 'CORE' }]]) {
      if ((await U({ action: 'buyItem', roomId, kind })).s !== 200) continue;
      if ((await U({ action: 'useItem', roomId, kind, payload })).s === 200) {
        did.cards++;
        if (kind === 'detector') did.detector = true;
      }
    }
  }
  let s = (await U({ action: 'state', roomId })).b;
  for (let i = 0; i < 80 && s?.room?.status !== 'finished'; i++) {
    const e = await U({ action: 'endTurn', roomId });
    if (e.s === 409 && /장이 열린 뒤/.test(e.b?.error ?? '')) await U({ action: 'preReady', roomId });
    s = (await U({ action: 'state', roomId })).b;
  }
  return { roomId, s, did };
}

// 1) 로그인 안 한 요청은 401
const anon = await post({ action: 'missions' });
ok('로그인 없이 미션 못 봄 (401)', anon.s === 401, String(anon.s));

// 2) 게스트: 미션 목록은 보이지만 경험치는 안 쌓임
const G = await user();
const g0 = (await G({ action: 'missions' })).b;
ok('게스트: 일일 6개·주간 3개, 회원 아님, 바꾸기 없음', g0?.member === false && g0.today.list.length === 6 && g0.week.list.length === 3 && !g0.rerolls, JSON.stringify(g0)?.slice(0, 200));
const gr = await G({ action: 'missionReroll', kind: 'day', slot: 0 });
ok('게스트는 미션 바꾸기 불가 (403)', gr.s === 403, String(gr.s));
const raw = JSON.stringify(g0);
ok('미션 응답에 계정 id·비밀값(긴 16진수) 없음', !/[0-9a-f]{16,}/.test(raw) && !/user_id|secret|salt|seed/.test(raw));

// 3) 회원: 봇전 한 판을 끝내면 서버가 판정
const A = await member();
const before = (await A({ action: 'missions' })).b;
ok('회원 미션 정보', before?.member === true && typeof before.xp === 'number' && before.level?.level >= 1, JSON.stringify(before)?.slice(0, 200));
const again = (await A({ action: 'missions' })).b;
ok('같은 날 같은 계정은 같은 미션', JSON.stringify(again.today.list.map((m) => m.id)) === JSON.stringify(before.today.list.map((m) => m.id)));

const g1 = await playBotGame(A);
ok('봇전 끝까지 진행', g1.s?.room?.status === 'finished', `status=${g1.s?.room?.status} day=${g1.s?.room?.day}`);
const after = (await A({ action: 'missions' })).b;
const all = (x) => [...x.today.list, ...x.week.list];
const gained = all(after).filter((m) => {
  const b = all(before).find((x) => x.id === m.id);
  return m.progress > (b?.progress ?? 0) || (m.done && !b?.done);
});
// 이 판으로 꼭 채워졌어야 하는 미션 (그 계정에 그 미션이 있고 아직 안 했으면)
const should = new Set(['finish1', 'bot1']);
if (g1.did.trades > 5) should.add('trade5');
if (g1.did.detector) should.add('detector');
if (g1.did.cards >= 2) should.add('card2');
const expect = all(before).filter((m) => should.has(m.id) && !m.done).map((m) => m.id);
console.log('  이번 판:', JSON.stringify(g1.did), '확인할 미션:', expect.join(',') || '(없음 — 이 계정 오늘 미션엔 해당 없음)');
ok('끝난 판으로 조건을 채운 미션은 모두 완료', expect.every((id) => after.today.list.concat(after.week.list).find((m) => m.id === id)?.done), JSON.stringify(gained.map((m) => m.id)));
ok('조건을 안 채운 미션은 그대로 (오늘의 도전 등)', all(after).filter((m) => m.id === 'daily' || m.id === 'order').every((m) => m.progress === all(before).find((x) => x.id === m.id).progress));
const doneXp = all(after).filter((m) => m.done && !all(before).find((x) => x.id === m.id)?.done).reduce((s, m) => s + m.xp, 0);
// 판 경험치 (design/game-xp.md): 봇전 10~20, 하루 상한 600, 새 업적 +20 (처음엔 0)
const tg = (await A({ action: 'missions', room: g1.roomId })).b;
const gameGain = (tg.thisGame?.xp ?? 0) + (tg.thisGame?.firstWin ?? 0);
ok('봇전 판 경험치 기록 (10~20, 상한이면 0)', !!tg.thisGame && tg.thisGame.firstWin === 0 && (tg.thisGame.xp === 0 ? tg.gameToday >= tg.gameCap - 20 : tg.thisGame.xp >= 10 && tg.thisGame.xp <= 20), JSON.stringify(tg.thisGame));
const extra = after.xp - before.xp - doneXp - gameGain;
ok('경험치 = 미션 + 판 (+ 새 업적 20씩)', extra >= 0 && extra % 20 === 0 && after.todayXp <= after.cap && tg.gameToday <= tg.gameCap, `xp ${before.xp}→${after.xp}, 미션 ${doneXp}, 판 ${gameGain}, 업적 ${extra}`);
const other = (await A({ action: 'missions', room: '00000000-0000-0000-0000-000000000000' })).b;
ok('다른(없는) 판 경험치는 없음', other.thisGame === null);
const bad = await A({ action: 'missions', room: "x' or 1=1" });
ok('이상한 room 값은 무시', bad.s === 200 && bad.b.thisGame === null);

// 4) 같은 판을 다시 확인해도 두 번 안 셈 (상태를 여러 번 물어도)
for (let i = 0; i < 3; i++) await A({ action: 'state', roomId: g1.roomId });
const after2 = (await A({ action: 'missions' })).b;
ok('같은 판은 한 번만 (경험치 그대로)', after2.xp === after.xp, `${after.xp}→${after2.xp}`);

// 5) 거래 없이 끝낸 판은 안 셈
const g2 = await playBotGame(A, false);
const after3 = (await A({ action: 'missions' })).b;
ok('거래 없이 끝낸 판은 판 경험치도 없음', (await A({ action: 'missions', room: g2.roomId })).b.thisGame === null && after3.xp === after2.xp, `${after2.xp}→${after3.xp}`);
ok('거래 없이 끝낸 판은 미션에 안 셈', g2.s?.room?.status === 'finished' && JSON.stringify(all(after3).map((m) => m.progress)) === JSON.stringify(all(after2).map((m) => m.progress)), JSON.stringify(all(after3).map((m) => [m.id, m.progress])));

// 6) 프로필에 경험치, 다른 사람 화면 데이터엔 없음
const prof = (await A({ action: 'profile' })).b;
ok('내 프로필에 경험치', typeof prof?.profile?.xp === 'number' && prof.profile.xp === after3.xp, String(prof?.profile?.xp));
const st = JSON.stringify((await A({ action: 'state', roomId: g2.roomId })).b);
ok('게임 화면 데이터에 경험치·미션 없음', !/"xp"|mission/.test(st));

// 7) 미션 바꾸기: 미완료만, 일일 하루 3번 · 주간 한 주 1번, 같은 등급으로
// (앞에서 봇전을 빠르게 진행해 행동 요청 한도(20초)를 다 썼을 수 있어 잠깐 쉼)
await new Promise((r) => setTimeout(r, 21_000));
{
  let m0 = (await A({ action: 'missions' })).b;
  ok('회원은 남은 바꾸기 횟수가 보임', m0.rerolls && typeof m0.rerolls.day === 'number' && typeof m0.rerolls.week === 'number', JSON.stringify(m0.rerolls));
  const bad1 = await A({ action: 'missionReroll', kind: 'day', slot: 9 });
  const bad2 = await A({ action: 'missionReroll', kind: 'month', slot: 0 });
  ok('이상한 칸·종류는 거절 (400)', bad1.s === 400 && bad2.s === 400, bad1.s + ' ' + bad2.s);
  const doneIdx = m0.today.list.findIndex((m) => m.done);
  if (doneIdx >= 0) {
    const r = await A({ action: 'missionReroll', kind: 'day', slot: doneIdx });
    ok('완료한 미션은 못 바꿈 (409)', r.s === 409, r.b?.error);
  }
  const todo = m0.today.list.findIndex((m) => !m.done);
  if (m0.rerolls.day > 0 && todo >= 0) {
    const tier = m0.today.list[todo].tier;
    // 동시에 두 번 → 한 번만 셈
    const [r1, r2] = await Promise.all([A({ action: 'missionReroll', kind: 'day', slot: todo }), A({ action: 'missionReroll', kind: 'day', slot: todo })]);
    const m1 = (await A({ action: 'missions' })).b;
    const used = m0.rerolls.day - m1.rerolls.day;
    ok('동시에 두 번 보내도 횟수는 맞게 (성공한 만큼만)', used === [r1, r2].filter((x) => x.s === 200).length && used >= 1, JSON.stringify([r1.s, r2.s, m0.rerolls.day, m1.rerolls.day]));
    ok('바뀐 미션은 같은 등급 · 목록 안에서 겹치지 않음', m1.today.list[todo].tier === tier && new Set(m1.today.list.map((m) => m.id)).size === 6, JSON.stringify(m1.today.list.map((m) => m.id)));
    for (let i = 0; i < 5 && m1.rerolls.day > 0; i++) {
      const t2 = m1.today.list.findIndex((m) => !m.done);
      await A({ action: 'missionReroll', kind: 'day', slot: t2 });
      m1.rerolls.day = (await A({ action: 'missions' })).b.rerolls.day;
    }
    const over = await A({ action: 'missionReroll', kind: 'day', slot: m1.today.list.findIndex((m) => !m.done) });
    ok('일일 바꾸기는 하루 3번까지 (그다음 409)', over.s === 409, over.b?.error);
  } else console.log('  ℹ️ 오늘은 이 계정의 일일 바꾸기를 이미 다 써서 일부 확인을 건너뜀');
  const wt = m0.week.list.findIndex((m) => !m.done);
  if (m0.rerolls.week > 0 && wt >= 0) {
    const w1 = await A({ action: 'missionReroll', kind: 'week', slot: wt });
    const w2 = await A({ action: 'missionReroll', kind: 'week', slot: wt });
    ok('주간 바꾸기는 한 주 1번', w1.s === 200 && w2.s === 409, w1.s + ' ' + w2.s);
  }
}

// 8) 화면이 미션 완료를 보낼 방법이 없음
const fake = await A({ action: 'missionDone', id: 'finish1' });
ok('미션 완료 요청은 없음 (400)', fake.s === 400, String(fake.s));
done();
