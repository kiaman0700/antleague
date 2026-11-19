/**
 * (060) 동시 접속 창 — FC온라인 방식 (사용자 결정 2026-11-19).
 * 다른 기기가 접속 중이면 '여기서 접속할까요?' → [여기서 접속] 이면 그 기기는 동시 접속으로 로그아웃.
 * [취소] 는 이 기기를 로그아웃하지 않고 '접속하지 않음' 화면으로 (손님이 코드 없이 기록을 잃지 않게).
 * 쫓겨난 기기는 '확인'을 누를 때까지 안내를 보여 줌.
 */
import { useState } from 'react';
import { api } from '../net/api';
import { setConcurrent, useConcurrent } from '../net/concurrent';
import { DialogBox } from './ui';

export function ConcurrentHost() {
  const mode = useConcurrent();
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
      setErr(e instanceof Error ? e.message : '접속하지 못했어요. 다시 시도해 주세요.');
      setBusy(false);
    }
  };
  return (
    <div className="modal-bg confirm-bg cc-bg">
      <DialogBox className="modal confirm-modal cc-modal" aria-labelledby="cc-title">
        {mode === 'kicked' ? (
          <>
            <h3 id="cc-title">동시 접속으로 로그아웃됐어요</h3>
            <p className="confirm-text">다른 기기에서 이 계정으로 접속해서 이 기기는 로그아웃됐어요. 본인이 아니라면 다시 로그인한 뒤 비밀번호를 바꿔 주세요.</p>
            <div className="confirm-actions">
              <button className="btn primary" onClick={() => setConcurrent(null)}>
                확인
              </button>
            </div>
          </>
        ) : mode === 'declined' ? (
          <>
            <h3 id="cc-title">이 기기는 접속하지 않았어요</h3>
            <p className="confirm-text">다른 기기에서 접속 중이에요. 그 기기에서 그만하면(창을 닫거나 1분 반쯤 쓰지 않으면) 여기서 바로 이어서 할 수 있어요.</p>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="confirm-actions">
              <button className="btn primary" disabled={busy} onClick={take}>
                {busy ? '접속하는 중…' : '여기서 접속'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="cc-title">다른 기기에서 접속 중이에요</h3>
            <p className="confirm-text">여기서 접속하면 그 기기는 동시 접속으로 로그아웃돼요. 여기서 접속할까요?</p>
            {err && <p className="error" role="alert">{err}</p>}
            <div className="confirm-actions">
              <button className="btn" disabled={busy} onClick={() => setConcurrent('declined')}>
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
