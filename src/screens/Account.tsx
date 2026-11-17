/**
 * 회원 화면: 로그인·회원가입·비밀번호 찾기 (/login), 마이프로필 (/me), 랭킹 (/ranking)
 * 마이프로필은 홈에서만 들어옴 (게임 중엔 제한 시간 때문에 다른 화면으로 나가지 않게)
 */
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { AVATARS, canUseAvatar } from '../game/avatars';
import { TierBadge, TierEmblem, TierLadder } from '../components/TierBadge';
import { DailyRankPanel } from '../components/Daily';
import { isPlaced, PLACEMENT_GAMES, tierOf } from '../game/tier';
import { api } from '../net/api';
import { ForgetMe } from '../components/ForgetMe';
import { loadNick } from '../session';
import { loginWith, logout, refreshAccount, resolveGuest, useAccount, type GuestLeftover } from '../net/account';
import { BADGES, givesTitle, titleOf } from '../game/achievements';
import { LevelMeter } from '../components/Missions';
import { Sheet } from '../components/PrefsPanel';
import { BadgeIcon, Icon } from '../components/Icon';
import { pct, tone } from '../lib/format';
import { josa } from '../engine/engine';
import { LegalSheet, type LegalKind } from '../components/Legal';

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

function AvailMsg({ st, what, invalid }: { st: Avail; what: string; invalid: string }) {
  if (st === 'checking') return <small className="muted">확인하는 중…</small>;
  if (st === 'ok') return <small className="good-msg">사용할 수 있는 {josa(what, '이에요', '예요')}</small>;
  if (st === 'taken') return <small className="error">이미 쓰는 {josa(what, '이에요', '예요')}. 다른 {josa(what, '을', '를')} 써 주세요</small>;
  if (st === 'invalid') return <small className="error">{invalid}</small>;
  if (st === 'error') return <small className="error">확인하지 못했어요. 잠시 후 다시 입력해 주세요</small>;
  return null;
}

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

