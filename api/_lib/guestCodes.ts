/**
 * 게스트 이어하기 코드 (DB 051, design/onboarding.md)
 * - 계속 쓰는 코드: 새로 받기 전까지 같은 코드. 본인(그 게스트)은 언제든 다시 봄 → 서버는 코드를 암호화(AES-256-GCM)해 보관
 * - 찾기는 HMAC(서버 비밀 키) — 코드 원문·해시를 그대로 찾는 데 쓰지 않음
 * - 불러오기: 코드가 맞고 그 계정이 아직 게스트(아이디 없음)일 때만, 서버가 임시 로그인 정보를 만들어 돌려줌
 *   → 그 브라우저가 로그인하면 더 새 세션이라 예전 기기는 끊김(051 session_check)
 * - 회원(아이디 있음) 계정은 절대 코드로 못 엶. 가입하면 코드는 지움
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { GameError } from '../../src/engine/engine.js';

const SECRET = () => process.env.SUPABASE_SECRET_KEY ?? 'dev';
/** 헷갈리는 글자(I·O·0·1) 뺀 32글자 → 12자리 = 60비트 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 회원 로그인 주소(u.stockduel.invalid)와 다른 도메인 — 화면이 '게스트였는지'를 주소로 가름
export const GUEST_DOMAIN = 'g.stockduel.invalid';

/** 사람이 친 코드를 비교용으로 (대문자, 글자·숫자만) */
export const normCode = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
const shown = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
const lookup = (c: string) => createHmac('sha256', SECRET()).update('guest-code:' + c).digest('hex');
const key = () => createHash('sha256').update(SECRET() + ':guest-code-enc').digest();

function encrypt(c: string) {
  const iv = randomBytes(12);
  const ci = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([ci.update(c, 'utf8'), ci.final()]);
  return Buffer.concat([iv, ci.getAuthTag(), ct]).toString('base64');
}
function decrypt(s: string): string | null {
  try {
    const b = Buffer.from(s, 'base64');
    const de = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    de.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([de.update(b.subarray(28)), de.final()]).toString('utf8');
  } catch {
    return null;
  }
}
function newCode() {
  let c = '';
  for (let i = 0; i < 12; i++) c += ALPHABET[randomInt(ALPHABET.length)];
  return c;
}

async function isMember(sb: SupabaseClient, uid: string) {
  const r = await sb.from('profiles').select('username').eq('user_id', uid).maybeSingle();
  if (r.error) throw new GameError('잠시 뒤에 다시 해 주세요.', 503);
  return !!(r.data as { username?: string | null } | null)?.username;
}

/** 내 게스트 코드 보기 (없으면 만듦) · renew 면 새 코드로 바꿈(예전 코드는 못 씀). 회원은 불가 */
export async function guestCode(sb: SupabaseClient, uid: string, renew: boolean): Promise<{ code: string }> {
  if (await isMember(sb, uid)) throw new GameError('회원은 같은 아이디로 로그인하면 이어져요.', 403);
  if (!renew) {
    const r = await sb.from('guest_codes').select('code_enc').eq('user_id', uid).maybeSingle();
    if (r.error) throw new GameError('지금은 코드를 볼 수 없어요. 잠시 뒤에 다시 해 주세요.', 503);
    const c = r.data ? decrypt((r.data as { code_enc: string }).code_enc) : null;
    if (c) return { code: shown(c) };
  }
  for (let i = 0; i < 3; i++) {
    const c = newCode();
    const up = await sb.from('guest_codes').upsert({ user_id: uid, code_hmac: lookup(c), code_enc: encrypt(c), created_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (!up.error) return { code: shown(c) };
    if (!/duplicate|unique/i.test(up.error.message)) break;
  }
  throw new GameError('코드를 만들지 못했어요. 잠시 뒤에 다시 해 주세요.', 503);
}

/** 가입해서 회원이 되면 게스트 코드는 지움 (회원 계정을 코드로 열 수 없게) */
export async function dropGuestCode(sb: SupabaseClient, uid: string) {
  await sb.from('guest_codes').delete().eq('user_id', uid);
}

const ipHash = (ip: string) => createHmac('sha256', SECRET()).update('guest-code-ip:' + ip).digest('hex').slice(0, 32);
const FAIL = '코드가 맞지 않아요. 다시 확인해 주세요.';

/**
 * 코드로 그 게스트 불러오기 (로그인 없이) → 그 계정의 임시 로그인 정보.
 * 실패는 늘 같은 문구. IP 당 10분 5번 실패하면 잠깐 막음(DB 로 셈 — 서버가 여러 대여도)
 */
export async function guestResume(sb: SupabaseClient, ip: string, raw: unknown): Promise<{ email: string; password: string }> {
  const h = ipHash(ip);
  const since = new Date(Date.now() - 600_000).toISOString();
  const fails = await sb.from('guest_code_fails').select('id', { count: 'exact', head: true }).eq('ip_hash', h).gte('created_at', since);
  if (fails.error && /guest_code_fails/.test(fails.error.message)) throw new GameError('지금은 코드로 불러올 수 없어요.', 503);
  if ((fails.count ?? 0) >= 5) throw new GameError('여러 번 틀려서 잠깐 막혔어요. 10분 뒤에 다시 해 주세요.', 429);
  const fail = async () => {
    await sb.from('guest_code_fails').insert({ ip_hash: h });
    // 하루 지난 기록은 정리
    await sb.from('guest_code_fails').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
    return new GameError(FAIL, 404);
  };
  const c = normCode(raw);
  if (c.length !== 12 || [...c].some((ch) => !ALPHABET.includes(ch))) throw await fail();
  const r = await sb.from('guest_codes').select('user_id').eq('code_hmac', lookup(c)).maybeSingle();
  if (r.error) throw new GameError('잠시 뒤에 다시 해 주세요.', 503);
  const uid = (r.data as { user_id: string } | null)?.user_id;
  if (!uid) throw await fail();
  // 그사이 가입해서 회원이 됐으면 코드로는 못 엶 (코드도 지움)
  if (await isMember(sb, uid)) {
    await dropGuestCode(sb, uid);
    throw await fail();
  }
  const u = await sb.auth.admin.getUserById(uid);
  if (u.error || !u.data.user) throw await fail();
  const password = randomBytes(24).toString('base64url');
  // 익명 계정이면 로그인할 수 있게 무작위 가짜 주소를 붙임 (메일은 가지 않음), 이미 주소가 있으면 비밀번호만 새로
  const email = u.data.user.email || `g_${randomBytes(10).toString('hex')}@${GUEST_DOMAIN}`;
  const up = await sb.auth.admin.updateUserById(uid, u.data.user.email ? { password } : { email, password, email_confirm: true });
  if (up.error) throw new GameError('불러오지 못했어요. 잠시 뒤에 다시 해 주세요.', 503);
  return { email, password };
}
