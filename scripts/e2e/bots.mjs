// 커스텀 방 봇 (설계서 design/bots-daily.md): 방장만 추가·빼기, 자리 제한, 봇 때문에 기다리지 않음, 동시 요청에도 한 칸 한 번, 정보가 새지 않음
import { user, ok, done } from './lib.mjs';

const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: '봇방장', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 4, title: '봇 시험' });
ok('방 만들기', made.s === 200, made.b?.error);
const { roomId, code } = made.b;

await B({ action: 'join', code, nickname: '봇손님', mode: 'easy' });
const notHost = await B({ action: 'addBot', roomId, level: 2 });
ok('방장이 아니면 봇을 못 넣음 (403)', notHost.s === 403, notHost.b?.error);
const badLevel = await A({ action: 'addBot', roomId, level: 9 });
ok('없는 난이도는 거절 (400)', badLevel.s === 400, badLevel.b?.error);
const a1 = await A({ action: 'addBot', roomId, level: 2 });
const a2 = await A({ action: 'addBot', roomId, level: 3 });
ok('방장은 봇 2명 추가', a1.s === 200 && a2.s === 200, a1.b?.error ?? a2.b?.error);
const full = await A({ action: 'addBot', roomId, level: 1 });
ok('자리가 다 차면 더 못 넣음 (409)', full.s === 409, full.b?.error);

let s = (await A({ action: 'state', roomId })).b;
const bots = s.players.filter((p) => p.bot);
ok('화면 데이터에 봇 2명 (난이도 표시)', bots.length === 2 && bots.map((p) => p.bot).sort().join() === '2,3', JSON.stringify(bots.map((p) => [p.nickname, p.bot])));
ok('봇은 늘 준비 완료', bots.every((p) => p.ready));
const kickBot = await A({ action: 'kick', roomId, target: bots[0].id });
ok('방장은 봇을 뺄 수 있음', kickBot.s === 200, kickBot.b?.error);
await A({ action: 'addBot', roomId, level: 2 });
s = (await A({ action: 'state', roomId })).b;
ok('뺀 자리에 다시 넣기', s.players.filter((p) => p.bot).length === 2);

await B({ action: 'ready', roomId, ready: true });
const st = await A({ action: 'start', roomId });
ok('봇과 함께 시작', st.s === 200, st.b?.error);
const late = await A({ action: 'addBot', roomId, level: 1 });
ok('시작한 뒤엔 봇 추가 불가 (409)', late.s === 409, late.b?.error);

// 동시 요청: 같은 순간 상태를 여러 번 물어도 봇은 한 칸에 한 번
await new Promise((r) => setTimeout(r, 3500));
await Promise.all([1, 2, 3, 4, 5, 6].map((i) => (i % 2 ? A : B)({ action: 'state', roomId })));
s = (await A({ action: 'state', roomId })).b;
const raw = JSON.stringify(s);
ok('화면 데이터에 봇 내부 값(bot_step·bot_level) 없음', !raw.includes('bot_step') && !raw.includes('bot_level'));
ok('상대(봇) 재산은 구간만', s.players.filter((p) => p.bot).every((p) => Array.isArray(p.band)));
ok('내 거래 목록엔 내 것만', (s.myTrades ?? []).every((t) => t.player_id === s.me || t.player_id === undefined));

// 사람 둘이 모두 기권하면 (봇만 남음) 판이 바로 끝남
await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
const sFin = (await A({ action: 'history' })).b ?? [];
ok('사람이 모두 나가면 봇만 남은 판은 끝남', Array.isArray(sFin) && sFin.some((h) => (h.results ?? []).some((r) => r.nickname === '봇방장')), `${sFin.length}개`);

// 사람 1 + 쉬움 봇: 내가 마감 → 카운트다운 → 봇이 서둘러 마감 → 다음 날, 끝까지
{
  const m1 = await A({ action: 'create', nickname: '봇과둘', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '봇 1대1 끝까지' });
  const r1 = m1.b.roomId;
  await A({ action: 'addBot', roomId: r1, level: 1 });
  ok('사람 1 + 쉬움 봇 시작', (await A({ action: 'start', roomId: r1 })).s === 200);
  await new Promise((r) => setTimeout(r, 2500));
  // 같은 순간 상태를 여러 번 물어도 봇은 한 칸에 한 번
  await Promise.all([1, 2, 3, 4, 5].map(() => A({ action: 'state', roomId: r1 })));
  await A({ action: 'endTurn', roomId: r1 });
  let s1 = (await A({ action: 'state', roomId: r1 })).b;
  for (let i = 0; i < 10 && s1.room.day === 0; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    s1 = (await A({ action: 'state', roomId: r1 })).b;
  }
  ok('내가 마감하면 봇(쉬움)도 바로 마감해 다음 날', s1.room.day === 1, `day=${s1.room.day} countdown=${s1.room.countdown}`);
  for (let i = 0; i < 120 && s1.room.status !== 'finished'; i++) {
    await A({ action: 'endTurn', roomId: r1 });
    s1 = (await A({ action: 'state', roomId: r1 })).b;
    if (s1.room.status !== 'finished') await new Promise((r) => setTimeout(r, 400));
  }
  ok('끝까지 진행', s1.room.status === 'finished', `day=${s1.room.day}`);
  const botIds = new Set(s1.players.filter((p) => p.bot).map((p) => p.id));
  const botTrades = (s1.final?.trades ?? []).filter((t) => botIds.has(t.player_id));
  ok('봇이 실제로 거래했음', botTrades.length > 0, `${botTrades.length}건`);
  const keys = botTrades.map((t) => [t.player_id, t.day, t.symbol, t.side, t.qty, t.created_at].join('|'));
  ok('봇 거래가 두 번씩 들어가지 않음 (동시 요청)', new Set(keys).size === keys.length);
}

