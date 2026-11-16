/**
 * 회원 화면: 로그인·회원가입·비밀번호 찾기 (/login), 마이프로필 (/me), 랭킹 (/ranking)
 * 마이프로필은 홈에서만 들어옴 (게임 중엔 제한 시간 때문에 다른 화면으로 나가지 않게)
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { loadNick } from '../session';
import { loginWith, logout, refreshAccount, useAccount, USER_DOMAIN } from '../net/account';
import { BADGES, titleOf } from '../game/achievements';
import { BadgeIcon, Icon } from '../components/Icon';
import { pct } from '../lib/format';

function PageHead({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <header className="page-head">
      <button className="icon-btn" aria-label="뒤로" onClick={onBack}>
        <Icon name="back" size={18} />
      </button>
      <h2>{title}</h2>
      <div className="ph-right">{right}</div>
    </header>
  );
}

const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

/** 가입·비밀번호 찾기 뒤에 한 번 보여 주는 복구 코드 */
function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel pad acc-recovery">
      <h3>
        <Icon name="key" size={18} /> 복구 코드를 꼭 저장해 두세요
      </h3>
      <p className="muted small">비밀번호를 잊었을 때 이 코드로만 새 비밀번호를 정할 수 있어요. 지금 한 번만 보여 드려요. (마이프로필에서 새로 받을 수 있어요)</p>
      <button className="code-big" onClick={() => copy(code)} title="눌러서 복사">
        {code} <Icon name="copy" size={14} />
      </button>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> 복구 코드를 따로 적어 두었어요
      </label>
      <button className="btn primary full" disabled={!saved} onClick={onDone}>
        확인
      </button>
    </section>
  );
}

