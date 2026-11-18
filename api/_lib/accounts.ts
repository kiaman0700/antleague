/**
 * 회원 계정 (015): 아이디·비밀번호·닉네임 — 이메일은 받지 않음.
 * - 가입: 지금 쓰던 게스트 계정을 그대로 정식 계정으로 바꿈(같은 계정 → 하던 게임·기록 유지)
 * - 로그인: 브라우저가 "아이디@u.stockduel.invalid" 로 비밀번호 로그인 (가짜 주소라 메일은 가지 않음)
 * - 비밀번호를 잊으면 가입 때 받은 복구 코드로 새 비밀번호
 * - 랭킹: 회원끼리 붙은 멀티 대결만 점수(Elo, 시작 1000) 반영 — 게스트와의 판은 전적만
 * 모든 읽기·쓰기는 서버만 (profiles·match_players 는 브라우저 권한 없음)
 */
import { challengerMap } from './challenger.js';
import { dropGuestCode } from './guestCodes.js';
import { createHmac, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanNickname, GameError } from '../../src/engine/engine.js';
import { badgeTier, givesTitle, parseTiered } from '../../src/game/achievements.js';
import { DIAMOND_MIN, ELO_K, ELO_SCALE, isPlaced, MASTER_MIN, PLACEMENT_GAMES, PLACEMENT_MULT } from '../../src/game/tier.js';
import { AVATAR_MAP, canUseAvatar } from '../../src/game/avatars.js';
import { levelBadges } from '../../src/game/missions.js';
import { mySkills } from './skills.js';

export const USER_DOMAIN = 'u.stockduel.invalid';
const USERNAME_RE = /^[a-z0-9_]{4,16}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface Profile {
  user_id: string;
  username: string;
  nickname: string;
  title: string | null;
  rating: number;
  games: number;
  wins: number;
  best_ret: number | null;
  /** 랭킹전으로 점수가 반영된 판 수 (2판까지는 배치) */
  ranked_games?: number;
  /** 프로필 사진 프리셋 id */
  avatar?: string;
  /** 미션 경험치 */
  xp?: number;
}

const hash = (v: string) => {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + scryptSync(v, salt, 32).toString('hex');
};
const check = (v: string, stored: string | null) => {
  if (!stored) return false;
  const [s, h] = stored.split(':');
  if (!s || !h) return false;
  const got = scryptSync(v, Buffer.from(s, 'hex'), 32);
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
};
// 아이디가 없을 때도 같은 시간이 걸리게 비교할 가짜 해시
const DUMMY_HASH = hash('dummy-recovery-code');
/** 가입 때 동의받는 이용약관·개인정보처리방침 판(版) — 화면 src/components/Legal.tsx 의 LEGAL_VERSION 과 같게 */
export const TERMS_VERSION = '2026-11-18';
/** 이 계정의 모든 로그인(다른 기기 포함)을 끊음 — 028 함수가 없으면 조용히 넘어감 */
const revokeSessions = async (sb: SupabaseClient, uid: string) => {
  await sb.rpc('revoke_user_sessions', { target: uid }).then(
    () => {},
    () => {},
  );
};
const newRecovery = () => {
  let c = '';
  for (let i = 0; i < 12; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8);
};
const normRecovery = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

export function cleanUsername(v: unknown): string {
  const u = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(u)) throw new GameError('아이디는 영어 소문자·숫자·밑줄(_)로 4~16자예요.');
  return u;
}
export function cleanNewPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72) throw new GameError('비밀번호는 8~72자로 정해 주세요.');
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) throw new GameError('비밀번호에 영어와 숫자를 함께 넣어 주세요.');
  return v;
}

export async function getProfile(sb: SupabaseClient, uid: string): Promise<Profile | null> {
  let r = await sb.from('profiles').select('user_id, username, nickname, title, rating, games, wins, best_ret, ranked_games, avatar, xp').eq('user_id', uid).maybeSingle();
  if (r.error && /xp/.test(r.error.message)) r = (await sb.from('profiles').select('user_id, username, nickname, title, rating, games, wins, best_ret, ranked_games, avatar').eq('user_id', uid).maybeSingle()) as typeof r; // 035 전
  if (r.error && /ranked_games/.test(r.error.message)) r = (await sb.from('profiles').select('user_id, username, nickname, title, rating, games, wins, best_ret').eq('user_id', uid).maybeSingle()) as typeof r; // 022 전
  if (r.error) return null; // 015 전이면 회원 기능 없음
  return (r.data as Profile | null) ?? null;
}

