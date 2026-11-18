import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from '../engine/engine';
import type { Market } from '../game/market';
import { accessToken, supabase } from '../lib/supabase';
import { saveNick } from '../session';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** 서버가 붙여 보낸 구분 값 (예: 'replaced' = 다른 곳에서 접속해 이 기기는 로그아웃) */
    public code?: string,
  ) {
    super(message);
  }
}

/**
 * 읽기만 하는 확인 요청: 아직 계정(로그인 세션)이 없으면 서버에 묻지 않고 빈 값으로 답함
 * — 처음 온 사람이 아무것도 안 했는데 화면을 여는 것만으로 익명 계정이 생기지 않게
 *   (검색 로봇·잠깐 들른 사람마다 계정이 쌓이고, 같은 IP 익명 가입 제한도 빨리 닳음)
 * 계정은 대결 찾기·방 만들기·입장처럼 실제 온라인 기능을 쓸 때 만들어짐
 */
const PEEK_EMPTY: Record<string, () => unknown> = {
  profile: () => ({ profile: null }),
  resume: () => null,
  queueCounts: () => ({ counts: {}, eta: {} }),
  invites: () => ({ incoming: [], duel: null }),
  party: () => ({ party: null }),
  me: () => ({ isAdmin: false }),
  history: () => [],
  dailyInfo: () => null,
  missions: () => null,
};

/** 게임 서버(/api/game) 호출 — 로그인 토큰을 함께 보낸다 */
export async function api<T = unknown>(action: string, payload: Record<string, unknown> = {}, retried = false): Promise<T> {
  const peek = Object.prototype.hasOwnProperty.call(PEEK_EMPTY, action);
  if (supabase && (peek || action === 'rooms' || action === 'ranking' || action === 'notices')) {
    const has = await supabase.auth
      .getSession()
      .then((r) => !!r.data.session)
      .catch(() => true);
    if (!has && peek) return PEEK_EMPTY[action]() as T;
    // 방 목록·랭킹·공지사항은 공개 — 계정 없이 서버에 물어봄 (토큰 없이)
    if (!has) return apiOnce<T>(action, payload, true);
  }
  try {
    return await apiOnce<T>(action, payload);
  } catch (e) {
    // 서버가 잠깐 막힘(503: 로그인 확인 서버가 느리거나 바쁨) → 계정은 그대로 두고 잠깐 뒤 한 번만 다시
    if (!retried && e instanceof ApiError && e.status === 503) {
      await new Promise((r) => setTimeout(r, 900));
      return api<T>(action, payload, true);
    }
    // 서버가 이 로그인을 모른다고 함(계정이 지워졌거나 서버를 옮김) → 이 기기의 로그인을 지우고
    //   손님이면 새 손님으로 한 번만 다시 시도. 회원이면 다시 로그인하라고 안내
    // (051) 다른 곳에서 더 나중에 로그인함 → 이 기기는 로그아웃하고 둘러보기로 (새 손님을 만들지 않음)
    if (e instanceof ApiError && e.status === 401 && e.code === 'replaced' && supabase) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      try {
        window.dispatchEvent(new CustomEvent('session-replaced'));
      } catch {
        /* 무시 */
      }
      throw e;
    }
    if (!retried && e instanceof ApiError && e.status === 401 && supabase) {
      const anon = (await supabase.auth.getSession()).data.session?.user?.is_anonymous ?? true;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      if (anon) return api<T>(action, payload, true);
      throw new ApiError('로그인이 풀렸어요. 다시 로그인해 주세요.', 401);
    }
    // 손님 닉네임이 회원 닉네임과 같으면: 저장된 닉네임을 비워서 다시 누를 때 새 닉네임을 정하게 (막힌 채로 남지 않게)
    if (e instanceof ApiError && e.status === 409 && /회원이 쓰는 닉네임/.test(e.message)) {
      saveNick('');
      throw new ApiError('회원이 쓰는 닉네임이라 쓸 수 없어요. 다시 누르면 새 닉네임을 정할 수 있어요.', 409);
    }
    throw e;
  }
}

async function apiOnce<T>(action: string, payload: Record<string, unknown>, noAuth = false): Promise<T> {
  const token = noAuth ? null : await accessToken();
  if (!noAuth) lastToken = token ?? null;
  let res: Response;
  try {
    res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
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
  if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? '서버 오류가 났어요.', res.status, (body as { code?: string } | null)?.code);
  return body as T;
}

