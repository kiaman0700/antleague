/**
 * 손님 닉네임이 바뀌었을 때 한 번 띄우는 안내 (design/v26-batch.md C).
 * 회원이 같은 닉네임을 등록하면 회원 것이 우선이라 손님 이름을 겹치지 않는 이름으로 바꿈 — 탓하는 말 없이 사실만.
 */
import { useEffect, useState } from 'react';
import { DialogBox } from './ui';

/** '…로/으로': 끝 글자가 받침(ㄹ 제외) 있는 한글이거나 숫자 0·3·6(영·삼·육)이면 '으로' */
function ro(name: string) {
  const c = name[name.length - 1] ?? '';
  if (/[036]/.test(c)) return name + '으로';
  if (/\d/.test(c)) return name + '로';
  const code = c.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return name + '(으)로';
  const jong = code % 28;
  return name + (jong === 0 || jong === 8 ? '로' : '으로');
}

export function RenameNotice() {
  const [r, setR] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setR((e as CustomEvent<{ from: string; to: string }>).detail);
    window.addEventListener('guest-renamed', on);
    return () => window.removeEventListener('guest-renamed', on);
  }, []);
  if (!r) return null;
  return (
    <div className="modal-bg confirm-bg">
      <DialogBox className="modal confirm-modal cc-modal" aria-labelledby="rn-title">
        <h3 id="rn-title">게스트 닉네임이 바뀌었어요</h3>
        <p className="confirm-text">
          회원이 '{r.from}' 닉네임을 등록해서, 게스트 닉네임을 '{r.to}'{ro(r.to).slice(r.to.length)} 바꿨어요. 게스트 닉네임은 회원 닉네임과 같을 수 없어요. 설정 · 내 계정에서 다른 닉네임으로 바꿀 수 있어요.
        </p>
        <div className="confirm-actions">
          <button className="btn primary" onClick={() => setR(null)}>
            확인
          </button>
        </div>
      </DialogBox>
    </div>
  );
}
