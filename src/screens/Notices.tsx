/**
 * 공지사항 (DB 043, 서버 api/_lib/notices.ts): 모두 읽기만, 운영자 계정이면 쓰기·고치기·지우기.
 * 글은 일반 글자로만 그림 (HTML 해석 없음)
 */
import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { Icon } from '../components/Icon';
import { ask } from '../components/ConfirmHost';
import { EmptyState, ErrorState, Loading, Toast } from '../components/ui';
import { markNoticeRead, NoticeText, refreshNotices } from '../components/NoticeBar';
import type { LobbyPage } from './Lobby';

export interface Notice {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const SEEN_KEY = 'stockduel.noticeSeen';
/** 이 기기에서 마지막으로 본 공지 시각 */
export function noticeSeenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
function markSeen(list: Notice[]) {
  const latest = Math.max(0, ...list.map((n) => new Date(n.created_at).getTime()));
  try {
    if (latest > noticeSeenAt()) localStorage.setItem(SEEN_KEY, String(latest));
  } catch {
    /* 무시 */
  }
}

function PageHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="page-head">
      <button className="icon-btn" aria-label="뒤로" onClick={onBack}>
        <Icon name="back" size={18} />
      </button>
      <h2>{title}</h2>
      <div className="ph-right" />
    </header>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

export function NoticesPage({ onBack, onGo }: { onBack: () => void; onGo: (p: LobbyPage) => void }) {
  const [list, setList] = useState<Notice[] | null>(null);
  const [err, setErr] = useState(false);
  const [n, setN] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // 펼쳐 본 공지는 공지 창과 같은 기준으로 읽음 (위 공지 줄·설정 점이 함께 꺼짐)
  useEffect(() => {
    if (open) markNoticeRead(open);
  }, [open]);
  // 운영자: 쓰는 중인 글 (id 가 있으면 고치기)
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string; pinned: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 올리기·고치기·지우기 결과는 잠깐 뜨는 알림으로 (오류는 글로 남김)
  const [done, setDone] = useState('');
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(''), 2500);
    return () => clearTimeout(t);
  }, [done]);

  useEffect(() => {
    setErr(false);
    api<Notice[]>('notices')
      .then((r) => {
        setList(r);
        markSeen(r);
        if (r[0]) setOpen((o) => o ?? r[0].id);
      })
      .catch(() => setErr(true));
  }, [n]);
  useEffect(() => {
    api<{ isAdmin: boolean }>('me')
      .then((r) => setAdmin(!!r?.isAdmin))
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await api<Notice[]>('adminNotice', { op: draft.id ? 'update' : 'create', id: draft.id, title: draft.title, body: draft.body, pinned: draft.pinned });
      setList(r);
      refreshNotices();
      setDraft(null);
      setDone(draft.id ? '공지를 고쳤어요' : '공지를 올렸어요');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (x: Notice) => {
    if (!(await ask(`'${x.title}' 공지를 지울까요? 되돌릴 수 없어요.`, { ok: '지우기', danger: true }))) return;
    try {
      setList(await api<Notice[]>('adminNotice', { op: 'delete', id: x.id }));
      refreshNotices();
      setMsg('');
      setDone('공지를 지웠어요');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="lobby page notices-page">
      <PageHead title="공지사항" onBack={onBack} />
      {admin && !draft && (
        <button className="btn primary" onClick={() => setDraft({ title: '', body: '', pinned: false })}>
          <Icon name="plus" size={16} /> 새 공지 쓰기
        </button>
      )}
      {admin && draft && (
        <section className="panel pad notice-edit">
          <h3>{draft.id ? '공지 고치기' : '새 공지'}</h3>
          <label className="field">
            <span>제목 (80자까지)</span>
            <input value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="field">
            <span>내용 (4000자까지) · 링크: [보일 글자](/install) 처럼 우리 사이트 주소만</span>
            <textarea value={draft.body} maxLength={4000} rows={8} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} /> 맨 위에 고정
          </label>
          <div className="notice-edit-actions">
            <button className="btn ghost" onClick={() => setDraft(null)} disabled={busy}>
              취소
            </button>
            <button className="btn primary" onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()}>
              {busy ? '저장 중…' : draft.id ? '고치기' : '올리기'}
            </button>
          </div>
        </section>
      )}
      {msg && <p className="error small" role="alert">{msg}</p>}
      {done && <Toast text={done} />}
      {err ? (
        <ErrorState what="공지사항" onRetry={() => setN((x) => x + 1)} />
      ) : list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState icon="bell" title="아직 공지가 없어요" desc="새 소식이 생기면 여기에 올라와요." />
      ) : (
        <ul className="notice-list">
          {list.map((x) => {
            const on = open === x.id;
            return (
              <li key={x.id} className={'panel notice' + (x.pinned ? ' pinned' : '') + (on ? ' open' : '')}>
                <button className="notice-head" onClick={() => setOpen(on ? null : x.id)} aria-expanded={on}>
                  {x.pinned && <span className="notice-pin">고정</span>}
                  <b>{x.title}</b>
                  <small className="muted">{fmt(x.created_at)}</small>
                  <Icon name={on ? 'up' : 'down'} size={16} className="notice-chev" />
                </button>
                {on && (
                  <div className="notice-body">
                    {/* 일반 글자로만 (줄바꿈 유지) */}
                    <NoticeText text={x.body} onGo={onGo} />
                    {x.updated_at !== x.created_at && new Date(x.updated_at).getTime() - new Date(x.created_at).getTime() > 60_000 && <small className="muted">{fmt(x.updated_at)} 고침</small>}
                    {admin && (
                      <div className="notice-admin">
                        <button className="btn sm ghost" onClick={() => setDraft({ id: x.id, title: x.title, body: x.body, pinned: x.pinned })}>
                          고치기
                        </button>
                        <button className="btn sm danger ghost" onClick={() => remove(x)}>
                          지우기
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
