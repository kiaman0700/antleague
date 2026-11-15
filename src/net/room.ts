import { useEffect, useRef, useState } from 'react';
import type { ItemRow } from '../game/items';
import type { Trade } from '../game/portfolio';
import { requireSupabase, supabase } from '../lib/supabase';
import type { UiMode } from '../session';

export interface Room {
  id: string;
  code: string;
  seed: number;
  status: 'waiting' | 'playing' | 'finished';
  total_days: number;
  turn_seconds: number;
  day: number;
  turn_deadline: string | null;
  host_id: string | null;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  mode: UiMode;
  ready: boolean;
  ended_day: number;
  cash: number;
  equity: number;
  trade_count: number;
  created_at: string;
}

export interface MatchResult {
  id: string;
  room_id: string;
  winner_nickname: string | null;
  results: { nickname: string; equity: number; ret: number }[];
  created_at: string;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
export function randomSeed() {
  return Math.floor(Math.random() * 2_000_000_000);
}

export async function createRoom(nickname: string, mode: UiMode, totalDays: number, turnSeconds: number) {
  const sb = requireSupabase();
  let room: Room | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const { data, error } = await sb
      .from('rooms')
      .insert({ code: randomCode(), seed: randomSeed(), total_days: totalDays, turn_seconds: turnSeconds })
      .select()
      .single();
    if (!error) room = data as Room;
    else if (!String(error.message).includes('duplicate')) throw error;
  }
  if (!room) throw new Error('방 코드를 만들지 못했어요. 다시 시도해 주세요.');
  const player = await addPlayer(room.id, nickname, mode, true);
  const { data, error } = await sb.from('rooms').update({ host_id: player.id }).eq('id', room.id).select().single();
  if (error) throw error;
  return { room: data as Room, player };
}

async function addPlayer(roomId: string, nickname: string, mode: UiMode, ready = false): Promise<Player> {
  const { data, error } = await requireSupabase().from('players').insert({ room_id: roomId, nickname, mode, ready }).select().single();
  if (error) throw error;
  return data as Player;
}

export async function joinRoom(code: string, nickname: string, mode: UiMode) {
  const sb = requireSupabase();
  const { data: room, error } = await sb.from('rooms').select().eq('code', code.toUpperCase().trim()).maybeSingle();
  if (error) throw error;
  if (!room) throw new Error('그런 방 코드가 없어요.');
  if (room.status !== 'waiting') throw new Error('이미 시작했거나 끝난 방이에요.');
  const { data: players } = await sb.from('players').select('id, nickname').eq('room_id', room.id);
  if ((players?.length ?? 0) >= 2) throw new Error('방이 가득 찼어요 (최대 2명).');
  if (players?.some((p) => p.nickname === nickname)) throw new Error('상대와 다른 닉네임을 써 주세요.');
  const player = await addPlayer(room.id, nickname, mode);
  return { room: room as Room, player };
}

export async function updatePlayer(playerId: string, patch: Partial<Pick<Player, 'ready' | 'mode' | 'ended_day'>>) {
  const { error } = await requireSupabase().from('players').update(patch).eq('id', playerId);
  if (error) throw error;
}

export async function startRoom(roomId: string): Promise<Room> {
  const { data, error } = await requireSupabase().rpc('start_room', { p_room: roomId });
  if (error) throw error;
  return data as Room;
}

export async function advanceDay(roomId: string, day: number) {
  await requireSupabase().rpc('advance_day', { p_room: roomId, p_day: day });
}

export async function leaveRoom(playerId: string) {
  await requireSupabase().from('players').delete().eq('id', playerId);
}

export async function fetchRoom(roomId: string) {
  const { data } = await requireSupabase().from('rooms').select().eq('id', roomId).maybeSingle();
  return data as Room | null;
}

export async function fetchPlayer(playerId: string) {
  const { data } = await requireSupabase().from('players').select().eq('id', playerId).maybeSingle();
  return data as Player | null;
}

export async function insertTrade(roomId: string, t: Trade) {
  const { error } = await requireSupabase()
    .from('trades')
    .insert({ id: t.id, room_id: roomId, player_id: t.player_id, day: t.day, symbol: t.symbol, side: t.side, qty: t.qty, price: t.price, fee: t.fee });
  if (error) throw error;
}

