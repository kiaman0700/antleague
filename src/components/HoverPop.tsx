/**
 * 위 메뉴바 버튼 + 팝업 (미션·내 프로필 공용, 2026-11-17)
 * - 마우스를 올리면 열리고 내리면 닫힘 (PC)
 * - 누르면 고정해서 열림 (휴대폰·키보드), 다시 누르거나 바깥을 누르거나 Esc 로 닫힘
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function HoverPop({
  className,
  button,
  label,
  onOpen,
  children,
  popClass,
  btnClass,
}: {
  className?: string;
  /** 버튼 안 내용 */
  button: ReactNode;
  /** 버튼·팝업 이름 (화면 읽기용) */
  label: string;
  /** 열 때마다 (새로 받아 오기 등) */
  onOpen?: () => void;
  children: ReactNode;
  popClass?: string;
  btnClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const shut = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(shut.current);
    if (!open) onOpen?.();
    setOpen(true);
  };
  const close = () => {
    pinned.current = false;
    setOpen(false);
  };
  const hideSoon = () => {
    if (pinned.current) return;
    window.clearTimeout(shut.current);
    shut.current = window.setTimeout(() => setOpen(false), 220);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(shut.current), []);
  return (
    <span
      className={'hpop' + (open ? ' open' : '') + (className ? ' ' + className : '')}
      ref={wrap}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hideSoon()}
    >
      <button
        className={'hpop-btn' + (btnClass ? ' ' + btnClass : '')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => {
          if (open && pinned.current) close();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        {button}
      </button>
      {open && (
        <div className={'hpop-pop' + (popClass ? ' ' + popClass : '')} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </span>
  );
}
