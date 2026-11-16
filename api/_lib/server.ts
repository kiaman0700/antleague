/**
 * 게임 서버 — 모든 쓰기 작업은 여기서만 일어난다.
 * 브라우저는 Supabase 테이블에 직접 쓸 수 없고(RLS), 이 함수가 비밀 키로 대신 쓴다.
 * 비밀 키(SUPABASE_SECRET_KEY)는 서버 환경변수에만 있고 브라우저 번들에는 절대 들어가지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

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
/**
 * 한 사람은 한 방에만: 다른 대기실에 있으면 거기서 자동으로 나오고, 진행 중인 대결(기권 안 함)이 있으면 막음.
 * (재입장 팝업이 여러 방 중 하나만 보여 주는 문제·한 사람이 여러 판을 동시에 하는 문제 방지)
 */
async function ensureFree(uid: string, exceptRoom?: string) {
  const seats = must(await db().from('players').select('id, room_id, left_game, rooms!inner(status)').eq('user_id', uid).in('rooms.status', ['playing', 'waiting']), 'seats') as unknown as { id: string; room_id: string; left_game: boolean; rooms: { status: string } }[];
  const others = seats.filter((p) => p.room_id !== exceptRoom);
  if (others.some((p) => p.rooms.status === 'playing' && !p.left_game))
    throw new GameError('진행 중인 대결이 있어요. 로비의 재입장 안내로 돌아가거나 기권한 뒤에 다른 방에 들어갈 수 있어요.', 409);
  for (const p of others.filter((x) => x.rooms.status === 'waiting')) await leaveSeat(p.room_id, p.id).catch(() => {});
  // 매칭을 찾던 중이었으면 그 대기도 취소 (이미 잡혔으면 그대로 — 곧 그쪽 게임이 시작됨)
  await db().from('match_tickets').delete().eq('user_id', uid).is('claim', null).is('room_id', null);
}

async function addToRoom(room: { id: string; code: string; status: string; max_players: number }, uid: string, nickname: string, mode: string) {
  const sb = db();
  const players = must(await sb.from('players').select('id, user_id, nickname').eq('room_id', room.id), 'players') as { id: string; user_id: string; nickname: string }[];
  const already = players.find((p) => p.user_id === uid);
  if (already) return { roomId: room.id, playerId: already.id, code: room.code };
  if (room.status !== 'waiting') throw new GameError('이미 시작했거나 끝난 방이에요.', 409);
  if (players.length >= room.max_players) throw new GameError(`방이 가득 찼어요 (최대 ${room.max_players}명).`, 409);
  if (players.some((p) => p.nickname === nickname)) throw new GameError('방에 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.');
  // 들어갈 수 있는 방인지 다 확인한 뒤에야: 다른 대기실에서 나오기 / 대결 중이면 막기
  await ensureFree(uid, room.id);
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
  validatePreReady,
  preAllReadyDeadline,
  type GameData,
  type OrderRow,
  type PlayerRow,
  type RoomRow,
  MAX_PLAYERS,
} from '../../src/engine/engine.js';
import type { ItemRow } from '../../src/game/items.js';
import { SOCIAL_ACTIONS, socialAct, touchSeen } from './social.js';
import { accountAct, getProfile, loginEmail, nicknameFree, recordMatch, resetPassword } from './accounts.js';
import { CASUAL_MAX_WINDOW, compatible, estimateWaitSec, PARTY_MAX, parseQueue, pickGroup, queueName, rankedMax, ratingWindow, SPEED_PRESET } from '../../src/engine/matching.js';
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
    sb.from('players').select('id, room_id, nickname, mode, ready, ended_day, created_at, version, left_game, last_seen, pre_day').eq('room_id', roomId),
    sb.from('trades').select('id, player_id, day, symbol, side, qty, price, fee, created_at').eq('room_id', roomId).order('created_at'),
    sb.from('items').select('id, player_id, day, kind, action, cost, payload, created_at').eq('room_id', roomId).order('created_at'),
    sb.from('orders').select('id, player_id, day, symbol, side, qty, limit_price, fee, status, fill_price, created_at').eq('room_id', roomId).order('created_at'),
  ]);
  // 007 마이그레이션 전이면 나감·접속 컬럼 없이 다시 읽음
  let pl = players as { data: unknown; error: { message: string } | null };
  // 025(pre_day) 적용 전이면 그 칸만 빼고 다시
  if (pl.error && /pre_day/.test(pl.error.message)) pl = await sb.from('players').select('id, room_id, nickname, mode, ready, ended_day, created_at, version, left_game, last_seen').eq('room_id', roomId);
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
      // v4: 시장 비밀값 (011 전이면 없음 → v3 와 같은 난수)
      salt: s.salt ?? null,
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
      kind: r.kind ?? 'custom',
      ranked: !!r.ranked,
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

/**
 * 방 비밀 저장: 최신 규칙(v4)은 128비트 시장 비밀값(salt)과 함께.
 * 마이그레이션 전이면 할 수 있는 만큼(v3 → v1)으로 내려서 저장
 */
async function insertSecret(row: { room_id: string; seed: number; password_hash: string | null }) {
  const sb = db();
  let sec = await sb.from('room_secrets').insert({ ...row, rules_version: CURRENT_RULES_VERSION, salt: randomBytes(16).toString('hex') });
  // 칸이 아예 없을 때(마이그레이션 전)만 내려서 저장. 제한(check) 위반 같은 다른 오류는 몰래 예전 규칙으로 바꾸지 않고 오류로
  const missing = (msg: string, col: string) => msg.includes(col) && /does not exist|could not find|schema cache/i.test(msg);
  if (sec.error && missing(sec.error.message, 'salt')) sec = await sb.from('room_secrets').insert({ ...row, rules_version: 3 });
  if (sec.error && missing(sec.error.message, 'rules_version')) sec = await sb.from('room_secrets').insert(row);
  must(sec, 'secret');
}

/** 회원이면 프로필 닉네임, 아니면 입력한 닉네임 */
/** 게임에서 쓸 닉네임: 회원은 프로필 닉네임(입력값 무시), 게스트는 입력값 — 단 회원이 쓰는 닉네임은 못 씀(사칭 방지) */
/** 최근에 내가 '만든' 커스텀 방 수 (매칭·초대로 들어간 자리는 세지 않음 — 매칭을 많이 해도 방 만들기가 막히지 않게) */
async function roomsMadeSince(uid: string, since: string) {
  const r = await db().from('players').select('id, rooms!inner(kind, host_id)').eq('user_id', uid).gte('created_at', since).limit(200);
  if (r.error) return 0;
  return ((r.data ?? []) as unknown as { id: string; rooms: { kind: string | null; host_id: string | null } }[]).filter((p) => (p.rooms.kind ?? 'custom') === 'custom' && p.rooms.host_id === p.id).length;
}

async function nickFor(uid: string, raw: unknown) {
  const p = await getProfile(db(), uid);
  if (p) return p.nickname;
  const n = cleanNickname(raw);
  if (!(await nicknameFree(db(), n))) throw new GameError('회원이 쓰는 닉네임이에요. 게스트 닉네임을 다른 것으로 바꿔 주세요.', 409);
  return n;
}

/** 이 방에서 회원(프로필 있음)인 플레이어들 — 화면엔 '회원 표시'만 (user_id 는 보내지 않음). 1분 캐시 */
const verifiedCache = new Map<string, { at: number; ids: Set<string> }>();
async function verifiedPlayers(roomId: string): Promise<Set<string>> {
  const hit = verifiedCache.get(roomId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const ps = ((await db().from('players').select('id, user_id').eq('room_id', roomId)).data ?? []) as { id: string; user_id: string | null }[];
  const uids = ps.map((p) => p.user_id).filter((x): x is string => !!x);
  const pr = uids.length ? await db().from('profiles').select('user_id').in('user_id', uids) : { data: [] as { user_id: string }[], error: null };
  const have = new Set(((pr.error ? [] : pr.data) ?? []).map((x) => x.user_id));
  const ids = new Set(ps.filter((p) => p.user_id && have.has(p.user_id)).map((p) => p.id));
  verifiedCache.set(roomId, { at: Date.now(), ids });
  if (verifiedCache.size > 2000) verifiedCache.clear();
  return ids;
}

/** 시장 키를 섞을 방별 비밀값 (서버 비밀 키로 만든 HMAC — 화면은 절대 알 수 없음) */
function keySalt(roomId: string) {
  return createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('market-key:' + roomId).digest('hex');
}

/** 접속 기록 (자리 비움 판단용). 20초에 한 번만 씀 */
async function seen(d: GameData, playerId: string) {
  const me = d.players.find((p) => p.id === playerId);
  // 대기실(방장이 살아 있는지 — 방 목록)과 게임 중(자리 비움) 모두 기록
  if (!me || me.left_game || d.room.status === 'finished') return;
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
    try {
      await recordMatch(db(), d.room.id, fin.results, !!d.room.ranked);
    } catch (e) {
      console.error('[api] rank', e instanceof Error ? e.message : e);
    }
  }
  return true;
}

/* ---------------- 액션 ---------------- */

type Body = Record<string, unknown>;

