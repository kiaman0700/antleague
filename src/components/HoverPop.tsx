/**
 * 위 메뉴바 버튼 + 팝업 (미션·내 프로필 공용, 2026-11-17)
 * - 마우스를 올리면 열리고, 벗어나면 0.15초 뒤 닫힘 — 버튼과 팝업 사이 틈을 지나 팝업으로 옮겨 갈 수 있게 (사용자 요청 2026-11-17).
 *   옆 팝업과 겹치지 않는 건 '하나가 열리면 다른 건 바로 닫힘'이 맡음
 * - 한 번에 하나만: 하나가 열리면 다른 팝업은 바로 닫힘
 * - 누르면 고정해서 열림 (휴대폰·키보드), 다시 누르거나 바깥을 누르거나 Esc 로 닫힘
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const OPEN_EVENT = 'stockduel:hpop';

export function HoverPop({
  className,
  button,
  label,
  onOpen,
  children,
  popClass,
  btnClass,
  openDelay = 0,
  onButtonClick,
  btnTitle,
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
  /** 마우스를 올리고 이만큼 머물러야 열림 (옆 메뉴로 지나가다 뜨지 않게) */
  openDelay?: number;
  /** 있으면 버튼을 누를 때 팝업 대신 이것 (예: 플레이 = 바로 찾기) */
  onButtonClick?: () => void;
  btnTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const me = useId();
  const shut = useRef<number | undefined>(undefined);
  const wait = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(shut.current);
    window.clearTimeout(wait.current);
    if (!open) onOpen?.();
    setOpen(true);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: me }));
  };
  const close = () => {
    pinned.current = false;
    setOpen(false);
  };
  const hide = () => {
    window.clearTimeout(shut.current);
    window.clearTimeout(wait.current);
    pinned.current = false;
    setOpen(false);
  };
  const hideSoon = () => {
    if (pinned.current) return;
    window.clearTimeout(shut.current);
    shut.current = window.setTimeout(hide, 150);
  };
  useEffect(() => () => (window.clearTimeout(shut.current), window.clearTimeout(wait.current)), []);
  const enter = () => {
    window.clearTimeout(shut.current);
    if (open || !openDelay) return show();
    window.clearTimeout(wait.current);
    wait.current = window.setTimeout(show, openDelay);
  };
  // 다른 팝업이 열리면 이건 닫힘
  useEffect(() => {
    const other = (e: Event) => (e as CustomEvent<string>).detail !== me && hide();
    window.addEventListener(OPEN_EVENT, other);
    return () => window.removeEventListener(OPEN_EVENT, other);
  }, [me]);
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
  return (
    <span
      className={'hpop' + (open ? ' open' : '') + (className ? ' ' + className : '')}
      ref={wrap}
      onPointerEnter={(e) => e.pointerType === 'mouse' && enter()}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        window.clearTimeout(wait.current);
        hideSoon();
      }}
    >
      <button
        className={'hpop-btn' + (btnClass ? ' ' + btnClass : '')}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={btnTitle}
        onClick={() => {
          if (onButtonClick) {
            hide();
            return onButtonClick();
          }
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
