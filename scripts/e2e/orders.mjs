// 예약(지정가) 주문: 걸기·거절 규칙·현금 예약·하루 5개·취소·남의 주문·상대에게 안 보임 (실제 서버)
import { user, ok, done } from './lib.mjs';

const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: 'A', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '예약 주문 시험' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: 'B', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
ok('2인 게임 시작', (await A({ action: 'start', roomId })).s === 200);

const st = async (P) => (await P({ action: 'state', roomId })).b;
const s0 = await st(A);
ok('첫날은 장 전 시간 (예약 주문을 거는 때)', !!s0.room.preUntil, String(s0.room.preUntil));
const day = s0.room.day;
const sym = 'CORE';
const open = s0.market.bars[sym][day].open;

// 1) 사기 예약: 지금 가격보다 낮고 30% 안
const r1 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 2, limit: Math.round(open * 0.95) });
ok('사기 예약 걸기', r1.s === 200, r1.b?.error);
// 2) 지금 가격보다 높은 사기 예약은 거절
const r2 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 1.05) });
ok('지금 가격보다 높은 사기 예약은 거절 (400)', r2.s === 400, r2.b?.error);
// 3) 30% 넘게 아래도 거절
const r3 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 0.5) });
ok('30% 넘게 낮은 예약은 거절 (400)', r3.s === 400, r3.b?.error);
// 4) 가진 게 없으면 팔기 예약 거절
const r4 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'sell', qty: 1, limit: Math.round(open * 1.05) });
ok('가진 주식 없이 팔기 예약은 거절 (400)', r4.s === 400, r4.b?.error);
// 5) 현금보다 큰 예약은 거절 (이미 건 예약까지 합쳐서)
const r5 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1_000_000, limit: Math.round(open * 0.95) });
ok('현금보다 큰 사기 예약은 거절 (400)', r5.s === 400, r5.b?.error);
// 6) 이상한 값
for (const bad of [{ qty: 0 }, { qty: 1.5 }, { qty: -3 }, { limit: 0 }, { limit: -1 }, { limit: 'abc' }, { side: 'hold' }, { symbol: 'XXXX' }]) {
  const r = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 0.95), ...bad });
  ok(`이상한 값 거절: ${JSON.stringify(bad)}`, r.s === 400, r.b?.error);
}

// 7) 내 화면엔 보이고, 상대 화면엔 안 보임
const mine = (await st(A)).myOrders.filter((o) => o.status === 'open');
ok('내 예약 주문 목록에 보임', mine.length === 1 && mine[0].symbol === sym && mine[0].qty === 2, JSON.stringify(mine));
const theirs = await st(B);
ok('상대 화면에는 내 예약 주문이 없음', !theirs.myOrders.some((o) => o.id === mine[0].id) && !JSON.stringify(theirs).includes(mine[0].id));

// 8) 하루 5개까지
for (let i = 0; i < 4; i++) await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * (0.9 - i * 0.01)) });
const r8 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 0.85) });
ok('예약 주문은 하루 5개까지 (6번째 거절)', r8.s === 400, r8.b?.error);

// 9) 취소: 남의 주문은 못 함, 내 주문은 한 번만
const target = mine[0].id;
const c0 = await B({ action: 'cancelOrder', roomId, orderId: target });
ok('남의 예약 주문은 취소 못 함 (404)', c0.s === 404, c0.b?.error);
const c1 = await A({ action: 'cancelOrder', roomId, orderId: target });
ok('내 예약 주문 취소', c1.s === 200, c1.b?.error);
const c2 = await A({ action: 'cancelOrder', roomId, orderId: target });
ok('이미 취소한 주문은 다시 취소 못 함 (409)', c2.s === 409, c2.b?.error);
const after = (await st(A)).myOrders.find((o) => o.id === target);
ok('취소한 주문은 취소 상태', after?.status === 'cancelled', after?.status);
const c3 = await A({ action: 'cancelOrder', roomId, orderId: 'not-a-real-id' });
ok('없는 주문 번호는 404', c3.s === 404, c3.b?.error);

await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
