import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** publishable(anon) 키 — 브라우저에 공개돼도 되는 키. 실제 권한은 RLS + 서버 함수가 통제 */
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

let pending: Promise<string> | null = null;

/** 익명 로그인 — 이 기기를 하나의 플레이어 계정으로 식별 (이메일·비밀번호 없음) */
export function accessToken(): Promise<string> {
  if (!supabase) return Promise.reject(new Error('온라인 설정이 없어요.'));
  if (pending) return pending;
  pending = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.access_token;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error || !signed.session) throw new Error('접속하지 못했어요. (Supabase 에서 익명 로그인을 켰는지 확인해 주세요)');
    return signed.session.access_token;
  })().finally(() => {
    // 토큰은 자동 갱신되므로 매번 세션에서 다시 읽는다
    setTimeout(() => (pending = null), 0);
  });
  return pending;
}
