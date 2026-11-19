// 증강(규칙 v27, design/augments-v27.md): 실제 서버로 고르기·다시 뽑기·동시 요청·정보가 새지 않음·카드 거절·결과 공개
import { user, ok, done } from './lib.mjs';

const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: '증강방장', mode: 'easy', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '증강 시험' });
ok('방 만들기', made.s === 200, made.b?.error);
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: '증강손님', mode: 'easy' });
await B({ action: 'ready', roomId, ready: true });
ok('시작', (await A({ action: 'start', roomId })).s === 200);

let a = (await A({ action: 'state', roomId })).b;
let b = (await B({ action: 'state', roomId })).b;
ok('새 방은 규칙 v27 이상', (a.room.rulesVersion ?? 0) >= 27, String(a.room.rulesVersion));
ok('첫날 내 보기 3개', a.aug?.offer?.ids?.length === 3, JSON.stringify(a.aug));
const mineIds = a.aug.offer.ids;
ok('상대 화면엔 내 보기가 없음', !mineIds.some((id) => JSON.stringify(b).includes(`"${id}"`) && !b.aug.offer.ids.includes(id)));
{
  const t = JSON.stringify(a);
  const i = t.search(/"salt"|"seed":[1-9]/);
  ok('화면 데이터에 salt·seed 없음', i < 0, i < 0 ? '' : t.slice(Math.max(0, i - 80), i + 40));
}

ok('카드 사기는 거절 (증강 판)', (await A({ action: 'buyItem', roomId, kind: 'scout' })).s === 409);
ok('보기에 없는 증강은 거절', (await A({ action: 'pickAug', roomId, aug: 'zzz' })).s === 400);
ok('없는 칸 다시 뽑기 거절', (await A({ action: 'rerollAug', roomId, slot: 5 })).s === 400);

// 같은 칸 다시 뽑기를 동시에 여러 번 → 한 번만
await Promise.all([1, 2, 3].map(() => A({ action: 'rerollAug', roomId, slot: 0 })));
a = (await A({ action: 'state', roomId })).b;
ok('같은 칸 동시 다시 뽑기는 한 번만 (칸 0 끝)', a.aug.offer.canReroll[0] === false && a.aug.offer.ids[1] === mineIds[1] && a.aug.offer.ids[2] === mineIds[2], JSON.stringify(a.aug.offer));

// 고르기를 동시에 다른 것으로 두 번 → 하나만
const ids = a.aug.offer.ids;
await Promise.all([A({ action: 'pickAug', roomId, aug: ids[0] }), A({ action: 'pickAug', roomId, aug: ids[1] })]);
a = (await A({ action: 'state', roomId })).b;
ok('동시에 두 개 골라도 하나만', a.aug.mine.length === 1 && ids.slice(0, 2).includes(a.aug.mine[0].id), JSON.stringify(a.aug.mine));
ok('고른 뒤엔 보기 없음', a.aug.offer === null);
b = (await B({ action: 'state', roomId })).b;
ok('상대 화면엔 내 증강 이름이 없음', !JSON.stringify(b).includes(`"${a.aug.mine[0].id}"`) || b.aug.mine.some((x) => x.id === a.aug.mine[0].id) || b.aug.offer?.ids.includes(a.aug.mine[0].id));

// B 는 안 고르고 마감 시도 → 거절
await B({ action: 'preReady', roomId });
await A({ action: 'preReady', roomId });
await new Promise((r) => setTimeout(r, 1500));
const bEnd = await B.raw({ action: 'endTurn', roomId });
ok('사람은 증강을 고르기 전 마감 불가', bEnd.s === 409 && /증강/.test(bEnd.b?.error ?? ''), bEnd.b?.error);

// 둘 다 끝까지 기권 → 결과에 모두의 증강
await A({ action: 'leave', roomId });
const fin = (await B({ action: 'state', roomId })).b;
ok('끝난 판 결과에 모두의 증강 공개', !!fin.final?.augs && Object.keys(fin.final.augs).length === 2, JSON.stringify(fin.final?.augs ?? null).slice(0, 200));
done();
