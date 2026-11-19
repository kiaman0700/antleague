/**
 * (060) 동시 접속 창 — FC온라인 방식.
 * 다른 기기가 접속 중이면 '여기서 접속할까요?' → [여기서 접속] 이면 그 기기는 동시 접속으로 로그아웃.
 * [취소] 면 이 기기는 로그아웃하고 다시 로그인하는 곳으로 (계정은 다른 기기에서 계속 쓰는 중이라 잃는 것 없음).
 * 쫓겨난 기기는 '확인'을 누를 때까지 안내를 보여 주고, 확인하면 다시 로그인하는 곳으로.
 */
import { useState } from 'react';
import { api } from '../net/api';
import { useAccount } from '../net/account';
import { goSignIn, setConcurrent, useConcurrent, wasGuest } from '../net/concurrent';
import { supabase } from '../lib/supabase';
import { DialogBox } from './ui';

export function ConcurrentHost() {
  const mode = useConcurrent();
  const acc = useAccount();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!mode) return null;
  const take = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('takeOver');
      setConcurrent(null);
      // 막혀 있던 화면 정보를 모두 다시 받음
      location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '접속하지 못했어요. 다시 해 주세요.');
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    // 묻는 동안엔 서버 요청이 막혀 계정 상태(회원/손님)를 아직 모를 수 있음 → 로그인 정보로 직접 확인
    const sess = (await supabase?.auth.getSession().catch(() => null))?.data.session;
    const guest = sess ? !!sess.user?.is_anonymous : acc.status === 'guest';
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});
    setBusy(false);
    setConcurrent(null);
    goSignIn(guest);
  };
  const confirmKicked = () => {
    setConcurrent(null);
    goSignIn(wasGuest());
  };
  return (
    <div className="modal-bg confirm-bg cc-bg">
      <DialogBox className="modal confirm-modal cc-modal" aria-labelledby="cc-title">
        {mode === 'kicked' ? (
          <>
            <h3 id="cc-title">동시 접속으로 로그아웃됐어요</h3>
            <p className="confirm-text">다른 기기에서 이 계정으로 접속해서 이 기기는 로그아웃됐어요. 본인이 아니라면 다시 로그인한 뒤 비밀번호를 바꿔 주세요.</p>
            <div className="confirm-actions">
              <button className="btn primary" onClick={confirmKicked}>
                확인
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="cc-title">다른 기기에서 접속 중이에요</h3>
            <p className="confirm-text">여기서 접속하면 그 기기는 동시 접속으로 로그아웃돼요. 여기서 접속할까요?</p>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="confirm-actions">
              <button className="btn" disabled={busy} onClick={cancel}>
                취소
              </button>
              <button className="btn primary" disabled={busy} onClick={take}>
                {busy ? '접속하는 중…' : '여기서 접속'}
              </button>
            </div>
          </>
        )}
      </DialogBox>
    </div>
  );
}
