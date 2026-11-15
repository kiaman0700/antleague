import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase 설정이 없습니다 (.env.local 확인)');
  return supabase;
}
