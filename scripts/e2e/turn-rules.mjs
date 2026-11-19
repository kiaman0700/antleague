// 장 마감 규칙: 카운트다운(하루 길이에 맞춤 — 1대1 하루의 ⅓(20~90초), 3인 이상 ⅔ 마감 시 하루의 ⅙(10~30초)) · 마감 취소 · 누가 마감했는지
import { user, ok, done } from './lib.mjs';

async function room(players, turnSeconds) {
  const us = await Promise.all(Array.from({ length: players }, () => user()));
  const made = await us[0]({ action: 'create', nickname: 'P0', mode: 'easy', totalDays: 10, turnSeconds, maxPlayers: players, title: '규칙 테스트' });
  if (made.s !== 200) return { made };
  const { roomId, code } = made.b;
  for (let i = 1; i < players; i++) {
    await us[i]({ action: 'join', code, nickname: 'P' + i, mode: 'easy' });
    await us[i]({ action: 'ready', roomId, ready: true });
  }
  const st = await us[0]({ action: 'start', roomId });
  ok(`${players}인 ${turnSeconds}초 방 시작`, st.s === 200, st.b?.error ?? '');
  const state = async () => (await us[0]({ action: 'state', roomId })).b;
  return { made, us, roomId, state };
}
const secsLeft = (s) => (s.room.deadline === null ? null : Math.round((s.room.deadline - s.serverNow) / 1000));

const zero = await (await user())({ action: 'create', nickname: 'X', mode: 'easy', totalDays: 10, turnSeconds: 0, maxPlayers: 2, title: '무제한' });
ok('무제한(0) 방은 만들 수 없음', zero.s === 400, zero.b?.error);
const ten = await room(2, 600);
if (ten.made.s === 200) ok('10분 방 만들기', true);
else console.log('ℹ️ 10분 방을 만들 수 없음 — supabase/005_turn_times.sql 을 실행하면 돼요  ' + (ten.made.b?.error ?? ''));

// ---- 1대1 (3분) ----
{
  const { us: [A, B], roomId, state } = await room(2, 180);
  let s = await state();
  const full = secsLeft(s);
  // (v14) 첫날에도 장 전 시간(3분 방 45초)이 있어 시작 직후엔 하루 3분 + 장 전 45초
  ok('3분 방: 시작하면 약 3분 (+ 첫날 장 전 45초)', full >= 175 && full <= 183 + 45, `남은 ${full}초`);
  await A({ action: 'endTurn', roomId });
  s = await state();
  ok('1대1(하루 3분): 한 명이 마감하면 60초 카운트다운', secsLeft(s) >= 55 && secsLeft(s) <= 60, `남은 ${secsLeft(s)}초`);
  const migrated = s.room.countdown === true;
  if (!migrated) console.log('ℹ️ 카운트다운 표시·시간 복구는 005 마이그레이션 후 동작해요');
  ok('누가 마감했는지 보임', s.players.find((p) => p.nickname === 'P0').endedDay === 0 && s.players.find((p) => p.nickname === 'P1').endedDay === -1);
  const noTrade = await A({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 1 });
  ok('마감한 뒤에는 거래 불가', noTrade.s === 409, noTrade.b?.error);
  const bCancel = await B({ action: 'cancelEnd', roomId });
  ok('마감 안 한 사람은 취소 불가', bCancel.s === 409, bCancel.b?.error);
  const cancel = await A({ action: 'cancelEnd', roomId });
  ok('카운트다운 중에 마감 취소', cancel.s === 200, cancel.b?.error ?? '');
  s = await state();
  if (migrated) ok('취소하면 원래 시간으로 복구 (끝내고 취소해서 상대 시간 줄이기 방지)', secsLeft(s) > 150 && !s.room.countdown, `남은 ${secsLeft(s)}초`);
  const trade = await A({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 1 });
  ok('취소 후 다시 거래 가능', trade.s === 200, trade.b?.error ?? '');
  const quick = await A({ action: 'endTurn', roomId });
  ok('취소하고 바로 다시 마감은 잠깐 막힘 (마감·취소 되풀이로 상대 재촉 방지)', quick.s === 409, quick.b?.error);
  await new Promise((r) => setTimeout(r, 5200));
  const again = await A({ action: 'endTurn', roomId });
  ok('5초 지나면 다시 마감 가능', again.s === 200, again.b?.error ?? '');
  await B({ action: 'endTurn', roomId });
  s = await state();
  ok('둘 다 마감하면 시간과 상관없이 바로 다음 날', s.room.day === 1 && secsLeft(s) >= 175, `남은 ${secsLeft(s)}초`);
}

// ---- 3인 (3분) ----
{
  const { us: [A, B], roomId, state } = await room(3, 180);
  await A({ action: 'endTurn', roomId });
  let s = await state();
  ok('3인: 1명 마감으로는 카운트다운 없음', secsLeft(s) > 150, `남은 ${secsLeft(s)}초`);
  await B({ action: 'endTurn', roomId });
  s = await state();
  ok('3인: 2명(⅔) 마감하면 30초 카운트다운', secsLeft(s) >= 25 && secsLeft(s) <= 30, `남은 ${secsLeft(s)}초`);
  await B({ action: 'cancelEnd', roomId });
  s = await state();
  if (s.room.countdown !== undefined && secsLeft(s) > 30) ok('한 명이 취소해 ⅔ 아래가 되면 원래 시간으로', s.room.day === 0 && secsLeft(s) > 150, `남은 ${secsLeft(s)}초`);
}

done();
