/**
 * 공지사항 (DB 043): 모두 읽기만, 운영자만 쓰기·고치기·지우기.
 * 글은 서버가 길이·제어문자를 정리해 저장하고, 화면은 일반 글자로만 보여 줌 (HTML 로 그리지 않음 → 스크립트가 끼어들 수 없음)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { GameError } from '../../src/engine/engine.js';

export interface Notice {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** 줄바꿈·탭은 남기고 나머지 제어문자·보이지 않는 방향 문자는 지움 */
const clean = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '')
        .replace(/\r\n?/g, '\n')
        .trim()
        .slice(0, max)
    : '';

/** 공지 목록 (고정 먼저, 최신 순, 30개) — 043 적용 전이면 빈 목록 */
export async function listNotices(sb: SupabaseClient): Promise<Notice[]> {
  const r = await sb.from('notices').select('id, title, body, pinned, created_at, updated_at').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30);
  if (r.error) return [];
  return (r.data ?? []) as Notice[];
}

/** 운영자: 공지 쓰기·고치기·지우기 (부르는 쪽에서 운영자인지 먼저 확인) */
export async function adminNotice(sb: SupabaseClient, b: { op?: unknown; id?: unknown; title?: unknown; body?: unknown; pinned?: unknown }) {
  const op = b.op === 'create' || b.op === 'update' || b.op === 'delete' ? b.op : null;
  if (!op) throw new GameError('잘못된 요청이에요.');
  const id = typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;
  if (op !== 'create' && !id) throw new GameError('공지를 다시 골라 주세요.');
  if (op === 'delete') {
    const r = await sb.from('notices').delete().eq('id', id!);
    if (r.error) throw new GameError('지우지 못했어요. 잠시 뒤에 다시 해 주세요.', 503);
    return listNotices(sb);
  }
  const title = clean(b.title, 80);
  const body = clean(b.body, 4000);
  if (!title || !body) throw new GameError('제목과 내용을 써 주세요.');
  const row = { title, body, pinned: b.pinned === true, updated_at: new Date().toISOString() };
  const r = op === 'create' ? await sb.from('notices').insert(row) : await sb.from('notices').update(row).eq('id', id!);
  if (r.error) throw new GameError('저장하지 못했어요. 잠시 뒤에 다시 해 주세요.', 503);
  return listNotices(sb);
}
