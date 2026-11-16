// 이모지 반응 채널(029): 같은 방 사람끼리만 주고받고, 방 밖 사람은 듣지도 보내지도 못함
import { createClient } from '@supabase/supabase-js';
import { user, ok, done, env } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [A, B, C] = await Promise.all([user(), user(), user()]);
const made = await A({ action: 'create', nickname: '반응A', mode: 'pro', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '반응 테스트' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: '반응B', mode: 'pro' });

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
ok('방 사람은 반응 채널에 들어감', a.st === 'SUBSCRIBED' && b.st === 'SUBSCRIBED', `${a.st} ${b.st}`);
ok('방 밖 사람은 비공개 반응 채널에 못 들어감', c.st !== 'SUBSCRIBED', c.st);
await b.ch.send({ type: 'broadcast', event: 'react', payload: { emoji: '👍', from: 'b' } });
await c.ch.send({ type: 'broadcast', event: 'react', payload: { emoji: '😂', from: 'fake' } }).catch(() => {});
// 방 밖 사람이 공개 채널(같은 이름)로 보내도 방 사람에게 안 감
const pub = client(C).channel('react-' + roomId, { config: { broadcast: { self: false } } });
await new Promise((r) => pub.subscribe((st) => st === 'SUBSCRIBED' && r()));
await pub.send({ type: 'broadcast', event: 'react', payload: { emoji: '🔥', from: 'outsider' } });
await sleep(2500);
ok('같은 방 사람의 반응은 옴', gotA.some((p) => p.from === 'b'), JSON.stringify(gotA));
ok('방 밖 사람의 반응은 안 옴', !gotA.some((p) => p.from === 'fake' || p.from === 'outsider'), JSON.stringify(gotA));
ok('방 밖 사람은 방 반응을 못 들음', gotC.length === 0);
await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
process.exit(0);
