/**
 * 환영 창 (design/onboarding.md): 처음 온 사람·둘러보기 중인 사람이 '하는' 버튼을 누를 때.
 * 게스트로 시작(닉네임) / 로그인 / 회원가입, 게스트는 '이어하기 코드로 불러오기'
 */
import { nickNotice, randomGuestName } from '../game/nickname';
import { useState } from 'react';
import { Icon } from './Icon';
import { useDialogFocus, useEscape } from './ui';
import { loadNick, saveNick } from '../session';
import { resumeGuestWithCode, startGuest } from '../net/account';
import { useNickCheck } from './LobbyNav';

export type WelcomeStep = 'intro' | 'nick' | 'code';
const nickValid = (n: string) => n.trim().length >= 1 && n.trim().length <= 10 && !nickNotice(n);

/** 게스트 코드 책임 고지 (코드 보기·받기·불러오기 화면 모두 같은 말) */
/** (052) 게스트 자동 삭제 안내 — 마지막 활동 날 뒤로 사흘 동안 활동이 없으면 그다음 날 0시(한국)에 삭제 */
export const GUEST_EXPIRY_NOTICE = '게스트 계정은 마지막으로 게임한 날 뒤로 사흘 동안 활동이 없으면, 그다음 날 0시에 모든 기록과 함께 자동으로 지워져요. 기록을 계속 남기려면 회원가입해 주세요.';
export const GUEST_CODE_NOTICE = '이 코드를 가진 사람은 누구나 이 게스트로 들어올 수 있어요. 코드 관리는 본인 책임이에요. 남에게 보여 주지 마세요.';

