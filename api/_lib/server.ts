/**
 * 게임 서버 — 모든 쓰기 작업은 여기서만 일어난다.
 * 브라우저는 Supabase 테이블에 직접 쓸 수 없고(RLS), 이 함수가 비밀 키로 대신 쓴다.
 * 비밀 키(SUPABASE_SECRET_KEY)는 서버 환경변수에만 있고 브라우저 번들에는 절대 들어가지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

/* ---------------- 비밀방 비밀번호: 소금 + scrypt 해시로만 저장 ---------------- */
function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return salt.toString('hex') + ':' + scryptSync(pw, salt, 32).toString('hex');
}
function checkPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
function cleanPassword(v: unknown) {
  if (typeof v !== 'string' || v.length < 4 || v.length > 20 || /[\u0000-\u001f]/.test(v)) throw new GameError('비밀번호는 4~20자로 정해 주세요.');
  return v;
}
function cleanTitle(v: unknown, fallback: string) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') throw new GameError('방 제목을 확인해 주세요.');
  const t = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!/^[^\p{C}<>]{1,20}$/u.test(t)) throw new GameError('방 제목은 1~20자로, 특수 제어문자 없이 입력해 주세요.');
  return t;
}
function cleanMax(v: unknown) {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= MAX_PLAYERS) return v;
  throw new GameError(`인원은 2~${MAX_PLAYERS}명으로 골라 주세요.`);
}
/** 비밀번호 무차별 대입 방지: 사용자·방마다 10분에 5번 */
const pwFails = new Map<string, { n: number; reset: number }>();
function pwGuard(key: string) {
  const now = Date.now();
  const e = pwFails.get(key);
  if (e && now < e.reset && e.n >= 5) throw new GameError('비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 시도해 주세요.', 429);
}
function pwFail(key: string) {
  const now = Date.now();
  const e = pwFails.get(key);
  if (!e || now > e.reset) pwFails.set(key, { n: 1, reset: now + 600_000 });
  else e.n++;
}

/** 방 기준 비밀번호 시도 제한(모든 사용자 합산, DB): 1시간에 20번 — 계정을 새로 만들거나 서버가 바뀌어도 유지 */
async function roomPwState(roomId: string) {
  const res = await db().from('rooms').select('pw_fails, pw_fail_at').eq('id', roomId).maybeSingle();
  if (res.error || !res.data) return null; // 007 전이면 메모리 제한만
  const r = res.data as { pw_fails: number; pw_fail_at: string | null };
  const fresh = !!r.pw_fail_at && Date.now() - new Date(r.pw_fail_at).getTime() < 3600_000;
  return { fails: fresh ? r.pw_fails : 0, since: fresh ? r.pw_fail_at : null };
}
async function roomPwGuard(roomId: string) {
  const st = await roomPwState(roomId);
  if (st && st.fails >= 20) throw new GameError('이 방은 비밀번호 시도가 너무 많아 잠시 잠겼어요. 나중에 다시 시도해 주세요.', 429);
}
async function roomPwFail(roomId: string) {
  const st = await roomPwState(roomId);
  if (!st) return;
  await db().from('rooms').update({ pw_fails: st.fails + 1, pw_fail_at: st.since ?? new Date().toISOString() }).eq('id', roomId);
}

/** 방에 새 플레이어 추가 (인원·닉네임 검사) */
async function addToRoom(room: { id: string; code: string; status: string; max_players: number }, uid: string, nickname: string, mode: string) {
  const sb = db();
  const players = must(await sb.from('players').select('id, user_id, nickname').eq('room_id', room.id), 'players') as { id: string; user_id: string; nickname: string }[];
  const already = players.find((p) => p.user_id === uid);
  if (already) return { roomId: room.id, playerId: already.id, code: room.code };
  if (room.status !== 'waiting') throw new GameError('이미 시작했거나 끝난 방이에요.', 409);
  if (players.length >= room.max_players) throw new GameError(`방이 가득 찼어요 (최대 ${room.max_players}명).`, 409);
  if (players.some((p) => p.nickname === nickname)) throw new GameError('방에 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.');
  const ins = await sb.from('players').insert({ room_id: room.id, user_id: uid, nickname, mode }).select('id').single();
  if (ins.error && /players_room_nick_uq/i.test(ins.error.message)) throw new GameError('방에 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.');
  const p = must(ins, 'join') as { id: string };
  await touchRoom(room.id);
  return { roomId: room.id, playerId: p.id, code: room.code };
}
import {
  buildView,
  cleanCode,
  cleanDays,
  cleanMode,
  cleanNickname,
  cleanTurn,
  finalResults,
  GameError,
  CURRENT_RULES_VERSION,
  dayClock,
  graceDeadline,
  LEGACY_TURN_SECONDS,
  restoreDeadline,
  validateCancelEnd,
  validateLeave,
  nextRoomState,
  resolveOrders,
  validateBuyItem,
  validateCancelOrder,
  validateEndTurn,
  validatePlaceOrder,
  validateTrade,
  validateUseItem,
  type GameData,
  type OrderRow,
  type PlayerRow,
  type RoomRow,
  MAX_PLAYERS,
} from '../../src/engine/engine.js';
import type { ItemRow } from '../../src/game/items.js';
import type { Trade } from '../../src/game/portfolio.js';

