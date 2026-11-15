import { user, ok, done } from './lib.mjs';

const [A, B, C] = await Promise.all([user(), user(), user()]);
const made = await A({ action: 'create', nickname: 'A', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 3, title: '카드 테스트' });
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: 'B', mode: 'pro' });
await C({ action: 'join', code, nickname: 'C', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
await C({ action: 'ready', roomId, ready: true });
ok('3인 게임 시작', (await A({ action: 'start', roomId })).s === 200);

const st = async (P) => (await P({ action: 'state', roomId })).b;
const ids = Object.fromEntries((await st(A)).players.map((p) => [p.nickname, p.id]));
const inv = async (P) => (await st(P)).myItems;

// 시작 카드 때문에 보유 한도(3장)를 넘지 않도록: 필요한 카드 사기 전에 가진 카드 수 확인
async function ensureCard(P, name, kind) {
  let my = await inv(P);
  if ((my.inventory[kind] ?? 0) > 0) return true;
  // 자리가 없으면 쓸 수 있는 정보 카드를 하나 써서 비움
  if (my.total >= 3) {
    for (const k of ['detector', 'analyst', 'scout', 'paper', 'bonus']) {
      if ((my.inventory[k] ?? 0) > 0) {
        const r = await P({ action: 'useItem', roomId, kind: k, payload: k === 'scout' ? { symbol: 'CORE' } : {} });
        if (r.s === 200) break;
      }
    }
  }
  const r = await P({ action: 'buyItem', roomId, kind });
  ok(`${name}: ${kind} 구매`, r.s === 200, r.b?.error ?? '');
  return r.s === 200;
}

// 1) 용돈 봉투는 상점 구매 불가
const bonusBuy = await A({ action: 'buyItem', roomId, kind: 'bonus' });
ok('용돈 봉투 상점 구매 거절', bonusBuy.s === 400, bonusBuy.b?.error);

// 2) 차트 분석: 종목 없으면 거절, 있으면 결과
if (await ensureCard(A, 'A', 'scout')) {
  const noSym = await A({ action: 'useItem', roomId, kind: 'scout' });
  ok('차트 분석: 종목 없으면 거절', noSym.s === 400, noSym.b?.error);
  const use = await A({ action: 'useItem', roomId, kind: 'scout', payload: { symbol: 'NEOT' } });
  ok('차트 분석 사용', use.s === 200, use.b?.error ?? '');
  const v = await st(A);
  ok('차트 분석 결과가 내 화면에만', v.reveals.scout?.symbol === 'NEOT' && typeof v.reveals.scout.up === 'boolean', JSON.stringify(v.reveals.scout));
  const vb = await st(B);
  ok('다른 사람 화면엔 결과 없음', !vb.reveals.scout);
}

// 3) B 가 반사 거울 보유 (방패가 있으면 방패가 먼저 막으므로 확인)
const bInv = await inv(B);
const bHasShield = (bInv.inventory.shield ?? 0) > 0;
const mirrorReady = await ensureCard(B, 'B', 'mirror');

// 4) A 가 B 에게 거래 정지 → (방패 없으면) 거울이 A 에게 되돌림
if (mirrorReady && (await ensureCard(A, 'A', 'freeze'))) {
  const atk = await A({ action: 'useItem', roomId, kind: 'freeze', payload: { target: ids.B } });
  ok('A → B 거래 정지 사용', atk.s === 200, atk.b?.error ?? '');
}

// 5) C 에게 정보 차단 (B 가 쏨)
const blackoutReady = await ensureCard(B, 'B', 'blackout');
if (blackoutReady) {
  const r = await B({ action: 'useItem', roomId, kind: 'blackout', payload: { target: ids.C } });
  ok('B → C 정보 차단 사용', r.s === 200, r.b?.error ?? '');
}

// 다음 날로
for (const P of [A, B, C]) await P({ action: 'endTurn', roomId });
const vA = await st(A);
const vB = await st(B);
const vC = await st(C);
ok('2일차로 진행', vA.room.day === 1);

if (mirrorReady) {
  if (bHasShield) console.log('ℹ️ B 가 시작 카드로 방패를 갖고 있어서 방패가 먼저 막음 (규칙대로)');
  const aFrozen = vA.effectsToday.includes('freeze');
  const bFrozen = vB.effectsToday.includes('freeze');
  ok('반사 거울: 공격이 B 대신 A 에게', bHasShield ? !bFrozen : aFrozen && !bFrozen, `A=${vA.effectsToday} B=${vB.effectsToday}`);
  const tr = await A({ action: 'trade', roomId, symbol: 'NEOT', side: 'buy', qty: 1 });
  ok('A 는 거래 정지 상태라 거래 불가', bHasShield ? true : tr.s === 409, tr.b?.error ?? '');
  console.log('   A 알림:', vA.notices.map((n) => n.text).join(' / '));
  console.log('   B 알림:', vB.notices.map((n) => n.text).join(' / '));
}
if (blackoutReady) {
  const cBlocked = vC.reveals.blackout;
  const cShield = vC.notices.some((n) => n.text.includes('방패') || n.text.includes('거울'));
  ok('정보 차단: C 는 오늘 뉴스가 안 보임', cShield || (cBlocked && !vC.market.news.some((n) => n.day === 1)), `blackout=${cBlocked}`);
  ok('A 는 오늘 뉴스가 보임', vA.market.news.some((n) => n.day === 1));
}

// 6) 용돈 봉투: 가진 사람이 있으면 써보기
for (const [name, P] of [
  ['A', A],
  ['B', B],
  ['C', C],
]) {
  const v = await st(P);
  if ((v.myItems.inventory.bonus ?? 0) > 0) {
    const before = v.players.find((p) => p.nickname === name).equity;
    const r = await P({ action: 'useItem', roomId, kind: 'bonus' });
    const after = (await st(P)).players.find((p) => p.nickname === name).equity;
    ok(`${name}: 용돈 봉투 사용 → +50만`, r.s === 200 && after - before === 500000, `${before} → ${after}`);
    break;
  }
}

done();