export function Welcome({
  onClose,
  onSignup,
  onLogin,
  onStart,
  initial = 'intro',
  visitor,
}: {
  onClose: () => void;
  onSignup: () => void;
  onLogin: () => void;
  onStart: () => void;
  initial?: WelcomeStep;
  /** 아직 세션이 없음 — 게스트로 시작하면 게스트 계정을 만듦 */
  visitor: boolean;
}) {
  const [step, setStep] = useState<WelcomeStep>(initial);
  const [inviteCode] = useState(() => {
    const c = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
    return /^[A-Z0-9]{6}$/.test(c) ? c : '';
  });
  // 처음 온 사람은 닉네임을 바로 떠올리기 어려움 → 무작위 이름을 채워 두고 고칠 수 있게
  const [nick, setNick] = useState(() => loadNick() || randomGuestName((n) => Math.floor(Math.random() * n)));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = useNickCheck(nick, step === 'nick');
  useEscape(onClose);
  const ready = nickValid(nick) && (check === 'ok' || check === 'checking');
  const go = async () => {
    if (!nickValid(nick) || check === 'taken' || check === 'invalid' || busy) return;
    saveNick(nick.trim());
    setBusy(true);
    setErr('');
    try {
      if (visitor) await startGuest();
      onStart();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await resumeGuestWithCode(code);
      onStart();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const boxRef = useDialogFocus<HTMLDivElement>();
  const label = step === 'intro' ? '개미리그 시작하기' : step === 'nick' ? '게스트 닉네임' : '이어하기 코드로 불러오기';
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={boxRef} tabIndex={-1} className="modal guest-start has-x" role="dialog" aria-modal aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn sm modal-x" aria-label="닫기" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
        {step === 'intro' ? (
          <>
            <h3>개미리그에 온 걸 환영해요</h3>
            {/* 친구가 보낸 초대 링크(?room=코드)로 왔으면: 왜 이 창이 떴는지 먼저 */}
            {inviteCode && <p className="gs-invite">친구가 보낸 방(코드 {inviteCode})에 들어가려면 먼저 시작해 주세요. 시작하면 그 방으로 들어가요.</p>}
            <p className="gs-pitch">같은 시장, 같은 뉴스로 겨루는 모의 주식 대결이에요. 진짜 돈은 쓰지 않아요.</p>
            {/* 먼저 해 보고, 가입은 나중에 — 처음 온 사람이 표부터 읽지 않게 */}
            <div className="gs-actions">
              <button className="btn primary full" onClick={() => setStep('nick')}>
                바로 시작하기
              </button>
              <button className="btn full" onClick={onSignup}>
                <Icon name="userPlus" size={16} /> 회원가입하고 시작
              </button>
              <button className="btn ghost full" onClick={onLogin}>
                이미 회원이에요 · 로그인
              </button>
            </div>
            <details className="gs-more">
              <summary>게스트와 회원은 뭐가 달라요?</summary>
              <p className="muted small">회원가입은 무료예요. 아이디·비밀번호·닉네임만 받고 이메일·전화번호는 받지 않아요.</p>
              <table className="gs-compare">
                <thead>
                  <tr>
                    <th />
                    <th>게스트</th>
                    <th className="gs-member">회원</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>일반전·커스텀</td>
                    <td className="y">가능</td>
                    <td className="y">가능</td>
                  </tr>
                  <tr>
                    <td>랭킹전·랭킹</td>
                    <td className="n">안 돼요</td>
                    <td className="y">가능</td>
                  </tr>
                  <tr>
                    <td>다른 기기에서</td>
                    <td className="n">이어하기 코드로</td>
                    <td className="y">아이디로 로그인하면 그대로</td>
                  </tr>
                  <tr>
                    <td>닉네임</td>
                    <td className="n">다른 게스트와 겹칠 수 있고, 회원이 같은 닉네임을 쓰면 바뀌어요</td>
                    <td className="y">나만 쓰는 닉네임 · 고를 수 있는 개미 사진</td>
                  </tr>
                  <tr>
                    <td>기록 보관</td>
                    <td className="n">사흘 동안 활동이 없으면 자동 삭제</td>
                    <td className="y">탈퇴할 때까지 보관</td>
                  </tr>
                </tbody>
              </table>
            </details>
            <small className="muted">'바로 시작하기'는 게스트로 해요. 나중에 가입해도 지금 기록이 그대로 이어져요. {GUEST_EXPIRY_NOTICE}</small>
          </>
        ) : step === 'nick' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void go();
            }}
          >
            <h3>닉네임을 정해 주세요</h3>
            <label className={'field' + (check === 'ok' ? ' good' : check === 'taken' || check === 'invalid' ? ' invalid' : '')}>
              <span>닉네임 (1~10자)</span>
              <input autoFocus value={nick} maxLength={10} placeholder="예: 개미왕" onFocus={(e) => e.currentTarget.select()} onChange={(e) => setNick(e.target.value)} />
              {check === 'taken' && <small className="error">회원이 쓰는 닉네임이에요. 다른 닉네임을 써 주세요.</small>}
              {check === 'invalid' && nick && <small className="error">{nickNotice(nick) ?? '1~10자, 글자·숫자로 정해 주세요.'}</small>}
              {check === 'ok' && <small className="good-msg">쓸 수 있어요</small>}
            </label>
            <small className="muted">아무거나 골라 뒀어요. 그대로 써도 되고, 나중에 '설정·더보기'에서 바꿀 수 있어요.</small>
            {err && (
              <p className="error" role="alert">
                {err}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('intro')}>
                뒤로
              </button>
              <button type="submit" className="btn primary" disabled={!ready || busy}>
                {busy ? '시작하는 중…' : '시작하기'}
              </button>
            </div>
            {visitor && (
              <button type="button" className="linkish-soft gs-alt" onClick={() => (setErr(''), setStep('code'))}>
                이미 게스트로 해 본 적 있나요? 이어하기 코드로 불러오기
              </button>
            )}
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <h3>
              이어하기 코드로 불러오기
            </h3>
            <p className="muted small">다른 기기·브라우저에서 하던 게스트를 불러와요. 코드는 그 기기의 '설정·더보기 → 내 계정'에서 볼 수 있어요.</p>
            <label className="field">
              <span>이어하기 코드 (12자리)</span>
              <input
                autoFocus
                className="code-input"
                value={code}
                maxLength={14}
                placeholder="XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => (setCode(e.target.value.toUpperCase()), setErr(''))}
              />
            </label>
            <small className="muted">불러오면 그 게스트가 원래 쓰던 기기는 로그아웃돼요. {GUEST_CODE_NOTICE}</small>
            {err && (
              <p className="error" role="alert">
                {err}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => (setErr(''), setStep(visitor ? 'nick' : 'intro'))}>
                뒤로
              </button>
              <button type="submit" className="btn primary" disabled={code.replace(/[^A-Za-z0-9]/g, '').length !== 12 || busy}>
                {busy ? '불러오는 중…' : '불러오기'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