export interface ApiResult {
  status: number;
  body: unknown;
}

let admin: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('server env missing');
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/* ---------------- 요청 제한 (사용자별) ---------------- */
const buckets = new Map<string, { n: number; reset: number }>();
function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    return;
  }
  if (++b.n > max) throw new GameError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
}

/* ---------------- DB 헬퍼 ---------------- */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) {
    console.error(`[db] ${what}:`, res.error.message);
    throw new Error('db');
  }
  return res.data as T;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

async function loadGame(roomId: string): Promise<GameData> {
  const sb = db();
  const [room, secret, players, trades, items, orders] = await Promise.all([
    sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    sb.from('room_secrets').select('*').eq('room_id', roomId).maybeSingle(),
    sb.from('players').select('id, room_id, nickname, mode, ready, ended_day, created_at, version, left_game, last_seen').eq('room_id', roomId),
    sb.from('trades').select('id, player_id, day, symbol, side, qty, price, fee, created_at').eq('room_id', roomId).order('created_at'),
    sb.from('items').select('id, player_id, day, kind, action, cost, payload, created_at').eq('room_id', roomId).order('created_at'),
    sb.from('orders').select('id, player_id, day, symbol, side, qty, limit_price, fee, status, fill_price, created_at').eq('room_id', roomId).order('created_at'),
  ]);
  // 007 마이그레이션 전이면 나감·접속 컬럼 없이 다시 읽음
  let pl = players as { data: unknown; error: { message: string } | null };
  if (pl.error && /left_game|last_seen/.test(pl.error.message)) pl = await sb.from('players').select('id, room_id, nickname, mode, ready, ended_day, created_at, version').eq('room_id', roomId);
  const r = must(room, 'room');
  const s = must(secret, 'secret');
  if (!r || !s) throw new GameError('방을 찾을 수 없어요.', 404);
  return {
    room: {
      id: r.id,
      code: r.code,
      seed: s.seed,
      // 006 마이그레이션 전이거나 예전 방이면 1
      version: s.rules_version ?? 1,
      status: r.status,
      total_days: r.total_days,
      // 예전 '무제한'(0) 방은 최대 시간으로 진행
      turn_seconds: r.turn_seconds > 0 ? r.turn_seconds : LEGACY_TURN_SECONDS,
      day: r.day,
      deadline: r.turn_deadline ? new Date(r.turn_deadline).getTime() : null,
      // 005 마이그레이션 전에는 컬럼이 없음 → null
      day_deadline: r.day_deadline ? new Date(r.day_deadline).getTime() : null,
      host_id: r.host_id,
      title: r.title,
      max_players: r.max_players,
      is_private: r.is_private,
      next_code: r.next_code ?? null,
    } as RoomRow,
    players: must(pl, 'players') as PlayerRow[],
    trades: (must(trades, 'trades') as Trade[]).map((t) => ({ ...t, price: Number(t.price), fee: Number(t.fee) })),
    items: (must(items, 'items') as ItemRow[]).map((i) => ({ ...i, cost: Number(i.cost) })),
    // orders 테이블이 아직 없으면(마이그레이션 전) 빈 목록으로
    orders: ((orders.error && /orders/.test(orders.error.message) ? [] : must(orders, 'orders')) as OrderRow[]).map((o) => ({ ...o, limit_price: Number(o.limit_price), fee: Number(o.fee), fill_price: o.fill_price == null ? null : Number(o.fill_price) })),
  };
}

/** 이 사용자가 이 방의 플레이어인지 (아니면 403) */
async function myPlayerId(roomId: unknown, uid: string): Promise<{ roomId: string; playerId: string }> {
  if (typeof roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(roomId)) throw new GameError('잘못된 방이에요.');
  const res = await db().from('players').select('id').eq('room_id', roomId).eq('user_id', uid).maybeSingle();
  const p = must(res, 'membership');
  if (!p) throw new GameError('이 방에 참가하지 않았어요.', 403);
  return { roomId, playerId: (p as { id: string }).id };
}

