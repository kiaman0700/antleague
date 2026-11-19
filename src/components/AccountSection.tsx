/**
 * 설정·더보기 '내 계정' 칸 (design/onboarding.md)
 * - 둘러보기(세션 없음): 시작하기·로그인·회원가입만 (닉네임 칸 없음)
 * - 게스트: 닉네임 · 이어하기 코드(언제든 보기·복사·새로 받기) · 다른 게스트 코드로 이어하기 · 게스트 그만하기
 * - 회원: 마이프로필 · 로그아웃
 */
import { copyText } from '../lib/copy';
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Loading } from './ui';
import { ask } from './ConfirmHost';
import { api } from '../net/api';
import { logout, type AccountState } from '../net/account';
import { GUEST_CODE_NOTICE, GUEST_EXPIRY_NOTICE, type WelcomeStep } from './Welcome';
import { setFlash } from '../lib/flash';

export function GuestCodeBox() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const load = async (renew: boolean) => {
    if (renew && !(await ask('새 코드로 바꿀까요? 지금 코드는 더는 쓸 수 없어요.', { ok: '새 코드 받기' }))) return;
    setBusy(true);
    setErr('');
    try {
      setCode((await api<{ code: string }>('guestCode', renew ? { renew: true } : {})).code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!code) return;
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else setErr('복사하지 못했어요. 코드를 직접 적어 두세요.');
  };
  return (
    <div className="gc-box">
      <b className="gc-box-t">
        <Icon name="key" size={15} /> 이어하기 코드
      </b>
      <small className="muted">다른 기기·브라우저에서 이 게스트를 이어서 할 때 써요.</small>
      {code ? (
        <div className="gc-box-code">
          <code aria-label="이어하기 코드">{code}</code>
          <button className="btn sm" onClick={copy}>
            {copied ? <><Icon name="check" size={14} /> 복사됐어요</> : '복사'}
          </button>
          <button className="btn sm ghost" disabled={busy} onClick={() => void load(true)}>
            새 코드로 바꾸기
          </button>
        </div>
      ) : (
        <button className="btn sm" disabled={busy} onClick={() => void load(false)}>
          {busy ? '불러오는 중…' : '코드 보기'}
        </button>
      )}
      <small className="gc-box-warn">{GUEST_CODE_NOTICE}</small>
      {err && (
        <p className="error small" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

export function AccountSection({
  account,
  online,
  member,
  memberRow,
  nickField,
  go,
  openWelcome,
}: {
  account: AccountState;
  online: boolean;
  member: boolean;
  /** 회원 줄 (마이프로필로) */
  memberRow: ReactNode;
  /** 게스트 닉네임 칸 */
  nickField: ReactNode;
  go: (p: 'signup' | 'login') => void;
  openWelcome: (step?: WelcomeStep) => void;
}) {
  const out = async (guest: boolean) => {
    const msg = guest
      ? '게스트를 그만할까요? 이어하기 코드를 받아 두지 않았다면 이 게스트로 다시 돌아올 수 없어요.'
      : '로그아웃할까요? 다시 하려면 아이디·비밀번호로 로그인하면 돼요.';
    if (!(await ask(msg, { ok: guest ? '그만하기' : '로그아웃', danger: guest }))) return;
    await logout();
    setFlash(guest ? '게스트를 그만했어요. 둘러보기만 할 수 있어요.' : '로그아웃했어요.');
  };
  if (!online) return <>{nickField}</>;
  if (member)
    return (
      <>
        {memberRow}
        <div className="rg-actions">
          <button className="btn sm" onClick={() => void out(false)}>
            <Icon name="exit" size={14} /> 로그아웃
          </button>
        </div>
      </>
    );
  if (account.status === 'loading') return <Loading inline label="내 계정을 확인하는 중…" />;
  if (account.status === 'visitor')
    return (
      <>
        <p className="muted small">아직 시작하지 않았어요. 게스트로 시작하거나 로그인하기 전에는 둘러보기만 할 수 있어요.</p>
        <div className="rg-actions">
          <button className="btn sm primary" onClick={() => openWelcome('intro')}>
            시작하기
          </button>
          <button className="btn sm" onClick={() => go('login')}>
            로그인
          </button>
          <button className="btn sm" onClick={() => go('signup')}>
            회원가입
          </button>
        </div>
      </>
    );
  return (
    <>
      {nickField}
      <p className="muted small guest-expiry">{GUEST_EXPIRY_NOTICE}</p>
      <div className="rg-actions">
        <button className="btn sm primary" onClick={() => go('signup')}>
          <Icon name="userPlus" /> 회원가입
        </button>
        <button className="btn sm" onClick={() => go('login')}>
          로그인
        </button>
      </div>
      <GuestCodeBox />
      <div className="rg-actions">
        <button
          className="btn sm ghost"
          onClick={async () => {
            if (await ask('다른 게스트 코드로 이어할까요? 지금 게스트에서 빠져요. 지금 게스트의 이어하기 코드를 받아 두지 않았다면 돌아올 수 없어요.', { ok: '코드 입력하기' })) openWelcome('code');
          }}
        >
          다른 게스트 코드로 이어하기
        </button>
        <button className="btn sm ghost danger-text" onClick={() => void out(true)}>
          게스트 그만하기
        </button>
      </div>
    </>
  );
}
