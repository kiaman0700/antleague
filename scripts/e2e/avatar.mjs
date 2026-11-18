// 프로필 사진: 기본 → 프리셋, 잠긴 사진·없는 id 는 서버가 거절
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { BASE, ok, done, TEST_KEY } from './lib.mjs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const post = async (body, tok) => { const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) }); return { s: r.status, b: await r.json().catch(() => null) }; };
const m = JSON.parse(fs.readFileSync('scripts/e2e/.members.json', 'utf8')).socialC;
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await c.auth.signInWithPassword({ email: (await post({ action: 'loginEmail', username: m.u })).b.email, password: m.pw });
const U = (b) => post(b, data.session.access_token);
ok('처음엔 기본 사진', ((await U({ action: 'profile' })).b.profile.avatar ?? 'default') === 'default');
ok('누구나 쓰는 사진으로 바꾸기', (await U({ action: 'updateProfile', avatar: 'antred' })).s === 200 && (await U({ action: 'profile' })).b.profile.avatar === 'antred');
// 이 계정이 아직 못 딴 업적으로 잠긴 사진을 고름 (시험 계정도 실제 대결로 업적을 딸 수 있어서 고정해 두면 틀림)
const { AVATARS } = await import('../../src/game/avatars.ts').catch(() => ({ AVATARS: null }));
const prof = (await U({ action: 'profile' })).b;
const have = new Set(Object.keys(prof.badges ?? {}));
const lockedId = AVATARS ? AVATARS.find((a) => a.need && !have.has(a.need))?.id : 'phoenix';
const locked = await U({ action: 'updateProfile', avatar: lockedId });
ok('업적 없이 잠긴 사진은 거절 (서버 확인)', locked.s === 403, `${lockedId}: ${locked.b?.error}`);
const bad = await U({ action: 'updateProfile', avatar: '<script>' });
ok('없는 사진 id 거절', bad.s === 400);
await U({ action: 'updateProfile', avatar: 'default' });
done();