export async function nicknameFree(sb: SupabaseClient, nickname: string, exceptUid?: string) {
  const r = await sb.from('profiles').select('user_id').ilike('nickname', nickname.replace(/[%_\\]/g, (c) => '\\' + c));
  const rows = (r.data ?? []) as { user_id: string }[];
  return !rows.some((x) => x.user_id !== exceptUid);
}

/** 이 사용자가 얻은 업적 (회원·게스트 모두: 참가한 끝난 대결의 결과에서) */
export async function earnedBadges(sb: SupabaseClient, uid: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  // 레벨 업적 (미션 경험치 — 서버가 올린 profiles.xp 로만)
  const pr = await sb.from('profiles').select('xp').eq('user_id', uid).maybeSingle();
  if (!pr.error && pr.data) for (const id of levelBadges((pr.data as { xp?: number }).xp ?? 0)) out[id] = 1;
  // (051) 튜토리얼: 게임 기초(②)에서 하는 첫 거래·첫 카드(감별기)·철벽 방어(연습봇의 수수료 폭탄을 방패가 막음)는 진짜 업적으로,
  //   4단계를 모두 끝내면 '개미 학교 졸업' (사용자 결정 2026-11-18). 튜토리얼은 브라우저 판이라 서버는 끝낸 기록만 믿음 — 업적은 처음 한 번
  const tut = await sb.from('tutorial_progress').select('done').eq('user_id', uid).maybeSingle();
  const tdone = (!tut.error && (tut.data as { done?: string[] } | null)?.done) || [];
  if (tdone.includes('game')) for (const id of ['first_trade', 'first_card', 'shield']) out[id] = (out[id] ?? 0) + 1;
  if (['home', 'game', 'result', 'growth'].every((c) => tdone.includes(c))) out.tut_grad = 1;
  // (055) 주간 리그: 올라가 본 가장 높은 단계 · 조 1위 횟수 (서버가 정산한 값만)
  const lg = await sb.from('league_tiers').select('best_tier, firsts').eq('user_id', uid).maybeSingle();
  if (!lg.error && lg.data) {
    const { best_tier, firsts } = lg.data as { best_tier: number; firsts: number };
    if (best_tier >= 4) out.league_queen = 1;
    if (best_tier >= 5) out.league_gold = 1;
    if (firsts > 0) out.league_win = firsts;
  }
  const mine = ((await sb.from('players').select('room_id, nickname').eq('user_id', uid).limit(300)).data ?? []) as { room_id: string; nickname: string }[];
  if (!mine.length) return out;
  const nick = new Map(mine.map((m) => [m.room_id, m.nickname]));
  const hist = ((await sb.from('match_history').select('room_id, results').in('room_id', mine.map((m) => m.room_id))).data ?? []) as { room_id: string; results: { nickname: string; badges?: string[] }[] }[];
  for (const h of hist) for (const r of h.results) if (r.nickname === nick.get(h.room_id)) for (const b of r.badges ?? []) out[b] = (out[b] ?? 0) + 1;
  return out;
}

type Body = Record<string, unknown>;

/** 아이디 → 로그인 주소 (로그인 전, 서버만 앎). 없는 아이디도 늘 같은 가짜 주소를 돌려줘 있는지 없는지 티 나지 않게 */
export async function loginEmail(sb: SupabaseClient, b: Body) {
  const u = typeof b.username === 'string' ? b.username.trim().toLowerCase().slice(0, 32) : '';
  const fake = `u_${createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('login-email:' + u).digest('hex').slice(0, 24)}@${USER_DOMAIN}`;
  if (!USERNAME_RE.test(u)) return { email: fake };
  const p = (await sb.from('profiles').select('user_id').eq('username', u).maybeSingle()).data as { user_id: string } | null;
  // 없는 아이디도 같은 조회를 한 번 해서(없는 id) 응답 시간으로 있는지 없는지 티 나지 않게
  const g = await sb.auth.admin.getUserById(p ? p.user_id : randomUUID()).catch(() => ({ data: { user: null } }));
  if (!p) return { email: fake };
  const email = g.data.user?.email;
  return { email: email && email.endsWith('@' + USER_DOMAIN) ? email : fake };
}

