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

// 사람 둘이 마감하면 봇을 기다리지 않고 바로 다음 날
const e1 = await A({ action: 'endTurn', roomId });
const e2 = await B({ action: 'endTurn', roomId });
ok('사람 둘 마감', e1.s === 200 && e2.s === 200, e1.b?.error ?? e2.b?.error);
s = (await A({ action: 'state', roomId })).b;
ok('봇을 기다리지 않고 바로 다음 날', s.room.day === 1, `day=${s.room.day}`);

// 끝까지 (사람 둘이 계속 마감)
for (let i = 0; i < 60 && s.room.status !== 'finished'; i++) {
  await A({ action: 'endTurn', roomId });
  await B({ action: 'endTurn', roomId });
  s = (await A({ action: 'state', roomId })).b;
}
ok('끝까지 진행', s.room.status === 'finished', `day=${s.room.day}`);
const fin = s.final;
const botIds = new Set(s.players.filter((p) => p.bot).map((p) => p.id));
const botTrades = (fin?.trades ?? []).filter((t) => botIds.has(t.player_id));
ok('봇이 실제로 거래했음', botTrades.length > 0, `${botTrades.length}건`);
const keys = botTrades.map((t) => [t.player_id, t.day, t.symbol, t.side, t.qty, t.created_at].join('|'));
ok('봇 거래가 두 번씩 들어가지 않음 (동시 요청)', new Set(keys).size === keys.length);

// 사람이 모두 나가면 판이 끝남 (새 방)
{
  const m2 = await A({ action: 'create', nickname: '혼자', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '봇 1대1' });
  const r2 = m2.b.roomId;
  await A({ action: 'addBot', roomId: r2, level: 1 });
  ok('사람 1 + 봇 1 로 시작', (await A({ action: 'start', roomId: r2 })).s === 200);
  const e = await A({ action: 'endTurn', roomId: r2 });
  const s2 = (await A({ action: 'state', roomId: r2 })).b;
  ok('혼자 마감하면 바로 다음 날', e.s === 200 && s2.room.day === 1, `day=${s2.room.day}`);
  await A({ action: 'leave', roomId: r2 });
  const after = (await B({ action: 'state', roomId: r2 })).s;
  ok('남의 봇 방 상태는 못 봄 (403)', after === 403);
}
done();
