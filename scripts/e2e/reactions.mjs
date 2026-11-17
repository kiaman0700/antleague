// 이모지 반응: 같은 방 사람끼리만, 보내기는 서버를 거쳐 서버가 보낸 사람을 붙임(사칭 불가, 2026-11-17)
// 브라우저가 채널에 직접 보내는 건 막힘(038). 방 밖 사람은 듣지도 보내지도 못함(029)
import { createClient } from '@supabase/supabase-js';
import { user, ok, done, env } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [A, B, C] = await Promise.all([user(), user(), user()]);
const made = await A({ action: 'create', nickname: '반응A', mode: 'pro', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '반응 테스트' });
const { roomId, code } = made.b;
const joinedB = await B({ action: 'join', code, nickname: '반응B', mode: 'pro' });
const bId = joinedB.b?.playerId;

const client = (U) => {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  sb.realtime.setAuth(U.token);
  return sb;
};
const join = (sb, got) =>
  new Promise((res) => {
    const ch = sb.channel('react-' + roomId, { config: { private: true, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => got.push(payload));
    ch.subscribe((st) => (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? res({ ch, st }) : null));
  });
const gotA = [];
const gotC = [];
const a = await join(client(A), gotA);
const b = await join(client(B), []);
const c = await join(client(C), gotC);
ok('방 사람은 반응 채널에 들어감 (듣기)', a.st === 'SUBSCRIBED' && b.st === 'SUBSCRIBED', `${a.st} ${b.st}`);
ok('방 밖 사람은 비공개 반응 채널에 못 들어감', c.st !== 'SUBSCRIBED', c.st);

// 1) 서버로 보내기: 서버가 보낸 사람(B 의 자리 id)을 붙임 — 화면이 보낸 from 은 무시
const sent = await B({ action: 'react', roomId, emoji: '🔥', from: 'someone-else' });
ok('서버로 반응 보내기', sent.s === 200, JSON.stringify(sent.b));
// 2) 브라우저가 채널에 직접 보내기 (다른 사람 이름으로) — 막혀야 함
await b.ch.send({ type: 'broadcast', event: 'react', payload: { emoji: '😂', from: 'fake-name' } }).catch(() => {});
await c.ch.send({ type: 'broadcast', event: 'react', payload: { emoji: '😂', from: 'fake' } }).catch(() => {});
// 3) 방 밖 사람이 공개 채널(같은 이름)로 보내도 방 사람에게 안 감
const pub = client(C).channel('react-' + roomId, { config: { broadcast: { self: false } } });
await new Promise((r) => pub.subscribe((st) => st === 'SUBSCRIBED' && r()));
await pub.send({ type: 'broadcast', event: 'react', payload: { emoji: '🔥', from: 'outsider' } });
await sleep(2500);
ok('서버를 거친 반응은 옴 (보낸 사람 = 진짜 B)', gotA.some((p) => p.from === bId && p.emoji === '🔥'), JSON.stringify(gotA));
ok('브라우저가 직접 보낸 반응(사칭)은 안 옴', !gotA.some((p) => p.from === 'fake-name' || p.from === 'someone-else'), JSON.stringify(gotA));
ok('방 밖 사람의 반응은 안 옴', !gotA.some((p) => p.from === 'fake' || p.from === 'outsider'), JSON.stringify(gotA));
ok('방 밖 사람은 방 반응을 못 들음', gotC.length === 0);

// 4) 서버 검사: 방 밖 사람·목록에 없는 내용·둘 다 보내기
const out = await C({ action: 'react', roomId, emoji: '🔥' });
ok('방 밖 사람은 서버로도 못 보냄 (403)', out.s === 403, String(out.s));
const bad = await B({ action: 'react', roomId, text: '아무 말이나 <script>' });
ok('목록에 없는 말은 거절 (400)', bad.s === 400, String(bad.s));
const both = await B({ action: 'react', roomId, emoji: '🔥', text: '가즈아!' });
ok('이모지와 말을 함께 보내면 거절 (400)', both.s === 400, String(both.s));

await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
process.exit(0);
