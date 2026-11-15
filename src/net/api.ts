import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from '../engine/engine';
import type { Market } from '../game/market';
import { accessToken, supabase } from '../lib/supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 게임 서버(/api/game) 호출 — 로그인 토큰을 함께 보낸다 */
export async function api<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new ApiError('인터넷 연결을 확인해 주세요.', 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 빈 응답 */
  }
  if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? '서버 오류가 났어요.', res.status);
  return body as T;
}

export interface LiveView {
  view: View | null;
  market: Market | null;
  /** 서버시각 - 내시각 */
  offset: number;
  error: string | null;
  refresh: () => Promise<void>;
}

/** 방 상태를 서버에서 받아오기: 변경 알림(Realtime) + 2.5초 폴링 */
export function useLiveView(roomId: string | null): LiveView {
  const [view, setView] = useState<View | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const t0 = Date.now();
      const v = await api<View>('state', { roomId, marketKey: keyRef.current });
      const t1 = Date.now();
      setOffset(v.serverNow - (t0 + t1) / 2);
      if (v.market) {
        setMarket(v.market);
        keyRef.current = v.marketKey;
      }
      setView(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        refresh();
      }
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    keyRef.current = undefined;
    refresh();
    const poll = setInterval(refresh, 2500);
    // 실시간 알림이 몰려도 한 번만 다시 받기 (0.3초 모아서)
    let t: number | undefined;
    const soon = () => {
      window.clearTimeout(t);
      t = window.setTimeout(refresh, 300);
    };
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      channel = supabase
        .channel('room-' + roomId)
        // 방(rooms) 변화만 구독: 마감·준비·입장·나감 같은 공개된 변화. 상대의 거래·카드 시점은 알 수 없게 players 는 구독하지 않음
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, soon)
        .subscribe();
    }
    return () => {
      clearInterval(poll);
      window.clearTimeout(t);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { view, market, offset, error, refresh };
}

/* ---------------- 이모지·한마디 ---------------- */

export const EMOJIS = ['😂', '😭', '🔥', '👏', '😎', '🙏', '🤑', '💀'];
export const PHRASES = ['가즈아!', '물렸다…', '부럽다', '이번엔 내가 이김', '살려줘', '잘 가~'];

export interface Reaction {
  id: number;
  from: string;
  emoji?: string;
  text?: string;
}

/** 반응은 DB에 저장하지 않고 실시간 broadcast 로만. 받은 내용은 정해진 목록에 있는 것만 표시 */
export function useReactions(roomId: string | null, playerId: string, onReceive: (r: Reaction) => void) {
  const chRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const cb = useRef(onReceive);
  cb.current = onReceive;
  const last = useRef(0);

  useEffect(() => {
    if (!roomId || !supabase) return;
    const ch = supabase.channel('react-' + roomId, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      const p = payload as Partial<Reaction>;
      const emoji = typeof p.emoji === 'string' && EMOJIS.includes(p.emoji) ? p.emoji : undefined;
      const text = typeof p.text === 'string' && PHRASES.includes(p.text) ? p.text : undefined;
      if ((!emoji && !text) || typeof p.from !== 'string') return;
      // 도배 방지: 0.7초에 하나
      const now = Date.now();
      if (now - last.current < 700) return;
      last.current = now;
      cb.current({ id: now + Math.random(), from: p.from, emoji, text });
    }).subscribe();
    chRef.current = ch;
    return () => {
      supabase!.removeChannel(ch);
      chRef.current = null;
    };
  }, [roomId]);

  return (r: { emoji?: string; text?: string }) => {
    chRef.current?.send({ type: 'broadcast', event: 'react', payload: { ...r, from: playerId } });
  };
}