// 사람이 모두 나가면 판이 끝남 (새 방)
{
  const m2 = await A({ action: 'create', nickname: '혼자', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '봇 1대1' });
  const r2 = m2.b.roomId;
  await A({ action: 'addBot', roomId: r2, level: 1 });
  ok('사람 1 + 봇 1 로 시작', (await A({ action: 'start', roomId: r2 })).s === 200);
  await A({ action: 'leave', roomId: r2 });
  const after = (await B({ action: 'state', roomId: r2 })).s;
  ok('남의 봇 방 상태는 못 봄 (403)', after === 403);
}
// 사람 2 + 봇 1, 하루 3분: 봇도 마감 인원으로 셈 (3명 중 2명 마감이면 카운트다운)
{
  const m3 = await A({ action: 'create', nickname: '카운트', mode: 'easy', totalDays: 10, turnSeconds: 180, maxPlayers: 3, title: '봇 카운트다운' });
  const r3 = m3.b.roomId;
  await B({ action: 'join', code: m3.b.code, nickname: '카운트B', mode: 'easy' });
  await B({ action: 'ready', roomId: r3, ready: true });
  await A({ action: 'addBot', roomId: r3, level: 2 });
  ok('사람 2 + 봇 1 시작', (await A({ action: 'start', roomId: r3 })).s === 200);
  await A({ action: 'endTurn', roomId: r3 });
  let s3 = (await A({ action: 'state', roomId: r3 })).b;
  ok('3명 중 1명 마감은 아직 카운트다운 아님 (봇도 한 명으로 셈)', s3.room.countdown === false, `countdown=${s3.room.countdown}`);
  await B({ action: 'endTurn', roomId: r3 });
  s3 = (await A({ action: 'state', roomId: r3 })).b;
  for (let i = 0; i < 6 && s3.room.day === 0; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    s3 = (await A({ action: 'state', roomId: r3 })).b;
  }
  ok('둘이 마감 → 카운트다운 → 보통 봇도 서둘러 마감해 다음 날', s3.room.day === 1, `day=${s3.room.day} countdown=${s3.room.countdown}`);
  await A({ action: 'leave', roomId: r3 });
  await B({ action: 'leave', roomId: r3 });
}
// 봇전(서버 판): 바로 시작, 잘못된 값 거절, 한 판 더(rematch)는 봇전 메뉴로
{
  const bad = await A({ action: 'botMatch', levels: [9, 'x'], totalDays: 10, turnSeconds: 60 });
  ok('봇전: 잘못된 난이도만 보내면 거절 (400)', bad.s === 400, bad.b?.error);
  const bm = await A({ action: 'botMatch', levels: [2, 3, 1, 1, 2, 3, 3], totalDays: 10, turnSeconds: 60, nickname: '봇전나', mode: 'easy' });
  ok('봇전 서버 판 시작', bm.s === 200, bm.b?.error);
  const sb = (await A({ action: 'state', roomId: bm.b.roomId })).b;
  ok('봇은 5명까지, 방 종류 bot, 바로 진행', sb.players.filter((p) => p.bot).length === 5 && sb.room.kind === 'bot' && sb.room.status === 'playing', `${sb.players.length}명 ${sb.room.kind} ${sb.room.status}`);
  ok('봇 이름이 겹치지 않음', new Set(sb.players.map((p) => p.nickname)).size === sb.players.length);
  const notMine = await B({ action: 'state', roomId: bm.b.roomId });
  ok('남의 봇전은 못 봄 (403)', notMine.s === 403);
  const rm = await A({ action: 'rematch', roomId: bm.b.roomId });
  ok('봇전 rematch 는 거절 (봇전 메뉴로)', rm.s === 409, rm.b?.error);
  await A({ action: 'leave', roomId: bm.b.roomId });
}
done();