/** 흔한 비밀번호 모양 (abcd1234·password1·qwer1234·같은 글자 반복·12345678 연속) — 막지는 않고 알려만 줌 */
function weakPw(p: string): boolean {
  const s = p.toLowerCase();
  if (/^(.)\1+$/.test(s.replace(/\d+$/, '')) ) return true;
  if (/(password|qwer|asdf|zxcv|abcd|1234|1q2w|iloveyou|admin|test)/.test(s) && s.length < 12) return true;
  return s.length < 10 && /^[a-z]+\d+$/.test(s) && new Set(s).size <= 5;
}
type Avail = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid' | 'error';
/** 입력이 멈추고 0.4초 뒤 서버에 중복 확인 (가입할 때만) */
function useAvailability(field: 'username' | 'nickname', value: string, on: boolean, valid: boolean): Avail {
  const [st, setSt] = useState<Avail>('idle');
  useEffect(() => {
    if (!on || !value.trim()) return setSt('idle');
    if (!valid) return setSt('invalid');
    setSt('checking');
    let alive = true;
    const t = setTimeout(() => {
      api<Record<string, 'ok' | 'taken' | 'invalid'>>('checkAvailable', { [field]: value.trim() })
        .then((r) => alive && setSt(r[field] ?? 'error'))
        .catch(() => alive && setSt('error'));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [field, value, on, valid]);
  return st;
}
const fieldCls = (s: Avail | 'match' | 'mismatch') => 'field' + (s === 'ok' || s === 'match' ? ' good' : s === 'taken' || s === 'invalid' || s === 'mismatch' ? ' bad' : '');

/* ================= 로그인 · 회원가입 · 비밀번호 찾기 ================= */
export function LoginPage({ onBack, onDone, initialTab = 'login' }: { onBack: () => void; onDone: () => void; initialTab?: 'login' | 'signup' }) {
  const acc = useAccount();
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>(initialTab);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nickname, setNickname] = useState(loadNick());
  const [code, setCode] = useState('');
  const [agree14, setAgree14] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [legal, setLegal] = useState<LegalKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [leftover, setLeftover] = useState<GuestLeftover | null>(null);

  const uOk = /^[a-z0-9_]{4,16}$/.test(username.trim().toLowerCase());
  const pOk = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password) && !(uOk && password.toLowerCase().includes(username.trim().toLowerCase()));
  const nOk = nickname.trim().length >= 1 && nickname.trim().length <= 10 && ![...nickname].some((ch) => ch === '<' || ch === '>' || ch.charCodeAt(0) < 32);
  const uAvail = useAvailability('username', username.trim().toLowerCase(), tab === 'signup', uOk);
  const nAvail = useAvailability('nickname', nickname, tab === 'signup', nOk);
  const pwState: 'idle' | 'match' | 'mismatch' = !password2 ? 'idle' : password2 === password && pOk ? 'match' : 'mismatch';
  const signupReady = uAvail === 'ok' && nAvail === 'ok' && pwState === 'match' && agree14 && agreePrivacy && agreeTerms;
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

  // 이미 기록이 있는 계정으로 로그인했는데 이 기기에 게스트 기록도 있으면: 가져올지 버릴지
  if (leftover) return (
    <div className="lobby page">
      <PageHead title="게스트 기록이 있어요" onBack={() => {}} />
      <section className="panel pad guest-merge">
        <p>
          로그인 전에 이 기기에서 게스트로 한 기록이 있어요: 끝낸 대결 <b>{leftover.games}판</b>
          {leftover.playing > 0 && (
            <>
              , 진행 중인 대결 <b>{leftover.playing}판</b>
            </>
          )}
          .
        </p>
        <p className="muted small">랭킹 점수는 랭킹전에서만 바뀌므로 어느 쪽을 골라도 계정 점수는 그대로예요. 이 기기의 연습 게임·화면 설정은 그대로 남아요.</p>
        {err && <p className="error">{err}</p>}
        <button
          className="btn primary full"
          disabled={busy}
          onClick={() => run(async () => (await resolveGuest(leftover.guestToken, 'merge'), setLeftover(null), onDone()))}
        >
          게스트 기록을 이 계정으로 가져오기
          <small> 전적·업적에 더해지고, 진행 중인 대결도 이어서 할 수 있어요</small>
        </button>
        <button
          className="btn ghost full"
          disabled={busy}
          onClick={() => run(async () => (await resolveGuest(leftover.guestToken, 'discard'), setLeftover(null), onDone()))}
        >
          게스트 기록은 버리고 계정 기록만 쓰기
          <small> 게스트로 한 기록은 지워져요 (되돌릴 수 없어요)</small>
        </button>
      </section>
    </div>
  );

  if (recovery) return (
    <div className="lobby page">
      <PageHead title={tab === 'signup' ? '가입 완료!' : '비밀번호를 바꿨어요'} onBack={onDone} />
      <RecoveryCode code={recovery} onDone={onDone} />
    </div>
  );

  // 이미 회원으로 로그인한 채 들어오면: 가입 양식을 다 채운 뒤에야 '이미 가입' 오류를 보지 않게 먼저 알려 줌
  if (acc.status === 'member' && acc.profile && !busy) return (
    <div className="lobby page account">
      <PageHead title="로그인" onBack={onBack} />
      <section className="panel pad">
        <EmptyState
          icon="check"
          title={`${acc.profile.nickname} 회원으로 로그인돼 있어요`}
          desc="다른 아이디로 들어가려면 먼저 로그아웃하세요."
          action={
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button className="btn ghost" onClick={() => void logout()}>로그아웃</button>
              <button className="btn primary" onClick={onDone}>홈으로</button>
            </div>
          }
        />
      </section>
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

      {/* 칸에서 엔터를 누르면 지금 탭의 버튼(로그인·가입하기·바꾸기)을 누른 것처럼 — 한글 입력 중(조합 중) 엔터는 무시 */}
      <section
        className="panel pad acc-form"
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || (e.target as HTMLElement).tagName !== 'INPUT') return;
          if ((e.target as HTMLInputElement).type === 'checkbox') return;
          e.preventDefault();
          const btn = e.currentTarget.querySelector<HTMLButtonElement>('.btn.primary.full');
          if (btn && !btn.disabled) btn.click();
        }}
      >
        {tab === 'signup' && (
          <p className="muted small">
            가입하면 <b>랭킹</b>에 올라가고, 다른 기기에서도 아이디로 이어서 할 수 있어요. 지금 이 기기에서 하던 게임·기록은 그대로 새 계정으로 옮겨져요. 이메일은 받지 않아요.
          </p>
        )}
        {tab === 'login' && <p className="muted small">로그인하면 이 기기는 그 계정으로 바뀌어요. 게스트로 하던 이 기기의 기록은 따로 남아요(로그아웃하면 다시 게스트).</p>}
        {tab === 'reset' && <p className="muted small">가입할 때 받은 복구 코드로 새 비밀번호를 정해요.</p>}

        <label className={tab === 'signup' ? fieldCls(uAvail) : 'field'}>
          <span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())} maxLength={16} autoComplete="username" autoCapitalize="none" placeholder="영어 소문자·숫자·_ 4~16자" />
          {tab === 'signup' && <AvailMsg st={uAvail} what="아이디" invalid="영어 소문자·숫자·밑줄(_)로 4~16자로 써 주세요" />}
        </label>
        {tab === 'signup' && (
          <label className={fieldCls(nAvail)}>
            <span>닉네임 (게임·랭킹에 보이는 이름)</span>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={10} placeholder="1~10자" />
            <AvailMsg st={nAvail} what="닉네임" invalid="1~10자, 꺾쇠(<>) 없이 써 주세요" />
          </label>
        )}
        {tab === 'reset' && (
          <label className="field">
            <span>복구 코드</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={14} placeholder="XXXX-XXXX-XXXX" autoComplete="off" />
          </label>
        )}
        <label className={tab !== 'login' && password ? fieldCls(pOk ? 'ok' : 'invalid') : 'field'}>
          <span>{tab === 'reset' ? '새 비밀번호' : '비밀번호'}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={72} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} placeholder={tab === 'login' ? '' : '8자 이상, 영어+숫자'} />
          {tab !== 'login' && password && !pOk && <small className="error">8자 이상, 영어와 숫자를 함께 (아이디는 넣지 말아 주세요)</small>}
          {tab !== 'login' && password && pOk && (weakPw(password) ? <small className="warn-msg">쓸 수는 있지만 흔한 비밀번호예요. 다른 사이트와 다르게, 더 길게 정하면 안전해요</small> : <small className="good-msg">쓸 수 있는 비밀번호예요</small>)}
        </label>
        {tab !== 'login' && (
          <label className={fieldCls(pwState)}>
            <span>비밀번호 확인</span>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} maxLength={72} autoComplete="new-password" />
            {pwState === 'mismatch' && <small className="error">{password2 !== password ? '비밀번호가 서로 달라요' : '먼저 위 비밀번호 조건을 맞춰 주세요'}</small>}
            {pwState === 'match' && <small className="good-msg">비밀번호가 같아요</small>}
          </label>
        )}
        {tab === 'signup' && (
          <div className="acc-agree" role="group" aria-label="가입 동의">
            {/* 전체 동의: 아래 [필수] 세 칸을 한 번에 켜고 끔 */}
            <label className="check agree-all">
              <input
                type="checkbox"
                checked={agree14 && agreeTerms && agreePrivacy}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAgree14(v);
                  setAgreeTerms(v);
                  setAgreePrivacy(v);
                }}
              />{' '}
              <b>모두 동의해요</b>
            </label>
            <label className="check">
              <input type="checkbox" checked={agree14} onChange={(e) => setAgree14(e.target.checked)} /> <span className="req">[필수]</span> 만 14세 이상이에요
            </label>
            <div className="check-row">
              <label className="check">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} /> <span className="req">[필수]</span> 이용약관에 동의해요
              </label>
              <button type="button" className="linkish-soft" onClick={() => setLegal('terms')}>
                보기
              </button>
            </div>
            <div className="check-row">
              <label className="check">
                <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} /> <span className="req">[필수]</span> 개인정보 수집·이용에 동의해요
              </label>
              <button type="button" className="linkish-soft" onClick={() => setLegal('privacy')}>
                보기
              </button>
            </div>
          </div>
        )}
        {err && <p className="error">{err}</p>}

        {tab === 'login' && (
          <button
            className="btn primary full"
            disabled={busy || !username || !password}
            onClick={() =>
              run(async () => {
                const left = await loginWith(username, password);
                if (left) setLeftover(left);
                else onDone();
              })
            }
          >
            {busy ? '확인 중…' : '로그인'}
          </button>
        )}
        {tab === 'signup' && (
          <button
            className="btn primary full"
            disabled={busy || !signupReady}
            onClick={() =>
              run(async () => {
                const r = await api<{ recoveryCode: string }>('signup', { username: username.trim().toLowerCase(), password, nickname: nickname.trim(), agree14, agreePrivacy, agreeTerms });
                // 비밀번호를 정하면 예전 세션이 끝나므로 새 아이디로 바로 로그인
                await loginWith(username, password);
                setRecovery(r.recoveryCode);
              })
            }
          >
            {busy ? '가입하는 중…' : '가입하기'}
          </button>
        )}
        {tab === 'signup' && !signupReady && <small className="muted center-text">아이디·닉네임·비밀번호 확인과 [필수] 동의 세 가지를 마치면 가입할 수 있어요</small>}
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
      {legal && <LegalSheet kind={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}

/* ================= 마이프로필 ================= */
export function MyProfilePage({ onBack, onLogin, onRanking, onRecords }: { onBack: () => void; onLogin: () => void; onRanking: () => void; onRecords: () => void }) {
  const acc = useAccount();
  const [nick, setNick] = useState('');
  // 바꿀 닉네임을 입력하는 동안 쓸 수 있는지 바로 확인 (지금 닉네임과 대소문자만 다르면 확인 안 함)
  const nickCheck = !!nick.trim() && nick.trim().toLowerCase() !== (acc.profile?.nickname ?? '').toLowerCase();
  const nickOk = nick.trim().length >= 1 && nick.trim().length <= 10 && ![...nick].some((ch) => ch === '<' || ch === '>' || ch.charCodeAt(0) < 32);
  const nickAvail = useAvailability('nickname', nick, nickCheck, nickOk);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [cur, setCur] = useState('');
  // 사진·칭호·비밀번호·복구 코드는 각각 따로 여는 창 (사용자 요청 2026-11-17: 사진과 칭호는 따로, 계정 설정은 접어 두기)
  const [sheet, setSheet] = useState<null | 'avatar' | 'title' | 'password' | 'recovery'>(null);
  const [editNick, setEditNick] = useState(false);
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

  if (acc.status === 'loading') return <Loading />;
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
        <button className="me-avatar-btn" onClick={() => (setErr(''), setMsg(''), setSheet('avatar'))} title="프로필 사진 바꾸기" aria-label="프로필 사진 바꾸기">
          <Avatar id={p.avatar} name={p.nickname} size={72} />
          <span className="me-av-edit">
            <Icon name="edit" size={12} />
          </span>
        </button>
        <div className="me-info">
          {editNick ? (
            <div className="me-nick-edit">
              <div className="row-input">
                <input
                  autoFocus
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (setEditNick(false), setNick(''))}
                  maxLength={10}
                  aria-label="새 닉네임"
                  aria-invalid={nickAvail === 'taken' || nickAvail === 'invalid'}
                />
                <button
                  className="btn sm primary"
                  disabled={!nick.trim() || nick.trim() === p.nickname || nickAvail === 'taken' || nickAvail === 'invalid'}
                  onClick={() => act(() => api('updateProfile', { nickname: nick.trim() }), '닉네임을 바꿨어요. 다음 게임부터 적용돼요').then(() => (setEditNick(false), setNick('')))}
                >
                  저장
                </button>
                <button className="btn sm ghost" onClick={() => (setEditNick(false), setNick(''))}>
                  취소
                </button>
              </div>
              {nickCheck ? (
                <div className="nick-avail" aria-live="polite">
                  <AvailMsg st={nickAvail} what="닉네임" invalid="1~10자, 꺾쇠(<>) 없이 써 주세요" />
                </div>
              ) : (
                <small className="muted">게임·랭킹에 보이는 이름이에요. 다른 회원과 같은 닉네임은 못 써요.</small>
              )}
            </div>
          ) : (
            <div className="me-name-row">
              <b className="me-nick">{p.nickname}</b>
              <button className="me-nick-btn" onClick={() => (setEditNick(true), setNick(p.nickname))} aria-label="닉네임 바꾸기" title="닉네임 바꾸기">
                <Icon name="edit" size={13} />
              </button>
            </div>
          )}
          <small className="me-id">@{p.username}</small>
          <button className={'me-title-btn' + (title ? '' : ' empty')} onClick={() => (setErr(''), setMsg(''), setSheet('title'))} title="칭호 바꾸기" aria-label={title ? `칭호 ${title.name}, 눌러서 바꾸기` : '칭호 고르기'}>
            {title ? (
              <>
                <BadgeIcon id={title.id} size={13} /> {title.name}
              </>
            ) : (
              '칭호 고르기'
            )}
            <Icon name="down" size={12} />
          </button>
          <LevelMeter xp={p.xp ?? 0} className="me-level" title="미션·대결로 경험치를 모아 레벨을 올려요 (최대 Lv.100)" />
        </div>
        {/* 랭크 칸: 엠블럼 위 · 티어 이름(티어 색) · 점수 · '랭킹 보기 ›' — 모두 가운데 */}
        <button className={'me-rank' + (isPlaced(p.ranked_games) ? '' : ' unplaced')} onClick={onRanking} aria-label="랭킹 보기">
          <TierEmblem rating={p.rating} placed={isPlaced(p.ranked_games)} size={46} />
          <b style={isPlaced(p.ranked_games) ? { color: tierOf(p.rating).color } : undefined}>{isPlaced(p.ranked_games) ? tierOf(p.rating).label : '배치 중'}</b>
          <small>{isPlaced(p.ranked_games) ? `${tierOf(p.rating).points}점${p.rankPos ? ` · ${p.rankPos}위` : ''}` : `배치 ${p.ranked_games ?? 0}/${PLACEMENT_GAMES}판`}</small>
          <span className="me-rank-go">
            랭킹 보기 <Icon name="right" size={12} />
          </span>
        </button>
      </section>

      <section className="panel pad me-stats">
        <div>
          <small>대결</small>
          <b>{p.games}판</b>
        </div>
        <div>
          <small>1위</small>
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

      <section className="panel pad me-recent">
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
                <span className={tone(r.ret)}>{pct(r.ret, 1)}</span>
                {r.rated && r.rating_after !== null && r.rating_before !== null && isPlaced(p.ranked_games) ? (
                  <span className={r.rating_after >= r.rating_before ? 'up' : 'down'}>
                    {r.rating_after >= r.rating_before ? '+' : ''}
                    {r.rating_after - r.rating_before}점
                  </span>
                ) : (
                  // 점수가 안 바뀐 판은 봇전·일반전·커스텀도 있어서 '게스트와'라고 하면 틀림. 랭킹전 배치 중이면 점수를 숨김
                  <span className="muted small">{r.rated ? '배치 경기' : '점수 없는 판'}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <button className="btn sm ghost" onClick={onRecords}>
          업적·전적 전체 보기
        </button>
      </section>

      <section className="panel pad more-links acc-sec">
        <h3 className="more-h">계정</h3>
        <button className="more-row" onClick={() => (setErr(''), setMsg(''), setSheet('password'))}>
          <Icon name="lock" /> <span className="mr-t"><b>비밀번호 바꾸기</b><small>지금 비밀번호가 필요해요 · 바꾸면 다른 기기는 로그아웃돼요</small></span> <Icon name="right" size={14} />
        </button>
        <button className="more-row" onClick={() => (setErr(''), setMsg(''), setSheet('recovery'))}>
          <Icon name="key" /> <span className="mr-t"><b>복구 코드 새로 받기</b><small>비밀번호를 잊었을 때 쓰는 코드 · 예전 코드는 못 쓰게 돼요</small></span> <Icon name="right" size={14} />
        </button>
      </section>
      {sheet === 'avatar' && (
        <Sheet title="프로필 사진" onClose={() => setSheet(null)} wide>
          <DecoAvatars current={p.avatar ?? 'default'} nickname={p.nickname} badges={acc.badges} onPick={(id, name) => act(() => api('updateProfile', { avatar: id }), `프로필 사진을 '${name}'(으)로 바꿨어요`)} />
          {err && <p className="error small">{err}</p>}
          {msg && <p className="ok-msg small">{msg}</p>}
        </Sheet>
      )}
      {sheet === 'title' && (
        <Sheet title="칭호" onClose={() => setSheet(null)} wide>
          <DecoTitles current={p.title} badges={acc.badges} onPick={(id, name) => act(() => api('updateProfile', { title: id }), id ? `대표 칭호를 '${name}'(으)로 정했어요` : '대표 칭호를 뺐어요')} />
          {err && <p className="error small">{err}</p>}
          {msg && <p className="ok-msg small">{msg}</p>}
        </Sheet>
      )}
      {sheet === 'password' && (
        <Sheet title="비밀번호 바꾸기" onClose={() => setSheet(null)}>
          <div className="acc-sheet">
            <div className="acc-pw">
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="지금 비밀번호" aria-label="지금 비밀번호" maxLength={72} autoComplete="current-password" />
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (8자 이상, 영어+숫자)" aria-label="새 비밀번호" maxLength={72} autoComplete="new-password" />
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" maxLength={72} autoComplete="new-password" />
            </div>
            {(pw || pw2) && (
              <p className="small pw-hint" aria-live="polite">
                {pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw) ? (
                  <span className="error">새 비밀번호는 8자 이상, 영어와 숫자를 함께 써 주세요</span>
                ) : pw2 && pw !== pw2 ? (
                  <span className="error">새 비밀번호 두 칸이 서로 달라요</span>
                ) : !cur ? (
                  <span className="muted">지금 비밀번호도 적어 주세요</span>
                ) : pw === pw2 ? (
                  weakPw(pw) ? <span className="warn-msg">바꿀 수는 있지만 흔한 비밀번호예요. 더 길게 정하면 안전해요</span> : <span className="ok-msg">바꿀 준비가 됐어요</span>
                ) : null}
              </p>
            )}
            <button
              className="btn primary block"
              disabled={!cur || pw.length < 8 || !/[a-z]/i.test(pw) || !/\d/.test(pw) || pw !== pw2}
              onClick={() =>
                act(async () => {
                  await api('changePassword', { current: cur, password: pw });
                  // 비밀번호를 바꾸면 예전 세션이 끝나므로 새 비밀번호로 다시 로그인
                  await loginWith(p.username, pw);
                  setCur('');
                  setPw('');
                  setPw2('');
                  setSheet(null);
                }, '비밀번호를 바꿨어요')
              }
            >
              비밀번호 바꾸기
            </button>
            {err && <p className="error small">{err}</p>}
          </div>
        </Sheet>
      )}
      {sheet === 'recovery' && (
        <Sheet title="복구 코드 새로 받기" onClose={() => setSheet(null)}>
          <div className="acc-sheet">
            <p className="muted small">새 코드를 받으면 예전 복구 코드는 더 이상 못 써요. 지금 비밀번호를 적어 주세요.</p>
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="지금 비밀번호" aria-label="지금 비밀번호" maxLength={72} autoComplete="current-password" />
            <button
              className="btn primary block"
              disabled={!cur}
              onClick={() =>
                act(async () => {
                  setRecovery((await api<{ recoveryCode: string }>('newRecovery', { current: cur })).recoveryCode);
                  setCur('');
                  setSheet(null);
                }, '새 복구 코드를 받았어요')
              }
            >
              <Icon name="key" size={14} /> 새 복구 코드 받기
            </button>
            {err && <p className="error small">{err}</p>}
          </div>
        </Sheet>
      )}
      <ForgetMe />
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
  avatar?: string;
}
export function RankingPage({ onBack, onLogin, onPlay }: { onBack: () => void; onLogin: () => void; onPlay?: () => void }) {
  const acc = useAccount();
  const [data, setData] = useState<{ top: RankRowT[]; me: { rank: number | null; rating: number; nickname: string; games: number; ranked_games?: number; unlisted?: boolean } | null } | null>(null);
  const [err, setErr] = useState(false);
  const [tryN, setTryN] = useState(0);
  useEffect(() => {
    setErr(false);
    api<typeof data>('ranking')
      .then((d) => setData(d))
      .catch(() => setErr(true));
  }, [tryN]);
  return (
    <div className="lobby page ranking">
      <PageHead title="랭킹" onBack={onBack} />
      <p className="muted small">랭킹전(회원끼리, 1대1·다인전) 결과로 점수가 바뀌어요. 처음엔 1000점, 2판 배치 뒤 티어가 보여요. 이기면 오르고 지면 내려가요. 상대가 강할수록 더 많이 올라요.</p>
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
          <span>{data.me.unlisted ? '시험용 계정이라 공개 랭킹에 안 나와요' : data.me.rank ? `${data.me.rank}위` : `아직 순위 없음 · 랭킹전 ${Math.max(1, PLACEMENT_GAMES - (data.me.ranked_games ?? 0))}판 더 하면 올라가요`}</span>
          <TierBadge rating={data.me.rating} rankedGames={data.me.ranked_games} size={26} />
          {onPlay && (
            <button className="btn sm primary" onClick={onPlay}>
              랭킹전 하러 가기
            </button>
          )}
        </section>
      )}
      {err && <ErrorState what="랭킹" onRetry={() => setTryN((n) => n + 1)} />}
      {!data && !err && <Loading />}
      {data && data.top.length === 0 && <EmptyState icon="trophy" title="아직 랭킹이 비어 있어요" desc={`랭킹전 배치 ${PLACEMENT_GAMES}판을 마친 회원부터 순위에 올라가요.`} />}
      {data && data.top.length > 0 && (
        <ol className="rank-board">
          {data.top.map((r) => {
            const t = r.title ? BADGES.find((b) => b.id === r.title) : null;
            const mine = data.me && r.nickname === data.me.nickname;
            return (
              <li key={r.rank + r.nickname} className={mine ? 'me' : ''}>
                <span className={'rb-rank r' + Math.min(r.rank, 4)}>{r.rank}</span>
                <Avatar id={r.avatar} name={r.nickname} size={30} />
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
                <TierBadge rating={r.rating} rankedGames={PLACEMENT_GAMES} size={24} />
              </li>
            );
          })}
        </ol>
      )}
      <DailyRankPanel />
      <TierLadder mine={data?.me ? { rating: data.me.rating, rankedGames: data.me.ranked_games } : undefined} />
    </div>
  );
}

