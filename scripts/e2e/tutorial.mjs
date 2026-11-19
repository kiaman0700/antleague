// 튜토리얼 미션·업적 + 업적 단계 칭호 (DB 051, design/titles-tiers-v3.md) — 실제 서버
// - 게임 기초를 끝내면 회원에게 경험치 100(한 번), 첫 거래·첫 증강 업적, 게임·결과·미션을 끝내면 '개미 학교 졸업'
// - 칭호·사진 단계는 딴 횟수로 서버가 확인 (못 넘은 단계는 거절)
import { createClient } from '@supabase/supabase-js';
import { ok, done, BASE, TEST_KEY, VIS, env } from './lib.mjs';

const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': VIS, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function guestTok() {
  for (let i = 0; i < 15; i++) {
    const g = await post({ action: 'guest' });
    if (g.s === 200) return (await client().auth.signInWithPassword(g.b)).data.session.access_token;
    await sleep(40_000);
  }
  throw new Error('손님 계정을 만들지 못했어요');
}

// 게스트로 시작 → 튜토리얼 상태는 비어 있음
const gt = await guestTok();
const st0 = await post({ action: 'tutorialState' }, gt);
ok('처음엔 튜토리얼 기록 없음', st0.s === 200 && st0.b.done.length === 0 && !st0.b.skipped && st0.b.games === 0, JSON.stringify(st0.b));
ok('이상한 단계 이름은 거절', (await post({ action: 'tutorialMark', chapter: 'hack' }, gt)).s === 400);

// 게스트가 게임 기초를 끝냄 → 경험치는 없음(회원 아님), 미션엔 '끝냄'
const g1 = await post({ action: 'tutorialMark', chapter: 'game' }, gt);
ok('게스트: 게임 기초 끝냄 기록 (경험치 0)', g1.s === 200 && g1.b.xp === 0, JSON.stringify(g1.b));

// 가입 → 가입 뒤 미션을 보면 그때 경험치 100 (게스트 때 끝낸 것도)
const rnd = Math.random().toString(36).slice(2, 7);
const u = 'e2etu' + rnd;
const pw = 'pw' + rnd + '123';
const su = await post({ action: 'signup', username: u, password: pw, nickname: 'Tu' + rnd, agree14: true, agreePrivacy: true, agreeTerms: true }, gt);
ok('회원가입', su.s === 200, JSON.stringify(su.b));
const em = (await post({ action: 'loginEmail', username: u })).b.email;
const mt = (await client().auth.signInWithPassword({ email: em, password: pw })).data.session.access_token;
const M = (b) => post(b, mt);
const m1 = await M({ action: 'missions' });
ok('가입한 뒤 튜토리얼 완료하기 미션 완료 + 경험치 100', m1.s === 200 && m1.b.tutorial?.done === true && m1.b.xp >= 100, JSON.stringify({ t: m1.b?.tutorial, xp: m1.b?.xp }));
const m2 = await M({ action: 'missions' });
ok('튜토리얼 경험치는 한 번만', m2.b.xp === m1.b.xp, `${m1.b.xp} → ${m2.b.xp}`);
const again = await M({ action: 'tutorialMark', chapter: 'game' });
ok('게임 기초를 다시 끝내도 경험치 없음', again.b?.xp === 0 && (await M({ action: 'missions' })).b.xp === m1.b.xp);

// 업적: 튜토리얼에서 자연스럽게 딴 것
const p1 = (await M({ action: 'profile' })).b;
const bd = p1.badges ?? {};
ok('첫 거래·첫 증강 업적이 진짜로 기록 (철벽 방어는 카드가 없어져 더는 안 줌)', bd.first_trade >= 1 && bd.first_card >= 1, JSON.stringify(bd));
ok('아직 결과·미션 단계를 안 끝내서 졸업 업적은 없음', !bd.tut_grad);
// 홈 둘러보기는 메뉴에서 따로 보는 단계라 없어도 졸업
for (const c of ['result', 'growth']) await M({ action: 'tutorialMark', chapter: c });
const bd2 = (await M({ action: 'profile' })).b.badges ?? {};
ok('게임·결과·미션을 끝내면 개미 학교 졸업 (홈 둘러보기 없이도)', bd2.tut_grad === 1, JSON.stringify(bd2));

// 칭호·사진 단계: 서버가 횟수로 확인
ok('딴 업적 칭호는 고를 수 있음', (await M({ action: 'updateProfile', title: 'tut_grad' })).s === 200);
const t2 = await M({ action: 'updateProfile', title: 'winner:2' });
ok('딴 적 없는 업적의 2단계 칭호는 거절', t2.s >= 400, JSON.stringify(t2.b));
ok('이상한 칭호 값은 거절', (await M({ action: 'updateProfile', title: 'tut_grad:9' })).s >= 400 && (await M({ action: 'updateProfile', title: '<x>' })).s >= 400);
ok('단계 없는 업적(첫 거래)의 2단계는 거절', (await M({ action: 'updateProfile', title: 'first_trade:2' })).s >= 400);
ok('졸업 사진은 고를 수 있음', (await M({ action: 'updateProfile', avatar: 'graduate' })).s === 200);
ok('졸업 사진 2단계는 거절', (await M({ action: 'updateProfile', avatar: 'graduate:2' })).s >= 400);
const p3 = (await M({ action: 'profile' })).b.profile;
ok('프로필에 고른 칭호·사진', p3.title === 'tut_grad' && p3.avatar === 'graduate', JSON.stringify({ t: p3.title, a: p3.avatar }));

// 다시 권하지 않음: 판이 없어도 기록이 있으면
const st1 = (await M({ action: 'tutorialState' })).b;
ok('끝낸 기록이 남음 (다른 기기에서도 자동으로 안 권함)', ['game', 'result', 'growth'].every((c) => st1.done.includes(c)), JSON.stringify(st1));
done();
