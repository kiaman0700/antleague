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
async function guest() {
  const g = await post({ action: 'guest' });
  const { data } = await client().auth.signInWithPassword(g.b);
  const tok = data.session.access_token;
  return (body) => post(body, tok);
}
const rnd = Math.random().toString(36).slice(2, 7);
async function member(tag) {
  const G = await guest();
  const u = 'mm' + tag + rnd;
  const pw = 'pw' + rnd + '123';
  const r = await G({ action: 'signup', username: u, password: pw, nickname: tag + rnd, agree14: true, agreePrivacy: true });
  if (r.s !== 200) throw new Error('signup ' + JSON.stringify(r.b));
  const { data } = await client().auth.signInWithPassword({ email: `${u}@u.stockduel.invalid`, password: pw });
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
  await B({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 5 });
  for (let d = 0; d < 10; d++) {
    await A({ action: 'endTurn', roomId });
    await B({ action: 'endTurn', roomId });
    await A({ action: 'state', roomId });
  }
  const fa = (await A({ action: 'myMatch', roomId })).b;
  const fb = (await B({ action: 'myMatch', roomId })).b;
  ok('랭킹전은 점수 반영 (합 0)', fa?.rated && fb?.rated && fa.rating_after - fa.rating_before === -(fb.rating_after - fb.rating_before) && fa.rating_after !== fa.rating_before, JSON.stringify([fa, fb]));
  ok('A 탈퇴', (await A({ action: 'forgetMe' })).s === 200);
  ok('B 탈퇴', (await B({ action: 'forgetMe' })).s === 200);
}
done();