/* ================= 로그인 · 회원가입 · 비밀번호 찾기 ================= */
export function LoginPage({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nickname, setNickname] = useState(loadNick());
  const [code, setCode] = useState('');
  const [agree14, setAgree14] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);

  const uOk = /^[a-z0-9_]{4,16}$/.test(username.trim().toLowerCase());
  const pOk = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  const run = async (fn: () => Promise<void>) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (recovery) return (
    <div className="lobby page">
      <PageHead title={tab === 'signup' ? '가입 완료!' : '비밀번호를 바꿨어요'} onBack={onDone} />
      <RecoveryCode code={recovery} onDone={onDone} />
    </div>
  );

  return (
    <div className="lobby page account">
      <PageHead title={tab === 'login' ? '로그인' : tab === 'signup' ? '회원가입' : '비밀번호 찾기'} onBack={onBack} />
      <div className="seg acc-tabs" role="tablist">
        {(
          [
            ['login', '로그인'],
            ['signup', '회원가입'],
            ['reset', '비밀번호 찾기'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => (setTab(k), setErr(''))}>
            {l}
          </button>
        ))}
      </div>

      <section className="panel pad acc-form">
        {tab === 'signup' && (
          <p className="muted small">
            가입하면 <b>랭킹</b>에 올라가고, 다른 기기에서도 아이디로 이어서 할 수 있어요. 지금 이 기기에서 하던 게임·기록은 그대로 새 계정으로 옮겨져요. 이메일은 받지 않아요.
          </p>
        )}
        {tab === 'login' && <p className="muted small">로그인하면 이 기기는 그 계정으로 바뀌어요. 게스트로 하던 이 기기의 기록은 따로 남아요(로그아웃하면 다시 게스트).</p>}
        {tab === 'reset' && <p className="muted small">가입할 때 받은 복구 코드로 새 비밀번호를 정해요.</p>}

        <label className="field">
          <span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} maxLength={16} autoComplete="username" autoCapitalize="none" placeholder="영어 소문자·숫자·_ 4~16자" />
          {tab === 'signup' && username && !uOk && <small className="error">영어 소문자·숫자·밑줄(_)로 4~16자</small>}
        </label>
        {tab === 'signup' && (
          <label className="field">
            <span>닉네임 (게임·랭킹에 보이는 이름)</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={10} placeholder="1~10자" />
          </label>
        )}
        {tab === 'reset' && (
          <label className="field">
            <span>복구 코드</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={14} placeholder="XXXX-XXXX-XXXX" autoComplete="off" />
          </label>
        )}
        <label className="field">
          <span>{tab === 'reset' ? '새 비밀번호' : '비밀번호'}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder={tab === 'login' ? '' : '8자 이상, 영어+숫자'} />
          {tab !== 'login' && password && !pOk && <small className="error">8자 이상, 영어와 숫자를 함께</small>}
        </label>
        {tab !== 'login' && (
          <label className="field">
            <span>비밀번호 확인</span>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} maxLength={72} autoComplete="new-password" />
            {password2 && password2 !== password && <small className="error">비밀번호가 서로 달라요</small>}
          </label>
        )}
        {tab === 'signup' && (
          <div className="acc-agree">
            <label className="check">
              <input type="checkbox" checked={agree14} onChange={(e) => setAgree14(e.target.checked)} /> 만 14세 이상이에요
            </label>
            <label className="check">
              <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} /> 개인정보 처리 안내(아이디·닉네임·게임 기록 저장)에 동의해요
            </label>
          </div>
        )}
        {err && <p className="error">{err}</p>}

        {tab === 'login' && (
          <button className="btn primary full" disabled={busy || !username || !password} onClick={() => run(async () => (await loginWith(username, password), onDone()))}>
            {busy ? '확인 중…' : '로그인'}
          </button>
        )}
        {tab === 'signup' && (
          <button
            className="btn primary full"
            disabled={busy || !uOk || !pOk || password !== password2 || !nickname.trim() || !agree14 || !agreePrivacy}
            onClick={() =>
              run(async () => {
                const r = await api<{ recoveryCode: string }>('signup', { username: username.trim().toLowerCase(), password, nickname: nickname.trim(), agree14, agreePrivacy });
                // 비밀번호를 정하면 예전 세션이 끝나므로 새 아이디로 바로 로그인
                await supabase!.auth.signInWithPassword({ email: `${username.trim().toLowerCase()}@${USER_DOMAIN}`, password });
                await refreshAccount();
                setRecovery(r.recoveryCode);
              })
            }
          >
            {busy ? '가입하는 중…' : '가입하기'}
          </button>
        )}
        {tab === 'reset' && (
          <button
            className="btn primary full"
            disabled={busy || !uOk || !pOk || password !== password2 || code.replace(/[^A-Z0-9]/g, '').length !== 12}
            onClick={() =>
              run(async () => {
                const r = await fetch('/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'resetPassword', username: username.trim().toLowerCase(), code, password }) });
                const j = (await r.json()) as { error?: string; recoveryCode?: string };
                if (!r.ok) throw new Error(j.error ?? '바꾸지 못했어요.');
                await loginWith(username, password);
                setRecovery(j.recoveryCode ?? null);
              })
            }
          >
            {busy ? '바꾸는 중…' : '새 비밀번호로 바꾸기'}
          </button>
        )}
      </section>
    </div>
  );
}