/** 지금 비밀번호 확인 (따로 만든 클라이언트로 로그인해 보고, 만든 세션은 바로 끝냄) */
async function verifyPassword(sb: SupabaseClient, uid: string, password: unknown) {
  const bad = () => new GameError('지금 비밀번호가 맞지 않아요.', 403);
  if (typeof password !== 'string' || !password || password.length > 72) throw bad();
  const g = await sb.auth.admin.getUserById(uid);
  const email = g.data.user?.email;
  if (!email) throw bad();
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new GameError('서버 설정이 없어요.', 500);
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await c.auth.signInWithPassword({ email, password });
  if (r.error || r.data.user?.id !== uid) {
    if (r.error && /rate|many/i.test(r.error.message)) throw new GameError('시도가 너무 많아요. 잠시 후 다시 해 주세요.', 429);
    throw bad();
  }
  if (r.data.session) await sb.auth.admin.signOut(r.data.session.access_token, 'local').catch(() => {});
}

export async function accountAct(sb: SupabaseClient, action: string, b: Body, user: { id: string; app_metadata?: Record<string, unknown> | null }, rateLimit: (k: string, n: number, ms: number) => void, leaveSeat?: (roomId: string, playerId: string) => Promise<unknown>): Promise<unknown> {
  const uid = user.id;
  switch (action) {
    case 'signup': {
      rateLimit(uid + ':signup', 5, 600_000);
      if (user.app_metadata?.role === 'admin') throw new GameError('운영자 계정은 회원 가입을 할 수 없어요.');
      if (await getProfile(sb, uid)) {
        // 지난번 가입이 반쯤 끝난 경우(프로필은 넣었는데 계정 전환 전에 끊김): 로그인 주소가 회원 주소가 아니면 남은 프로필을 지우고 다시 가입
        const cur = await sb.auth.admin.getUserById(uid);
        const email = cur.data.user?.email ?? '';
        if (cur.error || email.endsWith('@' + USER_DOMAIN)) throw new GameError('이미 가입한 계정이에요.', 409);
        // 1분 넘게 지난 반쯤 된 프로필만 지움 — 두 번 눌러 동시에 가입 중인 요청의 프로필을 서로 지우지 않게
        const del = await sb.from('profiles').delete().eq('user_id', uid).lt('created_at', new Date(Date.now() - 60_000).toISOString()).select('user_id');
        if (!del.error && !(del.data ?? []).length) throw new GameError('가입을 처리하는 중이에요. 잠시 후 다시 시도해 주세요.', 409);
      }
      // [필수] 세 가지: 만 14세 이상 · 이용약관 · 개인정보 수집·이용 (화면에서 칸을 지워 보내도 여기서 다시 확인)
      if (b.agree14 !== true || b.agreePrivacy !== true || b.agreeTerms !== true) throw new GameError('만 14세 이상 확인, 이용약관 동의, 개인정보 수집·이용 동의가 모두 필요해요.');
      const username = cleanUsername(b.username);
      const password = cleanNewPassword(b.password);
      if (password.toLowerCase().includes(username)) throw new GameError('비밀번호에 아이디를 그대로 넣지 말아 주세요.');
      const nickname = cleanNickname(b.nickname);
      if (!(await nicknameFree(sb, nickname))) throw new GameError('이미 쓰는 닉네임이에요. 다른 닉네임을 써 주세요.', 409);
      const taken = await sb.from('profiles').select('user_id').eq('username', username).maybeSingle();
      if (taken.data) throw new GameError('이미 쓰는 아이디예요.', 409);
      // 1) 프로필을 먼저 넣어 아이디·닉네임을 '예약' (DB 유일 제약 — 동시에 같은 아이디로 가입해도 한 명만)
      const code = newRecovery();
      // 동의한 약관 판(版)과 시험 회원 표시(아이디가 e2e… 로 시작 — 자동 시험용, 공개 랭킹에서 뺌)를 함께 저장. 031 전이면 빼고 저장
      const base = { user_id: uid, username, nickname, recovery_hash: hash(normRecovery(code)) };
      let ins = await sb.from('profiles').insert({ ...base, terms_version: TERMS_VERSION, is_test: /^x?e2e/.test(username) });
      if (ins.error && /terms_version|is_test/.test(ins.error.message)) ins = await sb.from('profiles').insert(base);
      if (ins.error) throw new GameError(/nickname/.test(ins.error.message) ? '이미 쓰는 닉네임이에요.' : /username|duplicate/.test(ins.error.message) ? '이미 쓰는 아이디예요.' : '가입하지 못했어요.', 409);
      // 2) 지금 쓰던 게스트 계정을 정식 계정으로 (같은 계정이라 하던 게임·기록이 그대로).
      //    로그인 주소는 아이디와 상관없는 무작위 값 — 아이디로 남이 미리 주소를 선점하거나 알아낼 수 없게
      const up = await sb.auth.admin.updateUserById(uid, { email: `u_${randomBytes(12).toString('hex')}@${USER_DOMAIN}`, password, email_confirm: true });
      if (up.error) {
        await sb.from('profiles').delete().eq('user_id', uid); // 실패하면 예약 취소
        throw new GameError('가입하지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      }
      // 게스트 이어하기 코드는 지움 — 회원 계정을 코드로 열 수 없게 (051)
      await dropGuestCode(sb, uid).catch(() => {});
      return { ok: true, recoveryCode: code, nickname };
    }

    case 'checkAvailable': {
      // 가입 화면 실시간 중복 확인. 남의 아이디를 마구 알아보는 데 쓰이지 않게 1분에 40번까지
      rateLimit(uid + ':avail', 20, 60_000);
      const out: { username?: 'ok' | 'taken' | 'invalid'; nickname?: 'ok' | 'taken' | 'invalid' } = {};
      if (b.username !== undefined) {
        const u = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
        if (!USERNAME_RE.test(u)) out.username = 'invalid';
        else out.username = (await sb.from('profiles').select('user_id').eq('username', u).maybeSingle()).data ? 'taken' : 'ok';
      }
      if (b.nickname !== undefined) {
        let n = '';
        try {
          n = cleanNickname(b.nickname);
        } catch {
          out.nickname = 'invalid';
        }
        if (n) out.nickname = (await nicknameFree(sb, n, uid)) ? 'ok' : 'taken';
      }
      return out;
    }

    case 'profile': {
      const p = await getProfile(sb, uid);
      if (!p) return { profile: null };
      const placed = isPlaced(p.ranked_games);
      // 공개 랭킹 목록과 같은 기준: 시험 회원은 세지 않고, 내가 시험 회원이면 순위 없음
      let above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES).gt('rating', p.rating).eq('is_test', false);
      if (above.error) above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES).gt('rating', p.rating);
      const tst = await sb.from('profiles').select('is_test').eq('user_id', uid).maybeSingle();
      const unlisted = !tst.error && !!(tst.data as { is_test?: boolean } | null)?.is_test;
      // 판 종류(kind·ranked)는 042 뒤에만 — 없으면 예전 칸만
      let rq = await sb.from('match_players').select('room_id, rank, players, ret, rated, rating_before, rating_after, created_at, kind, ranked').eq('user_id', uid).order('created_at', { ascending: false }).limit(10);
      if (rq.error) rq = (await sb.from('match_players').select('room_id, rank, players, ret, rated, rating_before, rating_after, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(10)) as typeof rq;
      const recent = (rq.data ?? []) as unknown[];
      const badges = await earnedBadges(sb, uid);
      const { user_id: _u, ...pub } = p;
      const chal = unlisted ? undefined : (await challengerMap(sb)).get(uid);
      // 랭크 점수 감소(054): 다이아몬드 이상만 — 쉴 수 있는 남은 날과 하루 감소 점수 (내 프로필에만)
      let decay: { days: number; perDay: number } | undefined;
      if (placed && p.rating >= DIAMOND_MIN) {
        const db = await sb.from('profiles').select('decay_bank').eq('user_id', uid).maybeSingle();
        const bank = !db.error ? (db.data as { decay_bank: number | null } | null)?.decay_bank : undefined;
        if (bank !== undefined) decay = { days: bank ?? (p.rating >= MASTER_MIN ? 14 : 28), perDay: p.rating >= MASTER_MIN ? 75 : 50 };
      }
      // '나의 투자 감각' (059, 내 것만 평균)
      const skills = await mySkills(sb, uid).catch(() => null);
      return { profile: { ...pub, ranked_games: p.ranked_games ?? 0, rankPos: placed && !unlisted ? (above.count ?? 0) + 1 : null, ...(chal ? { chal } : {}), ...(decay ? { decay } : {}) }, recent, badges, ...(skills?.all ? { skills } : {}) };
    }

    case 'updateProfile': {
      rateLimit(uid + ':profile', 10, 600_000);
      const p = await getProfile(sb, uid);
      if (!p) throw new GameError('회원만 바꿀 수 있어요.', 403);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.nickname !== undefined) {
        const nickname = cleanNickname(b.nickname);
        if (nickname !== p.nickname && !(await nicknameFree(sb, nickname, uid))) throw new GameError('이미 쓰는 닉네임이에요.', 409);
        patch.nickname = nickname;
      }
      if (b.avatar !== undefined) {
        // 프로필 사진: 프리셋만, 업적으로 여는 사진은 그 업적을 깼을 때만 (서버가 다시 확인)
        // 'id' 또는 단계가 붙은 'id:2'·'id:3' (그 사진을 여는 업적을 5번·20번 넘게 땄을 때만 — 테두리·장식)
        const pa = parseTiered(typeof b.avatar === 'string' ? b.avatar : '');
        const id = pa?.id ?? '';
        if (!pa || !Object.prototype.hasOwnProperty.call(AVATAR_MAP, id)) throw new GameError('없는 사진이에요.');
        const earned = await earnedBadges(sb, uid);
        if (!canUseAvatar(id, Object.keys(earned))) throw new GameError('아직 열리지 않은 사진이에요. 업적을 깨면 열려요.', 403);
        const need = AVATAR_MAP[id].need;
        if (pa.tier > 1 && (!need || badgeTier(need, earned[need] ?? 0) < pa.tier)) throw new GameError('그 단계는 업적을 더 따야 열려요.', 403);
        patch.avatar = pa.tier > 1 ? `${id}:${pa.tier}` : id;
      }
      if (b.title !== undefined) {
        if (b.title === null) patch.title = null;
        else {
          // 'winner' 또는 단계가 붙은 'winner:2'·'winner:3' — 서버가 딴 횟수로 단계를 다시 확인
          const pt = parseTiered(typeof b.title === 'string' ? b.title : '');
          const earned = await earnedBadges(sb, uid);
          if (!pt || !givesTitle(pt.id) || !earned[pt.id]) throw new GameError('칭호를 주는 업적을 얻어야 고를 수 있어요.');
          if (badgeTier(pt.id, earned[pt.id]) < pt.tier) throw new GameError('그 단계 칭호는 업적을 더 따야 열려요.', 403);
          patch.title = pt.tier > 1 ? `${pt.id}:${pt.tier}` : pt.id;
        }
      }
      const r = await sb.from('profiles').update(patch).eq('user_id', uid);
      if (r.error) throw new GameError(/nickname/.test(r.error.message) ? '이미 쓰는 닉네임이에요.' : '바꾸지 못했어요.', 409);
      return { ok: true };
    }

    case 'changePassword': {
      rateLimit(uid + ':pw', 5, 600_000);
      if (!(await getProfile(sb, uid))) throw new GameError('회원만 바꿀 수 있어요.', 403);
      // 잠깐 자리를 비운 사이 남이 바꾸지 못하게: 지금 비밀번호를 한 번 더 확인
      await verifyPassword(sb, uid, b.current);
      const password = cleanNewPassword(b.password);
      const r = await sb.auth.admin.updateUserById(uid, { password });
      if (r.error) throw new GameError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      await revokeSessions(sb, uid); // 다른 기기에 남은 로그인도 끊음
      return { ok: true };
    }

    case 'newRecovery': {
      rateLimit(uid + ':rec', 3, 600_000);
      if (!(await getProfile(sb, uid))) throw new GameError('회원만 받을 수 있어요.', 403);
      await verifyPassword(sb, uid, b.current);
      const code = newRecovery();
      await sb.from('profiles').update({ recovery_hash: hash(normRecovery(code)) }).eq('user_id', uid);
      return { recoveryCode: code };
    }

    case 'ranking': {
      // 랭킹에는 배치(랭킹전 2판)를 마친 회원만
      // 자동 시험 회원(is_test)은 공개 랭킹에서 뺌 (031 전이면 그 조건 없이)
      const topQ = (withTest: boolean) => {
        let q = sb.from('profiles').select('user_id, nickname, title, rating, games, wins, avatar').gte('ranked_games', PLACEMENT_GAMES);
        if (!withTest) q = q.eq('is_test', false);
        return q.order('rating', { ascending: false }).order('wins', { ascending: false }).limit(100);
      };
      let topR = await topQ(false);
      if (topR.error && /is_test/.test(topR.error.message)) topR = await topQ(true);
      const top = (topR.data ?? []) as {
        user_id?: string;
        nickname: string;
        title: string | null;
        rating: number;
        games: number;
        wins: number;
      }[];
      // uid 가 비었으면(로그인 없이 보는 공개 랭킹) 내 순위는 없음
      const me = uid ? await getProfile(sb, uid) : null;
      let mine: { rank: number | null; rating: number; nickname: string; games: number; ranked_games: number; unlisted?: boolean } | null = null;
      if (me) {
        let above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES).gt('rating', me.rating).eq('is_test', false);
        if (above.error) above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('ranked_games', PLACEMENT_GAMES).gt('rating', me.rating);
        // 자동 시험 회원은 공개 목록에서 빠지므로 내 순위도 비움 (목록과 내 카드가 어긋나지 않게)
        const t = await sb.from('profiles').select('is_test').eq('user_id', uid).maybeSingle();
        const isTest = !t.error && !!(t.data as { is_test?: boolean } | null)?.is_test;
        mine = { rank: isPlaced(me.ranked_games) && !isTest ? (above.count ?? 0) + 1 : null, rating: me.rating, nickname: me.nickname, games: me.games, ranked_games: me.ranked_games ?? 0, ...(isTest ? { unlisted: true } : {}) };
      }
      // 챌린저 #순위 (계정 id 는 화면에 안 보냄)
      const chal = await challengerMap(sb);
      const myChal = uid ? chal.get(uid) : undefined;
      return {
        top: top.map(({ user_id, ...t }, i) => ({ rank: i + 1, ...t, ...(user_id && chal.has(user_id) ? { chal: chal.get(user_id) } : {}) })),
        me: mine ? { ...mine, ...(myChal ? { chal: myChal } : {}) } : null,
      };
    }

    case 'guestSummary':
    case 'mergeGuest': {
      // 게스트로 하던 기기에서 이미 있는 회원 계정으로 로그인했을 때: 게스트 기록을 가져오거나 버림.
      // guestToken = 로그인 전 게스트 세션 토큰 (그 게스트 본인임을 증명)
      rateLimit(uid + ':merge', 10, 600_000);
      const tok = typeof b.guestToken === 'string' && b.guestToken.length < 4096 ? b.guestToken : '';
      const g = tok ? await sb.auth.getUser(tok) : null;
      const gu = g?.data.user;
      if (!gu || gu.id === uid) throw new GameError('게스트 기록을 찾을 수 없어요.', 404);
      if (gu.app_metadata?.role === 'admin' || (await getProfile(sb, gu.id))) throw new GameError('회원 계정의 기록은 가져올 수 없어요.', 403);
      const me = await getProfile(sb, uid);
      if (!me) throw new GameError('회원으로 로그인한 뒤에 할 수 있어요.', 403);
      const seats = ((await sb.from('players').select('id, room_id, left_game, rooms!inner(status)').eq('user_id', gu.id)).data ?? []) as unknown as { id: string; room_id: string; left_game: boolean | null; rooms: { status: string } }[];
      if (action === 'guestSummary')
        return { games: seats.filter((x) => x.rooms.status === 'finished').length, playing: seats.filter((x) => x.rooms.status !== 'finished').length };
      const mode = b.mode === 'merge' ? 'merge' : 'discard';
      let moved = 0;
      if (mode === 'merge' && seats.length) {
        const myRows = ((await sb.from('players').select('room_id, left_game, rooms!inner(status)').eq('user_id', uid)).data ?? []) as unknown as { room_id: string; left_game: boolean; rooms: { status: string } }[];
        const mine = new Set(myRows.map((x) => x.room_id));
        // 한 사람은 한 방에만: 회원 쪽에 이미 진행·대기 중 자리가 있으면 게스트의 진행·대기 자리는 가져오지 않음(아래에서 나가기 처리)
        let busy = myRows.some((x) => x.rooms.status !== 'finished' && !x.left_game);
        for (const s of seats) {
          if (mine.has(s.room_id)) continue; // 같은 방에 이미 내 자리가 있으면 건너뜀
          const active = s.rooms.status !== 'finished' && !s.left_game; // 기권한 자리는 진행 중으로 치지 않음
          if (active && busy) continue;
          if (active) busy = true;
          // 대기실 자리는 회원 닉네임으로 (게임 중·끝난 판은 그대로 — 다른 사람 화면·끝난 판 기록이 이름으로 이어져 있어서)
          const r = await sb.from('players').update(s.rooms.status === 'waiting' ? { user_id: uid, nickname: me.nickname } : { user_id: uid }).eq('id', s.id).eq('user_id', gu.id);
          if (r.error && s.rooms.status === 'waiting') {
            // 같은 방에 같은 닉네임이 있어 막히면 닉네임은 그대로 두고 자리만 옮김
            const r2 = await sb.from('players').update({ user_id: uid }).eq('id', s.id).eq('user_id', gu.id);
            if (!r2.error) moved++;
          } else if (!r.error) moved++;
        }
      }
      // 가져오지 않은 진행·대기 중 자리는 제대로 나가기 (게임 중이면 기권 → 남은 사람이 기다리지 않게, 대기실이면 자리 빼기)
      if (leaveSeat) {
        const left = ((await sb.from('players').select('id, room_id, left_game, rooms!inner(status)').eq('user_id', gu.id)).data ?? []) as unknown as { id: string; room_id: string; left_game: boolean; rooms: { status: string } }[];
        for (const s of left) {
          if (s.rooms.status === 'finished' || s.left_game) continue;
          await leaveSeat(s.room_id, s.id).catch(() => {});
        }
      }
      // 게스트 계정은 지움 (남은 자리는 연결만 끊김 — 다른 사람 기록은 그대로)
      await sb.from('match_tickets').delete().eq('user_id', gu.id);
      await sb.auth.admin.deleteUser(gu.id);
      return { ok: true, moved };
    }

    case 'myMatch': {
      if (typeof b.roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.roomId)) return null; // 방 번호 모양이 아니면 DB 에 묻지도 않음
      const r = await sb.from('match_players').select('rank, players, rated, rating_before, rating_after').eq('room_id', b.roomId).eq('user_id', uid).maybeSingle();
      if (!r.data) return null;
      const me = await getProfile(sb, uid);
      return { ...r.data, ranked_games: me?.ranked_games ?? 0 };
    }
  }
  throw new GameError('알 수 없는 요청이에요.');
}

