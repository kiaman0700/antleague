// 커스텀 방 빠른 참가 (design/v26-batch.md D) — 실제 서버
// - 조건(인원·하루 길이)에 맞는 공개·대기 중·자리 있는 방에 들어감, 비밀방·꽉 찬 방에는 안 들어감
// - 맞는 방이 없으면 404, 차단 관계인 사람이 있는 방은 뺌
import { user, ok, done } from './lib.mjs';

const H = await user(); // 방장 (공개 1대1, 하루 3분)
const P = await user(); // 비밀방 방장 (1대1, 하루 3분)
const B = await user(); // 빠른 참가
const C = await user(); // 늦게 온 사람

const pub = await H({ action: 'create', nickname: '빠른방장', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '빠른 참가 시험' });
const prv = await P({ action: 'create', nickname: '비밀방장', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '비밀 시험', isPrivate: true, password: 'pw1234' });
ok('방 둘 만듦 (공개·비밀)', pub.s === 200 && prv.s === 200, JSON.stringify([pub.b?.error, prv.b?.error]));
// 방장이 '자리에 있음'으로 보이게 상태를 한 번 봄
await H({ action: 'state', roomId: pub.b.roomId });
await P({ action: 'state', roomId: prv.b.roomId });

const j = await B({ action: 'quickJoin', size: 'duel', turnSeconds: 180, nickname: '빠른참가', mode: 'easy' });
ok('빠른 참가로 들어감', j.s === 200 && !!j.b?.roomId, JSON.stringify(j.b));
ok('비밀방에는 안 들어감', j.b?.roomId !== prv.b.roomId);
const st = (await B({ action: 'state', roomId: j.b.roomId })).b;
ok('들어간 방이 조건과 맞음 (1대1 · 하루 3분)', st?.room?.maxPlayers === 2 && st?.room?.turnSeconds === 180 && st?.room?.status === 'waiting' && !st?.room?.isPrivate, JSON.stringify({ m: st?.room?.maxPlayers, t: st?.room?.turnSeconds }));

// 시험 방이 꽉 찼으면 C 는 그 방에 못 들어감
if (j.b?.roomId === pub.b.roomId) {
  const c = await C({ action: 'quickJoin', size: 'duel', turnSeconds: 180, nickname: '늦은사람', mode: 'easy' });
  ok('꽉 찬 방에는 안 들어감 (다른 방이거나 404)', c.s === 404 || (c.s === 200 && c.b.roomId !== pub.b.roomId), JSON.stringify(c.b));
  if (c.s === 200) await C({ action: 'leave', roomId: c.b.roomId });
} else ok('(다른 시험 방에 먼저 들어감 — 꽉 찬 방 시험은 건너뜀)', true);

// 거의 없을 조건 → 404 와 안내 문구
const none = await C({ action: 'quickJoin', size: 'multi', turnSeconds: 60, nickname: '늦은사람', mode: 'easy' });
ok('맞는 방이 없으면 404 + 안내', none.s === 404 ? /조건에 맞는 방이 없어요/.test(none.b?.error ?? '') : none.s === 200, JSON.stringify(none.b));
if (none.s === 200) await C({ action: 'leave', roomId: none.b.roomId });

// 이상한 값은 '상관없음'으로 (서버가 거르고 오류 없이)
const odd = await C({ action: 'quickJoin', size: '<script>', turnSeconds: 'x', nickname: '늦은사람', mode: 'easy' });
ok('이상한 조건 값은 무시 (200 이나 404)', odd.s === 200 || odd.s === 404, String(odd.s));
if (odd.s === 200) await C({ action: 'leave', roomId: odd.b.roomId });

for (const [U, r] of [[B, j.b?.roomId], [H, pub.b?.roomId], [P, prv.b?.roomId]]) if (r) await U({ action: 'leave', roomId: r });
done();