/** 창을 닫을 때 매칭 대기에서 빠지기: 페이지가 사라져도 요청이 끝까지 가도록 keepalive */
let lastToken: string | null = null;
export function leaveQueueOnExit() {
  if (!lastToken) return;
  try {
    fetch('/api/game', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', authorization: `Bearer ${lastToken}` }, body: '{"action":"queueLeave"}' }).catch(() => {});
  } catch {
    /* 무시 — 서버가 10초 뒤 정리 */
  }
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
  /** 1초 가격 방에서 장이 열려 있는지 (빠르게 새로 받기) */
  const fastRef = useRef(false);
  /** 끝난 판: 결과 화면에선 '다시 하기 방' 소식만 기다리므로 천천히 */
  const doneRef = useRef(false);
  /** 지금까지 받은 오늘 장중 가격 — 다음엔 새로 생긴 칸만 받아 이어 붙임 */
  const liveRef = useRef<View['live']>(null);
  /** 서버가 '너무 많은 요청'(429)을 주면 잠깐 천천히 */
  const slowUntil = useRef(0);
  /** 이 방에서 빠졌거나 방이 사라짐(403·404) — 더 묻지 않음 (화면은 '더 이상 할 수 없어요' 안내) */
  const goneRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId || goneRef.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const t0 = Date.now();
      const have = liveRef.current;
      const v = await api<View>('state', { roomId, marketKey: keyRef.current, ...(have ? { liveDay: have.day, liveFrom: have.tick + 1 } : {}) });
      // 새로 생긴 칸만 왔으면 가진 것에 이어 붙임 (안 맞으면 다음에 처음부터 다시 받음)
      if (v.live) {
        const from = v.live.from ?? 0;
        if (from > 0) {
          if (have && have.day === v.live.day && have.tick + 1 === from) {
            const join = (a: Record<string, number[]>, b: Record<string, number[]>) => Object.fromEntries(Object.entries(b).map(([k, arr]) => [k, [...(a[k] ?? []), ...arr]]));
            v.live = { ...v.live, from: 0, krw: join(have.krw, v.live.krw), usd: join(have.usd, v.live.usd), index: [...have.index, ...v.live.index], usIndex: [...have.usIndex, ...v.live.usIndex] };
          } else {
            liveRef.current = null;
            again.current = true;
            return;
          }
        }
        liveRef.current = v.live;
      } else liveRef.current = null;
      const t1 = Date.now();
      setOffset(v.serverNow - (t0 + t1) / 2);
      if (v.market) {
        setMarket(v.market);
        keyRef.current = v.marketKey;
      }
      setView(v);
      fastRef.current = !!v.live && (v.live.tickMs ?? 5000) <= 1000;
      doneRef.current = v.room.status === 'finished';
      setError(null);
    } catch (e) {
      // 요청이 많다고 하면 화면은 그대로 두고 10초 동안 천천히 받음 (오류 문구로 놀라게 하지 않음)
      if (e instanceof ApiError && (e.status === 429 || e.status === 503)) slowUntil.current = Date.now() + 10_000;
      else {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) goneRef.current = true;
        setError(e instanceof Error ? e.message : String(e));
      }
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
    goneRef.current = false;
    refresh();
    // 1초 가격 방(v11)에서 장이 열려 있으면 1초마다, 아니면 2.5초마다 새로 받음
    let poll = 0;
    const loop = () => {
      // 창이 뒤에 있으면 10초마다(자리 비움 판정 90초보다 짧게), 요청 제한에 걸렸으면 5초마다
      const hidden = document.visibilityState === 'hidden';
      const ms = hidden ? 10_000 : doneRef.current ? 8000 : Date.now() < slowUntil.current ? 5000 : fastRef.current ? 1000 : 2500;
      poll = window.setTimeout(() => {
        if (goneRef.current) return; // 방에서 빠졌으면 여기서 멈춤
        refresh();
        loop();
      }, ms);
    };
    loop();
    // 다른 앱·탭에 갔다 돌아오면 바로 새로 받기 (자리 비움 표시도 곧바로 풀림)
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
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
      window.clearTimeout(poll);
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { view, market, offset, error, refresh };
}

/* ---------------- 이모지·한마디 ---------------- */

import { EMOJIS, PHRASES } from '../game/reactions';
export { EMOJIS, PHRASES };

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
  const me = useRef(playerId);
  me.current = playerId;

  useEffect(() => {
    if (!roomId || !supabase) return;
    const ch = supabase.channel('react-' + roomId, { config: { private: true, broadcast: { self: false } } }); // 비공개 채널: 그 방 사람만 듣고 보냄 (029 정책)
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      const p = payload as Partial<Reaction>;
      const emoji = typeof p.emoji === 'string' && EMOJIS.includes(p.emoji) ? p.emoji : undefined;
      const text = typeof p.text === 'string' && PHRASES.includes(p.text) ? p.text : undefined;
      if ((!emoji && !text) || typeof p.from !== 'string') return;
      // 서버가 방송하면 보낸 나에게도 옴 — 내 화면엔 누를 때 이미 띄웠으니 건너뜀 (두 번 뜨던 것)
      if (p.from === me.current) return;
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

  // 보내기는 서버로: 서버가 이 방 사람인지 확인하고 '보낸 사람'을 직접 붙여 방송 (다른 사람 이름으로 보내기 막기, 2026-11-17)
  return (r: { emoji?: string; text?: string }) => {
    if (!roomId) return;
    api('react', { roomId, ...r }).catch(() => {});
  };
}