/** 비밀번호 찾기 (로그인 없이): 아이디 + 복구 코드 → 새 비밀번호. 새 복구 코드를 다시 줌 */
export async function resetPassword(sb: SupabaseClient, b: Body) {
  const username = cleanUsername(b.username);
  const password = cleanNewPassword(b.password);
  const code = normRecovery(b.code);
  const p = (await sb.from('profiles').select('user_id, recovery_hash').eq('username', username).maybeSingle()).data as { user_id: string; recovery_hash: string | null } | null;
  // 없는 아이디여도 같은 계산을 해서 걸리는 시간으로 아이디가 있는지 알 수 없게
  const ok = check(code.length === 12 ? code : 'x'.repeat(12), p?.recovery_hash ?? DUMMY_HASH);
  if (!p || code.length !== 12 || !ok) throw new GameError('아이디나 복구 코드가 맞지 않아요.', 403);
  const r = await sb.auth.admin.updateUserById(p.user_id, { password });
  if (r.error) throw new GameError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
  await revokeSessions(sb, p.user_id); // 비밀번호를 찾았으면 남이 쓰던 로그인도 모두 끊음
  const next = newRecovery();
  await sb.from('profiles').update({ recovery_hash: hash(normRecovery(next)) }).eq('user_id', p.user_id);
  return { ok: true, recoveryCode: next };
}

