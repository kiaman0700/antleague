/**
 * 운영자 화면 (/admin): 운영자 계정 로그인·처음 만들기 + 의견함.
 * 의견 내용은 서버가 운영자 계정인지 확인한 뒤에만 보내 줌 — 화면을 열어도 다른 사람은 아무것도 볼 수 없음
 */
import { useCallback, useEffect, useState } from 'react';
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

export function Admin({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<'checking' | 'login' | 'inbox'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const login = async () => {
    setMsg('');
    setBusy(true);
    try {
      if (signup) {
        await api('adminSignup', { email, password, code });
      }
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error('이메일 또는 비밀번호가 맞지 않아요.');
      setPassword('');
      setCode('');
      await check();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
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

      {state === 'checking' && <p className="muted center">확인하는 중…</p>}

      {state === 'login' && (
        <section className="panel pad admin-login">
          <h3>{signup ? '운영자 계정 처음 만들기' : '운영자 로그인'}</h3>
          <p className="muted small">
            운영자만 쓰는 화면이에요. 로그인하면 이 기기의 게임 계정 대신 운영자 계정으로 바뀌어요. (게임은 로그아웃 후 새 계정으로 할 수 있어요)
          </p>
          <label className="field">
            <span>이메일</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span>비밀번호 {signup && <small className="muted">(10자 이상)</small>}</span>
            <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} />
          </label>
          {signup && (
            <label className="field">
              <span>설정 코드 (한 번만 필요)</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={40} autoComplete="off" />
            </label>
          )}
          {msg && <p className="error">{msg}</p>}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => (setSignup(!signup), setMsg(''))}>
              {signup ? '이미 계정이 있어요' : '처음이에요 (계정 만들기)'}
            </button>
            <button className="btn primary" onClick={login} disabled={busy || !email || password.length < (signup ? 10 : 1) || (signup && !code)}>
              {busy ? '확인 중…' : signup ? '만들고 로그인' : '로그인'}
            </button>
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
            <div className="empty-state">
              <i>
                <Icon name="check" size={28} />
              </i>
              <b>{filter === 'unread' ? '새 의견이 없어요' : '아직 받은 의견이 없어요'}</b>
            </div>
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

/** 홈: 운영자로 로그인했을 때만 보이는 새 의견 알림 (서버가 운영자인지 확인) */
export function AdminBanner({ onOpen }: { onOpen: () => void }) {
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ isAdmin: boolean }>('me')
      .then((me) => (me.isAdmin ? api<{ unread: number }>('adminInbox', { unread: true }) : null))
      .then((r) => alive && r && setUnread(r.unread))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (unread === null) return null;
  return (
    <button className={'admin-banner' + (unread > 0 ? ' has' : '')} onClick={onOpen}>
      <Icon name="bell" size={16} />
      <b>{unread > 0 ? `새 의견 ${unread}개` : '새 의견 없음'}</b>
      <span>의견함 열기 ›</span>
    </button>
  );
}