/** 플레이어 행을 '버전 확인 후 갱신' — 같은 사람의 동시 요청이 겹쳐 돈이 두 번 쓰이는 것을 막는다 */
async function bumpPlayer(d: GameData, playerId: string, patch: Record<string, unknown> = {}) {
  const me = d.players.find((p) => p.id === playerId)!;
  const res = await db()
    .from('players')
    .update({ ...patch, version: me.version + 1, updated_at: new Date().toISOString() })
    .eq('id', playerId)
    .eq('version', me.version)
    .select('id');
  if (!must(res, 'bump').length) throw new GameError('동시에 여러 요청이 들어왔어요. 다시 시도해 주세요.', 409);
}

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

/**
 * 방 변경 신호: 마감·준비·입장·나감처럼 모두에게 공개된 변화만 rooms.rev 를 바꿔 실시간으로 알림.
 * (players 행 변화는 거래·카드 시점을 드러내므로 브라우저가 구독하지 않음 — 007)
 */
async function touchRoom(roomId: string) {
  const res = await db().from('rooms').update({ rev: randomInt(2_000_000_000) }).eq('id', roomId);
  if (res.error && !/rev/.test(res.error.message)) console.error('[api] touch', res.error.message);
}

/** 접속 기록 (자리 비움 판단용). 20초에 한 번만 씀 */
async function seen(d: GameData, playerId: string) {
  const me = d.players.find((p) => p.id === playerId);
  if (!me || me.left_game || d.room.status !== 'playing') return;
  const last = me.last_seen ? new Date(me.last_seen).getTime() : 0;
  if (Date.now() - last < 20_000) return;
  const now = new Date().toISOString();
  const res = await db().from('players').update({ last_seen: now }).eq('id', playerId);
  if (res.error && !/last_seen/.test(res.error.message)) console.error('[api] seen', res.error.message);
  me.last_seen = now;
}

/**
 * 오늘(day)·진행 중인 방만 갱신. day_deadline 컬럼이 아직 없으면(005 마이그레이션 전) 그 값만 빼고 다시 시도.
 * 바뀐 행 수를 돌려줌
 */
async function updatePlayingRoom(roomId: string, day: number, patch: Record<string, unknown>, label: string): Promise<number> {
  const run = (p: Record<string, unknown>) => db().from('rooms').update(p).eq('id', roomId).eq('day', day).eq('status', 'playing').select('id');
  let res = await run(patch);
  if (res.error && /day_deadline/.test(res.error.message) && 'day_deadline' in patch) {
    const { day_deadline: _d, ...rest } = patch;
    res = await run(rest);
  }
  return must(res, label).length;
}

/** 진행 중인데 마감 시각이 없는 예전 '무제한' 방에 마감 시각을 붙인다 */
async function ensureDeadline(d: GameData): Promise<boolean> {
  if (d.room.status !== 'playing' || d.room.deadline !== null) return false;
  const deadline = Date.now() + d.room.turn_seconds * 1000;
  return (await updatePlayingRoom(d.room.id, d.room.day, { turn_deadline: iso(deadline), day_deadline: iso(deadline) }, 'deadline')) > 0;
}

/** 예약 주문 결과 저장 — 주문마다 '아직 open 인 것만' 바꿔서 두 번 체결되지 않게. 체결 시각은 가격이 닿은 칸의 시각 */
async function applyOrders(d: GameData, results: ReturnType<typeof resolveOrders>): Promise<number> {
  let changed = 0;
  const bumped = new Set<string>();
  for (const r of results) {
    // 체결로 현금이 바뀌는 사람은 버전을 올려 둠 → 같은 순간의 직접 거래와 겹치면 한쪽만 성공 (현금이 마이너스 되지 않게)
    if (r.trade && !bumped.has(r.trade.player_id)) {
      try {
        await bumpPlayer(d, r.trade.player_id);
        const pl = d.players.find((x) => x.id === r.trade!.player_id);
        if (pl) pl.version += 1;
        bumped.add(r.trade.player_id);
      } catch {
        continue; // 다음 요청 때 새 데이터로 다시 판단
      }
    }
    const upd = must(
      await db().from('orders').update({ status: r.status, fill_price: r.trade?.price ?? null }).eq('id', r.id).eq('status', 'open').select('id'),
      'order status',
    );
    if (upd.length) changed++;
    if (upd.length && r.trade) must(await db().from('trades').insert({ room_id: d.room.id, ...r.trade }), 'order fill');
  }
  return changed;
}

/** 장중: 지금 칸까지 가격이 닿은 예약 주문을 바로 체결 */
async function fillOrdersNow(d: GameData): Promise<boolean> {
  if (d.room.status !== 'playing' || !d.orders.some((o) => o.day === d.room.day && o.status === 'open')) return false;
  return (await applyOrders(d, resolveOrders(d, d.room.day, dayClock(d.room, Date.now()).tick, false))) > 0;
}

