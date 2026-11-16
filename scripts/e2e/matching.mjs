// 매칭: 일반전(게스트 OK)·랭킹전(회원만) × 1대1·다인전, 대기 취소, 진행 중이면 막기, 랭킹전 점수 반영
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { ok, done, BASE } from './lib.mjs';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const post = async (body, tok) => {
  const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  return { s: r.status, b: await r.json().catch(() => null) };
};
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
/** 아이디 → 로그인 주소 (서버에 물어봄, 화면과 같은 흐름) */
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
const rnd = Math.random().toString(36).slice(2, 7);
async function member(tag) {
  const G = await guest();
  const u = 'e2emm' + tag + rnd;
  const pw = 'pw' + rnd + '123';
  const r = await G({ action: 'signup', username: u, password: pw, nickname: tag + rnd, agree14: true, agreePrivacy: true, agreeTerms: true });
  if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
  const { data } = await client().auth.signInWithPassword({ email: await loginEmail(u), password: pw });
  const tok = data.session.access_token;
  return (body) => post(body, tok);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function pollAll(us, max = 15) {
  const res = new Array(us.length).fill(null);
  for (let i = 0; i < max && res.some((x) => !x); i++) {
    for (let k = 0; k < us.length; k++) if (!res[k]) {
      const s = (await us[k]({ action: 'queueStatus' })).b;
      if (s?.status === 'matched') res[k] = s;
    }
    if (res.some((x) => !x)) await wait(700);
  }
  return res;
}

// ---- 일반전 1대1 (게스트) ----
{
  const [A, B] = [await guest(), await guest()];
  const ja = await A({ action: 'queueJoin', queue: 'casual_duel_quick', nickname: '매칭A', mode: 'easy' });
  ok('게스트 일반전 대기 시작', ja.s === 200, ja.b?.error ?? '');
  const st = (await A({ action: 'queueStatus' })).b;
  ok('혼자면 기다리는 중', st.status === 'waiting', JSON.stringify(st));
  await B({ action: 'queueJoin', queue: 'casual_duel_quick', nickname: '매칭B', mode: 'pro' });
  const [ma, mb] = await pollAll([A, B]);
  ok('두 사람이 같은 방으로 매칭', ma && mb && ma.roomId === mb.roomId, JSON.stringify([ma, mb]));
  const re = (await A({ action: 'queueStatus' })).b;
  ok('매칭 결과를 놓쳐도 다시 물으면 같은 방', re.status === 'matched' && re.roomId === ma.roomId, JSON.stringify(re));
  const v = (await A({ action: 'state', roomId: ma.roomId })).b;
  ok('바로 게임 시작 (신속 = 10일 · 하루 1분)', v.room.status === 'playing' && v.room.totalDays === 10 && v.room.turnSeconds === 60, JSON.stringify(v.room));
  ok('일반전은 랭킹 아님 · 매칭 방', v.room.ranked === false && v.room.kind === 'match');
  const again = await A({ action: 'queueJoin', queue: 'casual_duel_quick', nickname: '매칭A', mode: 'easy' });
  ok('진행 중인 대결이 있으면 새 매칭 막기', again.s === 409, again.b?.error);
  await A({ action: 'leave', roomId: ma.roomId });
  await B({ action: 'leave', roomId: ma.roomId });
}

// ---- 대기 취소 ----
{
  const C = await guest();
  await C({ action: 'queueJoin', queue: 'casual_multi_normal', nickname: '취소', mode: 'easy' });
  await C({ action: 'queueLeave' });
  const s = (await C({ action: 'queueStatus' })).b;
  ok('대기 취소', s.status === 'none');
}

// ---- 랭킹전: 게스트 불가 ----
{
  const G = await guest();
  const r = await G({ action: 'queueJoin', queue: 'ranked_duel_quick', nickname: 'g', mode: 'easy' });
  ok('랭킹전은 회원만', r.s === 403, r.b?.error);
}

// ---- 일반전 다인전 4명 ----
{
  const us = [await guest(), await guest(), await guest(), await guest()];
  for (let i = 0; i < 4; i++) await us[i]({ action: 'queueJoin', queue: 'casual_multi_quick', nickname: '같은이름', mode: 'easy' });
  const ms = await pollAll(us);
  ok('4명이 한 방으로', ms.every((m) => m && m.roomId === ms[0].roomId), JSON.stringify(ms.map((m) => m?.roomId)));
  const v = (await us[0]({ action: 'state', roomId: ms[0].roomId })).b;
  ok('같은 닉네임은 방 안에서 겹치지 않게', new Set(v.players.map((p) => p.nickname)).size === 4, v.players.map((p) => p.nickname).join());
  for (const U of us) await U({ action: 'leave', roomId: ms[0].roomId });
}

// ---- 랭킹전 1대1 → 끝나면 점수 반영 ----
{
  const [A, B] = [await member('ra'), await member('rb')];
  await A({ action: 'queueJoin', queue: 'ranked_duel_quick', mode: 'easy' });
  await B({ action: 'queueJoin', queue: 'ranked_duel_quick', mode: 'easy' });
  const [ma] = await pollAll([A, B]);
  const roomId = ma.roomId;
  const v = (await A({ action: 'state', roomId })).b;
  ok('랭킹전 방', v.room.ranked === true && v.players.every((p) => p.verified), JSON.stringify(v.room));
  await B({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 2 });
  for (let d = 0; d < 10; d++) {
    await A({ action: 'preReady', roomId });
    await B({ action: 'preReady', roomId });
    await A({ action: 'endTurn', roomId });
    await B({ action: 'endTurn', roomId });
    await A({ action: 'state', roomId });
  }
  const fa = (await A({ action: 'myMatch', roomId })).b;
  const fb = (await B({ action: 'myMatch', roomId })).b;
  ok('랭킹전은 점수 반영 (합 0)', fa?.rated && fb?.rated && fa.rating_after - fa.rating_before === -(fb.rating_after - fb.rating_before) && fa.rating_after !== fa.rating_before, JSON.stringify([fa, fb]));
  ok('배치 중이라 점수가 크게 움직임 (같은 점수끼리 ±40)', Math.abs(fa.rating_after - fa.rating_before) === 40, JSON.stringify(fa));
  const pa = (await A({ action: 'profile' })).b.profile;
  const rk = (await A({ action: 'ranking' })).b;
  ok('랭킹전 1판 → 배치 1/2 · 랭킹에는 아직 없음', pa.ranked_games === 1 && !rk.top.some((r) => r.nickname === pa.nickname) && rk.me.rank === null, JSON.stringify([pa.ranked_games, rk.me]));
  const rm = await A({ action: 'rematch', roomId });
  ok("매칭 방은 '한 판 더' 대신 다시 찾기", rm.s === 409, rm.b?.error);
  ok('A 탈퇴', (await A({ action: 'forgetMe' })).s === 200);
  ok('B 탈퇴', (await B({ action: 'forgetMe' })).s === 200);
}
// ---- 랭킹전 기권 = 꼴찌 (지는 중에 나가서 점수를 지키지 못하게) ----
{
  const [C, D] = [await member('fc'), await member('fd')];
  await C({ action: 'queueJoin', queue: 'ranked_duel_quick', mode: 'easy' });
  await D({ action: 'queueJoin', queue: 'ranked_duel_quick', mode: 'easy' });
  const [mc] = await pollAll([C, D]);
  const roomId = mc.roomId;
  // D 는 몰빵 → 재산이 C(현금)보다 낮아질 수도 있지만, C 가 기권하면 C 가 꼴찌
  await D({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 2 });
  await C({ action: 'leave', roomId });
  for (let d = 0; d < 12; d++) {
    await D({ action: 'preReady', roomId });
    await D({ action: 'endTurn', roomId });
    const st = (await D({ action: 'state', roomId })).b;
    if (st?.room?.status === 'finished') break;
  }
  let fc = null;
  for (let i = 0; i < 5 && !fc; i++) fc = (await C({ action: 'myMatch', roomId })).b;
  ok('기권한 사람은 랭킹 점수가 내려감', fc?.rated && fc.rating_after < fc.rating_before, JSON.stringify(fc));
  ok('C 탈퇴', (await C({ action: 'forgetMe' })).s === 200);
  ok('D 탈퇴', (await D({ action: 'forgetMe' })).s === 200);
}
done();
