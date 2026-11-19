// 실제 서버(/api/game)를 여러 익명 계정으로 호출하는 테스트 도우미
// 사용: node scripts/e2e/three-players.mjs            (로컬: npm run dev 가 켜져 있어야 함)
//       BASE=https://배포주소 node scripts/e2e/cards.mjs  (배포본)
// 키는 .env.local 에서 읽는다 (저장소에 키를 넣지 않음)
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = path.join(ROOT, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error('.env.local 이 없어요. README 의 "로컬 실행"을 먼저 해 주세요.');
  process.exit(1);
}
export const env = Object.fromEntries(
  fs
    .readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

/** 시험 요청 표시 (서버가 비밀 키로 확인 — api/game.ts isTestKey) */
export const TEST_KEY = createHmac('sha256', env.SUPABASE_SECRET_KEY ?? '').update('e2e-test').digest('hex').slice(0, 32);
// (060) 동시 접속: 시험 요청은 '뒤에 숨은 창'으로 보냄 — 같은 시험 회원으로 짧은 간격에 여러 번 로그인해도 서로 '접속 중'으로 걸리지 않게.
// 동시 접속을 시험하는 곳(guestcode)만 '1'(화면이 보이는 요청)을 직접 보냄
export const VIS = '0';

/**
 * 시험 요청 하나. 같은 시험 회원을 다른 곳(사람이 연 브라우저 등)에서 쓰는 중이라 409 concurrent 가 오면
 * 사람처럼 '여기서 접속'(takeOver)을 고르고 한 번 다시 보냄 — 동시 접속 자체를 시험하는 guestcode.mjs 는 이걸 안 씀
 */
export async function apiPost(body, tok) {
  const go = async (b) => {
    const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': VIS, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(b) });
    return { s: r.status, b: await r.json().catch(() => null) };
  };
  let res = await go(body);
  if (res.s === 409 && res.b?.code === 'concurrent' && tok && body?.action !== 'takeOver') {
    await go({ action: 'takeOver' });
    res = await go(body);
  }
  // (규칙 v27) 고르는 날엔 증강을 먼저 — 회원 시험도 첫 보기를 고르고 다시 마감
  if (body?.action === 'endTurn' && res.s === 409 && /증강을 먼저/.test(res.b?.error ?? '')) {
    const st = (await go({ action: 'state', roomId: body.roomId })).b;
    if (st?.aug?.offer) await go({ action: 'pickAug', roomId: body.roomId, aug: st.aug.offer.ids[0] });
    res = await go(body);
  }
  return res;
}

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
    const r = await fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': VIS }, body: JSON.stringify({ action: 'guest' }) }).catch(() => null);
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
  const dead = [];
  for (let k = 0; k < c.tokens.length; k++) {
    const i = (c.next + k) % c.tokens.length;
    if (used.has(i)) continue;
    const { data, error } = await sb.auth.refreshSession({ refresh_token: c.tokens[i] });
    if (error || !data.session) {
      dead.push(i);
      continue;
    }
    c.tokens[i] = data.session.refresh_token;
    c.next = (i + 1) % c.tokens.length;
    saveCache(c);
    used.add(i);
    return data.session.access_token;
  }
  // 게스트 자동 삭제(052, 사흘 동안 활동 없으면 삭제)로 지워진 계정은 목록에서 빼고 새로 만들어 봄
  if (dead.length && !session.retried) {
    c.tokens = c.tokens.filter((_, i) => !dead.includes(i));
    c.next = 0;
    used.clear();
    saveCache(c);
    session.retried = true;
    try {
      return await session();
    } finally {
      session.retried = false;
    }
  }
  throw new Error('테스트 계정이 모자라요 (익명 계정 생성 제한). 잠시 후 다시 실행해 주세요.');
}

/** 테스트 계정 하나 → (body) => {s: 상태코드, b: 응답} */
let lock = Promise.resolve();
/** 방마다 그 방에 요청을 보낸 테스트 계정들 */
const roomUsers = new Map();
export async function user() {
  // 여러 개를 동시에 만들어도 같은 계정을 두 번 고르지 않게 차례로
  const p = lock.then(() => session());
  lock = p.catch(() => {});
  const tok = await p;
  const raw = async (body) => {
    const r = await fetch(BASE + '/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-stockduel-test': TEST_KEY, 'x-stockduel-vis': VIS, authorization: 'Bearer ' + tok },
      body: JSON.stringify(body),
    });
    const res0 = { s: r.status, b: await r.json().catch(() => null) };
    if (res0.s === 409 && res0.b?.code === 'concurrent' && body?.action !== 'takeOver') return apiPost(body, tok);
    return res0;
  };
  // (규칙 v7) 장 전 시간에는 '장 마감'이 막힘 → 테스트에서 날을 넘길 땐 그 방 사람 모두 '준비 완료'를 누른 뒤 다시 마감
  const U = async (body) => {
    if (body?.roomId) {
      if (!roomUsers.has(body.roomId)) roomUsers.set(body.roomId, new Set());
      roomUsers.get(body.roomId).add(raw);
    }
    let res = await raw(body);
    // (규칙 v27) 고르는 날엔 증강을 먼저 골라야 마감 → 테스트는 첫 번째 보기를 고르고 다시
    if (body?.action === 'endTurn' && res.s === 409 && /증강을 먼저/.test(res.b?.error ?? '')) {
      const st = (await raw({ action: 'state', roomId: body.roomId })).b;
      if (st?.aug?.offer) await raw({ action: 'pickAug', roomId: body.roomId, aug: st.aug.offer.ids[0] });
      res = await raw(body);
    }
    if (body?.action === 'endTurn' && res.s === 409 && /장이 열린 뒤/.test(res.b?.error ?? '')) {
      for (const u of roomUsers.get(body.roomId) ?? []) await u({ action: 'preReady', roomId: body.roomId });
      let again = await raw(body);
      if (again.s === 409 && /증강을 먼저/.test(again.b?.error ?? '')) {
        const st = (await raw({ action: 'state', roomId: body.roomId })).b;
        if (st?.aug?.offer) await raw({ action: 'pickAug', roomId: body.roomId, aug: st.aug.offer.ids[0] });
        again = await raw(body);
      }
      return again;
    }
    // (규칙 v14) 첫날에도 장 전 시간 → 지금 가격 거래가 막히면 모두 '준비 완료' 후 다시, 그래도 안 열리면 장이 열릴 때까지 기다림
    if (body?.action === 'trade' && res.s === 409 && /장이 열리지/.test(res.b?.error ?? '')) {
      for (const u of roomUsers.get(body.roomId) ?? []) await u({ action: 'preReady', roomId: body.roomId });
      let again = await raw(body);
      for (let i = 0; i < 4 && again.s === 409 && /장이 열리지/.test(again.b?.error ?? ''); i++) {
        const st = (await raw({ action: 'state', roomId: body.roomId })).b;
        const wait = Math.min(46_000, Math.max(500, (st?.room?.preUntil ?? Date.now()) - Date.now() + 600));
        await new Promise((r) => setTimeout(r, wait));
        again = await raw(body);
      }
      return again;
    }
    return res;
  };
  // 다시 쓰는 계정: 지난 테스트에서 남은 방·대결에서 나옴 (한 사람은 한 방에만 들어갈 수 있어서)
  for (let i = 0; i < 40; i++) {
    const r = (await U({ action: 'resume' })).b;
    if (!r?.roomId) break;
    await U({ action: 'leave', roomId: r.roomId });
  }
  await U({ action: 'queueLeave' });
  U.token = tok; // 실시간 채널 시험용
  U.raw = raw;
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