export async function fetchTrades(roomId: string, playerId?: string): Promise<Trade[]> {
  let q = requireSupabase().from('trades').select().eq('room_id', roomId);
  if (playerId) q = q.eq('player_id', playerId);
  const { data, error } = await q.order('created_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, price: Number(r.price), fee: Number(r.fee) })) as Trade[];
}

export async function insertItem(roomId: string, row: ItemRow) {
  const { error } = await requireSupabase()
    .from('items')
    .insert({ id: row.id, room_id: roomId, player_id: row.player_id, day: row.day, kind: row.kind, action: row.action, cost: row.cost, payload: row.payload ?? null });
  if (error) throw error;
}

export async function updateMyStats(playerId: string, cash: number, equity: number, tradeCount: number) {
  await requireSupabase()
    .from('players')
    .update({ cash: Math.round(cash), equity: Math.round(equity), trade_count: tradeCount, updated_at: new Date().toISOString() })
    .eq('id', playerId);
}

export async function saveResult(roomId: string, results: MatchResult['results'], winner: string | null) {
  await requireSupabase()
    .from('match_history')
    .upsert({ room_id: roomId, results, winner_nickname: winner }, { onConflict: 'room_id', ignoreDuplicates: true });
}

export async function fetchHistory(): Promise<MatchResult[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('match_history').select().order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as MatchResult[];
}

/** 서버 시각 - 내 시각 (ms) */
export async function measureClockOffset(): Promise<number> {
  if (!supabase) return 0;
  const samples: { rtt: number; offset: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_time');
    const t1 = Date.now();
    if (error || !data) continue;
    samples.push({ rtt: t1 - t0, offset: new Date(data as string).getTime() - (t0 + t1) / 2 });
  }
  if (!samples.length) return 0;
  samples.sort((a, b) => a.rtt - b.rtt);
  return samples[0].offset;
}

/** 방 + 플레이어 + 아이템 기록 실시간 구독 (realtime 이 안 되어도 폴링으로 동작) */
export function useRoomLive(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    if (!roomId || !supabase) return;
    const sb = supabase;
    let alive = true;
    const load = async () => {
      const [{ data: r }, { data: ps }, { data: its }] = await Promise.all([
        sb.from('rooms').select().eq('id', roomId).maybeSingle(),
        sb.from('players').select().eq('room_id', roomId).order('created_at'),
        sb.from('items').select().eq('room_id', roomId).order('created_at'),
      ]);
      if (!alive) return;
      if (r) setRoom(r as Room);
      if (ps) setPlayers((ps as Player[]).map((p) => ({ ...p, cash: Number(p.cash), equity: Number(p.equity) })));
      if (its) setItems((its as ItemRow[]).map((i) => ({ ...i, cost: Number(i.cost) })));
    };
    load();
    const channel = sb
      .channel('db-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `room_id=eq.${roomId}` }, load)
      .subscribe();
    const poll = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(poll);
      sb.removeChannel(channel);
    };
  }, [roomId]);

  return { room, players, items, setItems };
}

export interface Reaction {
  id: number;
  from: string;
  nickname: string;
  emoji?: string;
  text?: string;
}

/** 이모지/한마디: DB에 저장하지 않고 broadcast 로만 주고받음 */
export function useReactions(roomId: string | null, playerId: string, nickname: string, onReceive: (r: Reaction) => void) {
  const chRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const cb = useRef(onReceive);
  cb.current = onReceive;

  useEffect(() => {
    if (!roomId || !supabase) return;
    const ch = supabase.channel('react-' + roomId, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => cb.current({ ...(payload as Reaction), id: Date.now() + Math.random() })).subscribe();
    chRef.current = ch;
    return () => {
      supabase!.removeChannel(ch);
      chRef.current = null;
    };
  }, [roomId]);

  return (r: { emoji?: string; text?: string }) => {
    chRef.current?.send({ type: 'broadcast', event: 'react', payload: { ...r, from: playerId, nickname } });
  };
}
