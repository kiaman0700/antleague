// 방 잠금(DB 067): 마지막 자리에 동시에 들어오기 · 시작과 나가기가 겹칠 때 — 실제 서버
import { user, ok, done } from './lib.mjs';

const [A, B, C] = await Promise.all([user(), user(), user()]);

// 1) 2인 방의 마지막 한 자리에 둘이 동시에 → 한 명만
{
  const m = await A({ action: 'create', nickname: '잠금방장', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '잠금 시험' });
  ok('방 만들기', m.s === 200, m.b?.error);
  const { roomId, code } = m.b;
  const [jb, jc] = await Promise.all([B({ action: 'join', code, nickname: '동시B', mode: 'easy' }), C({ action: 'join', code, nickname: '동시C', mode: 'easy' })]);
  const wins = [jb, jc].filter((x) => x.s === 200).length;
  ok('마지막 자리에 둘이 동시에 들어와도 한 명만 들어감', wins === 1, `${jb.s} ${jb.b?.error ?? ''} / ${jc.s} ${jc.b?.error ?? ''}`);
  const s = (await A({ action: 'state', roomId })).b;
  ok('방 인원은 정원(2명) 그대로', s.players.length === 2, String(s.players.length));

  // 2) 시작과 나가기가 겹침 → 혼자 남은 진행 중인 판이 생기지 않음
  const In = jb.s === 200 ? B : C;
  await In({ action: 'ready', roomId, ready: true });
  const [st, lv] = await Promise.all([A({ action: 'start', roomId }), In({ action: 'leave', roomId })]);
  const after = (await A({ action: 'state', roomId })).b;
  const alone = after.room.status === 'playing' && after.players.length < 2;
  ok('시작과 나가기가 겹쳐도 혼자 남은 진행 중인 판은 없음', !alone, `start ${st.s} ${st.b?.error ?? ''} / leave ${lv.s} · ${after.room.status} ${after.players.length}명`);
  ok('시작됐으면 나간 사람은 기권으로 남고, 아니면 대기실에 방장만', after.room.status === 'waiting' ? after.players.length === 1 : after.players.length === 2 && after.players.some((p) => p.status === 'left'), `${after.room.status} ${JSON.stringify(after.players.map((p) => p.status))}`);
  await A({ action: 'leave', roomId });
}

// 3) 시작한 방에는 못 들어감
{
  const m = await A({ action: 'create', nickname: '잠금방장', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 3, title: '잠금 시험 2' });
  const { roomId, code } = m.b;
  await B({ action: 'join', code, nickname: '먼저B', mode: 'easy' });
  await B({ action: 'ready', roomId, ready: true });
  const [st, jc] = await Promise.all([A({ action: 'start', roomId }), C({ action: 'join', code, nickname: '늦은C', mode: 'easy' })]);
  const s = (await A({ action: 'state', roomId })).b;
  // 들어온 게 먼저면 준비 안 한 사람이 있어 시작이 거절되고, 시작이 먼저면 입장이 거절됨 — 어느 쪽이든 진행 중인 방에 준비 안 한 자리가 끼지 않음
  ok('시작과 입장이 겹쳐도 진행 중인 방에 끼어든 자리가 없음', !(s.room.status === 'playing' && s.players.length === 3), `start ${st.s} / join ${jc.s} ${jc.b?.error ?? ''} · ${s.room.status} ${s.players.length}명`);
  for (const U of [A, B, C]) await U({ action: 'leave', roomId });
}
done();