/**
 * 끝난 대결의 결과를 회원 기록·랭킹에 반영 (한 판에 한 번 — match_players 기본키로 중복 막음).
 * results 는 1등부터, nickname 은 그 방 안에서 유일
 */

/**
 * 순위 → Elo 점수 변화. 기권한 사람은 랭킹전에서 꼴찌로 침 (지는 중에 나가서 점수를 지키지 못하게).
 * weight(a,b): 그 쌍의 점수 비중 (1 = 그대로, 0.5 = 절반, 0 = 반영 안 함)
 */
export function eloDeltas(
  members: { user_id: string; rating: number }[],
  rankOf: Map<string, number>,
  weight: (a: string, b: string) => number = () => 1,
) {
  const delta = new Map<string, number>();
  for (const a of members) {
    let d = 0;
    for (const o of members) {
      const w = o.user_id === a.user_id ? 0 : weight(a.user_id, o.user_id);
      if (w <= 0) continue;
      const ra = rankOf.get(a.user_id)!;
      const ro = rankOf.get(o.user_id)!;
      const s = ra < ro ? 1 : ra > ro ? 0 : 0.5;
      const e = 1 / (1 + Math.pow(10, (o.rating - a.rating) / ELO_SCALE));
      d += w * (s - e);
    }
    delta.set(a.user_id, Math.round((ELO_K / Math.max(1, members.length - 1)) * d));
  }
  return delta;
}

