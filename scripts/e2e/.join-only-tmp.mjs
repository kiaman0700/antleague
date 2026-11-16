// 임시: 방에 들어가 준비만 하고 30초 기다렸다 나감
import { user } from './lib.mjs';
const B = await user();
const j = await B({ action: 'join', code: process.argv[2], nickname: '테스트봇', mode: 'pro' });
console.log('join', j.s, j.b?.error ?? '');
await B({ action: 'ready', roomId: j.b.roomId, ready: true });
await new Promise((r) => setTimeout(r, 30000));
await B({ action: 'leave', roomId: j.b.roomId });
console.log('left');
