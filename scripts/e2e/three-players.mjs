import { user, ok, done } from './lib.mjs';

const [A, B, C, D] = await Promise.all([user(), user(), user(), user()]);

const made = await A({ action: 'create', nickname: '철수', mode: 'pro', totalDays: 10, turnSeconds: 180, maxPlayers: 3, title: '비밀 3인방', isPrivate: true, password: 'tiger1234' });
ok('A 비밀방(3인) 생성', made.s === 200, JSON.stringify(made.b));
const { roomId, code } = made.b;
// 새 방은 최신 규칙으로 저장돼야 함 (DB 제한 때문에 몰래 v1 규칙으로 바뀌지 않는지)
const st0 = (await A({ action: 'state', roomId })).b;
const { CURRENT_RULES_VERSION } = await import('../../src/engine/engine.ts').catch(() => ({ CURRENT_RULES_VERSION: null }));
ok('새 방은 최신 규칙 버전', st0?.room?.rulesVersion >= 11 && (CURRENT_RULES_VERSION === null || st0.room.rulesVersion === CURRENT_RULES_VERSION), String(st0?.room?.rulesVersion));

const list = await D({ action: 'rooms' });
const row = list.b.find((r) => r.id === roomId);
ok('방 목록에 보임(🔒, 1/3)', row && row.isPrivate && row.players === 1 && row.maxPlayers === 3, JSON.stringify(row));
ok('방 목록에 코드·비밀번호 없음', row && !('code' in row) && !JSON.stringify(list.b).includes('tiger') && !JSON.stringify(list.b).includes(code));

const bad = await B({ action: 'joinRoom', roomId, nickname: '영희', mode: 'easy', password: 'wrong' });
ok('틀린 비밀번호 거절', bad.s === 403, bad.b?.error);
const noPw = await B({ action: 'joinRoom', roomId, nickname: '영희', mode: 'easy' });
ok('비밀번호 없이 목록 입장 거절', noPw.s === 403);
const good = await B({ action: 'joinRoom', roomId, nickname: '영희', mode: 'easy', password: 'tiger1234' });
ok('맞는 비밀번호로 입장', good.s === 200);

const byCode = await C({ action: 'join', code, nickname: '민수', mode: 'pro' });
ok('초대 코드로는 비밀번호 없이 입장', byCode.s === 200);

const full = await D({ action: 'join', code, nickname: '지민', mode: 'pro' });
ok('4번째는 가득 차서 거절', full.s === 409, full.b?.error);

// 무차별 대입 잠금 (D 계정으로)
let last;
for (let i = 0; i < 6; i++) last = await D({ action: 'joinRoom', roomId, nickname: '지민', mode: 'pro', password: 'guess' + i });
ok('비밀번호 반복 실패 시 잠금(429)', last.s === 429, last.b?.error);

const early = await A({ action: 'start', roomId });
ok('아직 준비 안 됐으면 시작 불가', early.s === 409, early.b?.error);
await B({ action: 'ready', roomId, ready: true });
await C({ action: 'ready', roomId, ready: true });
const start = await A({ action: 'start', roomId });
ok('모두 준비 후 시작', start.s === 200);

for (const [P, sym] of [
  [A, 'CORE'],
  [B, 'NEOT'],
  [C, 'KIDX'],
]) {
  // 시작 가격이 판마다 절반~두 배라 비싼 종목 5주는 시작 돈을 넘을 수 있음 → 1주
  const t = await P({ action: 'trade', roomId, symbol: sym, side: 'buy', qty: 1 });
  ok('거래 ' + sym, t.s === 200, t.b?.error);
}
await A({ action: 'endTurn', roomId });
await B({ action: 'endTurn', roomId });
const mid = await A({ action: 'state', roomId });
ok('3명 중 2명만 마감 → 아직 1일차', mid.b.room.day === 0);
await C({ action: 'endTurn', roomId });
const after = await A({ action: 'state', roomId });
ok('3명 모두 마감 → 2일차', after.b.room.day === 1, 'players=' + after.b.players.map((p) => p.nickname + ':' + p.equity).join(', '));
ok('A 화면에 B·C 거래 없음', after.b.myTrades.length === 1 && after.b.myTrades.every((t) => t.symbol === 'CORE'));

// 방해 카드 대상 지정 (가진 카드가 있으면)
const inv = after.b.myItems.inventory;
const attack = ['freeze', 'fee', 'fake'].find((k) => inv[k] > 0);
if (attack) {
  const noTarget = await A({ action: 'useItem', roomId, kind: attack, payload: attack === 'fake' ? { symbol: 'NEOT', tone: 'good' } : {} });
  ok('3인에서 대상 없이 방해 카드 거절', noTarget.s === 400, noTarget.b?.error);
  const hit = await A({ action: 'useItem', roomId, kind: attack, payload: { target: after.b.players.find((p) => p.nickname === '민수').id, ...(attack === 'fake' ? { symbol: 'NEOT', tone: 'good' } : {}) } });
  ok('대상 지정해서 ' + attack + ' 사용', hit.s === 200, hit.b?.error ?? '');
} else console.log('ℹ️ A가 방해 카드를 안 가져서 대상 지정 실전 테스트는 생략 (단위 테스트로 검증됨)');

const listAfter = await D({ action: 'rooms' });
ok('시작한 방은 목록에서 사라짐', !listAfter.b.some((r) => r.id === roomId));

done();
