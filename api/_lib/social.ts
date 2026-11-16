/**
 * 친구 (회원만): 닉네임으로 신청 → 수락/거절, 삭제, 차단, 접속 상태(친구에게만)
 * 화면에 보내는 값: 닉네임·칭호·점수·상태, 그리고 행동용 id(친구 관계/차단 줄의 id — user id 아님)
 * 절대 안 보냄: user id, 아이디, 로그인 주소, 차단당했는지, 거절당했는지
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanNickname, GameError } from '../../src/engine/engine.js';
import { getProfile } from './accounts.js';

type Body = Record<string, unknown>;
type RL = (k: string, n: number, ms: number) => void;

export const FRIEND_MAX = 100;
export const PENDING_DAYS = 7;
export const ONLINE_MS = 120_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanId = (v: unknown) => {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new GameError('잘못된 요청이에요.');
  return v;
};
const pair = (x: string, y: string) => (x < y ? { user_a: x, user_b: y } : { user_a: y, user_b: x });

interface FRow {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

/** 접속 표시 갱신: 서버 인스턴스마다 사람당 1분에 한 번만 DB 에 씀 */
const seenAt = new Map<string, number>();
export async function touchSeen(sb: SupabaseClient, uid: string) {
  const now = Date.now();
  if (now - (seenAt.get(uid) ?? 0) < 60_000) return;
  seenAt.set(uid, now);
  if (seenAt.size > 20_000) seenAt.clear();
  const r = await sb.from('profiles').update({ last_seen: new Date(now).toISOString() }).eq('user_id', uid).select('user_id');
  // 아직 회원이 아니면(게스트) 10초 뒤 다시 확인 — 막 가입한 사람도 바로 '접속 중'으로 보이게
  if (!r.data?.length) seenAt.set(uid, now - 50_000);
}

async function myRows(sb: SupabaseClient, uid: string): Promise<FRow[]> {
  const r = await sb.from('friendships').select('id, user_a, user_b, requested_by, status, created_at').or(`user_a.eq.${uid},user_b.eq.${uid}`);
  if (r.error) return []; // 018 전
  return (r.data ?? []) as FRow[];
}
async function myBlocks(sb: SupabaseClient, uid: string) {
  const r = await sb.from('blocks').select('id, blocked').eq('blocker', uid);
  return (r.data ?? []) as { id: string; blocked: string }[];
}