/** 프로필 사진 고르기 창: 얻은 것만 (못 딴 건 숨기고 개수만) — 칭호 창과 같은 칸 모양. 사진과 칭호는 따로 고름 */
function DecoAvatars({ current, nickname, badges, onPick }: { current: string; nickname: string; badges: Record<string, number>; onPick: (id: string, name: string) => void }) {
  const mine = Object.keys(badges);
  const open = AVATARS.filter((a) => canUseAvatar(a.id, mine));
  const hidden = AVATARS.filter((a) => !a.need?.startsWith('__')).length - open.length;
  return (
    <>
      <div className="deco-grid">
        {open.map((a) => {
          const on = current === a.id;
          const from = a.need ? BADGES.find((b) => b.id === a.need) : null;
          return (
            <button key={a.id} className={'deco-cell' + (on ? ' on' : '')} aria-pressed={on} disabled={on} onClick={() => onPick(a.id, a.name)}>
              <Avatar id={a.id} name={nickname} size={56} />
              <b>{a.name}</b>
              <small>{on ? '지금 사진' : from ? `업적 '${from.name}'` : '기본'}</small>
            </button>
          );
        })}
      </div>
      {hidden > 0 && <p className="muted small deco-hidden">아직 숨은 사진 {hidden}개 — 업적을 깨면 하나씩 나타나요.</p>}
    </>
  );
}