export async function recordMatch(sb: SupabaseClient, roomId: string, results: { nickname: string; ret: number; idle?: boolean }[], ranked = false) {
  const ps = ((await sb.from('players').select('user_id, nickname, left_game').eq('room_id', roomId)).data ?? []) as { user_id: string | null; nickname: string; left_game: boolean | null }[];
  if (ps.length < 2) return;
  // 판 종류 (전적에 '랭킹전·봇전…' 표시용)
  const room = (await sb.from('rooms').select('kind, ranked').eq('id', roomId).maybeSingle()).data as { kind?: string; ranked?: boolean } | null;
  const uids = ps.map((p) => p.user_id).filter((x): x is string => !!x);
  let pq = await sb.from('profiles').select('user_id, rating, games, wins, best_ret, ranked_games').in('user_id', uids);
  if (pq.error) pq = (await sb.from('profiles').select('user_id, rating, games, wins, best_ret').in('user_id', uids)) as typeof pq;
  const profs = (pq.data ?? []) as Profile[];
  if (!profs.length) return;
  const byNick = new Map(ps.map((p) => [p.nickname, p.user_id]));
  const quit = new Set(ps.filter((p) => p.left_game && p.user_id).map((p) => p.user_id!));
  // 매칭에서 거래 0회인 사람도 기권처럼 꼴찌·승리 없음 (finalResults 의 idle — 사용자 결정 2026-11-17)
  for (const r of results) if (r.idle) { const u = ps.find((p) => p.nickname === r.nickname)?.user_id; if (u) quit.add(u); }
  const rankOf = new Map<string, number>();
  results.forEach((r, i) => {
    const u = byNick.get(r.nickname);
    if (u) rankOf.set(u, i + 1);
  });
  const retOf = new Map(results.map((r) => [byNick.get(r.nickname) ?? '', r.ret]));
  const members = profs.filter((p) => rankOf.has(p.user_id));
  // 점수는 랭킹전(매칭)에서만. 친구 방·일반전은 전적만 남김
  // 모두 기권했거나 거래 0회면 점수는 그대로 (전적만)
  const rated = ranked && members.length >= 2 && members.some((m) => !quit.has(m.user_id));
  let delta = new Map<string, number>();
  if (rated) {
    // 랭킹전: 기권한 사람은 재산과 상관없이 꼴찌 (끝까지 한 사람끼리의 순서는 그대로)
    const eloRank = new Map<string, number>();
    const order = [...members].sort((x, y) => (quit.has(x.user_id) ? 1 : 0) - (quit.has(y.user_id) ? 1 : 0) || rankOf.get(x.user_id)! - rankOf.get(y.user_id)!);
    order.forEach((m, i) => eloRank.set(m.user_id, quit.has(m.user_id) ? members.length : i + 1));
    // 같은 상대와 몇 번을 만나도 점수는 똑같이 (사람이 적어 같은 상대를 자주 만나는 경우 — 사용자 결정)
    delta = eloDeltas(members, eloRank);
    // 배치(랭킹전 2판) 중인 사람은 점수가 크게 움직여 빨리 제 실력 자리로 (상대 점수 차에 따라 오르내리는 건 Elo 가 이미 반영)
    for (const m of members) if (!isPlaced(m.ranked_games)) delta.set(m.user_id, Math.round((delta.get(m.user_id) ?? 0) * PLACEMENT_MULT));
  }
  for (const p of members) {
    const rank = rankOf.get(p.user_id)!;
    const d = delta.get(p.user_id) ?? 0;
    const after = p.rating + d;
    const ret = retOf.get(p.user_id) ?? 0;
    // match_players 기본키(방·사람)로 한 판은 한 번만 반영
    const row = { room_id: roomId, user_id: p.user_id, rank, players: ps.length, ret, rated, rating_before: p.rating, rating_after: after };
    let ins = await sb.from('match_players').insert({ ...row, kind: room?.kind ?? null, ranked: !!room?.ranked }).select('user_id');
    // 042(판 종류 칸) 적용 전이면 예전 칸만으로 다시 (점수 기록이 막히지 않게)
    if (ins.error && /kind|ranked|column/i.test(ins.error.message)) ins = await sb.from('match_players').insert(row).select('user_id');
    if (ins.error || !ins.data?.length) continue; // 이미 반영된 판
    // 점수·전적은 DB 안에서 한 번에 더함 (두 판이 동시에 끝나도 값이 덮어써지지 않게)
    let rpc = await sb.rpc('apply_rating2', { p_user: p.user_id, p_delta: d, p_win: rank === 1 && !quit.has(p.user_id), p_ret: ret, p_ranked: rated });
    if (rpc.error) rpc = await sb.rpc('apply_rating', { p_user: p.user_id, p_delta: d, p_win: rank === 1 && !quit.has(p.user_id), p_ret: ret });
    if (rpc.error)
      await sb
        .from('profiles')
        .update({ rating: after, games: p.games + 1, wins: p.wins + (rank === 1 ? 1 : 0), best_ret: p.best_ret === null ? ret : Math.max(p.best_ret, ret), updated_at: new Date().toISOString() })
        .eq('user_id', p.user_id);
  }
}
