/**
 * 공통 화면 부품 — 여러 화면에서 같은 모양·같은 말투로 쓰기 위해 한곳에 모음.
 *   Loading      불러오는 중 (작은 글 + 회전 표시)
 *   EmptyState   비어 있을 때 안내 (아이콘·제목·설명·버튼)
 *   ErrorState   불러오기 실패 + '다시 시도'
 *   IconList     아이콘이 붙은 안내 목록 (순서가 있으면 steps 로 세로 선 연결)
 *   SectionTitle 칸 제목 (아이콘 + 글 + 오른쪽 덧붙임)
 *   Toast        화면 아래 짧은 확인 안내 (몇 초 뒤 사라지는 건 쓰는 쪽에서)
 * 모양은 styles-kit.css
 */
import { useEffect, useRef, useState, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/** 불러오는 중 — inline 이면 줄 안에 작게, 아니면 칸 가운데 */
export function Loading({ label = '불러오는 중…', inline = false }: { label?: string; inline?: boolean }) {
  return (
    <div className={'ui-loading' + (inline ? ' inline' : '')} role="status" aria-live="polite">
      <span className="ui-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** 비어 있을 때: 무엇이 없는지 + 어떻게 채우는지 + (있으면) 바로 할 수 있는 버튼 */
export function EmptyState({
  icon,
  title,
  desc,
  action,
  compact = false,
  tone,
}: {
  icon: IconName;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  tone?: 'error';
}) {
  return (
    <div className={'ui-empty' + (compact ? ' compact' : '') + (tone ? ' ' + tone : '')}>
      <i aria-hidden>
        <Icon name={icon} size={compact ? 24 : 30} />
      </i>
      <b>{title}</b>
      {desc && <small>{desc}</small>}
      {action && <div className="ui-empty-act">{action}</div>}
    </div>
  );
}

/** 불러오기 실패: 같은 말투 + '다시 시도' 버튼 */
export function ErrorState({ what, onRetry, compact = false }: { what: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <EmptyState
      icon="warn"
      tone="error"
      compact={compact}
      title={`${what}${hasBatchim(what.slice(-1)) ? '을' : '를'} 불러오지 못했어요`}
      desc="인터넷 연결을 확인하고 다시 시도해 주세요."
      action={
        onRetry && (
          <button className="btn sm" onClick={onRetry}>
            <Icon name="refresh" size={14} /> 다시 시도
          </button>
        )
      }
    />
  );
}

/** 마지막 글자에 받침이 있는지 (을/를 고르기) */
function hasBatchim(ch: string) {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

export interface IconListItem {
  icon: IconName;
  title?: ReactNode;
  body: ReactNode;
}
/** 아이콘 안내 목록. steps 면 순서대로 세로 선으로 이어 줌 (진행 순서처럼 정말 순서가 있을 때만) */
export function IconList({ items, steps = false }: { items: IconListItem[]; steps?: boolean }) {
  return (
    <ol className={'ui-iconlist' + (steps ? ' steps' : '')}>
      {items.map((it, i) => (
        <li key={i}>
          <i aria-hidden>
            <Icon name={it.icon} size={17} />
          </i>
          <span>
            {it.title && <b>{it.title}</b>}
            <span className="ui-il-body">{it.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 칸 제목: 아이콘 + 제목 (+ 오른쪽에 개수·링크 등) */
export function SectionTitle({ icon, children, right }: { icon?: IconName; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="ui-title">
      <h3>
        {icon && <Icon name={icon} size={18} />}
        {children}
      </h3>
      {right && <div className="ui-title-right">{right}</div>}
    </div>
  );
}

/** 화면 아래 짧은 확인 안내 (예: '기권했어요') — 화면 읽기 프로그램도 읽어 줌 */
export function Toast({ text, tone }: { text: string; tone?: 'error' }) {
  return (
    <div className={'ui-toast' + (tone ? ' ' + tone : '')} role="status" aria-live="polite">
      <Icon name={tone === 'error' ? 'warn' : 'check'} size={16} />
      <span>{text}</span>
    </div>
  );
}

/** 카드를 나란히 놓을 칸 수: 마지막 줄에 하나만 남지 않게 (1~3 → 그대로, 4 → 2, 5 이상 → 3) */
export const balancedCols = (n: number) => (n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3);

/**
 * 열린 창(모달·바텀시트·서랍·팝업) 쌓임 순서. Esc 는 맨 위(가장 나중에 열린) 창 하나만 닫음
 * (예전엔 창마다 따로 Esc 를 들어서, 서랍 위에 카드 창이 떠 있으면 Esc 한 번에 둘 다 닫혔음)
 */
type Layer = { close: { current: () => void }; id?: number; popped?: boolean };
const escStack: Layer[] = [];
let escBound = false;
let layerSeq = 0;
/** 창을 닫으며 우리가 history.back() 한 횟수 — 그 popstate 는 화면 이동으로 치지 않고 삼킴 */
let swallowPops = 0;
/** 되돌리기(history.back)가 끝나기 전에 열린 창 — 되돌리기가 끝난 뒤 기록을 넣음 (한 번 누름으로 닫고 바로 다른 창을 여는 경우) */
const pendingPush: Layer[] = [];
let swallowSafety: number | undefined;
function pushLayer(entry: Layer) {
  if (!escStack.includes(entry) || entry.popped) return;
  if (swallowPops > 0) {
    if (!pendingPush.includes(entry)) pendingPush.push(entry);
    return;
  }
  try {
    entry.id = ++layerSeq;
    history.pushState({ ...((history.state as object | null) ?? {}), __layer: entry.id }, '', location.href);
  } catch {
    entry.id = undefined;
  }
}
function flushPending() {
  for (const e of pendingPush.splice(0)) pushLayer(e);
}
function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const top = escStack[escStack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.close.current();
}
/**
 * 뒤로 가기(휴대폰 뒤로 버튼·스와이프 포함): 맨 위 창이 '뒤로 가기로 닫힘' 창이면 화면은 그대로 두고 그 창만 닫음.
 * 다른 popstate 처리(주소 = 화면, 휴대폰 탭)보다 먼저 받으려고 capture 로 등록하고 나머지는 멈춤
 */
function onPop(e: PopStateEvent) {
  if (swallowPops > 0) {
    swallowPops--;
    e.stopImmediatePropagation();
    if (swallowPops === 0) {
      window.clearTimeout(swallowSafety);
      flushPending();
    }
    return;
  }
  const top = escStack[escStack.length - 1];
  // 맨 위 창의 기록 '아래'로 내려온 경우만 (앞으로 가기 등으로 같은/더 위 기록에 온 건 손대지 않음)
  const at = (e.state as { __layer?: number } | null)?.__layer ?? 0;
  if (top?.id && !top.popped && at < top.id) {
    top.popped = true;
    e.stopImmediatePropagation();
    top.close.current();
  }
}

/** 지금 기록이 창 기록이면 화면 이동은 새 기록 대신 그 자리를 바꿈 (창 안에서 다른 화면·탭으로 옮길 때 남는 기록·주소 어긋남 방지) */
export function onLayerEntry() {
  return typeof history !== 'undefined' && (history.state as { __layer?: number } | null)?.__layer != null;
}

/**
 * 창(모달)을 Esc 키로 닫기 — 열려 있는 동안만, 겹쳐 있으면 맨 위 창만.
 * back: 뒤로 가기로도 닫힘 (열 때 같은 주소로 기록을 하나 넣고, 다른 방법으로 닫히면 그 기록을 되돌림).
 * 돌려주는 rearm(): 뒤로 가기로 닫으려 했지만 창이 '그대로 두기'를 고르면(쓰던 글 확인 등) 기록을 다시 넣음
 */
export function useEscape(onClose: () => void, on = true, back = false): () => void {
  const ref = useRef(onClose);
  ref.current = onClose;
  const entryRef = useRef<Layer | null>(null);
  useEffect(() => {
    if (!on) return;
    if (!escBound && typeof window !== 'undefined') {
      window.addEventListener('keydown', onEscKey);
      window.addEventListener('popstate', onPop, true);
      escBound = true;
    }
    const entry: Layer = { close: ref };
    entryRef.current = back ? entry : null;
    // 기록은 한 박자 뒤에 넣음 — 바로 열렸다 닫히는 경우(개발 모드의 두 번 실행 등)엔 아예 넣지 않게
    let timer: number | undefined;
    if (back && typeof history !== 'undefined') {
      timer = window.setTimeout(() => {
        timer = undefined;
        pushLayer(entry);
      }, 0);
    }
    escStack.push(entry);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      const pi = pendingPush.indexOf(entry);
      if (pi >= 0) pendingPush.splice(pi, 1);
      const i = escStack.lastIndexOf(entry);
      if (i >= 0) escStack.splice(i, 1);
      if (entryRef.current === entry) entryRef.current = null;
      // X·Esc·바깥 누르기로 닫혔으면 넣어 둔 기록을 되돌림 — 단, 그사이 다른 화면으로 옮겨 갔으면(기록이 바뀜) 건드리지 않음
      if (entry.id && !entry.popped && (history.state as { __layer?: number } | null)?.__layer === entry.id) {
        swallowPops++;
        history.back();
        // 되돌리기 popstate 가 끝내 안 오면(기록 맨 앞 등) 멈춰 있지 않게
        window.clearTimeout(swallowSafety);
        swallowSafety = window.setTimeout(() => {
          if (swallowPops > 0) {
            swallowPops = 0;
            flushPending();
          }
        }, 1500);
      }
    };
  }, [on, back]);
  return () => {
    const e = entryRef.current;
    if (!e || !e.popped) return;
    e.popped = false;
    e.id = undefined;
    pushLayer(e);
  };
}

/** 지금 Esc 로 닫힐 창이 있는지 (창이 없을 때만 하는 Esc 동작 — 예: 화면 편집 끝내기 — 이 겹치지 않게) */
export const hasOpenLayer = () => escStack.length > 0;

/**
 * 창(모달)이 열리면 키보드 초점을 창 안으로, 닫히면 원래 누른 버튼으로 돌려줌
 * (키보드·화면 읽기 프로그램 사용자가 창이 열린 걸 알고, 닫은 뒤 제자리로 돌아오게)
 * 창 안에 autoFocus 칸이 있으면 그대로 둠
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // 창을 그리는 순간(안의 autoFocus 가 초점을 가져가기 전)의 초점 자리 = 닫은 뒤 돌아갈 곳
  const [prev] = useState(() => (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null));
  useEffect(() => {
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      if (prev && prev !== document.body && prev.isConnected && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
    };
  }, [prev]);
  return ref;
}

/** 창 상자: 열리면 초점이 이 상자로 오고 닫히면 돌아감 (useDialogFocus 를 쓰기 어려운 조건부 창용) */
export function DialogBox(props: HTMLAttributes<HTMLDivElement>) {
  const ref = useDialogFocus<HTMLDivElement>();
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal {...props} />;
}

/** 비밀번호 칸 + 오른쪽 '보기' 버튼 (휴대폰에서 잘못 친 걸 확인할 수 있게). 나머지 속성은 input 에 그대로 */
export function PwInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={show ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="pw-eye"
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        aria-pressed={show}
        onClick={(e) => {
          e.preventDefault();
          setShow((v) => !v);
        }}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}

/** 인터넷 연결 상태 (브라우저 online/offline 신호) */
export function useNetOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/** 로비·대기실: 인터넷이 끊기면 위에 띠 (게임 화면의 끊김 띠와 같은 모양) — 예전엔 아무 표시 없이 버튼이 실패했음 */
export function OfflineBanner() {
  const on = useNetOnline();
  if (on || typeof document === 'undefined') return null;
  // body 에 바로 그림 — 로비 틀의 '자식은 모두 relative' 규칙에 걸려 화면 아래로 밀려났었음
  return createPortal(
    <div className="net-banner" role="alert">
      <Icon name="warn" size={14} /> 인터넷이 끊겼어요. 연결되면 다시 쓸 수 있어요
    </div>,
    document.body,
  );
}