async function act(action: string, b: Body, uid: string): Promise<unknown> {
  const sb = db();
  switch (action) {
    case 'create': {
      const nickname = await nickFor(uid, b.nickname);
      const mode = cleanMode(b.mode);
      const totalDays = cleanDays(b.totalDays);
      const turnSeconds = cleanTurn(b.turnSeconds);
      const maxPlayers = cleanMax(b.maxPlayers ?? 2);
      const title = cleanTitle(b.title, `${nickname}의 방`);
      const isPrivate = b.isPrivate === true;
      const passwordHash = isPrivate ? hashPassword(cleanPassword(b.password)) : null;
      // 방 만들기 남용 방지: 1시간에 10개까지
      const since = new Date(Date.now() - 3600_000).toISOString();
      rateLimit(uid + ':makeRoom', 15, 3600_000); // 만들고 바로 나가 방이 지워지는 경우까지 (서버 메모리 기준)
      if ((await roomsMadeSince(uid, since)) >= 10) throw new GameError('방을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.', 429);

      let room: { id: string; code: string } | null = null;
      for (let i = 0; i < 5 && !room; i++) {
        const res = await sb.from('rooms').insert({ code: newCode(), total_days: totalDays, turn_seconds: turnSeconds, title, max_players: maxPlayers, is_private: isPrivate }).select('id, code').single();
        if (!res.error) room = res.data;
        else if (!/duplicate/i.test(res.error.message)) must(res, 'create room');
      }
      if (!room) throw new GameError('방을 만들지 못했어요. 다시 시도해 주세요.', 500);
      // 새 방은 최신 시장 규칙(v2). rules_version 컬럼이 아직 없으면(006 적용 전) 빼고 저장 → v1
      const secretRow = { room_id: room.id, seed: randomInt(2_000_000_000), password_hash: passwordHash };
      await insertSecret(secretRow);
      let p: { id: string };
      try {
        await ensureFree(uid, room.id);
        p = must(await sb.from('players').insert({ room_id: room.id, user_id: uid, nickname, mode, ready: true }).select('id').single(), 'host') as { id: string };
      } catch (e) {
        await sb.from('rooms').delete().eq('id', room.id); // 빈 방이 남지 않게
        throw e;
      }
      must(await sb.from('rooms').update({ host_id: p.id }).eq('id', room.id), 'host_id');
      return { roomId: room.id, playerId: p.id, code: room.code };
    }

    case 'join': {
      const code = cleanCode(b.code);
      const nickname = await nickFor(uid, b.nickname);
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
      let psRes = await sb.from('players').select('id, room_id, nickname, user_id, last_seen').in('room_id', rooms.map((r) => r.id));
      if (psRes.error && /last_seen/.test(psRes.error.message)) psRes = (await sb.from('players').select('id, room_id, nickname, user_id').in('room_id', rooms.map((r) => r.id))) as typeof psRes;
      const ps = must(psRes, 'room players') as { id: string; room_id: string; nickname: string; user_id: string; last_seen?: string | null }[];
      // 방장이 창을 닫고 2분 넘게 응답이 없는 방은 목록에서 숨김 (들어가도 시작할 사람이 없음)
      const hostAlive = (r: { id: string; host_id: string; created_at: string }) => {
        const h = ps.find((p) => p.id === r.host_id);
        const seenAt = h?.last_seen ? new Date(h.last_seen).getTime() : new Date(r.created_at).getTime();
        return Date.now() - seenAt < 120_000;
      };
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
            alive: hostAlive(r),
          };
        })
        .filter((r) => r.players > 0 && (r.players < r.maxPlayers || r.joined) && (r.joined || r.alive))
        .map(({ alive: _a, ...r }) => r)
        .slice(0, 30);
    }

    case 'joinRoom': {
      // 방 목록에서 입장 — 비밀방은 비밀번호 확인
      if (typeof b.roomId !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.roomId)) throw new GameError('잘못된 방이에요.');
      const nickname = await nickFor(uid, b.nickname);
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
      // 화면이 이미 가진 장중 칸 수 (숫자만 받음)
      const lf = typeof b.liveDay === 'number' && typeof b.liveFrom === 'number' ? { day: Math.floor(b.liveDay), from: Math.floor(b.liveFrom) } : undefined;
      return buildView(d, playerId, Date.now(), typeof b.marketKey === 'string' ? b.marketKey : undefined, keySalt(roomId), await verifiedPlayers(roomId), lf);
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
      return leaveSeat(roomId, playerId);
    }

    case 'rejoinCode': {
      // 다른 기기에서 이어하기: 방 코드 + 비밀값. 비밀값은 해시만 저장, 새로 받으면 예전 코드는 못 씀
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      rateLimit(uid + ':rejoinCode', 5, 600_000);
      // 회원 자리는 옮길 수 없음 (다른 기기에서 같은 아이디로 로그인하면 이어짐) — 랭킹전에서 지는 판을 다른 계정으로 넘겨 점수를 피하지 못하게
      if ((await sb.from('profiles').select('user_id').eq('user_id', uid).maybeSingle()).data)
        throw new GameError('회원은 다른 기기에서 같은 아이디로 로그인하면 바로 이어할 수 있어요.', 409);
      const room = must(await sb.from('rooms').select('code, status').eq('id', roomId).single(), 'room') as { code: string; status: string };
      if (room.status === 'finished') throw new GameError('끝난 게임이에요.', 409);
      let secret = '';
      for (let i = 0; i < 10; i++) secret += CODE_CHARS[randomInt(CODE_CHARS.length)];
      // 10분 안에만 쓸 수 있게 만료 시각을 해시 앞에 붙여 저장 ("만료ms|소금:해시")
      const res = await sb.from('players').update({ rejoin_hash: `${Date.now() + 600_000}|${hashPassword(secret)}` }).eq('id', playerId);
      if (res.error && /rejoin_hash/.test(res.error.message)) throw new GameError('아직 준비 중인 기능이에요.', 503);
      must(res, 'rejoin code');
      return { code: `${room.code}-${secret}`, expiresIn: 600 };
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
      await roomPwGuard(room.id); // 방 기준 시도 제한 (계정을 새로 만들어도 유지)
      const ps = must(await sb.from('players').select('id, user_id, nickname, mode, rejoin_hash').eq('room_id', room.id), 'players') as { id: string; user_id: string; nickname: string; mode: string; rejoin_hash: string | null }[];
      const live = (h: string | null) => {
        if (!h) return null;
        const [exp, hash] = h.includes('|') ? h.split('|') : ['0', ''];
        return Number(exp) > Date.now() ? hash : null;
      };
      const hit = ps.find((p) => {
        const h = live(p.rejoin_hash);
        return !!h && checkPassword(m[2], h);
      });
      if (!hit) {
        await roomPwFail(room.id);
        throw fail();
      }
      // 회원 자리는 옮기지 않음 (코드가 회원이 되기 전에 만들어졌어도)
      if (hit.user_id && (await sb.from('profiles').select('user_id').eq('user_id', hit.user_id).maybeSingle()).data) throw fail();
      const mine = ps.find((p) => p.user_id === uid);
      if (mine && mine.id !== hit.id) throw new GameError('이 기기는 이미 이 방에 다른 자리로 들어와 있어요.', 409);
      await ensureFree(uid, room.id); // 다른 대결 중이면 옮겨 오지 못함 (한 사람은 한 방에만)
      const moved = must(await sb.from('players').update({ user_id: uid, rejoin_hash: null }).eq('id', hit.id).eq('rejoin_hash', hit.rejoin_hash!).select('id'), 'rejoin') as unknown[];
      if (!moved.length) throw fail(); // 같은 코드로 동시에 두 번 — 한 번만 성공
      await touchRoom(room.id);
      return { roomId: room.id, playerId: hit.id, code: room.code, status: room.status, nickname: hit.nickname, mode: hit.mode };
    }

    case 'rematch': {
      // 한 판 더: 끝난 방과 같은 설정으로 새 방. 이미 누가 만들었으면 그 코드로 (같은 방 사람만)
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const old = must(await sb.from('rooms').select('status, total_days, turn_seconds, title, max_players, is_private, next_code, kind').eq('id', roomId).single(), 'room') as {
        status: string; total_days: number; turn_seconds: number; title: string; max_players: number; is_private: boolean; next_code: string | null; kind?: string;
      };
      if (old.status !== 'finished') throw new GameError('게임이 끝난 뒤에 할 수 있어요.', 409);
      // 매칭 방은 '한 판 더' 대신 같은 조건으로 다시 찾기 (랭킹전 상대를 골라 반복하지 못하게)
      if (old.kind === 'match') throw new GameError('매칭 대결은 같은 조건으로 다시 찾아 주세요.', 409);
      const me = must(await sb.from('players').select('nickname, mode').eq('id', playerId).single(), 'me') as { nickname: string; mode: string };
      const prof = await getProfile(sb, uid);
      if (prof) me.nickname = prof.nickname;
      if (old.next_code) {
        const nr = must(await sb.from('rooms').select('id, code, status, max_players').eq('code', old.next_code).maybeSingle(), 'next') as { id: string; code: string; status: string; max_players: number } | null;
        if (!nr) throw new GameError('다시 하기 방이 사라졌어요.', 404);
        return addToRoom(nr, uid, me.nickname, me.mode);
      }
      const since = new Date(Date.now() - 3600_000).toISOString();
      rateLimit(uid + ':makeRoom', 15, 3600_000); // 만들고 바로 나가 방이 지워지는 경우까지 (서버 메모리 기준)
      if ((await roomsMadeSince(uid, since)) >= 10) throw new GameError('방을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요.', 429);
      await ensureFree(uid);
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
      await insertSecret({ room_id: room.id, seed: randomInt(2_000_000_000), password_hash: secret?.password_hash ?? null });
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
      // 끝난 게임의 순위표 닉네임은 '탈퇴한 플레이어'로 (다른 사람 기록의 숫자는 그대로)
      const ids = mine.map((p) => p.id);
      for (const id of ids) await sb.from('players').update({ nickname: `탈퇴${randomInt(100000)}`, rejoin_hash: null }).eq('id', id);
      const del = await sb.auth.admin.deleteUser(uid);
      if (del.error) throw new GameError('지우지 못했어요. 잠시 후 다시 시도해 주세요.', 500);
      return { ok: true };
    }

    case 'feedback': {
      // 의견 보내기 (문의·버그·삭제 요청). 10분에 3번
      rateLimit(uid + ':feedback', 3, 600_000);
      const kind = ['bug', 'idea', 'privacy', 'etc'].includes(b.kind as string) ? (b.kind as string) : 'etc';
      // 줄바꿈·탭 말고 보이지 않는 제어 문자는 뺌
      const text = typeof b.text === 'string' ? [...b.text.normalize('NFC')].filter((ch) => ch.charCodeAt(0) === 10 || ch.charCodeAt(0) === 9 || ch.charCodeAt(0) >= 32).join('').trim() : '';
      if (text.length < 2 || text.length > 1000) throw new GameError('내용을 2~1000자로 적어 주세요.');
      const page = typeof b.page === 'string' ? b.page.slice(0, 160) : null;
      const res = await sb.from('feedback').insert({ user_id: uid, kind, body: text, page });
      if (res.error) throw new GameError('보내지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
      return { ok: true };
    }

    /* ---------- 매칭 ---------- */
    case 'queueJoin': {
      rateLimit(uid + ':queue', 20, 600_000);
      const q = parseQueue(b.queue);
      if (!q) throw new GameError('대결 종류를 골라 주세요.');
      const prof = await getProfile(sb, uid);
      if (q.kind === 'ranked' && !prof) throw new GameError('랭킹전은 로그인한 회원만 할 수 있어요.', 403);
      const nickname = prof ? prof.nickname : await nickFor(uid, b.nickname);
      const mode = cleanMode(b.mode);
      // 진행 중인 대결·대기실이 있으면 먼저 끝내거나 나가게 (두 판을 동시에 하지 않게)
      const seats = must(await sb.from('players').select('id, left_game, rooms!inner(status)').eq('user_id', uid).in('rooms.status', ['playing', 'waiting']), 'seats') as unknown as { left_game: boolean; rooms: { status: string } }[];
      if (seats.some((p) => p.rooms.status === 'playing' && !p.left_game)) throw new GameError('진행 중인 대결이 있어요. 새로고침하면 나오는 재입장 안내로 돌아가거나 기권한 뒤에 찾아 주세요.', 409);
      if (seats.some((p) => p.rooms.status === 'waiting')) throw new GameError('들어가 있는 대기실이 있어요. 그 방에서 나온 뒤에 찾아 주세요.', 409);
      // 이미 다른 사람이 나를 잡아 방을 만드는 중이면 덮어쓰지 않음
      const cur = (await sb.from('match_tickets').select('claim, claimed_at, room_id').eq('user_id', uid).maybeSingle()).data as { claim: string | null; claimed_at: string | null; room_id: string | null } | null;
      if (cur && !cur.room_id && cur.claim && cur.claimed_at && Date.now() - new Date(cur.claimed_at).getTime() < 15_000)
        throw new GameError('지금 상대를 연결하고 있어요. 잠시만 기다려 주세요.', 409);
      const now = new Date().toISOString();
      const party = prof ? await partyOf(uid) : null;
      if (party && party.members.length > 1) {
        // 파티: 파티장만 찾기 시작, 일반전 다인전만. 파티원 모두의 대기표를 같은 파티로 한꺼번에
        if (party.leader !== uid) throw new GameError('파티는 파티장이 찾기를 시작해요.', 409);
        if (q.kind !== 'casual' || q.size !== 'multi') throw new GameError('파티는 일반전 다인전만 같이 찾을 수 있어요. 랭킹전·1대1은 파티에서 나온 뒤 혼자 찾아 주세요.', 409);
        const rows = [];
        // 파티원이 1분 안에 접속해 있어야 (없으면 찾다가 바로 취소됨)
        const seenRows = (((await sb.from('profiles').select('user_id, last_seen').in('user_id', party.members)).data ?? []) as { user_id: string; last_seen: string | null }[]);
        if (seenRows.some((r) => r.user_id !== uid && (!r.last_seen || Date.now() - new Date(r.last_seen).getTime() > 75_000)))
          throw new GameError('파티원이 지금 접속해 있지 않아요. 친구가 들어오면 다시 찾아 주세요.', 409);
        // 파티원 중 누가 이미 다른 대결에 잡혀 있으면 덮어쓰지 않음
        const curT = (((await sb.from('match_tickets').select('user_id, claim, room_id, party_id').in('user_id', party.members)).data ?? []) as { user_id: string; claim: string | null; room_id: string | null; party_id: string | null }[]);
        if (curT.some((t) => t.claim && !t.room_id)) throw new GameError('지금 상대를 연결하고 있어요. 잠시만 기다려 주세요.', 409);
        for (const m of party.members) {
          if (m !== uid) {
            const ss = must(await sb.from('players').select('left_game, rooms!inner(status)').eq('user_id', m).in('rooms.status', ['playing', 'waiting']), 'seats') as unknown as { left_game: boolean; rooms: { status: string } }[];
            if (ss.some((x) => (x.rooms.status === 'playing' && !x.left_game) || x.rooms.status === 'waiting')) throw new GameError('파티원이 지금 다른 게임이나 대기실에 있어요.', 409);
          }
          const mp = m === uid ? prof : await getProfile(sb, m);
          rows.push({ user_id: m, queue: queueName(q), rating: mp?.rating ?? 1000, nickname: mp?.nickname ?? nickname, mode: m === uid ? mode : 'easy', party_id: party.id, claim: null, claimed_at: null, room_id: null, player_id: null, matched_at: null, created_at: now, last_poll: now });
        }
        const pr = await sb.from('match_tickets').upsert(rows, { onConflict: 'user_id' });
        if (pr.error) throw new GameError('대기열에 들어가지 못했어요.', 503);
        return { ok: true, party: true };
      }
      const row = { user_id: uid, queue: queueName(q), rating: prof?.rating ?? 1000, nickname, mode, party_id: null, claim: null, claimed_at: null, room_id: null, player_id: null, matched_at: null, created_at: now, last_poll: now };
      let res = await sb.from('match_tickets').upsert(row, { onConflict: 'user_id' });
      if (res.error && /party_id/.test(res.error.message)) {
        // 020 전: 새 칸 없이
        const { party_id: _p, ...old } = row;
        void _p;
        res = await sb.from('match_tickets').upsert(old, { onConflict: 'user_id' });
      }
      if (res.error) throw new GameError(/match_tickets/.test(res.error.message) ? '아직 준비 중인 기능이에요.' : '대기열에 들어가지 못했어요.', 503);
      return { ok: true };
    }

    case 'queueLeave': {
      // 아직 아무도 잡지 않은 대기표만 지움. 이미 상대가 잡혔으면 지우지 않고 알려 줌 (곧 매칭 결과가 나옴)
      const myT = (await sb.from('match_tickets').select('party_id').eq('user_id', uid).maybeSingle()).data as { party_id: string | null } | null;
      if (myT?.party_id) {
        // 파티 대기 중 하나라도 이미 잡혔으면(방 만드는 중) 취소하지 않고 결과를 기다림
        const claimed = (await sb.from('match_tickets').select('id').eq('party_id', myT.party_id).or('claim.not.is.null,room_id.not.is.null').limit(1)).data ?? [];
        if (claimed.length) return { ok: false, pending: true };
        await sb.from('match_tickets').delete().eq('party_id', myT.party_id).is('room_id', null).is('claim', null);
      }
      const gone = must(await sb.from('match_tickets').delete().eq('user_id', uid).is('room_id', null).is('claim', null).select('id'), 'leave') as unknown[];
      if (myT?.party_id) return { ok: true };
      if (gone.length) return { ok: true };
      const left = (await sb.from('match_tickets').select('id, room_id').eq('user_id', uid).maybeSingle()).data as { id: string; room_id: string | null } | null;
      return left ? { ok: false, pending: true } : { ok: true };
    }

    case 'queueCounts': {
      // 대기열마다 지금 기다리는 사람 수 (숫자만 — 누가 기다리는지는 안 보냄). 사람이 많은 쪽을 고르기 쉽게
      rateLimit(uid + ':qcounts', 30, 60_000);
      const rows = ((await sb.from('match_tickets').select('queue, rating, user_id').is('room_id', null).gte('last_poll', new Date(Date.now() - 10_000).toISOString()).limit(2000)).data ?? []) as { queue: string; rating: number; user_id: string }[];
      const counts: Record<string, number> = {};
      for (const r of rows) if (r.user_id !== uid) counts[r.queue] = (counts[r.queue] ?? 0) + 1;
      // 대기열마다 '지금 찾으면' 예상 대기 (내 점수 기준)
      const myProf = await getProfile(sb, uid);
      const myRating = myProf?.rating ?? 1000;
      const myParty = myProf ? ((await partyOf(uid))?.members.length ?? 1) : 1;
      const st = await matchStats();
      const eta: Record<string, number | null> = {};
      for (const kind of ['ranked', 'casual'] as const)
        for (const size of ['duel', 'multi'] as const)
          for (const speed of ['quick', 'normal'] as const) {
            const q = `${kind}_${size}_${speed}`;
            const others = rows.filter((r) => r.queue === q && r.user_id !== uid);
            // 파티(2명)면 다인전 예상은 파티 기준, 1대1·랭킹전은 파티로 못 들어가므로 혼자 기준
            eta[q] = waitEstimate(q, myRating, 0, others.map((o) => o.rating), st, Date.now(), kind === 'casual' && size === 'multi' ? myParty : 1);
          }
      return { counts, eta, online: st.online };
    }

    case 'queueStatus': {
      type T = { id: string; user_id: string; queue: string; rating: number; nickname: string; mode: string; claim: string | null; room_id: string | null; player_id: string | null; created_at: string; matched_at: string | null; party_id?: string | null; ip_hash?: string | null };
      const mine = (await sb.from('match_tickets').select('*').eq('user_id', uid).maybeSingle()).data as T | null;
      if (!mine) return { status: 'none' };
      if (mine.room_id && mine.player_id) {
        // 매칭 결과는 잠시(2분) 남겨 둠 — 응답을 놓쳐도 다음 확인 때 다시 받음
        const room = (await sb.from('rooms').select('code').eq('id', mine.room_id).maybeSingle()).data as { code: string } | null;
        if (!room) {
          await sb.from('match_tickets').delete().eq('id', mine.id);
          return { status: 'none' };
        }
        return { status: 'matched', roomId: mine.room_id, playerId: mine.player_id, code: room.code, nickname: mine.nickname, mode: mine.mode };
      }
      const nowMs = Date.now();
      const ago = (ms: number) => new Date(nowMs - ms).toISOString();
      await sb.from('match_tickets').update({ last_poll: new Date(nowMs).toISOString() }).eq('id', mine.id);
      // 정리: 창을 닫은 사람(10초 응답 없음), 서버가 멈춰 15초 넘게 '잡힌 채' 남은 표, 2분 지난 매칭 결과
      await sb.from('match_tickets').delete().is('room_id', null).is('claim', null).lt('last_poll', ago(10_000));
      await sb.from('match_tickets').update({ claim: null, claimed_at: null }).is('room_id', null).lt('claimed_at', ago(15_000));
      await sb.from('match_tickets').delete().lt('matched_at', ago(120_000));
      const q = parseQueue(mine.queue)!;
      const maxWin = q.kind === 'ranked' ? rankedMax : CASUAL_MAX_WINDOW;
      let wq = await sb.from('match_tickets').select('id, user_id, rating, nickname, mode, created_at, party_id').eq('queue', mine.queue).is('room_id', null).is('claim', null).gte('last_poll', ago(10_000)).order('created_at').limit(50);
      if (wq.error) wq = (await sb.from('match_tickets').select('id, user_id, rating, nickname, mode, created_at').eq('queue', mine.queue).is('room_id', null).is('claim', null).gte('last_poll', ago(10_000)).order('created_at').limit(50)) as typeof wq;
      let waiting = (wq.data ?? []) as { id: string; user_id: string; rating: number; nickname: string; mode: string; created_at: string; party_id?: string | null }[];
      // 파티는 파티원 모두의 표가 살아 있어야 (한 명이 창을 닫았으면 파티 표 전체를 정리)
      const partyCount = new Map<string, number>();
      for (const w of waiting) if (w.party_id) partyCount.set(w.party_id, (partyCount.get(w.party_id) ?? 0) + 1);
      if (mine.party_id && !mine.claim && (partyCount.get(mine.party_id) ?? 0) < 2) {
        // 파티원 표가 (잡힌 것 포함) 하나도 없으면 = 파티원이 창을 닫음 → 파티 대기 취소. 누가 방을 만드는 중(잡힘)이면 그대로 둠
        const rest = (await sb.from('match_tickets').select('id, claim').eq('party_id', mine.party_id).neq('id', mine.id).limit(2)).data ?? [];
        if (!rest.length) {
          await sb.from('match_tickets').delete().eq('party_id', mine.party_id).is('room_id', null).is('claim', null);
          return { status: 'none', reason: 'party' };
        }
      }
      waiting = waiting.filter((w) => !w.party_id || (partyCount.get(w.party_id) ?? 0) === 2);
      const toT = (t: { id: string; rating: number; created_at: string; party_id?: string | null }) => ({ id: t.id, rating: t.rating, createdAt: new Date(t.created_at).getTime(), party: t.party_id ?? null });
      const meT = toT(mine);
      // 내 파티 표가 정확히 2장 살아 있을 때만 파티로 매칭 (동시에 셋이 들어간 경우 등은 매칭하지 않음)
      const partyOk = !mine.party_id || (partyCount.get(mine.party_id) ?? 0) === 2;
      const st = await matchStats();
      const etaSec = waitEstimate(mine.queue, mine.rating, nowMs - meT.createdAt, waiting.filter((w) => w.id !== mine.id).map((w) => w.rating), st, nowMs, mine.party_id ? 2 : 1);
      const similar = waiting.filter((w) => w.id !== mine.id && compatible(meT, toT(w), nowMs, maxWin)).length;
      const waitingInfo = { status: 'waiting', waitedSec: Math.round((nowMs - meT.createdAt) / 1000), inQueue: waiting.length, similar, online: st.online, etaSec, window: ratingWindow(meT, nowMs, maxWin) };
      // 친구·같은 상대끼리도 만날 수 있음 (사람이 적을 때 대기가 길어지지 않게). 짜고 치기는 점수 쪽에서 막음
      const group = mine.claim || !partyOk ? null : pickGroup(meT, waiting.map(toT), q.size, nowMs, maxWin);
      if (!group) return waitingInfo;
      // 같은 사람들을 둘이 동시에 잡으려다 서로 계속 실패하지 않게: 무리 중 가장 먼저 온 사람의 확인 때만 방을 만듦
      const first = [...group].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1))[0];
      if (first.id !== mine.id) return waitingInfo;
      const batch = randomBytes(16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      const ids = group.map((g) => g.id);
      const got = must(await sb.from('match_tickets').update({ claim: batch, claimed_at: new Date(nowMs).toISOString() }).in('id', ids).is('claim', null).is('room_id', null).select('id'), 'claim') as { id: string }[];
      if (got.length !== ids.length) {
        await sb.from('match_tickets').update({ claim: null, claimed_at: null }).eq('claim', batch);
        return waitingInfo;
      }
      let roomId: string | null = null;
      try {
        const members = ids.map((id) => waiting.find((w) => w.id === id) ?? { id: mine.id, user_id: uid, rating: mine.rating, nickname: mine.nickname, mode: mine.mode, created_at: mine.created_at });
        // 닉네임이 겹치면 뒤에 숫자를 붙임 (방 안에서는 유일해야 함)
        const used = new Set<string>();
        for (const m of members) {
          let n = m.nickname;
          for (let k = 2; used.has(n); k++) n = (m.nickname.slice(0, 8) + k).slice(0, 10);
          used.add(n);
          m.nickname = n;
        }
        const preset = SPEED_PRESET[q.speed];
        const title = `${q.kind === 'ranked' ? '랭킹전' : '일반전'} · ${q.size === 'duel' ? '1대1' : `${members.length}인`} · ${preset.label}`;
        let room: { id: string; code: string } | null = null;
        for (let i = 0; i < 5 && !room; i++) {
          const res = await sb.from('rooms').insert({ code: newCode(), total_days: preset.days, turn_seconds: preset.turnSeconds, title, max_players: members.length, is_private: true, kind: 'match', ranked: q.kind === 'ranked' }).select('id, code').single();
          if (!res.error) room = res.data;
          else if (!/duplicate/i.test(res.error.message)) must(res, 'match room');
        }
        if (!room) throw new GameError('방을 만들지 못했어요.', 500);
        roomId = room.id;
        await insertSecret({ room_id: room.id, seed: randomInt(2_000_000_000), password_hash: null });
        const ins = must(await sb.from('players').insert(members.map((m) => ({ room_id: room!.id, user_id: m.user_id, nickname: m.nickname, mode: m.mode, ready: true }))).select('id, user_id'), 'match players') as { id: string; user_id: string }[];
        const deadline = iso(Date.now() + (preset.turnSeconds + 5) * 1000);
        must(await sb.from('rooms').update({ host_id: ins[0].id, status: 'playing', day: 0, turn_deadline: deadline, day_deadline: deadline }).eq('id', room.id), 'match start');
        const matchedAt = new Date().toISOString();
        for (const m of members) {
          const p = ins.find((x) => x.user_id === m.user_id);
          await sb.from('match_tickets').update({ room_id: room.id, player_id: p?.id ?? null, nickname: m.nickname, matched_at: matchedAt }).eq('id', m.id);
        }
        const meP = ins.find((x) => x.user_id === uid)!;
        return { status: 'matched', roomId: room.id, playerId: meP.id, code: room.code, nickname: members.find((m) => m.user_id === uid)!.nickname, mode: mine.mode };
      } catch (e) {
        // 반쯤 만들어진 방은 지우고(자리·비밀값도 함께 지워짐) 대기표는 다시 풀어 줌
        if (roomId) await sb.from('rooms').delete().eq('id', roomId);
        await sb.from('match_tickets').update({ claim: null, claimed_at: null, room_id: null, player_id: null, matched_at: null }).eq('claim', batch);
        throw e;
      }
    }

    case 'kick': {
      // 대기실에서 방장이 다른 사람을 내보냄 (준비 안 하고 자리만 차지하는 경우)
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const room = must(await sb.from('rooms').select('status, host_id').eq('id', roomId).single(), 'room') as { status: string; host_id: string };
      if (room.host_id !== playerId) throw new GameError('방장만 내보낼 수 있어요.', 403);
      if (room.status !== 'waiting') throw new GameError('게임이 시작된 뒤에는 내보낼 수 없어요.', 409);
      const target = typeof b.target === 'string' ? b.target : '';
      if (!/^[0-9a-f-]{36}$/i.test(target) || target === playerId) throw new GameError('내보낼 사람을 골라 주세요.');
      // 시작과 동시에 눌러도 꼬이지 않게 DB 함수로(방 잠금 후 대기 중일 때만) — 010
      const rpc = await sb.rpc('kick_player', { p_room: roomId, p_host: playerId, p_target: target });
      if (!rpc.error) {
        if (rpc.data !== true) throw new GameError('내보내지 못했어요. 이미 나갔거나 게임이 시작됐어요.', 409);
        return { ok: true };
      }
      if (!/kick_player/.test(rpc.error.message)) must(rpc, 'kick');
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

    case 'preReady': {
      // (v7) 장 전 '준비 완료' — 남은 사람이 모두 누르면 장을 바로 엶
      const { roomId, playerId } = await myPlayerId(b.roomId, uid);
      const d = await loadGame(roomId);
      const { day } = validatePreReady(d, playerId, Date.now());
      await bumpPlayer(d, playerId, { pre_day: day });
      const fresh = await loadGame(roomId);
      const open = preAllReadyDeadline(fresh, Date.now());
      if (open !== null) await updatePlayingRoom(roomId, day, { turn_deadline: iso(open), day_deadline: iso(open) }, 'preopen');
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
/**
 * 손님 계정 (익명 로그인이 막혔을 때의 대체 경로).
 * Supabase 익명 로그인은 같은 인터넷(IP) 당 시간마다 수십 명으로 막혀 PC방·학교에서 접속이 안 될 수 있음 →
 * 서버가 무작위 이메일·비밀번호 계정을 만들어 주고(관리자 API), 브라우저는 그걸로 로그인 (로그인 한도가 훨씬 넉넉함).
 * 개인정보 없음(가짜 이메일). 같은 IP 에서 10분에 20개까지
 */
async function createGuest(ip: string) {
  rateLimit('guest:' + ip, 20, 600_000);
  // DB 기준 제한 (서버 인스턴스가 바뀌어도 유지): 같은 IP 시간당 60개, 전체 시간당 3000개
  const ipHash = createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('guest-ip:' + ip).digest('hex').slice(0, 32);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [mine, all] = await Promise.all([
    db().from('guest_log').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since),
    db().from('guest_log').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if (!mine.error && (mine.count ?? 0) >= 60) throw new GameError('같은 인터넷에서 접속이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
  if (!all.error && (all.count ?? 0) >= 3000) throw new GameError('지금 접속이 몰려 있어요. 잠시 후 다시 시도해 주세요.', 429);
  const id = randomBytes(12).toString('hex');
  const email = `guest-${id}@guest.invalid`;
  const password = randomBytes(24).toString('base64url');
  const res = await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { guest: true } });
  if (res.error) {
    console.error('[api] guest', res.error.message);
    throw new GameError('접속용 계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
  }
  await db().from('guest_log').insert({ ip_hash: ipHash });
  return { email, password };
}

/* ---------------- 운영자 ---------------- */
// 운영자 = 서버(비밀 키)만 쓸 수 있는 app_metadata.role 이 'admin' 인 계정. 이메일만으로는 절대 운영자가 아님
// (누가 같은 이메일로 먼저 가입해도 운영자가 될 수 없음)
const isAdminUser = (u: { app_metadata?: Record<string, unknown> | null; is_anonymous?: boolean }) => u.app_metadata?.role === 'admin' && !u.is_anonymous;
// (app_metadata 는 비밀 키로만 바꿀 수 있고, 이 서버 코드 어디에도 role 을 쓰는 곳이 없음)

/*
 * 운영자 계정은 화면·API 로 만들 수 없음. 운영자 지정은 DB 비밀 주소가 있는 운영자 컴퓨터에서만:
 *   npm run db -- set-admin <아이디>   (해제: unset-admin)
 */

async function adminAct(action: string, b: Body) {
  const sb = db();
  if (action === 'adminInbox') {
    const kind = typeof b.kind === 'string' && ['bug', 'idea', 'privacy', 'etc'].includes(b.kind) ? b.kind : null;
    let q = sb.from('feedback').select('id, kind, body, page, created_at, read_at').order('created_at', { ascending: false }).limit(200);
    if (kind) q = q.eq('kind', kind);
    if (b.unread === true) q = q.is('read_at', null);
    const rows = must(await q, 'inbox');
    const unread = await sb.from('feedback').select('id', { count: 'exact', head: true }).is('read_at', null);
    return { rows, unread: unread.count ?? 0 };
  }
  if (action === 'adminUnread') {
    // 위 메뉴 의견함 배지: 안 읽은 의견 수만
    const unread = await sb.from('feedback').select('id', { count: 'exact', head: true }).is('read_at', null);
    return { unread: unread.count ?? 0 };
  }
  if (action === 'adminMarkRead') {
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).filter((x): x is number => Number.isInteger(x)).slice(0, 200) : [];
    const read = b.read !== false;
    if (ids.length) must(await sb.from('feedback').update({ read_at: read ? new Date().toISOString() : null }).in('id', ids), 'mark');
    return { ok: true };
  }
  throw new GameError('알 수 없는 요청이에요.');
}

/* ---------- 친구 초대: 커스텀 방 초대 · 1대1 신청 (회원끼리, 친구만) ---------- */
const ROOM_INVITE_MS = 5 * 60_000;
const DUEL_INVITE_MS = 90_000;
const INVITE_ACTIONS = ['invites', 'inviteRoom', 'challenge', 'inviteRespond', 'inviteCancel'];

/** 친구 관계 줄 id → 상대 user id (내가 그 관계에 있고, 친구(수락)이고, 서로 차단하지 않았을 때만) */
async function friendOf(uid: string, friendId: unknown): Promise<string> {
  const sb = db();
  if (typeof friendId !== 'string' || !/^[0-9a-f-]{36}$/i.test(friendId)) throw new GameError('잘못된 요청이에요.');
  const r = (await sb.from('friendships').select('user_a, user_b, status').eq('id', friendId).maybeSingle()).data as { user_a: string; user_b: string; status: string } | null;
  if (!r || r.status !== 'accepted' || (r.user_a !== uid && r.user_b !== uid)) throw new GameError('친구를 찾을 수 없어요.', 404);
  const other = r.user_a === uid ? r.user_b : r.user_a;
  const blk = (await sb.from('blocks').select('id').or(`and(blocker.eq.${uid},blocked.eq.${other}),and(blocker.eq.${other},blocked.eq.${uid})`).limit(1)).data ?? [];
  // 차단 관계면 (상대가 나를 차단한 경우 포함) 조용히 아무 일도 없게 — 차단 사실을 알 수 없도록 성공처럼 보임
  if (blk.length) throw Object.assign(new GameError('보냈어요.', 200), { silent: true });
  return other;
}

/** 지금도 친구이고 서로 차단하지 않았는지 */
async function areFriends(a: string, b: string) {
  const sb = db();
  const pr = a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
  const f = (await sb.from('friendships').select('status').eq('user_a', pr.user_a).eq('user_b', pr.user_b).maybeSingle()).data as { status: string } | null;
  if (!f || f.status !== 'accepted') return false;
  const blk = (await sb.from('blocks').select('id').or(`and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a})`).limit(1)).data ?? [];
  return blk.length === 0;
}

/** 진행 중인 대결·대기실이 있는지 */
async function busySeat(uid: string) {
  const seats = must(await db().from('players').select('left_game, rooms!inner(status)').eq('user_id', uid).in('rooms.status', ['playing', 'waiting']), 'seats') as unknown as { left_game: boolean; rooms: { status: string } }[];
  return seats.some((p) => (p.rooms.status === 'playing' && !p.left_game) || p.rooms.status === 'waiting');
}

async function inviteAct(action: string, b: Body, uid: string): Promise<unknown> {
  const sb = db();
  const me = await getProfile(sb, uid);
  if (!me) throw new GameError('친구 초대는 회원만 쓸 수 있어요.', 403);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cleanInviteId = (v: unknown) => {
    if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) throw new GameError('잘못된 요청이에요.');
    return v;
  };

  switch (action) {
    case 'invites': {
      // 받은 초대(대기 중·만료 전) + 내가 보낸 1대1 신청의 결과. 닉네임·방 제목만 (user id 없음)
      rateLimit(uid + ':invites', 40, 60_000);
      const inbox = ((await sb.from('invites').select('id, from_user, kind, room_id, speed, expires_at').eq('to_user', uid).eq('status', 'pending').gt('expires_at', nowIso).order('created_at').limit(10)).data ?? []) as {
        id: string; from_user: string; kind: string; room_id: string | null; speed: string | null; expires_at: string;
      }[];
      const sent = ((await sb.from('invites').select('id, to_user, kind, status, room_id, from_player, expires_at, speed').eq('from_user', uid).eq('kind', 'duel').gte('created_at', new Date(now - 10 * 60_000).toISOString()).order('created_at', { ascending: false }).limit(1)).data ?? []) as {
        id: string; to_user: string; kind: string; status: string; room_id: string | null; from_player: string | null; expires_at: string; speed: string | null;
      }[];
      const uids = [...new Set([...inbox.map((x) => x.from_user), ...sent.map((x) => x.to_user)])];
      const nick = new Map(uids.length ? (((await sb.from('profiles').select('user_id, nickname').in('user_id', uids)).data ?? []) as { user_id: string; nickname: string }[]).map((p) => [p.user_id, p.nickname]) : []);
      const roomIds = inbox.map((x) => x.room_id).filter((x): x is string => !!x);
      const rooms = new Map(roomIds.length ? (((await sb.from('rooms').select('id, title, status, max_players').in('id', roomIds)).data ?? []) as { id: string; title: string; status: string; max_players: number }[]).map((r) => [r.id, r]) : []);
      const stillFriends = new Set<string>();
      for (const f of inbox.map((x) => x.from_user)) if (await areFriends(uid, f)) stillFriends.add(f);
      const incoming = inbox
        .filter((x) => stillFriends.has(x.from_user))
        .filter((x) => x.kind === 'duel' || x.kind === 'party' || rooms.get(x.room_id ?? '')?.status === 'waiting')
        .map((x) => ({ id: x.id, kind: x.kind, from: nick.get(x.from_user) ?? '친구', title: x.kind === 'room' ? (rooms.get(x.room_id!)?.title ?? '') : null, speed: x.speed, expiresAt: x.expires_at, left: Math.max(0, Math.round((new Date(x.expires_at).getTime() - now) / 1000)) }));
      const s = sent[0];
      let duel: unknown = null;
      if (s) {
        const expired = s.status === 'pending' && new Date(s.expires_at).getTime() <= now;
        duel = { id: s.id, to: nick.get(s.to_user) ?? '친구', status: expired ? 'expired' : s.status, speed: s.speed, expiresAt: s.expires_at, left: Math.max(0, Math.round((new Date(s.expires_at).getTime() - now) / 1000)) };
        if (s.status === 'accepted' && s.room_id && s.from_player) {
          const room = (await sb.from('rooms').select('code, status').eq('id', s.room_id).maybeSingle()).data as { code: string; status: string } | null;
          const seat = (await sb.from('players').select('left_game').eq('id', s.from_player).maybeSingle()).data as { left_game: boolean | null } | null;
          const fresh = now - new Date(s.expires_at).getTime() < 3 * 60_000;
          if (room && room.status === 'playing' && seat && !seat.left_game && fresh) duel = { ...(duel as object), roomId: s.room_id, playerId: s.from_player, code: room.code, nickname: me.nickname };
        }
      }
      return { incoming, duel };
    }

    case 'inviteRoom': {
      // 내가 들어가 있는 대기 중인 방으로 친구 초대 (5분 동안, 비밀방이어도 비밀번호 없이 입장)
      rateLimit(uid + ':inviteRoom', 20, 600_000);
      let other: string;
      try {
        other = await friendOf(uid, b.friendId);
      } catch (e) {
        if ((e as { silent?: boolean }).silent) return { ok: true };
        throw e;
      }
      const { roomId } = await myPlayerId(b.roomId, uid);
      const room = must(await sb.from('rooms').select('status, max_players, is_private, host_id').eq('id', roomId).single(), 'room') as { status: string; max_players: number; is_private: boolean; host_id: string };
      if (room.status !== 'waiting') throw new GameError('대기 중인 방에서만 초대할 수 있어요.', 409);
      const mySeat = (await myPlayerId(b.roomId, uid)).playerId;
      if (room.is_private && room.host_id !== mySeat) throw new GameError('비밀방은 방장만 초대할 수 있어요.', 403);
      const n = (((await sb.from('players').select('id').eq('room_id', roomId)).data ?? []) as unknown[]).length;
      if (n >= room.max_players) throw new GameError('방이 가득 찼어요.', 409);
      // 같은 사람·같은 방 초대가 이미 있으면 시간만 늘림
      await sb.from('invites').update({ status: 'cancelled' }).eq('from_user', uid).eq('to_user', other).eq('room_id', roomId).eq('status', 'pending');
      const ins = await sb.from('invites').insert({ from_user: uid, to_user: other, kind: 'room', room_id: roomId, expires_at: new Date(now + ROOM_INVITE_MS).toISOString() });
      if (ins.error) throw new GameError(/invites/.test(ins.error.message) ? '아직 준비 중인 기능이에요.' : '초대하지 못했어요.', 503);
      return { ok: true };
    }

    case 'challenge': {
      // 친구에게 1대1 신청 (점수 없음). 90초 안에 수락하면 둘이 바로 시작
      rateLimit(uid + ':challenge', 10, 600_000);
      let other: string;
      const speed = b.speed === 'normal' ? 'normal' : 'quick';
      try {
        other = await friendOf(uid, b.friendId);
      } catch (e) {
        if ((e as { silent?: boolean }).silent) {
          // 차단된 경우: 겉으로는 보낸 것처럼 (아무도 받지 않아 시간이 지나면 '답이 없었어요')
          return { ok: true };
        }
        throw e;
      }
      if (await busySeat(uid)) throw new GameError('진행 중인 대결이나 대기실이 있어요. 먼저 끝내거나 나간 뒤에 신청해 주세요.', 409);
      // 지난 매칭 결과 표는 정리, 지금 찾는 중이면 먼저 그만 찾기
      await sb.from('match_tickets').delete().eq('user_id', uid).not('room_id', 'is', null);
      const myQ = (await sb.from('match_tickets').select('id').eq('user_id', uid).maybeSingle()).data;
      if (myQ) throw new GameError('매칭을 찾는 중이에요. 그만 찾기를 누른 뒤에 신청해 주세요.', 409);
      // 내가 보낸 다른 1대1 신청은 취소 (한 번에 하나만)
      await sb.from('invites').update({ status: 'cancelled' }).eq('from_user', uid).eq('kind', 'duel').eq('status', 'pending');
      const ins = await sb.from('invites').insert({ from_user: uid, to_user: other, kind: 'duel', speed, expires_at: new Date(now + DUEL_INVITE_MS).toISOString() });
      if (ins.error) throw new GameError(/invites/.test(ins.error.message) ? '아직 준비 중인 기능이에요.' : '신청하지 못했어요.', 503);
      return { ok: true };
    }

    case 'inviteCancel': {
      const id = cleanInviteId(b.id);
      await sb.from('invites').update({ status: 'cancelled' }).eq('id', id).eq('from_user', uid).eq('status', 'pending');
      return { ok: true };
    }

    case 'inviteRespond': {
      const id = cleanInviteId(b.id);
      const inv = (await sb.from('invites').select('id, from_user, to_user, kind, room_id, speed, status, expires_at').eq('id', id).maybeSingle()).data as {
        id: string; from_user: string; to_user: string; kind: string; room_id: string | null; speed: string | null; status: string; expires_at: string;
      } | null;
      // 나에게 온, 아직 대기 중이고 만료 전인 초대만
      if (!inv || inv.to_user !== uid || inv.status !== 'pending') throw new GameError('초대를 찾을 수 없어요.', 404);
      if (new Date(inv.expires_at).getTime() <= now) throw new GameError('초대 시간이 지났어요.', 410);
      if (b.accept !== true) {
        await sb.from('invites').update({ status: 'declined' }).eq('id', id).eq('status', 'pending');
        return { ok: true };
      }
      // 아직 아무도 안 잡은 매칭 대기만 정리 (이미 잡혀 시작한 게임 결과는 건드리지 않음 — 그 판은 busySeat 가 막음)
      if (inv.kind !== 'party') await sb.from('match_tickets').delete().eq('user_id', uid).is('claim', null).is('room_id', null);
      if (!(await areFriends(uid, inv.from_user))) {
        await sb.from('invites').update({ status: 'cancelled' }).eq('id', id);
        throw new GameError('초대를 찾을 수 없어요.', 404);
      }
      // 매칭을 찾는 중이면 그 대기는 취소하고 받음 (이미 상대가 잡혔으면 받을 수 없음)
      // (이미 끝난 매칭 결과 표는 진짜 게임 여부를 busySeat 가 따로 봄)
      const myTicket = (await sb.from('match_tickets').select('claim, room_id').eq('user_id', uid).maybeSingle()).data as { claim: string | null; room_id: string | null } | null;
      if (myTicket && myTicket.claim && !myTicket.room_id && inv.kind !== 'party') throw new GameError('지금 매칭 상대를 연결하고 있어요. 잠시 뒤 다시 눌러 주세요.', 409);
      // 한 번만 쓰이게: pending → accepted 를 먼저 잡음
      const took = must(await sb.from('invites').update({ status: 'accepted' }).eq('id', id).eq('status', 'pending').select('id'), 'take') as unknown[];
      if (!took.length) throw new GameError('초대를 찾을 수 없어요.', 404);
      const mode = b.mode === undefined ? 'easy' : cleanMode(b.mode);
      if (inv.kind === 'party') {
        const pid = ((await sb.from('invites').select('party_id').eq('id', id).single()).data as { party_id: string | null } | null)?.party_id;
        const pt = pid ? ((await sb.from('parties').select('id, leader').eq('id', pid).maybeSingle()).data as { id: string; leader: string } | null) : null;
        if (!pt || pt.leader !== inv.from_user) throw new GameError('파티가 없어졌어요.', 404);
        const n = (((await sb.from('party_members').select('user_id').eq('party_id', pt.id)).data ?? []) as unknown[]).length;
        if (n >= PARTY_MAX) throw new GameError('파티가 가득 찼어요.', 409);
        // 다른 파티에 있었으면 거기서 나오고, 혼자 찾던 대기도 취소하고 들어감
        await leaveParty(uid);
        await sb.from('match_tickets').delete().eq('user_id', uid).is('claim', null).is('room_id', null);
        const j = await sb.rpc('join_party', { p_party: pt.id, p_user: uid, p_max: PARTY_MAX });
        if (j.error) {
          // 021 전: 그냥 넣기
          const ins = await sb.from('party_members').insert({ party_id: pt.id, user_id: uid });
          if (ins.error) throw new GameError('파티에 들어가지 못했어요.', 409);
        } else if (j.data !== true) throw new GameError('파티가 가득 찼어요.', 409);
        return { kind: 'party' };
      }
      if (inv.kind === 'room') {
        const room = (await sb.from('rooms').select('id, code, status, max_players').eq('id', inv.room_id!).maybeSingle()).data as { id: string; code: string; status: string; max_players: number } | null;
        if (!room) throw new GameError('방이 사라졌어요.', 404);
        // 초대한 사람이 아직 그 방에 있어야
        const host = (await sb.from('players').select('id').eq('room_id', room.id).eq('user_id', inv.from_user).maybeSingle()).data;
        if (!host) throw new GameError('초대한 친구가 방에서 나갔어요.', 409);
        const r = await addToRoom(room, uid, me.nickname, mode);
        return { kind: 'room', ...r, nickname: me.nickname };
      }
      // 1대1: 둘 다 다른 게임이 없어야 (게임이 없으면 지난 매칭 결과 표는 정리)
      if (await busySeat(uid)) throw new GameError('진행 중인 대결이나 대기실이 있어요. 먼저 끝내거나 나간 뒤에 수락해 주세요.', 409);
      await sb.from('match_tickets').delete().eq('user_id', uid).not('room_id', 'is', null);
      const fromT = (await sb.from('match_tickets').select('claim, room_id').eq('user_id', inv.from_user).maybeSingle()).data as { claim: string | null; room_id: string | null } | null;
      if ((await busySeat(inv.from_user)) || (fromT && fromT.claim && !fromT.room_id)) {
        await sb.from('invites').update({ status: 'cancelled' }).eq('id', id);
        throw new GameError('신청한 친구가 지금 다른 게임 중이에요.', 409);
      }
      await sb.from('match_tickets').delete().eq('user_id', inv.from_user).is('claim', null);
      const from = await getProfile(sb, inv.from_user);
      if (!from) throw new GameError('신청한 친구를 찾을 수 없어요.', 404);
      const preset = SPEED_PRESET[inv.speed === 'normal' ? 'normal' : 'quick'];
      let room: { id: string; code: string } | null = null;
      for (let i = 0; i < 5 && !room; i++) {
        const res = await sb.from('rooms').insert({ code: newCode(), total_days: preset.days, turn_seconds: preset.turnSeconds, title: `친구 1대1 · ${preset.label}`, max_players: 2, is_private: true, kind: 'friend', ranked: false }).select('id, code').single();
        if (!res.error) room = res.data;
        else if (!/duplicate/i.test(res.error.message)) must(res, 'duel room');
      }
      if (!room) throw new GameError('방을 만들지 못했어요.', 500);
      try {
        await insertSecret({ room_id: room.id, seed: randomInt(2_000_000_000), password_hash: null });
        const fromNick = from.nickname;
        const ins = must(await sb.from('players').insert([
          { room_id: room.id, user_id: inv.from_user, nickname: fromNick, mode: 'easy', ready: true },
          { room_id: room.id, user_id: uid, nickname: me.nickname, mode, ready: true },
        ]).select('id, user_id'), 'duel players') as { id: string; user_id: string }[];
        const deadline = iso(Date.now() + (preset.turnSeconds + 5) * 1000);
        must(await sb.from('rooms').update({ host_id: ins[0].id, status: 'playing', day: 0, turn_deadline: deadline, day_deadline: deadline }).eq('id', room.id), 'duel start');
        const fromP = ins.find((x) => x.user_id === inv.from_user)!;
        const meP = ins.find((x) => x.user_id === uid)!;
        await sb.from('invites').update({ room_id: room.id, from_player: fromP.id }).eq('id', id);
        return { kind: 'duel', roomId: room.id, playerId: meP.id, code: room.code, nickname: me.nickname };
      } catch (e) {
        await sb.from('rooms').delete().eq('id', room.id);
        await sb.from('invites').update({ status: 'cancelled' }).eq('id', id);
        throw e;
      }
    }
  }
  throw new GameError('알 수 없는 요청이에요.');
}

/* ---------- 일반전 파티 (회원, 최대 2명, 일반전 다인전만 같이 찾기) ---------- */
const PARTY_INVITE_MS = 2 * 60_000;
const PARTY_ACTIONS = ['party', 'partyInvite', 'partyLeave'];

/** 내 파티: 파티 id · 파티장 · 구성원 user id (없으면 null). 018~020 전이면 null */
async function partyOf(uid: string): Promise<{ id: string; leader: string; members: string[] } | null> {
  const sb = db();
  const m = await sb.from('party_members').select('party_id').eq('user_id', uid).maybeSingle();
  if (m.error || !m.data) return null;
  const pid = (m.data as { party_id: string }).party_id;
  const p = (await sb.from('parties').select('id, leader').eq('id', pid).maybeSingle()).data as { id: string; leader: string } | null;
  if (!p) return null;
  const ms = (((await sb.from('party_members').select('user_id').eq('party_id', pid).order('joined_at')).data ?? []) as { user_id: string }[]).map((x) => x.user_id);
  return { id: p.id, leader: p.leader, members: ms };
}

/** 파티에서 나가기 — 파티장이 나가면 파티 해산. 찾던 대기표도 함께 취소 */
async function leaveParty(uid: string) {
  const sb = db();
  const p = await partyOf(uid);
  if (!p) return;
  await sb.from('match_tickets').delete().eq('party_id', p.id).is('room_id', null).is('claim', null);
  if (p.leader === uid || p.members.length <= 2) await sb.from('parties').delete().eq('id', p.id);
  else await sb.from('party_members').delete().eq('party_id', p.id).eq('user_id', uid);
}

async function partyAct(action: string, b: Body, uid: string): Promise<unknown> {
  const sb = db();
  const me = await getProfile(sb, uid);
  if (!me) throw new GameError('파티는 회원만 만들 수 있어요.', 403);
  switch (action) {
    case 'party': {
      // 내 파티 상태 (닉네임·파티장 여부·같이 찾는 중인지). user id 는 안 보냄
      rateLimit(uid + ':party', 60, 60_000);
      const p = await partyOf(uid);
      if (!p) return { party: null };
      const profs = (((await sb.from('profiles').select('user_id, nickname, rating, ranked_games, avatar').in('user_id', p.members)).data ?? []) as { user_id: string; nickname: string; rating: number; ranked_games?: number; avatar?: string }[]);
      const tickets = (((await sb.from('match_tickets').select('user_id, room_id, queue').eq('party_id', p.id)).data ?? []) as { user_id: string; room_id: string | null; queue: string }[]);
      const searching = tickets.length > 0 && tickets.every((t) => !t.room_id);
      return {
        party: {
          isLeader: p.leader === uid,
          members: p.members.map((u) => ({ nickname: profs.find((x) => x.user_id === u)?.nickname ?? '친구', rating: profs.find((x) => x.user_id === u)?.rating ?? 1000, ranked: profs.find((x) => x.user_id === u)?.ranked_games ?? 0, avatar: profs.find((x) => x.user_id === u)?.avatar ?? 'default', leader: u === p.leader, me: u === uid })),
          searching,
          queue: tickets[0]?.queue ?? null,
        },
      };
    }
    case 'partyInvite': {
      // 친구를 내 파티로 초대 (파티가 없으면 내가 파티장으로 새로 만듦)
      rateLimit(uid + ':partyInvite', 15, 600_000);
      let other: string;
      try {
        other = await friendOf(uid, b.friendId);
      } catch (e) {
        if ((e as { silent?: boolean }).silent) return { ok: true };
        throw e;
      }
      let p = await partyOf(uid);
      if (p && p.leader !== uid) throw new GameError('파티장만 초대할 수 있어요.', 403);
      if (p && p.members.length >= PARTY_MAX) throw new GameError(`파티는 ${PARTY_MAX}명까지예요.`, 409);
      if (p && p.members.includes(other)) throw new GameError('이미 파티에 있어요.', 409);
      if (!p) {
        const np = must(await sb.from('parties').insert({ leader: uid }).select('id').single(), 'party') as { id: string };
        const jm = await sb.from('party_members').insert({ party_id: np.id, user_id: uid });
        if (jm.error) {
          await sb.from('parties').delete().eq('id', np.id);
          throw new GameError('파티를 만들지 못했어요.', 503);
        }
        p = { id: np.id, leader: uid, members: [uid] };
      }
      await sb.from('invites').update({ status: 'cancelled' }).eq('from_user', uid).eq('to_user', other).eq('kind', 'party').eq('status', 'pending');
      const ins = await sb.from('invites').insert({ from_user: uid, to_user: other, kind: 'party', party_id: p.id, expires_at: new Date(Date.now() + PARTY_INVITE_MS).toISOString() });
      if (ins.error) throw new GameError('초대하지 못했어요.', 503);
      return { ok: true };
    }
    case 'partyLeave': {
      await leaveParty(uid);
      return { ok: true };
    }
  }
  throw new GameError('알 수 없는 요청이에요.');
}


/* ---------- 매칭 예상 대기 ---------- */
/** 최근 1시간 매칭 기록(대기열별 들어온 사람 수)과 접속 중인 사람 수. 15초 캐시 */
let statsCache: { at: number; recent: Record<string, number>; online: number } | null = null;
async function matchStats() {
  if (statsCache && Date.now() - statsCache.at < 15_000) return statsCache;
  const sb = db();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const rooms = ((await sb.from('rooms').select('ranked, max_players, turn_seconds').eq('kind', 'match').gte('created_at', since).limit(2000)).data ?? []) as { ranked: boolean; max_players: number; turn_seconds: number }[];
  const recent: Record<string, number> = {};
  for (const r of rooms) {
    const speed = r.turn_seconds === SPEED_PRESET.quick.turnSeconds ? 'quick' : 'normal';
    const q = `${r.ranked ? 'ranked' : 'casual'}_${r.max_players === 2 ? 'duel' : 'multi'}_${speed}`;
    recent[q] = (recent[q] ?? 0) + r.max_players;
  }
  const twoMin = new Date(Date.now() - 120_000).toISOString();
  const members = await sb.from('profiles').select('user_id', { count: 'exact', head: true }).gte('last_seen', twoMin);
  const tickets = await sb.from('match_tickets').select('id', { count: 'exact', head: true }).is('room_id', null).gte('last_poll', new Date(Date.now() - 10_000).toISOString());
  statsCache = { at: Date.now(), recent, online: (members.count ?? 0) + (tickets.count ?? 0) };
  return statsCache;
}
/**
 * 예상 대기(초): 같은 대기열에서 기다리는 사람(점수 범위 안/밖), 최근 1시간 이 대기열에 들어온 사람 수,
 * 지금 접속 중인 사람 수(일부가 들어올 거라고 어림)를 함께 봄
 */
function waitEstimate(queue: string, rating: number, waitedMs: number, others: number[], st: { recent: Record<string, number>; online: number }, now = Date.now(), partySize = 1) {
  const q = parseQueue(queue);
  if (!q) return null;
  const max = q.kind === 'ranked' ? rankedMax : CASUAL_MAX_WINDOW;
  const me = { id: 'me', rating, createdAt: now - waitedMs };
  // 다른 사람들도 대략 나만큼 기다렸다고 보고 범위를 계산
  const sim = others.filter((r) => compatible(me, { id: 'o', rating: r, createdAt: now - waitedMs }, now, max)).length;
  const gaps = others.map((r) => Math.abs(r - rating)).filter((g, i) => !compatible(me, { id: 'o', rating: others[i], createdAt: now - waitedMs }, now, max));
  const arrivalsPerMin = (st.recent[queue] ?? 0) / 60 + (st.online * 0.1) / 8;
  return estimateWaitSec({ size: q.size, similar: sim, nearestGap: gaps.length ? Math.min(...gaps) : null, arrivalsPerMin, waitedMs, max, partySize });
}

/** 방에서 나가기: 게임 중이면 기권, 대기실이면 자리 빼기(방장이면 넘기기), 끝난 방은 그대로 */
async function leaveSeat(roomId: string, playerId: string): Promise<{ ok: true }> {
  const sb = db();
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
      // (v7) 장 전: 남은 사람이 모두 준비 완료였으면 바로 장을 엶
      const open = preAllReadyDeadline(fresh, Date.now());
      if (open !== null) await updatePlayingRoom(roomId, fresh.room.day, { turn_deadline: iso(open), day_deadline: iso(open) }, 'preopen');
    }
    await touchRoom(roomId);
    return { ok: true };
  }
  if (room.status !== 'waiting') return { ok: true }; // 끝난 게임은 기록 보존
  if (room.host_id === playerId) {
    // 방장이 나가면 먼저 들어온 다음 사람에게 방장을 넘김 (아무도 없으면 방 삭제) — DB 함수로 한 번에(010)
    const rpc = await sb.rpc('host_leave', { p_room: roomId, p_host: playerId });
    if (!rpc.error) return { ok: true };
    if (!/host_leave/.test(rpc.error.message)) must(rpc, 'host leave');
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

export async function handle(body: unknown, token: string | null, ip = 'unknown'): Promise<ApiResult> {
  try {
    if (body && typeof body === 'object' && (body as Body).action === 'guest') return { status: 200, body: await createGuest(ip) };
    if (body && typeof body === 'object' && (body as Body).action === 'loginEmail') {
      rateLimit('loginEmail:' + ip, 30, 600_000);
      return { status: 200, body: await loginEmail(db(), body as Body) };
    }
    if (body && typeof body === 'object' && (body as Body).action === 'resetPassword') {
      rateLimit('reset:' + ip, 8, 600_000);
      return { status: 200, body: await resetPassword(db(), body as Body) };
    }
    if (!token || token.length > 4096) return { status: 401, body: { error: '로그인이 필요해요.' } };
    const { data, error } = await db().auth.getUser(token);
    if (error || !data.user) return { status: 401, body: { error: '로그인이 만료됐어요. 새로고침해 주세요.' } };
    const uid = data.user.id;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: '잘못된 요청이에요.' } };
    const b = body as Body;
    const action = typeof b.action === 'string' ? b.action : '';
    // 화면 갱신과 행동(거래·마감 등)은 따로 셈 → 붐비는 방에서도 갱신 때문에 거래가 막히지 않게
    if (['state', 'queueStatus', 'queueCounts', 'party', 'invites', 'friends', 'resume', 'profile'].includes(action)) rateLimit(uid + ':state', 90, 20_000);
    else rateLimit(uid + ':act', 40, 20_000);
    // 운영자: 내가 운영자인지 / 의견함 — 운영자 계정이 아니면 내용은 절대 보내지 않음
    // 친구에게 보이는 접속 표시 (1분에 한 번만 씀, 회원만 의미 있음)
    touchSeen(db(), uid).catch(() => {});
    if (action === 'me') return { status: 200, body: { isAdmin: isAdminUser(data.user) } };
    if (SOCIAL_ACTIONS.includes(action)) return { status: 200, body: await socialAct(db(), action, b, uid, rateLimit) };
    if (INVITE_ACTIONS.includes(action)) return { status: 200, body: await inviteAct(action, b, uid) };
    if (PARTY_ACTIONS.includes(action)) return { status: 200, body: await partyAct(action, b, uid) };
    if (['signup', 'checkAvailable', 'guestSummary', 'mergeGuest', 'profile', 'updateProfile', 'changePassword', 'newRecovery', 'ranking', 'myMatch'].includes(action)) return { status: 200, body: await accountAct(db(), action, b, data.user, rateLimit, leaveSeat) };
    if (action.startsWith('admin')) {
      if (!isAdminUser(data.user)) return { status: 403, body: { error: '운영자만 볼 수 있어요.' } };
      return { status: 200, body: await adminAct(action, b) };
    }
    const result = await act(action, b, uid);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof GameError) return { status: e.status, body: { error: e.message } };
    console.error('[api] unexpected', e instanceof Error ? e.message : e);
    return { status: 500, body: { error: '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.' } };
  }
}