/* ================= 마이프로필 ================= */
export function MyProfilePage({ onBack, onLogin, onRanking, onRecords }: { onBack: () => void; onLogin: () => void; onRanking: () => void; onRecords: () => void }) {
  const acc = useAccount();
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);
  const p = acc.profile;
  useEffect(() => {
    refreshAccount();
  }, []);
  useEffect(() => {
    if (p) setNick(p.nickname);
  }, [p?.nickname]);

  if (acc.status === 'loading') return <div className="center-msg"><div className="spinner" /></div>;
  if (!p)
    return (
      <div className="lobby page">
        <PageHead title="마이프로필" onBack={onBack} />
        <section className="panel pad center">
          <p>로그인하면 마이프로필과 랭킹을 쓸 수 있어요.</p>
          <button className="btn primary" onClick={onLogin}>
            로그인 · 회원가입
          </button>
        </section>
      </div>
    );

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      await refreshAccount();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const earned = BADGES.filter((b) => acc.badges[b.id]);
  const title = p.title ? BADGES.find((b) => b.id === p.title) : titleOf(Object.keys(acc.badges));

  if (recovery) return (
    <div className="lobby page">
      <PageHead title="새 복구 코드" onBack={() => setRecovery(null)} />
      <RecoveryCode code={recovery} onDone={() => setRecovery(null)} />
    </div>
  );

  return (
    <div className="lobby page profile-page">
      <PageHead
        title="마이프로필"
        onBack={onBack}
        right={
          <button className="btn sm ghost" onClick={() => logout().then(onBack)}>
            로그아웃
          </button>
        }
      />
      <section className="panel pad me-card">
        <div className="me-avatar">{p.nickname.slice(0, 1)}</div>
        <div className="me-info">
          <b>
            {p.nickname} <Icon name="check" size={14} className="verified" />
          </b>
          {title && (
            <span className="title-tag">
              <BadgeIcon id={title.id} size={13} /> {title.name}
            </span>
          )}
          <small className="muted">아이디 {p.username}</small>
        </div>
        <button className="me-rank" onClick={onRanking}>
          <small>랭킹 점수</small>
          <b>{p.rating}</b>
          <small>{p.rankPos ? `${p.rankPos}위` : '첫 대결 후 순위'}</small>
        </button>
      </section>

      <section className="panel pad me-stats">
        <div>
          <small>대결</small>
          <b>{p.games}판</b>
        </div>
        <div>
          <small>1등</small>
          <b>{p.wins}번</b>
        </div>
        <div>
          <small>승률</small>
          <b>{p.games ? Math.round((p.wins / p.games) * 100) + '%' : '-'}</b>
        </div>
        <div>
          <small>최고 수익률</small>
          <b>{p.best_ret === null ? '-' : pct(p.best_ret, 1)}</b>
        </div>
      </section>

      {msg && <p className="ok-msg">{msg}</p>}
      {err && <p className="error">{err}</p>}

      <section className="panel pad">
        <h3>닉네임</h3>
        <div className="row-input">
          <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={10} aria-label="닉네임" />
          <button className="btn sm primary" disabled={!nick.trim() || nick.trim() === p.nickname} onClick={() => act(() => api('updateProfile', { nickname: nick.trim() }), '닉네임을 바꿨어요. 다음 게임부터 적용돼요')}>
            바꾸기
          </button>
        </div>
        <small className="muted">게임·랭킹에 보이는 이름이에요. 다른 회원과 같은 닉네임은 쓸 수 없어요.</small>
      </section>

      <section className="panel pad">
        <h3>
          <Icon name="medal" /> 업적 · 대표 칭호
        </h3>
        <p className="muted small">얻은 업적 중 하나를 대표 칭호로 고르면 랭킹에 함께 보여요.</p>
        <div className="badge-grid">
          {BADGES.map((b) => {
            const got = acc.badges[b.id];
            const on = p.title === b.id;
            return (
              <button
                key={b.id}
                className={'bg-cell r' + b.rarity + (got ? ' got' : '') + (on ? ' on' : '')}
                title={b.desc}
                disabled={!got}
                aria-pressed={on}
                onClick={() => act(() => api('updateProfile', { title: on ? null : b.id }), on ? '대표 칭호를 뺐어요' : `대표 칭호를 '${b.name}'(으)로 정했어요`)}
              >
                <i>{got ? <BadgeIcon id={b.id} /> : <Icon name="lock" size={20} />}</i>
                <b>{b.name}</b>
                <small>{got ? (on ? '대표 칭호' : '×' + got) : b.desc}</small>
              </button>
            );
          })}
        </div>
        {earned.length === 0 && <p className="muted small">아직 얻은 업적이 없어요. 대결을 끝내면 업적이 쌓여요.</p>}
      </section>

      <section className="panel pad">
        <h3>최근 대결</h3>
        {acc.recent.length === 0 ? (
          <p className="muted small">아직 끝낸 대결이 없어요. 친구와 대결을 끝내면 여기에 쌓여요.</p>
        ) : (
          <ul className="me-recent">
            {acc.recent.map((r) => (
              <li key={r.room_id}>
                <span className="date">{new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                <b>
                  {r.rank}위 / {r.players}명
                </b>
                <span className={r.ret >= 0 ? 'up' : 'down'}>{pct(r.ret, 1)}</span>
                {r.rated && r.rating_after !== null && r.rating_before !== null ? (
                  <span className={r.rating_after >= r.rating_before ? 'up' : 'down'}>
                    {r.rating_after >= r.rating_before ? '+' : ''}
                    {r.rating_after - r.rating_before}점
                  </span>
                ) : (
                  <span className="muted small">점수 없음(게스트와)</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <button className="btn sm ghost" onClick={onRecords}>
          전체 기록 보기
        </button>
      </section>

      <section className="panel pad">
        <h3>계정</h3>
        <div className="acc-pw">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (8자 이상, 영어+숫자)" maxLength={72} autoComplete="new-password" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="새 비밀번호 확인" maxLength={72} autoComplete="new-password" />
          <button
            className="btn sm"
            disabled={pw.length < 8 || pw !== pw2}
            onClick={() =>
              act(async () => {
                await api('changePassword', { password: pw });
                // 비밀번호를 바꾸면 예전 세션이 끝나므로 새 비밀번호로 다시 로그인
                await loginWith(p.username, pw);
                setPw('');
                setPw2('');
              }, '비밀번호를 바꿨어요')
            }
          >
            비밀번호 바꾸기
          </button>
        </div>
        <button className="btn sm ghost" onClick={() => act(async () => setRecovery((await api<{ recoveryCode: string }>('newRecovery')).recoveryCode), '새 복구 코드를 받았어요')}>
          <Icon name="key" size={14} /> 복구 코드 새로 받기
        </button>
        <p className="muted small">탈퇴는 홈 → 기록·업적 → 내 데이터 지우기에서 할 수 있어요.</p>
      </section>
    </div>
  );
}

/* ================= 랭킹 ================= */
interface RankRowT {
  rank: number;
  nickname: string;
  title: string | null;
  rating: number;
  games: number;
  wins: number;
}
export function RankingPage({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const acc = useAccount();
  const [data, setData] = useState<{ top: RankRowT[]; me: { rank: number | null; rating: number; nickname: string; games: number } | null } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api<typeof data>('ranking')
      .then((d) => setData(d))
      .catch(() => setErr(true));
  }, []);
  return (
    <div className="lobby page ranking">
      <PageHead title="랭킹" onBack={onBack} />
      <p className="muted small">회원끼리 붙은 멀티 대결 결과로 점수가 바뀌어요 (시작 1000점). 이기면 오르고 지면 내려가요. 상대가 강할수록 더 많이 올라요.</p>
      {acc.status === 'guest' && (
        <section className="panel pad guest-cta">
          <span>게스트는 랭킹에 올라가지 않아요.</span>
          <button className="btn sm primary" onClick={onLogin}>
            로그인 · 회원가입
          </button>
        </section>
      )}
      {data?.me && (
        <section className="panel pad my-rank">
          <b>{data.me.nickname}</b>
          <span>{data.me.rank ? `${data.me.rank}위` : '아직 순위 없음 (회원과 대결을 끝내면 올라가요)'}</span>
          <b className="pts">{data.me.rating}점</b>
        </section>
      )}
      {err && <p className="error">랭킹을 불러오지 못했어요. 인터넷을 확인해 주세요.</p>}
      {!data && !err && <p className="muted center">불러오는 중…</p>}
      {data && data.top.length === 0 && (
        <div className="empty-state">
          <i>
            <Icon name="trophy" size={32} />
          </i>
          <b>아직 랭킹이 비어 있어요</b>
          <small>회원끼리 첫 대결을 끝내면 순위가 생겨요.</small>
        </div>
      )}
      {data && data.top.length > 0 && (
        <ol className="rank-board">
          {data.top.map((r) => {
            const t = r.title ? BADGES.find((b) => b.id === r.title) : null;
            const mine = data.me && r.nickname === data.me.nickname;
            return (
              <li key={r.rank + r.nickname} className={mine ? 'me' : ''}>
                <span className={'rb-rank r' + Math.min(r.rank, 4)}>{r.rank}</span>
                <span className="rb-name">
                  <b>{r.nickname}</b>
                  {t && (
                    <small className="title-tag">
                      <BadgeIcon id={t.id} size={12} /> {t.name}
                    </small>
                  )}
                </span>
                <span className="rb-stat muted">
                  {r.games}판 · {r.wins}승
                </span>
                <b className="rb-pts">{r.rating}</b>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
