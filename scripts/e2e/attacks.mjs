// 방해 카드 실전: 몰아치기(같은 날 한 사람에게 두 번째 방해는 무효) · 반사 거울 · 알림 문구
import { user, ok, done } from './lib.mjs';

async function room3() {
  const [A, B, C] = [await user(), await user(), await user()];
  const made = await A({ action: 'create', nickname: 'A', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 3, title: '방해 테스트' });
  const { roomId, code } = made.b;
  await B({ action: 'join', code, nickname: 'B', mode: 'pro' });
  await C({ action: 'join', code, nickname: 'C', mode: 'pro' });
  await B({ action: 'ready', roomId, ready: true });
  await C({ action: 'ready', roomId, ready: true });
  await A({ action: 'start', roomId });
  const st = async (P) => (await P({ action: 'state', roomId })).b;
  const ids = Object.fromEntries((await st(A)).players.map((p) => [p.nickname, p.id]));
  // 카드 자리 만들기: 쓸 수 있는 정보·보너스 카드를 써서 비움
  const free = async (P) => {
    for (const k of ['bonus', 'detector', 'analyst', 'paper', 'scout']) {
      const my = (await st(P)).myItems;
      if (my.total < 3) return;
      if ((my.inventory[k] ?? 0) > 0) await P({ action: 'useItem', roomId, kind: k, payload: k === 'scout' ? { symbol: 'CORE' } : {} });
    }
  };
  const buy = async (P, kind) => {
    await free(P);
    const r = await P({ action: 'buyItem', roomId, kind });
    return r.s === 200 || ((await st(P)).myItems.inventory[kind] ?? 0) > 0;
  };
  const nextDay = async () => {
    for (const P of [A, B, C]) await P({ action: 'endTurn', roomId });
    await st(A);
  };
  return { A, B, C, roomId, ids, st, buy, nextDay };
}

// ---- 몰아치기 ----
{
  const { A, B, C, roomId, ids, st, buy, nextDay } = await room3();
  ok('A 거래 정지 준비', await buy(A, 'freeze'));
  ok('B 수수료 폭탄 준비', await buy(B, 'fee'));
  const a = await A({ action: 'useItem', roomId, kind: 'freeze', payload: { target: ids.C } });
  ok('A → C 방해', a.s === 200, a.b?.error ?? '');
  const feeBefore = (await st(B)).myItems.inventory.fee ?? 0;
  const b = await B({ action: 'useItem', roomId, kind: 'fee', payload: { target: ids.C } });
  ok('B → C 두 번째 방해는 거절 (누가 썼는지는 안 알려 줌)', b.s === 409 && /이미 누군가/.test(b.b?.error ?? '') && !/A/.test(b.b?.error ?? ''), b.b?.error ?? '');
  ok('B 의 카드는 그대로 남음', ((await st(B)).myItems.inventory.fee ?? 0) === feeBefore && feeBefore > 0);
  const bOther = await B({ action: 'useItem', roomId, kind: 'fee', payload: { target: ids.A } });
  ok('B 는 다른 사람(A)에게는 쓸 수 있음', bOther.s === 200, bOther.b?.error ?? '');
  await nextDay();
  const c = await st(C);
  ok('C 는 수수료 폭탄을 받지 않음', !c.effectsToday.includes('fee'), JSON.stringify(c.effectsToday));
  ok('C 알림에 쓴 사람 이름이 없음', !c.notices.some((n) => /A의|A가|A이/.test(n.text)), JSON.stringify(c.notices.map((n) => n.text)));
}

// ---- 반사 거울 ----
{
  const { A, C, roomId, ids, st, buy, nextDay } = await room3();
  const shields = (await st(C)).myItems.inventory.shield ?? 0;
  ok('C 반사 거울 준비', await buy(C, 'mirror'));
  // C 에게 방패가 있으면 첫날 하나로 방패를 소모 (방패가 거울보다 먼저 막음, 하루 한 번 규칙 때문에 다음 날 다시)
  if (shields > 0) {
    ok('A fake 준비', await buy(A, 'fake'));
    const f = await A({ action: 'useItem', roomId, kind: 'fake', payload: { target: ids.C, symbol: 'CORE', tone: 'good' } });
    ok('A → C fake (방패 소모용)', f.s === 200, f.b?.error ?? '');
    await nextDay();
  }
  ok('A blackout 준비', await buy(A, 'blackout'));
  const r = await A({ action: 'useItem', roomId, kind: 'blackout', payload: { target: ids.C } });
  ok('A → C blackout', r.s === 200, r.b?.error ?? '');
  await nextDay();
  const a = await st(A);
  ok('반사된 정보 차단이 A 에게 돌아옴', a.effectsToday.includes('blackout') || a.reveals.blackout === true, JSON.stringify(a.effectsToday));
  ok('A 에게 "방어에 막혀 돌아왔어요" 알림 (상대 카드 종류는 말 안 함)', a.notices.some((n) => n.text.includes('돌아왔어요') && !n.text.includes('반사 거울')), JSON.stringify(a.notices.map((n) => n.text)));
  const c = await st(C);
  ok('C 에게 "누군가의 … 되돌려 보냈어요" 알림 (쓴 사람 이름 없음)', c.notices.some((n) => n.text.includes('누군가의') && n.text.includes('되돌려 보냈어요')), JSON.stringify(c.notices.map((n) => n.text)));
  ok('C 는 정보 차단을 받지 않음', !c.reveals.blackout);
}

done();
