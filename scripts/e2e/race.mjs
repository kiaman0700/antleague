// 동시에 여러 번 사기(서로 다른 요청 번호) — 가진 현금보다 많이 사지면 안 됨 (072 bump_insert, 실제 서버)
import { randomUUID } from 'node:crypto';
import { user, ok, done } from './lib.mjs';

const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: 'A', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 2, title: '동시 사기 시험' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: 'B', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
ok('2인 게임 시작', (await A({ action: 'start', roomId })).s === 200);

const sym = 'CORE';
// 장 전이면 먼저 거래 하나로 장을 열어 둠 (도우미가 준비 완료 후 다시 보냄)
await A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1, reqId: randomUUID() });
const st = (await A({ action: 'state', roomId })).b;
const spentOf = (trades) => trades.reduce((s, t) => s + (t.side === 'buy' ? 1 : -1) * Number(t.qty) * Number(t.price) + Number(t.fee ?? 0), 0);
const cash0 = 1_000_000 - spentOf(st.myTrades ?? []);
const price = st.market.bars[sym][st.room.day].open;
// 한 번은 살 수 있지만 두 번은 못 사는 수량 (현금의 절반 넘게)
const qty = Math.floor(cash0 / 2 / price) + 1;
ok('한 번만 살 수 있는 수량 (현금의 절반 넘게)', qty * price > cash0 / 2 && qty * price * 1.01 < cash0, `qty ${qty} · 가격 ${price}`);

for (let round = 1; round <= 3; round++) {
  const res = await Promise.all([1, 2, 3, 4, 5].map(() => A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty, reqId: randomUUID() })));
  const okN = res.filter((r) => r.s === 200).length;
  const after = (await A({ action: 'state', roomId })).b;
  const spent = spentOf(after.myTrades ?? []);
  ok(`${round}회차: 동시에 5번 → 많아야 한 번만 체결`, okN <= 1, JSON.stringify(res.map((r) => r.s)));
  ok(`${round}회차: 쓴 돈이 시작 현금을 넘지 않음`, spent <= 1_000_000, `쓴 돈 ${Math.round(spent)}`);
  // 다음 회차를 위해 산 것을 팖
  const held = (after.myTrades ?? []).filter((t) => t.symbol === sym).reduce((s, t) => s + (t.side === 'buy' ? 1 : -1) * Number(t.qty), 0);
  if (held > 0) await A({ action: 'trade', roomId, symbol: sym, side: 'sell', qty: held, reqId: randomUUID() });
}

// 예약 주문도 동시에 여러 개 → 묶인 현금이 현금을 넘지 않음
const st2 = (await A({ action: 'state', roomId })).b;
const price2 = st2.market.bars[sym][st2.room.day].open;
const cash2 = 1_000_000 - spentOf(st2.myTrades ?? []);
const q2 = Math.floor(cash2 / 2 / Math.round(price2 * 0.9)) + 1;
const ords = await Promise.all([1, 2, 3, 4].map(() => A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: q2, limit: Math.round(price2 * 0.9), reqId: randomUUID() })));
ok('예약 사기를 동시에 4번 → 많아야 한 번만 걸림', ords.filter((r) => r.s === 200).length <= 1, JSON.stringify(ords.map((r) => r.s)));

await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
