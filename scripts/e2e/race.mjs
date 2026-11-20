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

await new Promise((r) => setTimeout(r, 21_000)); // 앞 시험의 요청 제한이 풀리게
// 예약 체결과 직접 거래가 같은 순간 — 예약(현금의 절반 넘게)이 닿는 순간 직접 사기(절반 넘게)·상태 요청을 함께 → 쓴 돈이 현금을 넘지 않음 (073 fill_order)
for (const o of (((await A({ action: 'state', roomId })).b.myOrders) ?? []).filter((x) => x.status === 'open')) await A({ action: 'cancelOrder', roomId, orderId: o.id });
for (let round = 1; round <= 2; round++) {
  if (round > 1) await new Promise((r) => setTimeout(r, 21_000)); // 요청 제한(20초 40번) 넘지 않게
  const s3 = (await A({ action: 'state', roomId })).b;
  const held3 = (s3.myTrades ?? []).filter((t) => t.symbol === sym).reduce((s, t) => s + (t.side === 'buy' ? 1 : -1) * Number(t.qty), 0);
  if (held3 > 0) await A({ action: 'trade', roomId, symbol: sym, side: 'sell', qty: held3, reqId: randomUUID() });
  const s4 = (await A({ action: 'state', roomId })).b;
  const cash4 = 1_000_000 - spentOf(s4.myTrades ?? []);
  const live = s4.live?.krw?.[sym];
  const p4 = Array.isArray(live) && live.length ? live[live.length - 1] : s4.market.bars[sym][s4.room.day].open;
  // 지금 가격 바로 아래 — 가격이 조금만 흔들려도 곧 닿음
  const lim = Math.floor(p4 * 0.999);
  const q4 = Math.floor(cash4 / 2 / lim) + 1;
  const placed = await A({ action: 'placeOrder', roomId, symbol: sym, side: 'buy', qty: q4, limit: lim, reqId: randomUUID() });
  if (placed.s !== 200) { ok(`${round}회차 예약 넣기`, false, JSON.stringify(placed.b)); continue; }
  let burst = [];
  for (let k = 0; k < 8; k++) {
    burst = await Promise.all([
      A({ action: 'state', roomId }),
      A({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: q4, reqId: randomUUID() }),
      A({ action: 'state', roomId }),
    ]);
    const now = (await A({ action: 'state', roomId })).b;
    if (!(now.myOrders ?? []).some((x) => x.status === 'open')) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  const s5 = (await A({ action: 'state', roomId })).b;
  const spent5 = spentOf(s5.myTrades ?? []);
  ok(`예약 체결 겹침 ${round}회차: 쓴 돈이 시작 현금을 넘지 않음`, spent5 <= 1_000_000, `쓴 돈 ${Math.round(spent5)} · ${JSON.stringify(burst.map((r) => r.s))}`);
  for (const o of (s5.myOrders ?? []).filter((x) => x.status === 'open')) {
    const c = await A({ action: 'cancelOrder', roomId, orderId: o.id });
    ok(`${round}회차: 남은 예약 취소 응답은 200 또는 이미 체결 409`, c.s === 200 || c.s === 409, String(c.s));
  }
}

await A({ action: 'leave', roomId });
await B({ action: 'leave', roomId });
done();
