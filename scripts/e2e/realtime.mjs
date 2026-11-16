// 실시간 장중 시장: 5초 칸 · 지금 칸까지만 공개 · 거래는 지금 가격 · 장중 속보는 공개 전엔 없음
import { user, ok, done } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [A, B] = await Promise.all([user(), user()]);
const made = await A({ action: 'create', nickname: '실시간A', mode: 'pro', totalDays: 10, turnSeconds: 60, maxPlayers: 2, title: '실시간 테스트' });
ok('1분 방 생성', made.s === 200, made.b?.error ?? '');
const { roomId, code } = made.b;
await B({ action: 'join', code, nickname: '실시간B', mode: 'pro' });
await B({ action: 'ready', roomId, ready: true });
ok('시작', (await A({ action: 'start', roomId })).s === 200);

const state = async (P = A) => (await P({ action: 'state', roomId })).b;
let s = await state();
// 칸 길이: 새 방(v11)은 1초 → 1분 = 60칸 (예전 5초 방은 12칸)
const tickMs = s.live?.tickMs ?? 5000;
ok('장중 데이터가 있음 (1분 = 60칸, 1초 칸)', s.live && tickMs === 1000 && s.live.n === 60, JSON.stringify({ tick: s.live?.tick, n: s.live?.n, tickMs }));
const lens = Object.values(s.live.krw).map((a) => a.length);
ok('모든 종목이 지금 칸까지만', lens.every((l) => l === s.live.tick + 1), `tick=${s.live.tick} lens=${[...new Set(lens)]}`);

await sleep(12_000);
const s2 = await state();
ok('시간이 지나면 칸이 늘어남', s2.live.tick > s.live.tick, `${s.live.tick} → ${s2.live.tick}`);
const expectTick = Math.min(s2.live.n, Math.max(0, Math.floor((s2.serverNow - s2.live.startAt) / (s2.live.tickMs ?? 5000))));
ok('칸 번호 = 서버 시각 기준', s2.live.tick === expectTick, `${s2.live.tick} vs ${expectTick}`);
ok('미래 칸은 없음', Object.values(s2.live.krw).every((a) => a.length === s2.live.tick + 1));

// 거래 가격 = 요청 순간의 칸 가격 (요청 사이 칸이 바뀔 수 있어 앞뒤 칸 중 하나)
const before = await state();
const t = await A({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 1 });
const after = await state();
const cands = new Set([...before.live.krw.CORE.slice(-1), ...after.live.krw.CORE.slice(-2)]);
ok('거래 가격 = 지금 칸 가격', t.s === 200 && cands.has(t.b.price), `price=${t.b?.price} cands=${[...cands]}`);
ok('화면이 보낸 가격 무시', (await A({ action: 'trade', roomId, symbol: 'CORE', side: 'buy', qty: 1, price: 1 })).b?.price > 1);

// 공개된 뉴스 중 오늘 장중 속보는 공개 칸이 지난 것만
const today = after.market?.news?.filter((n) => n.day === after.room.day && n.at != null) ?? [];
ok('오늘 공개된 속보는 모두 공개 칸이 지났음', today.every((n) => after.live.tick >= Math.ceil(n.at * after.live.n)), `${today.length}개`);
// (카드 이름 'fake'(가짜 뉴스 카드)는 내 카드 목록에 있을 수 있음 → 뉴스만 검사)
ok('뉴스에 가짜 여부 표시는 없음', (after.market?.news ?? []).every((n) => !('fake' in n)) && !JSON.stringify(after.live).includes('fake'));

// 상대 화면에도 같은 가격
const sb = await state(B);
ok('두 사람이 같은 장중 가격을 봄', JSON.stringify(sb.live.krw.CORE.slice(0, 3)) === JSON.stringify(after.live.krw.CORE.slice(0, 3)));

done();
