// 같은 요청 번호(reqId)로 다시 보내도 한 번만 처리 — 응답만 끊겨 다시 눌러도 두 번 사지지 않게 (실제 서버)
import { randomUUID } from 'node:crypto';
import { user, ok, done } from './lib.mjs';

const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: 'A', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '요청 번호 시험' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: 'B', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
ok('2인 게임 시작', (await A({ action: 'start', roomId })).s === 200);

const sym = 'CORE';
const trades = async (P) => ((await P({ action: 'state', roomId })).b.myTrades ?? []).length;

// 1) 같은 번호로 두 번 → 둘째는 dup, 거래는 한 줄
const k1 = randomUUID();
const t1 = await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: k1 });
ok('첫 거래 성공', t1.s === 200 && !t1.b.dup, JSON.stringify(t1.b));
const t1b = await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: k1 });
ok('같은 번호로 다시 보내면 처음 결과 (dup)', t1b.s === 200 && t1b.b.dup === true && t1b.b.price === t1.b.price, JSON.stringify(t1b.b));
ok('거래는 한 줄만', (await trades(A)) === 1);

// 2) 동시에 두 번 → 한 줄
const k2 = randomUUID();
const both = await Promise.all([1, 2].map(() => A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: k2 })));
ok('동시에 같은 번호 두 번 → 둘 다 실패하지 않음(하나는 dup 또는 동시 요청 409)', both.every((r) => r.s === 200 || r.s === 409), JSON.stringify(both.map((r) => r.s)));
ok('동시에 보내도 거래는 하나만 늘어남', (await trades(A)) === 2);

// 3) 같은 번호에 다른 내용 → 422
const bad = await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 3, reqId: k1 });
ok('같은 번호로 수량만 바꾸면 거절 (422)', bad.s === 422, bad.b?.error);

// 4) 모양이 틀린 번호 → 400
for (const v of ['abc', 'x'.repeat(300), 123, { a: 1 }, '00000000-0000-1000-8000-000000000000']) {
  const r = await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: v });
  ok(`이상한 번호 거절: ${JSON.stringify(v).slice(0, 30)}`, r.s === 400, r.b?.error);
}

// 5) 남이 같은 번호를 써도 각자 처리 (번호는 내 자리 안에서만)
const tB = await B({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: k1 });
ok('다른 사람이 같은 번호를 써도 따로 체결', tB.s === 200 && !tB.b.dup, JSON.stringify(tB.b));
ok('상대 거래는 내 목록에 안 섞임', (await trades(A)) === 2);

// 6) 예약 주문도 한 번만
const k3 = randomUUID();
const st = (await A({ action: 'state', roomId })).b;
const open = st.market.bars[sym][st.room.day].open;
const o1 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 0.9), reqId: k3 });
const o2 = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: 1, limit: Math.round(open * 0.9), reqId: k3 });
ok('예약 주문 두 번 보내도 성공 응답', o1.s === 200 && o2.s === 200 && o2.b.dup === true, JSON.stringify([o1.b, o2.b]));
const openOrders = ((await A({ action: 'state', roomId })).b.myOrders ?? []).filter((o) => o.status === 'open');
ok('예약은 하나만', openOrders.length === 1, String(openOrders.length));

// 7) 번호 없이 보내던 예전 화면도 그대로
const old = await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1 });
ok('번호 없는 요청도 예전처럼 처리', old.s === 200);

// 8) 화면 데이터에 번호가 나가지 않음
const view = JSON.stringify((await A({ action: 'state', roomId })).b);
ok('화면 데이터에 요청 번호가 없음', !view.includes(k1) && !view.includes(k3) && !view.includes('req_id'));

await A({ action: 'leaveGame', roomId }).catch(() => {});
await B({ action: 'leaveGame', roomId }).catch(() => {});
done();
