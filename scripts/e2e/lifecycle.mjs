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
  await B({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 2 });
  const s = (await A({ action: 'state', roomId })).b;
  const b = s.players.find((p) => p.id === ids[1]);
  // 2026-11-17 결정: 상대 재산은 원 단위로 보임, 무엇을 샀는지는 안 보임
  ok('상대 재산은 원 단위로 보임 (구간 아님)', typeof b.equity === 'number' && !b.band, String(b.equity));
  ok('상대가 산 종목·거래는 안 보임', !JSON.stringify(s).includes('"player_id":"' + ids[1] + '"') && (s.myTrades ?? []).length === 0);
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

// ---- '다른 기기로 옮기기(이어하기 코드)'는 없앤 기능 (2026-11-17) — 서버가 받지 않아야 함 ----
{
  const { us: [A, B], roomId, code } = await room(2);
  await A({ action: 'start', roomId });
  const rc = await B({ action: 'rejoinCode', roomId });
  ok('이어하기 코드 받기는 없는 기능 (400)', rc.s === 400, rc.b?.error);
  const re = await X1({ action: 'rejoin', code: `${code}-AAAAAAAAAA` });
  ok('이어하기 코드로 자리 옮기기도 없음 (400)', re.s === 400, re.b?.error);
  const still = await B({ action: 'state', roomId });
  ok('원래 사람은 그대로 자기 자리', still.s === 200);
  // 새로고침한 게임 주소: 코드로 내 자리 찾기 — 남의 방 코드면 아무것도 안 줌, 내 방이면 내 자리만
  const mineR = (await B({ action: 'resume', code })).b;
  ok('코드로 이어하기: 내 방이면 내 자리', mineR?.roomId === roomId && !!mineR?.playerId, JSON.stringify(mineR));
  const otherR = (await X1({ action: 'resume', code })).b;
  ok('코드로 이어하기: 남의 방 코드면 내 자리(없음)만 — 남의 자리·방 id 안 보임', !otherR || otherR.code !== code, JSON.stringify(otherR));
  const junk = await X1({ action: 'resume', code: "' or 1=1--" });
  ok('코드로 이어하기: 이상한 코드는 무시', junk.s === 200, String(junk.s));
}

// ---- 한 판 더 ----
{
  const { us: [A, B], roomId } = await room(2, { days: 10 });
  await A({ action: 'start', roomId });
  const early = await A({ action: 'rematch', roomId });
  ok('끝나기 전엔 한 판 더 불가', early.s === 409, early.b?.error);
  // (v7) 둘째 날부터 장 전 시간 — 장 마감 전에 둘 다 준비 완료를 눌러야 장이 열림 (안 누르면 타이밍에 따라 날이 덜 넘어감)
  // 서버가 느리면 한 번에 하루가 안 넘어갈 수 있어 넉넉히 (날이 그대로면 잠깐 쉬고 다시)
  let lastDay = -1;
  for (let d = 0; d < 40; d++) {
    await A({ action: 'preReady', roomId });
    await B({ action: 'preReady', roomId });
    await A({ action: 'endTurn', roomId });
    await B({ action: 'endTurn', roomId });
    const st = (await A({ action: 'state', roomId })).b;
    if (st?.room?.status === 'finished') break;
    if (st?.room?.day === lastDay) await new Promise((r) => setTimeout(r, 600));
    lastDay = st?.room?.day ?? lastDay;
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
