/**
 * 회원 계정 (015): 아이디·비밀번호·닉네임 — 이메일은 받지 않음.
 * - 가입: 지금 쓰던 게스트 계정을 그대로 정식 계정으로 바꿈(같은 계정 → 하던 게임·기록 유지)
 * - 로그인: 브라우저가 "아이디@u.stockduel.invalid" 로 비밀번호 로그인 (가짜 주소라 메일은 가지 않음)
 * - 비밀번호를 잊으면 가입 때 받은 복구 코드로 새 비밀번호
 * - 랭킹: 회원끼리 붙은 멀티 대결만 점수(Elo, 시작 1000) 반영 — 게스트와의 판은 전적만
 * 모든 읽기·쓰기는 서버만 (profiles·match_players 는 브라우저 권한 없음)
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanNickname, GameError } from '../../src/engine/engine.js';
import { BADGES } from '../../src/game/achievements.js';

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
  const r = await sb.from('profiles').select('user_id, username, nickname, title, rating, games, wins, best_ret').eq('user_id', uid).maybeSingle();
  if (r.error) return null; // 015 전이면 회원 기능 없음
  return (r.data as Profile | null) ?? null;
}

async function nicknameFree(sb: SupabaseClient, nickname: string, exceptUid?: string) {
  const r = await sb.from('profiles').select('user_id').ilike('nickname', nickname.replace(/[%_\\]/g, (c) => '\\' + c));
  const rows = (r.data ?? []) as { user_id: string }[];
  return !rows.some((x) => x.user_id !== exceptUid);
}

/** 이 사용자가 얻은 업적 (회원·게스트 모두: 참가한 끝난 대결의 결과에서) */
export async function earnedBadges(sb: SupabaseClient, uid: string): Promise<Record<string, number>> {
  const mine = ((await sb.from('players').select('room_id, nickname').eq('user_id', uid).limit(300)).data ?? []) as { room_id: string; nickname: string }[];
  if (!mine.length) return {};
  const nick = new Map(mine.map((m) => [m.room_id, m.nickname]));
  const hist = ((await sb.from('match_history').select('room_id, results').in('room_id', mine.map((m) => m.room_id))).data ?? []) as { room_id: string; results: { nickname: string; badges?: string[] }[] }[];
  const out: Record<string, number> = {};
  for (const h of hist) for (const r of h.results) if (r.nickname === nick.get(h.room_id)) for (const b of r.badges ?? []) out[b] = (out[b] ?? 0) + 1;
  return out;
}

type Body = Record<string, unknown>;

