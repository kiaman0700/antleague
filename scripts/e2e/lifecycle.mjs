// 방 생애주기: 방장 넘기기 · 내보내기 · 기권 · 기기 바꿔 이어하기 · 한 판 더 · 정보 노출
import { user, ok, done } from './lib.mjs';

// 익명 계정은 IP 당 만들 수 있는 수가 제한돼 있어서 미리 몇 개만 만들어 돌려 씀
const pool = [];
for (let i = 0; i < 3; i++) pool.push(await user());
// X1: 이어하기로 자리를 받을 '다른 기기' (그 방에 없는 C 를 씀), X2: 아무 방에도 없는 계정
const X1 = pool[2];
const X2 = await user();

// 한 사람은 한 방에만 들어갈 수 있어서, 새 방 전에 지난 방·대결에서 나옴
async function free(U) {
  for (let i = 0; i < 20; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
}
async function room(players, opts = {}) {
  const us = pool.slice(0, players);
  for (const U of us) await free(U);
  const made = await us[0]({ action: 'create', nickname: 'P0', mode: 'easy', totalDays: opts.days ?? 10, turnSeconds: 180, maxPlayers: Math.max(players, opts.max ?? players), title: '생애주기' });
  const { roomId, code } = made.b;
  const ids = [made.b.playerId];
  for (let i = 1; i < players; i++) {
    const j = await us[i]({ action: 'join', code, nickname: 'P' + i, mode: 'easy' });
    ids.push(j.b.playerId);
    await us[i]({ action: 'ready', roomId, ready: true });
  }
  return { us, roomId, code, ids };
}

// ---- 대기실: 내보내기 · 방장 넘기기 ----
{
  const { us: [A, B, C], roomId, ids } = await room(3, { max: 4 });
  const notHost = await B({ action: 'kick', roomId, target: ids[2] });
  ok('방장만 내보낼 수 있음', notHost.s === 403, notHost.b?.error);
  const kick = await A({ action: 'kick', roomId, target: ids[2] });
  ok('방장이 내보내기', kick.s === 200, kick.b?.error ?? '');
  const gone = await C({ action: 'state', roomId });
  ok('내보낸 사람은 방 정보를 못 봄', gone.s === 403, gone.b?.error);
  await A({ action: 'leave', roomId });
  const s = (await B({ action: 'state', roomId })).b;
  ok('방장이 나가면 다음 사람이 방장', s?.room?.hostId === ids[1], JSON.stringify(s?.room?.hostId));
}

// ---- 게임 중: 상대 정보 노출 · 기권 ----
{
  const { us: [A, B, C], roomId, ids } = await room(3);
  await A({ action: 'start', roomId });
  await B({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 37 });
  const s = (await A({ action: 'state', roomId })).b;
  const b = s.players.find((p) => p.id === ids[1]);
  ok('상대 재산은 10만원 단위', b.equity % 100000 === 0, String(b.equity));
  ok('상대의 오늘 거래 횟수는 안 보임', b.tradeCount === 0, String(b.tradeCount));
  ok('접속 시각 같은 내부 값은 없음', !JSON.stringify(s).includes('last_seen') && !JSON.stringify(s).includes('rejoin'));
  const leave = await C({ action: 'leave', roomId });
  ok('게임 중 나가기(기권)', leave.s === 200, leave.b?.error ?? '');
  const s2 = (await A({ action: 'state', roomId })).b;
  ok('나간 사람은 "나감"으로 표시', s2.players.find((p) => p.id === ids[2])?.status === 'left');
  await A({ action: 'endTurn', roomId });
  await B({ action: 'endTurn', roomId });
  const s3 = (await A({ action: 'state', roomId })).b;
  ok('남은 두 사람만 마감하면 바로 다음 날 (나간 사람 안 기다림)', s3.room.day === 1, `day=${s3.room.day}`);
  const back = await C({ action: 'resume' });
  ok('기권한 게임은 이어하기 목록에 안 나옴', back.s === 200 && (back.b === null || back.b.roomId !== roomId));
}

// ---- 기기 바꿔 이어하기 ----
{
  const { us: [A, B], roomId, code, ids } = await room(2);
  await A({ action: 'start', roomId });
  const rc = await B({ action: 'rejoinCode', roomId });
  ok('이어하기 코드 받기', rc.s === 200 && new RegExp(`^${code}-[A-Z0-9]{10}$`).test(rc.b?.code ?? ''), rc.b?.error ?? rc.b?.code);
  const other = X1;
  const wrong = await other({ action: 'rejoin', code: `${code}-AAAAAAAAAA` });
  ok('틀린 코드는 거절', wrong.s === 403, wrong.b?.error);
  const re = await other({ action: 'rejoin', code: rc.b.code });
  ok('새 기기로 자리 옮기기', re.s === 200 && re.b.playerId === ids[1] && re.b.status === 'playing', re.b?.error ?? '');
  const oldDev = await B({ action: 'state', roomId });
  ok('예전 기기는 더 이상 그 자리가 아님', oldDev.s === 403, oldDev.b?.error);
  const again = await X2({ action: 'rejoin', code: rc.b.code });
  ok('이어하기 코드는 한 번만', again.s === 403, again.b?.error);
}

// ---- 한 판 더 ----
{
  const { us: [A, B], roomId } = await room(2, { days: 10 });
  await A({ action: 'start', roomId });
  const early = await A({ action: 'rematch', roomId });
  ok('끝나기 전엔 한 판 더 불가', early.s === 409, early.b?.error);
  for (let d = 0; d < 10; d++) {
    await A({ action: 'endTurn', roomId });
    await B({ action: 'endTurn', roomId });
    await A({ action: 'state', roomId });
  }
  const fin = (await A({ action: 'state', roomId })).b;
  ok('게임 끝', fin.room.status === 'finished', fin.room.status);
  const [ra, rb] = await Promise.all([A({ action: 'rematch', roomId }), B({ action: 'rematch', roomId })]);
  ok('둘이 동시에 눌러도 같은 새 방', ra.s === 200 && rb.s === 200 && ra.b.code === rb.b.code, JSON.stringify([ra.b, rb.b]));
  const s = (await A({ action: 'state', roomId })).b;
  ok('끝난 방에 다시 하기 코드 표시', s.room.nextCode === ra.b.code);
  const outsider = await X2({ action: 'rematch', roomId });
  ok('남의 방에서는 한 판 더 불가', outsider.s === 403, outsider.b?.error);
}

// ---- 한 사람은 한 방에만 ----
{
  const [A, B] = pool;
  await free(A);
  await free(B);
  const r1 = (await A({ action: 'create', nickname: 'P0', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '첫 방' })).b;
  const r2 = (await A({ action: 'create', nickname: 'P0', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '둘째 방' })).b;
  const res = (await A({ action: 'resume' })).b;
  ok('새 방을 만들면 예전 대기실에서는 자동으로 나옴', res?.roomId === r2.roomId && (await A({ action: 'state', roomId: r1.roomId })).s !== 200, JSON.stringify(res));
  const q = await A({ action: 'queueJoin', queue: 'casual_duel_quick', nickname: 'P0', mode: 'easy' });
  ok('대기실에 있으면 매칭 대기 불가 (대기는 한 곳만)', q.s === 409, q.b?.error);
  await B({ action: 'join', code: r2.code, nickname: 'P1', mode: 'easy' });
  await B({ action: 'ready', roomId: r2.roomId, ready: true });
  await A({ action: 'start', roomId: r2.roomId });
  const other = (await X2({ action: 'create', nickname: 'X', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '다른 방' })).b;
  const busyQ = await A({ action: 'queueJoin', queue: 'casual_duel_quick', nickname: 'P0', mode: 'easy' });
  ok('대결 중에는 매칭 대기 불가 (게임은 하나만)', busyQ.s === 409, busyQ.b?.error);
  const busy = await A({ action: 'join', code: other.code, nickname: 'P0', mode: 'easy' });
  ok('대결 중에는 다른 방에 못 들어감', busy.s === 409, busy.b?.error);
  await A({ action: 'leave', roomId: r2.roomId });
  const after = await A({ action: 'join', code: other.code, nickname: 'P0', mode: 'easy' });
  ok('기권한 뒤에는 들어갈 수 있음', after.s === 200, after.b?.error ?? '');
  await A({ action: 'leave', roomId: other.roomId });
  await X2({ action: 'leave', roomId: other.roomId });
  await B({ action: 'leave', roomId: r2.roomId });
}
done();
