import { useEffect, useState } from 'react';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Trade } from '../game/portfolio';

export interface Room {
  id: string;
  code: string;
  seed: number;
  status: 'waiting' | 'playing' | 'finished';
  day_ms: number;
  total_days: number;
  started_at: string | null;
  host_id: string | null;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  cash: number;
  equity: number;
  ready: boolean;
  trade_count: number;
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

export async function createRoom(nickname: string, dayMs: number, totalDays: number) {
  const sb = requireSupabase();
  let room: Room | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const { data, error } = await sb
      .from('rooms')
      .insert({ code: randomCode(), seed: randomSeed(), day_ms: dayMs, total_days: totalDays })
      .select()
      .single();
    if (!error) room = data as Room;
    else if (!String(error.message).includes('duplicate')) throw error;
  }
  if (!room) throw new Error('방 코드를 만들지 못했어요. 다시 시도해 주세요.');
  const player = await addPlayer(room.id, nickname);
  const { data, error } = await sb.from('rooms').update({ host_id: player.id }).eq('id', room.id).select().single();
  if (error) throw error;
  return { room: data as Room, player };
}

async function addPlayer(roomId: string, nickname: string): Promise<Player> {
  const { data, error } = await requireSupabase().from('players').insert({ room_id: roomId, nickname }).select().single();
  if (error) throw error;
  return data as Player;
}

export async function joinRoom(code: string, nickname: string) {
  const sb = requireSupabase();
  const { data: room, error } = await sb.from('rooms').select().eq('code', code.toUpperCase().trim()).maybeSingle();
  if (error) throw error;
  if (!room) throw new Error('그런 방 코드가 없어요.');
  if (room.status !== 'waiting') throw new Error('이미 시작했거나 끝난 방이에요.');
  const { data: players } = await sb.from('players').select('id, nickname').eq('room_id', room.id);
  if ((players?.length ?? 0) >= 2) throw new Error('방이 가득 찼어요 (최대 2명).');
  if (players?.some((p) => p.nickname === nickname)) throw new Error('상대와 다른 닉네임을 써 주세요.');
  const player = await addPlayer(room.id, nickname);
  return { room: room as Room, player };
}

export async function setReady(playerId: string, ready: boolean) {
  await requireSupabase().from('players').update({ ready }).eq('id', playerId);
}

export async function startRoom(roomId: string): Promise<Room> {
  const { data, error } = await requireSupabase().rpc('start_room', { p_room: roomId });
  if (error) throw error;
  return data as Room;
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
    .insert({ room_id: roomId, player_id: t.player_id, tick: t.tick, symbol: t.symbol, side: t.side, qty: t.qty, price: t.price });
  if (error) throw error;
}

export async function fetchTrades(roomId: string): Promise<Trade[]> {
  const { data, error } = await requireSupabase().from('trades').select().eq('room_id', roomId).order('created_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, price: Number(r.price) })) as Trade[];
}

export async function updateMyStats(playerId: string, cash: number, equity: number, tradeCount: number) {
  await requireSupabase()
    .from('players')
    .update({ cash: Math.round(cash), equity: Math.round(equity), trade_count: tradeCount, updated_at: new Date().toISOString() })
    .eq('id', playerId);
}

export async function finishRoom(roomId: string, results: MatchResult['results'], winner: string | null) {
  const sb = requireSupabase();
  await sb.from('rooms').update({ status: 'finished' }).eq('id', roomId);
  // room_id 가 unique 라 두 명이 동시에 저장해도 한 번만 기록됨
  await sb.from('match_history').upsert({ room_id: roomId, results, winner_nickname: winner }, { onConflict: 'room_id', ignoreDuplicates: true });
}

export async function fetchHistory(): Promise<MatchResult[]> {
  if (!supabase) return [];
  const { data } = await supabase.from('match_history').select().order('created_at', { ascending: false }).limit(50);
  return (data ?? []) as MatchResult[];
}

/** 서버 시각 - 내 시각 (ms). 두 기기가 같은 틱을 보도록 보정 */
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

/** 방 + 플레이어 실시간 구독 (realtime 이 꺼져 있어도 동작하도록 폴링 병행) */
export function useRoomLive(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!roomId || !supabase) return;
    const sb = supabase;
    let alive = true;
    const load = async () => {
      const [{ data: r }, { data: ps }] = await Promise.all([
        sb.from('rooms').select().eq('id', roomId).maybeSingle(),
        sb.from('players').select().eq('room_id', roomId).order('updated_at'),
      ]);
      if (!alive) return;
      if (r) setRoom(r as Room);
      if (ps) setPlayers((ps as Player[]).map((p) => ({ ...p, cash: Number(p.cash), equity: Number(p.equity) })));
    };
    load();
    const channel = sb
      .channel('room-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, load)
      .subscribe();
    const poll = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(poll);
      sb.removeChannel(channel);
    };
  }, [roomId]);

  return { room, players };
}