export async function socialAct(sb: SupabaseClient, action: string, b: Body, uid: string, rateLimit: RL): Promise<unknown> {
  const me = await getProfile(sb, uid);
  if (!me) throw new GameError('친구 기능은 회원만 쓸 수 있어요. 로그인하거나 가입해 주세요.', 403);
  const otherOf = (r: FRow) => (r.user_a === uid ? r.user_b : r.user_a);

  switch (action) {
    case 'friends': {
      rateLimit(uid + ':friends', 30, 60_000);
      await touchSeen(sb, uid);
      // 7일 지난 신청은 정리
      await sb.from('friendships').delete().eq('status', 'pending').lt('created_at', new Date(Date.now() - PENDING_DAYS * 86_400_000).toISOString());
      const rows = await myRows(sb, uid);
      const blocks = await myBlocks(sb, uid);
      const blockedSet = new Set(blocks.map((x) => x.blocked));
      const ids = [...new Set([...rows.map(otherOf), ...blocks.map((x) => x.blocked)])];
      const profs = ids.length
        ? (((await sb.from('profiles').select('user_id, nickname, title, rating, last_seen').in('user_id', ids)).data ?? []) as { user_id: string; nickname: string; title: string | null; rating: number; last_seen: string | null }[])
        : [];
      const P = new Map(profs.map((p) => [p.user_id, p]));
      // 친구의 '게임 중' 여부 (친구에게만)
      const friendIds = rows.filter((r) => r.status === 'accepted').map(otherOf);
      const playing = new Set<string>();
      if (friendIds.length) {
        const ps = ((await sb.from('players').select('user_id, left_game, rooms!inner(status)').in('user_id', friendIds).eq('rooms.status', 'playing')).data ?? []) as unknown as { user_id: string; left_game: boolean | null }[];
        for (const p of ps) if (!p.left_game) playing.add(p.user_id);
      }
      const now = Date.now();
      const statusOf = (u: string) => {
        const seen = P.get(u)?.last_seen;
        const online = !!seen && now - new Date(seen).getTime() < ONLINE_MS;
        return online ? (playing.has(u) ? 'playing' : 'online') : 'offline';
      };
      const card = (r: FRow) => {
        const p = P.get(otherOf(r));
        return { id: r.id, nickname: p?.nickname ?? '알 수 없음', title: p?.title ?? null, rating: p?.rating ?? 1000 };
      };
      const friends = rows
        .filter((r) => r.status === 'accepted' && P.has(otherOf(r)))
        .map((r) => ({ ...card(r), status: statusOf(otherOf(r)) }))
        .sort((x, y) => ['playing', 'online', 'offline'].indexOf(x.status) - ['playing', 'online', 'offline'].indexOf(y.status) || x.nickname.localeCompare(y.nickname, 'ko'));
      // 받은 신청: 내가 차단한 사람 것은 안 보임
      const incoming = rows.filter((r) => r.status === 'pending' && r.requested_by !== uid && !blockedSet.has(otherOf(r)) && P.has(otherOf(r))).map((r) => ({ ...card(r), at: r.created_at }));
      // 보낸 신청: 상대가 나를 차단했어도 그대로 '대기 중'으로 보임 (차단 사실을 알 수 없게)
      const outgoing = rows.filter((r) => r.status === 'pending' && r.requested_by === uid && P.has(otherOf(r))).map((r) => ({ ...card(r), at: r.created_at }));
      const blocked = blocks.filter((x) => P.has(x.blocked)).map((x) => ({ id: x.id, nickname: P.get(x.blocked)!.nickname }));
      return { friends, incoming, outgoing, blocked, max: FRIEND_MAX };
    }

    case 'friendRequest': {
      rateLimit(uid + ':freq', 20, 3_600_000);
      rateLimit(uid + ':freqMin', 10, 60_000);
      const nick = cleanNickname(b.nickname);
      // 정확히 같은 닉네임만 (대소문자 무시, 와일드카드 무력화) — 목록 훑기 불가
      const found = ((await sb.from('profiles').select('user_id').ilike('nickname', nick.replace(/[%_\\]/g, (c) => '\\' + c)).limit(2)).data ?? []) as { user_id: string }[];
      if (found.length !== 1) throw new GameError('그 닉네임의 회원을 찾지 못했어요. 정확히 입력해 주세요.', 404);
      const other = found[0].user_id;
      if (other === uid) throw new GameError('나에게는 친구 신청을 할 수 없어요.');
      const rows = await myRows(sb, uid);
      const existing = rows.find((r) => otherOf(r) === other);
      if (existing?.status === 'accepted') throw new GameError('이미 친구예요.', 409);
      if (existing && existing.requested_by === uid) return { ok: true, status: 'pending' };
      // 내가 그 사람을 차단했으면 먼저 차단을 풀어야
      const iBlocked = await sb.from('blocks').select('id').eq('blocker', uid).eq('blocked', other).maybeSingle();
      if (iBlocked.data) throw new GameError('내가 차단한 사람이에요. 차단을 푼 뒤에 신청해 주세요.', 409);
      if (existing) {
        // 상대가 먼저 신청했으면 바로 친구 (상대가 나를 차단했으면 신청 자체가 안 보였으므로 그냥 대기)
        const theyBlocked = await sb.from('blocks').select('id').eq('blocker', other).eq('blocked', uid).maybeSingle();
        if (theyBlocked.data) return { ok: true, status: 'pending' };
        if (rows.filter((r) => r.status === 'accepted').length >= FRIEND_MAX) throw new GameError(`친구는 ${FRIEND_MAX}명까지예요.`, 409);
        await sb.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', existing.id);
        return { ok: true, status: 'accepted' };
      }
      if (rows.filter((r) => r.status === 'accepted').length >= FRIEND_MAX) throw new GameError(`친구는 ${FRIEND_MAX}명까지예요.`, 409);
      const ins = await sb.from('friendships').insert({ ...pair(uid, other), requested_by: uid, status: 'pending' });
      if (ins.error) {
        if (/duplicate/i.test(ins.error.message)) return { ok: true, status: 'pending' };
        throw new GameError(/friendships/.test(ins.error.message) ? '아직 준비 중인 기능이에요.' : '신청하지 못했어요. 잠시 후 다시 해 주세요.', 503);
      }
      return { ok: true, status: 'pending' };
    }

    case 'friendRespond': {
      const id = cleanId(b.id);
      const r = ((await sb.from('friendships').select('id, user_a, user_b, requested_by, status, created_at').eq('id', id).maybeSingle()).data ?? null) as FRow | null;
      // 나에게 온 신청만 (남의 관계 id 를 넣어도 아무 일 없음)
      if (!r || (r.user_a !== uid && r.user_b !== uid) || r.requested_by === uid || r.status !== 'pending') throw new GameError('신청을 찾을 수 없어요.', 404);
      if (b.accept === true) {
        const rows = await myRows(sb, uid);
        if (rows.filter((x) => x.status === 'accepted').length >= FRIEND_MAX) throw new GameError(`친구는 ${FRIEND_MAX}명까지예요.`, 409);
        await sb.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
        return { ok: true, status: 'accepted' };
      }
      await sb.from('friendships').delete().eq('id', id);
      return { ok: true, status: 'declined' };
    }

    case 'friendRemove': {
      // 친구 끊기 / 보낸 신청 취소
      const id = cleanId(b.id);
      await sb.from('friendships').delete().eq('id', id).or(`user_a.eq.${uid},user_b.eq.${uid}`);
      return { ok: true };
    }

    case 'friendBlock': {
      // 친구·신청 줄의 id 로 그 사람을 차단 → 관계도 지움
      rateLimit(uid + ':block', 20, 600_000);
      const id = cleanId(b.id);
      const r = ((await sb.from('friendships').select('id, user_a, user_b, requested_by, status, created_at').eq('id', id).maybeSingle()).data ?? null) as FRow | null;
      if (!r || (r.user_a !== uid && r.user_b !== uid)) throw new GameError('찾을 수 없어요.', 404);
      const other = otherOf(r);
      await sb.from('blocks').upsert({ blocker: uid, blocked: other }, { onConflict: 'blocker,blocked', ignoreDuplicates: true });
      await sb.from('friendships').delete().eq('id', id);
      return { ok: true };
    }

    case 'unblock': {
      const id = cleanId(b.id);
      await sb.from('blocks').delete().eq('id', id).eq('blocker', uid);
      return { ok: true };
    }
  }
  throw new GameError('알 수 없는 요청이에요.');
}

export const SOCIAL_ACTIONS = ['friends', 'friendRequest', 'friendRespond', 'friendRemove', 'friendBlock', 'unblock'];
