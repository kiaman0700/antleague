// 확인용: 1초 가격 방에서 화면 데이터 크기 (장 끝 무렵)
import { buildView, type GameData } from '../src/engine/engine.js';
import { gzipSync } from 'node:zlib';
const T0 = 1_900_000_000_000;
for (const turn of [60, 90, 180]) {
  const d: GameData = {
    room: { id: 'r', code: 'AAAAAA', seed: 3, salt: 'ab'.repeat(16), status: 'playing', total_days: 10, turn_seconds: turn, day: 2, deadline: T0 + turn * 1000, day_deadline: T0 + turn * 1000, host_id: 'a', version: 12 },
    players: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, room_id: 'r', nickname: id, mode: 'pro' as const, ready: true, ended_day: 1, created_at: String(i), version: 0, last_seen: new Date(T0).toISOString() })),
    trades: [], items: [], orders: [],
  };
  const now = T0 + (turn - 2) * 1000;
  const full = buildView(d, 'a', now);
  const again = buildView(d, 'a', now, full.marketKey, undefined, undefined, { day: 2, from: turn - 3 }); // 시장 데이터 없이, 새 칸만 (보통 매초 요청)
  const live = JSON.stringify(again.live);
  const all = JSON.stringify(again);
  console.log(`하루 ${turn}초: 매초 요청 ${(all.length / 1024).toFixed(1)}KB (압축 ${(gzipSync(all).length / 1024).toFixed(1)}KB), 그중 장중 가격 ${(live.length / 1024).toFixed(1)}KB · 처음 요청(시장 포함) ${(JSON.stringify(full).length / 1024).toFixed(0)}KB`);
}
