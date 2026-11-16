import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** publishable(anon) 키 — 브라우저에 공개돼도 되는 키. 실제 권한은 RLS + 서버 함수가 통제 */
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// 예전 서버(지역 이전 전 프로젝트)의 로그인 토큰이 남아 있으면 지움 — 더는 쓰지 않는 로그인 정보를 기기에 두지 않게
try {
  const ref = url ? new URL(url).hostname.split('.')[0] : '';
  if (ref)
    for (const k of Object.keys(localStorage)) if (/^sb-[a-z0-9]+-auth-token/.test(k) && !k.startsWith(`sb-${ref}-`)) localStorage.removeItem(k);
} catch {
  /* 저장소를 못 쓰는 환경 — 무시 */
}

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let pending: Promise<string> | null = null;

/** 손님 계정으로 로그인 (익명 로그인 제한에 걸렸을 때) → access token, 실패하면 null */
async function guestSignIn(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'guest' }) });
    if (!r.ok) return null;
    const { email, password } = (await r.json()) as { email: string; password: string };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return error || !data.session ? null : data.session.access_token;
  } catch {
    return null;
  }
}

/** 익명 로그인 — 이 기기를 하나의 플레이어 계정으로 식별 (이메일·비밀번호 없음) */
export function accessToken(): Promise<string> {
  if (!supabase) return Promise.reject(new Error('온라인 설정이 없어요.'));
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.access_token;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
      // 같은 인터넷(PC방·학교 등)에서 익명 접속이 많아 막힘 → 서버가 만들어 주는 손님 계정으로 로그인
      const guest = await guestSignIn();
      if (guest) return guest;
      throw new Error('같은 인터넷에서 새로 접속한 사람이 많아 잠시 막혔어요. 몇 분 뒤에 다시 시도해 주세요. (혼자 연습·튜토리얼은 지금도 할 수 있어요)');
    }
    if (error || !signed.session) throw new Error('서버에 접속하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    return signed.session.access_token;
  })().finally(() => {
    // 토큰은 자동 갱신되므로 매번 세션에서 다시 읽는다
    setTimeout(() => (pending = null), 0);
  });
  return pending;
}
