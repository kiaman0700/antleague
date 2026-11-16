/**
 * 게임 안 확인 창: 브라우저 기본 confirm 대신 (카카오톡 등 앱 안 브라우저는 confirm 을 막아서 버튼이 안 먹는 것처럼 보임)
 * 사용: if (!(await ask('정말 나갈까요?', { ok: '나가기', danger: true }))) return;
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

interface Req {
  text: string;
  ok: string;
  danger: boolean;
  done: (v: boolean) => void;
}
let cur: Req | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function ask(text: string, opt: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  // 이미 떠 있는 확인 창은 '아니요'로 닫고 새로
  cur?.done(false);
  return new Promise((resolve) => {
    const req: Req = {
      text,
      ok: opt.ok ?? '확인',
      danger: !!opt.danger,
      done: (v) => {
        if (cur === req) {
          cur = null;
          emit();
        }
        resolve(v);
      },
    };
    cur = req;
    emit();
  });
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => cur,
  );
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    // 닫은 뒤 초점을 처음 누른 버튼으로 돌려줌 (키보드·화면 읽기 프로그램)
    const prev = document.activeElement as HTMLElement | null;
    // 되돌릴 수 없는 일(기권·삭제)은 실수로 Enter 를 눌러도 취소가 되게
    (req.danger ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        req.done(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (prev && prev !== document.body && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, [req]);
  if (!req) return null;
  return (
    <div className="modal-bg confirm-bg" onClick={() => req.done(false)}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal aria-label={req.text} onClick={(e) => e.stopPropagation()}>
        <p className="confirm-text">{req.text}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} className="btn" onClick={() => req.done(false)}>
            취소
          </button>
          <button ref={okRef} className={'btn ' + (req.danger ? 'danger' : 'primary')} onClick={() => req.done(true)}>
            {req.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