export async function accountAct(sb: SupabaseClient, action: string, b: Body, user: { id: string; app_metadata?: Record<string, unknown> | null }, rateLimit: (k: string, n: number, ms: number) => void): Promise<unknown> {
  const uid = user.id;
  switch (action) {
    case 'signup': {
      rateLimit(uid + ':signup', 5, 600_000);
      if (user.app_metadata?.role === 'admin') throw new GameError('운영자 계정은 회원 가입을 할 수 없어요.');
      if (await getProfile(sb, uid)) throw new GameError('이미 가입한 계정이에요.', 409);
      if (b.agree14 !== true || b.agreePrivacy !== true) throw new GameError('만 14세 이상 확인과 개인정보 안내 동의가 필요해요.');
      const username = cleanUsername(b.username);
      const password = cleanNewPassword(b.password);
      const nickname = cleanNickname(b.nickname);
      if (!(await nicknameFree(sb, nickname))) throw new GameError('이미 쓰는 닉네임이에요. 다른 닉네임을 써 주세요.', 409);
      const taken = await sb.from('profiles').select('user_id').eq('username', username).maybeSingle();
      if (taken.data) throw new GameError('이미 쓰는 아이디예요.', 409);
      // 지금 쓰던 게스트 계정을 정식 계정으로 (같은 계정이라 하던 게임·기록이 그대로)
      const up = await sb.auth.admin.updateUserById(uid, { email: `${username}@${USER_DOMAIN}`, password, email_confirm: true, user_metadata: { username } });
      if (up.error) throw new GameError(/already|exists|registered/i.test(up.error.message) ? '이미 쓰는 아이디예요.' : '가입하지 못했어요. 잠시 후 다시 시도해 주세요.', 409);
      const code = newRecovery();
      const ins = await sb.from('profiles').insert({ user_id: uid, username, nickname, recovery_hash: hash(normRecovery(code)) });
      if (ins.error) throw new GameError(/nickname/.test(ins.error.message) ? '이미 쓰는 닉네임이에요.' : /username/.test(ins.error.message) ? '이미 쓰는 아이디예요.' : '가입하지 못했어요.', 409);
      return { ok: true, recoveryCode: code, username, nickname };
    }

    case 'profile': {
      const p = await getProfile(sb, uid);
      if (!p) return { profile: null };
      const above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gt('games', 0).gt('rating', p.rating);
      const recent = ((await sb.from('match_players').select('room_id, rank, players, ret, rated, rating_before, rating_after, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(10)).data ?? []) as unknown[];
      const badges = await earnedBadges(sb, uid);
      const { user_id: _u, ...pub } = p;
      return { profile: { ...pub, rankPos: p.games > 0 ? (above.count ?? 0) + 1 : null }, recent, badges };
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
      if (b.title !== undefined) {
        if (b.title === null) patch.title = null;
        else {
          const t = typeof b.title === 'string' ? b.title : '';
          const earned = await earnedBadges(sb, uid);
          if (!BADGES.some((x) => x.id === t) || !earned[t]) throw new GameError('얻은 업적만 대표 칭호로 고를 수 있어요.');
          patch.title = t;
        }
      }
      const r = await sb.from('profiles').update(patch).eq('user_id', uid);
      if (r.error) throw new GameError(/nickname/.test(r.error.message) ? '이미 쓰는 닉네임이에요.' : '바꾸지 못했어요.', 409);
      return { ok: true };
    }

    case 'changePassword': {
      rateLimit(uid + ':pw', 5, 600_000);
      if (!(await getProfile(sb, uid))) throw new GameError('회원만 바꿀 수 있어요.', 403);
      const password = cleanNewPassword(b.password);
      const r = await sb.auth.admin.updateUserById(uid, { password });
      if (r.error) throw new GameError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      return { ok: true };
    }

    case 'newRecovery': {
      rateLimit(uid + ':rec', 3, 600_000);
      if (!(await getProfile(sb, uid))) throw new GameError('회원만 받을 수 있어요.', 403);
      const code = newRecovery();
      await sb.from('profiles').update({ recovery_hash: hash(normRecovery(code)) }).eq('user_id', uid);
      return { recoveryCode: code };
    }

    case 'ranking': {
      const top = ((await sb.from('profiles').select('nickname, title, rating, games, wins').gt('games', 0).order('rating', { ascending: false }).order('wins', { ascending: false }).limit(100)).data ?? []) as {
        nickname: string;
        title: string | null;
        rating: number;
        games: number;
        wins: number;
      }[];
      const me = await getProfile(sb, uid);
      let mine: { rank: number | null; rating: number; nickname: string; games: number } | null = null;
      if (me) {
        const above = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gt('games', 0).gt('rating', me.rating);
        mine = { rank: me.games > 0 ? (above.count ?? 0) + 1 : null, rating: me.rating, nickname: me.nickname, games: me.games };
      }
      return { top: top.map((t, i) => ({ rank: i + 1, ...t })), me: mine };
    }

    case 'myMatch': {
      if (typeof b.roomId !== 'string') return null;
      const r = await sb.from('match_players').select('rank, players, rated, rating_before, rating_after').eq('room_id', b.roomId).eq('user_id', uid).maybeSingle();
      return r.data ?? null;
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
  if (!p || code.length !== 12 || !check(code, p.recovery_hash)) throw new GameError('아이디나 복구 코드가 맞지 않아요.', 403);
  const r = await sb.auth.admin.updateUserById(p.user_id, { password });
  if (r.error) throw new GameError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
  const next = newRecovery();
  await sb.from('profiles').update({ recovery_hash: hash(normRecovery(next)) }).eq('user_id', p.user_id);
  return { ok: true, recoveryCode: next };
}

/**
 * 끝난 대결의 결과를 회원 기록·랭킹에 반영 (한 판에 한 번 — match_players 기본키로 중복 막음).
 * results 는 1등부터, nickname 은 그 방 안에서 유일
 */
export async function recordMatch(sb: SupabaseClient, roomId: string, results: { nickname: string; ret: number }[], ranked = false) {
  const ps = ((await sb.from('players').select('user_id, nickname').eq('room_id', roomId)).data ?? []) as { user_id: string | null; nickname: string }[];
  if (ps.length < 2) return;
  const uids = ps.map((p) => p.user_id).filter((x): x is string => !!x);
  const profs = ((await sb.from('profiles').select('user_id, rating, games, wins, best_ret').in('user_id', uids)).data ?? []) as Profile[];
  if (!profs.length) return;
  const byNick = new Map(ps.map((p) => [p.nickname, p.user_id]));
  const rankOf = new Map<string, number>();
  results.forEach((r, i) => {
    const u = byNick.get(r.nickname);
    if (u) rankOf.set(u, i + 1);
  });
  const retOf = new Map(results.map((r) => [byNick.get(r.nickname) ?? '', r.ret]));
  const members = profs.filter((p) => rankOf.has(p.user_id));
  // 점수는 랭킹전(매칭)에서만. 친구 방·일반전은 전적만 남김
  const rated = ranked && members.length >= 2;
  // 회원끼리 쌍마다 Elo (K=32 를 상대 수로 나눔). 게스트와의 결과는 점수에 넣지 않음
  const delta = new Map<string, number>();
  if (rated) {
    for (const a of members) {
      let d = 0;
      for (const o of members) {
        if (o.user_id === a.user_id) continue;
        const ra = rankOf.get(a.user_id)!;
        const ro = rankOf.get(o.user_id)!;
        const s = ra < ro ? 1 : ra > ro ? 0 : 0.5;
        const e = 1 / (1 + Math.pow(10, (o.rating - a.rating) / 400));
        d += s - e;
      }
      delta.set(a.user_id, Math.round((32 / (members.length - 1)) * d));
    }
  }
  for (const p of members) {
    const rank = rankOf.get(p.user_id)!;
    const after = p.rating + (delta.get(p.user_id) ?? 0);
    const ins = await sb
      .from('match_players')
      .insert({ room_id: roomId, user_id: p.user_id, rank, players: ps.length, ret: retOf.get(p.user_id) ?? 0, rated, rating_before: p.rating, rating_after: after })
      .select('user_id');
    if (ins.error || !ins.data?.length) continue; // 이미 반영된 판
    const ret = retOf.get(p.user_id) ?? 0;
    await sb
      .from('profiles')
      .update({ rating: after, games: p.games + 1, wins: p.wins + (rank === 1 ? 1 : 0), best_ret: p.best_ret === null ? ret : Math.max(p.best_ret, ret), updated_at: new Date().toISOString() })
      .eq('user_id', p.user_id);
  }
}