const RARITY_LABEL = { 3: '전설', 2: '희귀', 1: '일반' } as const;
/** 꾸미기 · 칭호: 얻은 것만, 귀한 순서(전설 → 희귀 → 일반) · 같은 등급은 많이 딴 순 · 웃픈 칭호는 따로 맨 뒤 */
function DecoTitles({ current, badges, onPick }: { current: string | null; badges: Record<string, number>; onPick: (id: string | null, name: string) => void }) {
  const got = BADGES.map((b, i) => ({ b, i, n: badges[b.id] ?? 0 })).filter((x) => x.n > 0 && givesTitle(x.b.id));
  type G = (typeof got)[number];
  const sortFn = (x: G, y: G) => y.b.rarity - x.b.rarity || y.n - x.n || x.i - y.i;
  const normal = got.filter((x) => !x.b.funny).sort(sortFn);
  const funny = got.filter((x) => x.b.funny).sort(sortFn);
  const total = BADGES.filter((b) => givesTitle(b.id)).length;
  const cell = ({ b, n }: G) => {
    const on = current === b.id;
    return (
      <button key={b.id} className={'deco-cell title r' + b.rarity + (b.funny ? ' funny' : '') + (on ? ' on' : '')} aria-pressed={on} title={b.desc} onClick={() => onPick(on ? null : b.id, b.name)}>
        <i>
          <BadgeIcon id={b.id} size={22} />
        </i>
        <b>{b.name}</b>
        <small>
          {on ? '대표 칭호' : b.funny ? '웃픈 칭호' : RARITY_LABEL[b.rarity]} · ×{n}
        </small>
      </button>
    );
  };
  if (!got.length) return <p className="muted small">아직 얻은 칭호가 없어요. 대결을 끝내면 업적과 함께 칭호가 생겨요.</p>;
  return (
    <>
      <p className="muted small deco-note">고른 칭호는 이름 옆과 랭킹에 보여요. 한 번 더 누르면 빼요.</p>
      <div className="deco-grid">{normal.map(cell)}</div>
      {funny.length > 0 && (
        <>
          <h4 className="deco-sub">웃픈 칭호</h4>
          <div className="deco-grid">{funny.map(cell)}</div>
        </>
      )}
      {total - got.length > 0 && <p className="muted small deco-hidden">아직 숨은 칭호 {total - got.length}개</p>}
    </>
  );
}