async function maybeAdvance(d: GameData): Promise<boolean> {
  const next = nextRoomState(d, Date.now());
  if (!next) return false;
  const advanced = (await updatePlayingRoom(d.room.id, d.room.day, { day: next.day, status: next.status, turn_deadline: iso(next.deadline), day_deadline: iso(next.day_deadline) }, 'advance')) > 0;
  if (!advanced) return false;
  // 오늘 남은 예약 주문 처리: 끝까지 안 닿은 건 만료
  await applyOrders(d, resolveOrders(d, d.room.day, dayClock(d.room, 0).n, true));
  if (next.status === 'finished') {
    const fresh = await loadGame(d.room.id);
    const fin = finalResults(fresh);
    await db().from('match_history').upsert({ room_id: d.room.id, results: fin.results, winner_nickname: fin.winner }, { onConflict: 'room_id', ignoreDuplicates: true });
  }
  return true;
}

/* ---------------- 액션 ---------------- */

type Body = Record<string, unknown>;

async function act(action: string, b: Body, uid: string): Promise<unknown> {
  const sb = db();
  switch (action) {
    case 'create': {
      const nickname = cleanNickname(b.nickname);
      const mode = cleanMode(b.mode);
      const totalDays = cleanDays(b.totalDays);
      const turnSeconds = cleanTurn(b.turnSeconds);
      const maxPlayers = cleanMax(b.maxPlayers ?? 2);
      const title = cleanTitle(b.title, `${nickname}의 방`);
      const isPrivate = b.isPrivate === true;
      const passwordHash = isPrivate ? hashPassword(cleanPassword(b.password)) : null;
      // 방 만들기 남용 방지: 1시간에 10개까지
      const since = new Date(Date.now() - 3600_000).toISOString();
      const recent = must(await sb.from('players').select('id', { count: 'exact', head: false }).eq('user_id', uid).gte('created_at', since), 'recent') as unknown[];
      if (recent.length >= 10) throw new GameError('방을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.', 429);

      let room: { id: string; code: string } | null = null;
      for (let i = 0; i < 5 && !room; i++) {
        const res = await sb.from('rooms').insert({ code: newCode(), total_days: totalDays, turn_seconds: turnSeconds, title, max_players: maxPlayers, is_private: isPrivate }).select('id, code').single();
        if (!res.error) room = res.data;
        else if (!/duplicate/i.test(res.error.message)) must(res, 'create room');
      }
      if (!room) throw new GameError('방을 만들지 못했어요. 다시 시도해 주세요.', 500);
      // 새 방은 최신 시장 규칙(v2). rules_version 컬럼이 아직 없으면(006 적용 전) 빼고 저장 → v1
      const secretRow = { room_id: room.id, seed: randomInt(2_000_000_000), password_hash: passwordHash };
      let sec = await sb.from('room_secrets').insert({ ...secretRow, rules_version: CURRENT_RULES_VERSION });
      if (sec.error && /rules_version/.test(sec.error.message)) sec = await sb.from('room_secrets').insert(secretRow);
      must(sec, 'secret');
      const p = must(await sb.from('players').insert({ room_id: room.id, user_id: uid, nickname, mode, ready: true }).select('id').single(), 'host') as { id: string };
      must(await sb.from('rooms').update({ host_id: p.id }).eq('id', room.id), 'host_id');
      return { roomId: room.id, playerId: p.id, code: room.code };
    }

    case 'join': {
      const code = cleanCode(b.code);
      const nickname = cleanNickname(b.nickname);
      const mode = cleanMode(b.mode);
      const room = must(await sb.from('rooms').select('id, code, status, max_players').eq('code', code).maybeSingle(), 'find room') as { id: string; code: string; status: string; max_players: number } | null;
      if (!room) throw new GameError('그런 방 코드가 없어요.', 404);
      return addToRoom(room, uid, nickname, mode);
    }

    case 'rooms': {
      // 대기 중인 방 목록 (최근 3시간). 코드·비밀번호는 절대 보내지 않음
      const since = new Date(Date.now() - 3 * 3600_000).toISOString();
      const rooms = must(
        await sb.from('rooms').select('id, title, is_private, max_players, total_days, turn_seconds, host_id, created_at').eq('status', 'waiting').gte('created_at', since).order('created_at', { ascending: false }).limit(40),
        'rooms',
      ) as { id: string; title: string; is_private: boolean; max_players: number; total_days: number; turn_seconds: number; host_id: string; created_at: string }[];
      if (!rooms.length) return [];
      const ps = must(await sb.from('players').select('id, room_id, nickname, user_id').in('room_id', rooms.map((r) => r.id)), 'room players') as { id: string; room_id: string; nickname: string; user_id: string }[];
      return rooms
        .map((r) => {
          const mine = ps.filter((p) => p.room_id === r.id);
          return {
            id: r.id,
            title: r.title,
            isPrivate: r.is_private,
            maxPlayers: r.max_players,
            players: mine.length,
            host: mine.find((p) => p.id === r.host_id)?.nickname ?? '?',
            totalDays: r.total_days,
            turnSeconds: r.turn_seconds,
            joined: mine.some((p) => p.user_id === uid),
          };
        })
        .filter((r) => r.players > 0 && (r.players < r.maxPlayers || r.joined))
        .slice(0, 30);
    }

    case 'joinRoom': {
      // 방 목록에서 입장 — 비밀방은 비밀번호 확인
      if (typeof b.roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.roomId)) throw new GameError('잘못된 방이에요.');
      const nickname = cleanNickname(b.nickname);
      const mode = cleanMode(b.mode);
      const room = must(await sb.from('rooms').select('id, code, status, max_players, is_private').eq('id', b.roomId).maybeSingle(), 'find room') as
        | { id: string; code: string; status: string; max_players: number; is_private: boolean }
        | null;
      if (!room) throw new GameError('방을 찾을 수 없어요.', 404);
      const mine = must(await sb.from('players').select('id').eq('room_id', room.id).eq('user_id', uid).maybeSingle(), 'member');
      if (room.is_private && !mine) {
        const key = uid + ':' + room.id;
        pwGuard(key);
        await roomPwGuard(room.id);
        const secret = must(await sb.from('room_secrets').select('password_hash').eq('room_id', room.id).maybeSingle(), 'pw') as { password_hash: string | null } | null;
        const pw = typeof b.password === 'string' ? b.password.slice(0, 40) : '';
        if (!checkPassword(pw, secret?.password_hash ?? null)) {
          pwFail(key);
          await roomPwFail(room.id);
          throw new GameError('비밀번호가 맞지 않아요.', 403);
        }
      }
      return addToRoom(room, uid, nickname, mode);
    }

    case 'resume': {
      const rows = must(
        await sb.from('players').select('id, nickname, mode, room_id, rooms!inner(id, code, status)').eq('user_id', uid).eq('left_game', false).neq('rooms.status', 'finished').order('created_at', { ascending: false }).limit(1),
        'resume',
      ) as unknown as { id: string; nickname: string; mode: string; rooms: { id: string; code: string; status: string } }[];
      const r = rows[0];
      return r ? { roomId: r.rooms.id, code: r.rooms.code, status: r.rooms.status, playerId: r.id, nickname: r.nickname, mode: r.mode } : null;
    }

    case 'history': {
      const mine = must(await sb.from('players').select('room_id, nickname').eq('user_id', uid).limit(200), 'my rooms') as { room_id: string; nickname: string }[];
      if (!mine.length) return [];
      const nickOf = new Map(mine.map((m) => [m.room_id, m.nickname]));
      const rows = must(
        await sb.from('match_history').select('id, room_id, winner_nickname, results, created_at').in('room_id', mine.map((m) => m.room_id)).order('created_at', { ascending: false }).limit(30),
        'history',
      ) as { room_id: string }[];
      return rows.map(({ room_id, ...r }) => ({ ...r, me: nickOf.get(room_id) ?? null }));
    }

    case 'state': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      let d = await loadGame(roomId);
      await seen(d, playerId);
      if (await ensureDeadline(d)) d = await loadGame(roomId);
      if (await fillOrdersNow(d)) d = await loadGame(roomId);
      if (await maybeAdvance(d)) d = await loadGame(roomId);
      return buildView(d, playerId, Date.now(), typeof b.marketKey === 'string' ? b.marketKey : undefined);
    }

    case 'ready':
    case 'mode': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const patch = action === 'ready' ? { ready: b.ready === true } : { mode: cleanMode(b.mode) };
      if (action === 'ready') {
        const room = must(await sb.from('rooms').select('status').eq('id', roomId).single(), 'room') as { status: string };
        if (room.status !== 'waiting') throw new GameError('이미 시작한 방이에요.', 409);
      }
      must(await sb.from('players').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', playerId), action);
      if (action === 'ready') await touchRoom(roomId);
      return { ok: true };
    }

    case 'leave': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const room = must(await sb.from('rooms').select('status, host_id').eq('id', roomId).single(), 'room') as { status: string; host_id: string };
      if (room.status === 'playing') {
        // 게임 중 나가기 = 기권: 기록·순위는 남고, 남은 사람들은 더 이상 기다리지 않음
        const d = await loadGame(roomId);
        const patch = validateLeave(d, playerId);
        const res = await sb.from('players').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', playerId);
        if (res.error && /left_game/.test(res.error.message)) must(await sb.from('players').update({ ended_day: patch.ended_day }).eq('id', playerId), 'leave');
        else must(res, 'leave');
        const fresh = await loadGame(roomId);
        if (!(await maybeAdvance(fresh))) {
          const grace = graceDeadline(fresh, Date.now());
          if (grace !== null) await updatePlayingRoom(roomId, fresh.room.day, { turn_deadline: iso(grace) }, 'grace');
        }
        await touchRoom(roomId);
        return { ok: true };
      }
      if (room.status !== 'waiting') return { ok: true }; // 끝난 게임은 기록 보존
      if (room.host_id === playerId) {
        // 방장이 나가면 먼저 들어온 다음 사람에게 방장을 넘김 (아무도 없으면 방 삭제)
        const others = must(await sb.from('players').select('id').eq('room_id', roomId).neq('id', playerId).order('created_at').limit(1), 'others') as { id: string }[];
        if (!others.length) {
          must(await sb.from('rooms').delete().eq('id', roomId), 'delete room');
          return { ok: true };
        }
        must(await sb.from('players').delete().eq('id', playerId), 'leave');
        must(await sb.from('players').update({ ready: true }).eq('id', others[0].id), 'new host ready');
        must(await sb.from('rooms').update({ host_id: others[0].id }).eq('id', roomId), 'new host');
        await touchRoom(roomId);
        return { ok: true };
      }
      must(await sb.from('players').delete().eq('id', playerId), 'leave');
      await touchRoom(roomId);
      return { ok: true };
    }

    case 'rejoinCode': {
      // 다른 기기에서 이어하기: 방 코드 + 비밀값. 비밀값은 해시만 저장, 새로 받으면 예전 코드는 못 씀
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      rateLimit(uid + ':rejoinCode', 5, 600_000);
      const room = must(await sb.from('rooms').select('code, status').eq('id', roomId).single(), 'room') as { code: string; status: string };
      if (room.status === 'finished') throw new GameError('끝난 게임이에요.', 409);
      let secret = '';
      for (let i = 0; i < 10; i++) secret += CODE_CHARS[randomInt(CODE_CHARS.length)];
      const res = await sb.from('players').update({ rejoin_hash: hashPassword(secret) }).eq('id', playerId);
      if (res.error && /rejoin_hash/.test(res.error.message)) throw new GameError('아직 준비 중인 기능이에요.', 503);
      must(res, 'rejoin code');
      return { code: `${room.code}-${secret}` };
    }

    case 'rejoin': {
      // 이어하기 코드로 내 자리를 이 기기(계정)로 옮김 — 한 번 쓰면 끝
      rateLimit(uid + ':rejoin', 8, 600_000);
      const raw = typeof b.code === 'string' ? b.code.toUpperCase().replace(/\s/g, '') : '';
      const m = /^([A-Z0-9]{6})-([A-Z0-9]{10})$/.exec(raw);
      if (!m) throw new GameError('이어하기 코드는 "방코드-10자리" 모양이에요.');
      pwGuard(uid + ':rejoin');
      const room = must(await sb.from('rooms').select('id, code, status').eq('code', m[1]).maybeSingle(), 'find room') as { id: string; code: string; status: string } | null;
      const fail = () => {
        pwFail(uid + ':rejoin');
        return new GameError('이어하기 코드가 맞지 않아요.', 403);
      };
      if (!room || room.status === 'finished') throw fail();
      const ps = must(await sb.from('players').select('id, user_id, nickname, mode, rejoin_hash').eq('room_id', room.id), 'players') as { id: string; user_id: string; nickname: string; mode: string; rejoin_hash: string | null }[];
      const hit = ps.find((p) => p.rejoin_hash && checkPassword(m[2], p.rejoin_hash));
      if (!hit) throw fail();
      const mine = ps.find((p) => p.user_id === uid);
      if (mine && mine.id !== hit.id) throw new GameError('이 기기는 이미 이 방에 다른 자리로 들어와 있어요.', 409);
      must(await sb.from('players').update({ user_id: uid, rejoin_hash: null }).eq('id', hit.id).eq('rejoin_hash', hit.rejoin_hash!), 'rejoin');
      return { roomId: room.id, playerId: hit.id, code: room.code, status: room.status, nickname: hit.nickname, mode: hit.mode };
    }

    case 'rematch': {
      // 한 판 더: 끝난 방과 같은 설정으로 새 방. 이미 누가 만들었으면 그 코드로 (같은 방 사람만)
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const old = must(await sb.from('rooms').select('status, total_days, turn_seconds, title, max_players, is_private, next_code').eq('id', roomId).single(), 'room') as {
        status: string; total_days: number; turn_seconds: number; title: string; max_players: number; is_private: boolean; next_code: string | null;
      };
      if (old.status !== 'finished') throw new GameError('게임이 끝난 뒤에 할 수 있어요.', 409);
      const me = must(await sb.from('players').select('nickname, mode').eq('id', playerId).single(), 'me') as { nickname: string; mode: string };
      if (old.next_code) {
        const nr = must(await sb.from('rooms').select('id, code, status, max_players').eq('code', old.next_code).maybeSingle(), 'next') as { id: string; code: string; status: string; max_players: number } | null;
        if (!nr) throw new GameError('다시 하기 방이 사라졌어요.', 404);
        return addToRoom(nr, uid, me.nickname, me.mode);
      }
      const secret = must(await sb.from('room_secrets').select('password_hash').eq('room_id', roomId).maybeSingle(), 'pw') as { password_hash: string | null } | null;
      let room: { id: string; code: string } | null = null;
      for (let i = 0; i < 5 && !room; i++) {
        const res = await sb
          .from('rooms')
          .insert({ code: newCode(), total_days: old.total_days, turn_seconds: old.turn_seconds > 0 ? old.turn_seconds : 180, title: old.title, max_players: old.max_players, is_private: old.is_private })
          .select('id, code')
          .single();
        if (!res.error) room = res.data;
        else if (!/duplicate/i.test(res.error.message)) must(res, 'rematch room');
      }
      if (!room) throw new GameError('방을 만들지 못했어요. 다시 시도해 주세요.', 500);
      must(await sb.from('room_secrets').insert({ room_id: room.id, seed: randomInt(2_000_000_000), password_hash: secret?.password_hash ?? null, rules_version: CURRENT_RULES_VERSION }), 'secret');
      const p = must(await sb.from('players').insert({ room_id: room.id, user_id: uid, nickname: me.nickname, mode: me.mode, ready: true }).select('id').single(), 'host') as { id: string };
      must(await sb.from('rooms').update({ host_id: p.id }).eq('id', room.id), 'host_id');
      // 동시에 두 명이 눌렀으면 먼저 붙은 방만 남김
      const linked = must(await sb.from('rooms').update({ next_code: room.code }).eq('id', roomId).is('next_code', null).select('id'), 'link') as unknown[];
      if (!linked.length) {
        await sb.from('rooms').delete().eq('id', room.id);
        const again = must(await sb.from('rooms').select('next_code').eq('id', roomId).single(), 'again') as { next_code: string };
        const nr = must(await sb.from('rooms').select('id, code, status, max_players').eq('code', again.next_code).maybeSingle(), 'next') as { id: string; code: string; status: string; max_players: number } | null;
        if (!nr) throw new GameError('다시 하기 방이 사라졌어요.', 404);
        return addToRoom(nr, uid, me.nickname, me.mode);
      }
      return { roomId: room.id, playerId: p.id, code: room.code };
    }

    case 'forgetMe': {
      // 내 데이터 모두 지우기: 익명 계정을 지우면 내 참가 기록·거래·카드가 함께 지워짐(cascade).
      // 진행·대기 중인 방이 있으면 다른 사람 게임이 깨지므로 먼저 나가게 함
      rateLimit(uid + ':forget', 3, 600_000);
      const mine = must(await sb.from('players').select('id, left_game, rooms!inner(status)').eq('user_id', uid), 'my rooms') as unknown as { id: string; left_game: boolean; rooms: { status: string } }[];
      if (mine.some((p) => p.rooms.status === 'waiting' || (p.rooms.status === 'playing' && !p.left_game)))
        throw new GameError('대기 중이거나 진행 중인 방이 있어요. 먼저 그 방에서 나간(기권한) 뒤에 지울 수 있어요.', 409);
      const del = await sb.auth.admin.deleteUser(uid);
      if (del.error) throw new GameError('지우지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      return { ok: true };
    }

    case 'kick': {
      // 대기실에서 방장이 다른 사람을 내보냄 (준비 안 하고 자리만 차지하는 경우)
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const room = must(await sb.from('rooms').select('status, host_id').eq('id', roomId).single(), 'room') as { status: string; host_id: string };
      if (room.host_id !== playerId) throw new GameError('방장만 내보낼 수 있어요.', 403);
      if (room.status !== 'waiting') throw new GameError('게임이 시작된 뒤에는 내보낼 수 없어요.', 409);
      const target = typeof b.target === 'string' ? b.target : '';
      if (!/^[0-9a-f-]{36}$/i.test(target) || target === playerId) throw new GameError('내보낼 사람을 골라 주세요.');
      const del = must(await sb.from('players').delete().eq('id', target).eq('room_id', roomId).select('id'), 'kick') as unknown[];
      if (!del.length) throw new GameError('이미 나간 사람이에요.', 404);
      await touchRoom(roomId);
      return { ok: true };
    }

    case 'start': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      if (d.room.host_id !== playerId) throw new GameError('방장만 시작할 수 있어요.', 403);
      if (d.room.status !== 'waiting') throw new GameError('이미 시작했어요.', 409);
      if (d.players.length < 2) throw new GameError('2명 이상 모여야 시작할 수 있어요.', 409);
      if (!d.players.every((p) => p.ready || p.id === playerId)) throw new GameError('모두 준비해야 시작할 수 있어요.', 409);
      const deadline = iso(Date.now() + (d.room.turn_seconds + 3) * 1000);
      let st = await sb.from('rooms').update({ status: 'playing', day: 0, turn_deadline: deadline, day_deadline: deadline }).eq('id', roomId).eq('status', 'waiting');
      if (st.error && /day_deadline/.test(st.error.message)) st = await sb.from('rooms').update({ status: 'playing', day: 0, turn_deadline: deadline }).eq('id', roomId).eq('status', 'waiting');
      must(st, 'start');
      return { ok: true };
    }

    case 'trade': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const t = validateTrade(d, playerId, Date.now(), b);
      await bumpPlayer(d, playerId);
      must(await sb.from('trades').insert({ room_id: roomId, ...t }), 'trade');
      return { ok: true, price: t.price, fee: t.fee };
    }

    case 'buyItem':
    case 'useItem': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const row = action === 'buyItem' ? validateBuyItem(d, playerId, Date.now(), b) : validateUseItem(d, playerId, Date.now(), b);
      await bumpPlayer(d, playerId);
      must(await sb.from('items').insert({ room_id: roomId, ...row }), 'item');
      return { ok: true };
    }

    case 'placeOrder': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const o = validatePlaceOrder(d, playerId, Date.now(), b);
      await bumpPlayer(d, playerId);
      must(await sb.from('orders').insert({ room_id: roomId, ...o }), 'order');
      return { ok: true };
    }

    case 'cancelOrder': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const id = validateCancelOrder(d, playerId, Date.now(), b);
      await bumpPlayer(d, playerId);
      must(await sb.from('orders').update({ status: 'cancelled' }).eq('id', id).eq('status', 'open'), 'cancel');
      return { ok: true };
    }

    case 'endTurn': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const { day } = validateEndTurn(d, playerId, Date.now());
      await bumpPlayer(d, playerId, { ended_day: day });
      const fresh = await loadGame(roomId);
      if (!(await maybeAdvance(fresh))) {
        // 마감 인원이 기준에 닿으면 카운트다운(1대1 90초, 3인 이상 ⅔ 마감 시 30초) — 더 이를 때만 당김
        const grace = graceDeadline(fresh, Date.now());
        if (grace !== null) await updatePlayingRoom(roomId, fresh.room.day, { turn_deadline: iso(grace) }, 'grace');
      }
      await touchRoom(roomId);
      return { ok: true };
    }

    case 'cancelEnd': {
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const { endedDay } = validateCancelEnd(d, playerId, Date.now());
      await bumpPlayer(d, playerId, { ended_day: endedDay });
      // 마감 인원이 기준 아래로 내려가면 카운트다운을 멈추고 원래 마감 시각으로
      const fresh = await loadGame(roomId);
      const back = restoreDeadline(fresh);
      if (back !== null) await updatePlayingRoom(roomId, fresh.room.day, { turn_deadline: iso(back) }, 'restore');
      await touchRoom(roomId);
      return { ok: true };
    }

    default:
      throw new GameError('알 수 없는 요청이에요.');
  }
}

/** 요청 진입점: 토큰 검증 → 요청 제한 → 액션 */
export async function handle(body: unknown, token: string | null): Promise<ApiResult> {
  try {
    if (!token || token.length > 4096) return { status: 401, body: { error: '로그인이 필요해요.' } };
    const { data, error } = await db().auth.getUser(token);
    if (error || !data.user) return { status: 401, body: { error: '로그인이 만료됐어요. 새로고침해 주세요.' } };
    const uid = data.user.id;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: '잘못된 요청이에요.' } };
    const b = body as Body;
    const action = typeof b.action === 'string' ? b.action : '';
    // 화면 갱신과 행동(거래·마감 등)은 따로 셈 → 붐비는 방에서도 갱신 때문에 거래가 막히지 않게
    if (action === 'state') rateLimit(uid + ':state', 60, 20_000);
    else rateLimit(uid + ':act', 40, 20_000);
    const result = await act(action, b, uid);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof GameError) return { status: e.status, body: { error: e.message } };
    console.error('[api] unexpected', e instanceof Error ? e.message : e);
    return { status: 500, body: { error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' } };
  }
}
