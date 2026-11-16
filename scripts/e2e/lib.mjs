// 실제 서버(/api/game)를 여러 익명 계정으로 호출하는 테스트 도우미
// 사용: node scripts/e2e/three-players.mjs            (로컬: npm run dev 가 켜져 있어야 함)
//       BASE=https://배포주소 node scripts/e2e/cards.mjs  (배포본)
// 키는 .env.local 에서 읽는다 (저장소에 키를 넣지 않음)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = path.join(ROOT, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error('.env.local 이 없어요. README 의 "로컬 실행"을 먼저 해 주세요.');
  process.exit(1);
}
const env = Object.fromEntries(
  fs
    .readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

export const BASE = (process.env.BASE ?? 'http://localhost:5173').replace(/\/$/, '');

/**
 * 테스트 계정: 익명 계정은 IP 당 시간마다 만들 수 있는 수가 제한돼 있어서,
 * 만든 계정을 .accounts.json(깃에 안 올라감)에 저장해 돌려 가며 다시 씀. 모자라면 새로 만듦
 */
const CACHE = path.join(ROOT, 'scripts/e2e/.accounts.json');
const POOL_MAX = 80;
const loadCache = () => {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return { next: 0, tokens: [] };
  }
};
const saveCache = (c) => fs.writeFileSync(CACHE, JSON.stringify(c));
const used = new Set();

async function session() {
  const c = loadCache();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  // 저장된 계정이 적으면 새로 만들어 봄 (제한에 걸리면 저장된 것 재사용)
  if (c.tokens.length < POOL_MAX) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (!error) {
      c.tokens.push(data.session.refresh_token);
      saveCache(c);
      used.add(c.tokens.length - 1);
      return data.session.access_token;
    }
    // 익명 로그인이 막히면 게임과 같은 대체 경로(서버 손님 계정)로
    const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'guest' }) }).catch(() => null);
    if (r?.ok) {
      const g = await r.json();
      const { data: d2, error: e2 } = await sb.auth.signInWithPassword(g);
      if (!e2 && d2.session) {
        c.tokens.push(d2.session.refresh_token);
        saveCache(c);
        used.add(c.tokens.length - 1);
        return d2.session.access_token;
      }
    }
    if (!c.tokens.length) throw error;
  }
  // 이번 실행에서 아직 안 쓴 계정을 차례로 (다 썼으면 처음부터 다시 — 테스트마다 새 방을 쓰므로 괜찮음)
  if (used.size >= c.tokens.length) used.clear();
  for (let k = 0; k < c.tokens.length; k++) {
    const i = (c.next + k) % c.tokens.length;
    if (used.has(i)) continue;
    const { data, error } = await sb.auth.refreshSession({ refresh_token: c.tokens[i] });
    if (error || !data.session) continue;
    c.tokens[i] = data.session.refresh_token;
    c.next = (i + 1) % c.tokens.length;
    saveCache(c);
    used.add(i);
    return data.session.access_token;
  }
  throw new Error('테스트 계정이 모자라요 (익명 계정 생성 제한). 잠시 후 다시 실행해 주세요.');
}

/** 테스트 계정 하나 → (body) => {s: 상태코드, b: 응답} */
let lock = Promise.resolve();
export async function user() {
  // 여러 개를 동시에 만들어도 같은 계정을 두 번 고르지 않게 차례로
  const p = lock.then(() => session());
  lock = p.catch(() => {});
  const tok = await p;
  const U = async (body) => {
    const r = await fetch(BASE + '/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => null) };
  };
  // 다시 쓰는 계정: 지난 테스트에서 남은 방·대결에서 나옴 (한 사람은 한 방에만 들어갈 수 있어서)
  for (let i = 0; i < 40; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
  await U({ action: 'queueLeave' });
  return U;
}

let failed = 0;
export const ok = (label, cond, extra = '') => {
  if (!cond) failed++;
  console.log((cond ? '✅' : '❌') + ' ' + label + (extra ? '  ' + extra : ''));
};
export const done = () => {
  console.log(failed ? `\n❌ ${failed}개 실패` : '\n✅ 모두 통과');
  process.exit(failed ? 1 : 0);
};
console.log(`대상 서버: ${BASE}\n`);
