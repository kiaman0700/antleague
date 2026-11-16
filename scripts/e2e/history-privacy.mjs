// 전적(history)은 내가 한 판만: 그 판에 없던 사람은 남의 판 기록을 못 봄, 기록 안에 계정 id 같은 값 없음
import { user, ok, done } from './lib.mjs';

const [A, B, C] = [await user(), await user(), await user()];
async function free(U) {
  for (let i = 0; i < 20; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
}
for (const U of [A, B, C]) await free(U);

const tag = Math.random().toString(36).slice(2, 6);
const nA = '기록A' + tag;
const nB = '기록B' + tag;
const made = await A({ action: 'create', nickname: nA, mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '전적 시험' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: nB, mode: 'easy' });
await B({ action: 'ready', roomId, ready: true });
await A({ action: 'start', roomId });
// A 가 기권 → 1대1 이 끝나고 기록이 남음
await A({ action: 'leave', roomId });
await new Promise((r) => setTimeout(r, 1500));
// B 가 상태를 한 번 받아 끝난 판 기록이 확실히 남게
await B({ action: 'state', roomId });

const has = (rows) => (rows ?? []).some((h) => (h.results ?? []).some((r) => r.nickname === nA || r.nickname === nB));
const hb = (await B({ action: 'history' })).b;
const hc = (await C({ action: 'history' })).b;
ok('같이 한 사람(B)은 그 판 기록이 보임', has(hb), JSON.stringify(hb).slice(0, 120));
ok('그 판에 없던 사람(C)은 그 판 기록을 못 봄', !has(hc), JSON.stringify(hc).slice(0, 120));
const mine = (hb ?? []).find((h) => (h.results ?? []).some((r) => r.nickname === nB));
ok('기록에 내 닉네임(me)이 표시됨', mine?.me === nB, String(mine?.me));
const raw = JSON.stringify(hb ?? []);
ok('기록 안에 방 id·계정 id·시드 없음', !/room_id|user_id|player_id|seed|salt/.test(raw) && !raw.includes(roomId), raw.slice(0, 120));
// 그 판에 없던 C 가 방 ID 만 알고 하는 요청은 모두 거절 (다시 하기·상태·이어하기 코드·나가기·마감·준비)
for (const act of ['rematch', 'state', 'rejoinCode', 'leave', 'endTurn', 'preReady', 'trade']) {
  const r = await C({ action: act, roomId, symbol: 'CORE', side: 'buy', qty: 1 });
  ok(`남의 방 ${act} 거절`, r.s === 403, `${r.s} ${r.b?.error ?? ''}`);
}
await B({ action: 'leave', roomId });
done();
process.exit(0);
