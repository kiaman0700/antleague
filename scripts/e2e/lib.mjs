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

/** 새 익명 계정 하나 → (body) => {s: 상태코드, b: 응답} */
export async function user() {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const tok = data.session.access_token;
  return async (body) => {
    const r = await fetch(BASE + '/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok },
      body: JSON.stringify(body),
    });
    return { s: r.status, b: await r.json().catch(() => null) };
  };
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
