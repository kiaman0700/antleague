/**
 * 운영자 화면 (/admin): 의견함. 운영자는 일반 회원 로그인으로 들어온 '운영자로 지정된' 계정만.
 * 운영자 계정을 만들거나 지정하는 방법은 화면·API 에 없음 (운영자 컴퓨터에서 `npm run db -- set-admin <아이디>` 만).
 * 의견 내용은 서버가 운영자 계정인지 확인한 뒤에만 보내 줌 — 화면을 열어도 다른 사람은 아무것도 볼 수 없음
 */
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, Loading } from '../components/ui';
import { useAccount } from '../net/account';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { Icon } from '../components/Icon';

interface Row {
  id: number;
  kind: 'bug' | 'idea' | 'privacy' | 'etc';
  body: string;
  page: string | null;
  created_at: string;
  read_at: string | null;
}
const KIND: Record<Row['kind'], string> = { bug: '버그·오류', idea: '아이디어', privacy: '개인정보', etc: '무엇이든' };

export function Admin({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const member = useAccount().status === 'member';
  const [state, setState] = useState<'checking' | 'login' | 'inbox'>('checking');
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | Row['kind']>('unread');

  const check = useCallback(async () => {
    try {
      const me = await api<{ isAdmin: boolean }>('me');
      setState(me.isAdmin ? 'inbox' : 'login');
    } catch {
      setState('login');
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);

  const load = useCallback(async () => {
    const r = await api<{ rows: Row[]; unread: number }>('adminInbox', filter === 'unread' ? { unread: true } : filter === 'all' ? {} : { kind: filter });
    setRows(r.rows);
    setUnread(r.unread);
  }, [filter]);
  useEffect(() => {
    if (state === 'inbox') load().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [state, load]);

  const logout = async () => {
    await supabase?.auth.signOut();
    location.assign('/');
  };
  const mark = async (ids: number[], read: boolean) => {
    await api('adminMarkRead', { ids, read });
    await load();
  };

  return (
    <div className="lobby page admin">
      <header className="page-head">
        <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2>운영자</h2>
        <div className="ph-right">
          {state === 'inbox' && (
            <button className="btn sm ghost" onClick={logout}>
              로그아웃
            </button>
          )}
        </div>
      </header>

      {state === 'checking' && <Loading label="확인하는 중…" />}

      {state === 'login' && (
        <section className="panel pad admin-login">
          <h3>운영자만 볼 수 있어요</h3>
          <p className="muted small">{member ? '지금 로그인한 계정은 운영자가 아니에요.' : '운영자로 지정된 회원 계정으로 로그인하면 이 화면에서 의견함을 볼 수 있어요.'}</p>
          <div className="modal-actions">
            <button className={'btn ' + (member ? 'primary' : 'ghost')} onClick={onBack}>
              홈으로
            </button>
            {!member && (
              <button className="btn primary" onClick={onLogin}>
                로그인하러 가기
              </button>
            )}
          </div>
        </section>
      )}

      {state === 'inbox' && (
        <>
          <div className="seg admin-filter" role="tablist">
            {(
              [
                ['unread', `안 읽음 ${unread}`],
                ['all', '전체'],
                ['bug', KIND.bug],
                ['idea', KIND.idea],
                ['privacy', KIND.privacy],
                ['etc', KIND.etc],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          {msg && <p className="error">{msg}</p>}
          {rows.length === 0 ? (
            <EmptyState icon="check" title={filter === 'unread' ? '새 의견이 없어요' : '아직 받은 의견이 없어요'} />
          ) : (
            <>
              {filter === 'unread' && (
                <button className="btn sm ghost" onClick={() => mark(rows.map((r) => r.id), true)}>
                  <Icon name="check" size={14} /> 모두 읽음으로
                </button>
              )}
              <ul className="inbox">
                {rows.map((r) => (
                  <li key={r.id} className={'inbox-item k-' + r.kind + (r.read_at ? '' : ' unread')}>
                    <div className="ib-head">
                      <span className={'ib-kind k-' + r.kind}>{KIND[r.kind]}</span>
                      <small className="muted">{new Date(r.created_at).toLocaleString('ko-KR')}</small>
                      <button className="btn sm ghost" onClick={() => mark([r.id], !r.read_at)}>
                        {r.read_at ? '안 읽음으로' : '읽음'}
                      </button>
                    </div>
                    <p className="ib-body">{r.body}</p>
                    {r.page && <small className="muted ib-page">{r.page}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

