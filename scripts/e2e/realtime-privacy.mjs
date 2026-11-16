// 실시간 알림(방 변화)은 그 방 사람만 받음 — 방 밖 사람이 방 ID 를 알아도 엿듣지 못함
import { createClient } from '@supabase/supabase-js';
import { user, ok, done, env } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [A, B, C] = await Promise.all([user(), user(), user()]);
const made = await A({ action: 'create', nickname: '알림A', mode: 'pro', totalDays: 10, turnSeconds: 60, maxPlayers: 3, title: '알림 시험' });
const { roomId, code } = made.b;

// 채널 하나에 허용되지 않는 표를 섞으면 채널 전체가 막히므로 표마다 따로 구독
const listen = (U, got, table, filter) =>
  new Promise((res) => {
    const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    sb.realtime.setAuth(U.token);
    sb.channel(table + '-' + roomId + '-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (p) => got.push({ table, p }))
      .subscribe((st) => (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' ? res(st) : null));
  });
const gotA = [];
const gotC = [];
await listen(A, gotA, 'rooms', `id=eq.${roomId}`);
await listen(A, gotA, 'players', `room_id=eq.${roomId}`);
await listen(A, gotA, 'trades');
await listen(C, gotC, 'rooms', `id=eq.${roomId}`);
await listen(C, gotC, 'players', `room_id=eq.${roomId}`);
await listen(C, gotC, 'trades');
await listen(C, gotC, 'room_secrets');
await sleep(1500);
// 방 변화 일으키기: B 입장 → 준비 → 시작 → 거래
await B({ action: 'join', code, nickname: '알림B', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
await A({ action: 'start', roomId });
await A({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 1 });
await sleep(4000);
ok('방 사람은 방 변화 알림을 받음', gotA.some((x) => x.table === 'rooms'), `${gotA.length}건`);
ok('방 밖 사람은 아무 알림도 못 받음', gotC.length === 0, `${gotC.length}건`);
ok('거래·참가자 변화는 방 사람에게도 실시간으로 안 감 (상대 거래 시점 숨김)', !gotA.some((x) => x.table !== 'rooms'), JSON.stringify(gotA.map((x) => x.table)));
// 받은 알림 안에 비밀값이 없는지
const raw = JSON.stringify(gotA);
ok('알림 안에 시드·비밀값·비밀번호 없음', !/seed|salt|pw_hash|password/.test(raw), raw.slice(0, 120));
await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
process.exit(0);
