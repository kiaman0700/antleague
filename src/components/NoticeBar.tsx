/**
 * 공지 띠 + 새 공지 팝업 (사용자 요청 2026-11-19, 사례 조사로 정한 방식):
 *  - 위 메뉴 줄(미션 버튼 옆)에 공지 제목 띠: 고정 공지 + 최근 14일 공지가 5초마다 위로 넘어가며 바뀜, 누르면 그 공지 창
 *  - 새 공지(이 기기에서 아직 안 본 것)가 있으면 로비에 들어왔을 때 한 번 창으로 — 창 안에서 다른 공지도 넘겨 봄, '확인'이면 다시 안 뜸
 *  - 공지 글은 일반 글자로만 그림. [글자](/install) 처럼 우리 사이트 화면 주소만 링크가 됨 (바깥 주소·스크립트는 글자 그대로)
 */
import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { api } from '../net/api';
import { lobbyPageOf } from '../router';
import type { LobbyPage } from '../screens/Lobby';
import { Icon } from './Icon';
import { useDialogFocus, useEscape } from './ui';

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const SEEN_KEY = 'stockduel.noticeSeen';
const POPPED_KEY = 'stockduel.noticePopped';
const DAY = 86_400_000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

/* ---------- 공지 목록 (모든 부품이 함께 씀, 5분 기억) ---------- */
let cache: { at: number; list: NoticeItem[] } | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function load(force = false) {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return;
  if (loading) return;
  loading = api<NoticeItem[]>('notices')
    .then((list) => {
      cache = { at: Date.now(), list: Array.isArray(list) ? list : [] };
      emit();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
}
function useNoticeList(): NoticeItem[] {
  const list = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => cache?.list ?? EMPTY,
  );
  useEffect(() => load(), []);
  return list;
}
const EMPTY: NoticeItem[] = [];

/* ---------- 공지 창 열기 (띠·다른 곳에서) ---------- */
let openId: string | null = null;
const openSubs = new Set<() => void>();
export function openNotice(id: string | null) {
  openId = id;
  openSubs.forEach((f) => f());
}
function useOpenNotice() {
  return useSyncExternalStore(
    (f) => {
      openSubs.add(f);
      return () => void openSubs.delete(f);
    },
    () => openId,
  );
}

const seenAt = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
};
function markAllSeen(list: NoticeItem[]) {
  const latest = Math.max(0, ...list.map((n) => new Date(n.created_at).getTime()));
  try {
    if (latest > seenAt()) localStorage.setItem(SEEN_KEY, String(latest));
    localStorage.setItem(POPPED_KEY, String(latest));
  } catch {
    /* 무시 */
  }
}

/** 띠에 보일 공지: 고정 + 최근 14일 (최대 5개) */
/** 이미 홈 화면 앱으로 열려 있으면 설치 안내 공지(글 속 /install 링크)는 띠·창에서 뺌 (공지 목록엔 그대로) */
let standalone: boolean | null = null;
function isStandalone() {
  if (standalone === null) {
    try {
      standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    } catch {
      standalone = false;
    }
  }
  return standalone;
}
const relevant = (n: NoticeItem) => !(isStandalone() && /\]\(\/install\)/.test(n.body));

function tickerList(list: NoticeItem[]) {
  list = list.filter(relevant);
  const now = Date.now();
  return list.filter((n) => n.pinned || now - new Date(n.created_at).getTime() < 14 * DAY).slice(0, 5);
}

/* ---------- 글 (링크는 사이트 안 화면만) ---------- */
const LINK = /\[([^\]\n]{1,40})\]\((\/[a-z-]{0,20})\)/g;
export function NoticeText({ text, onGo }: { text: string; onGo: (p: LobbyPage) => void }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const page = lobbyPageOf(m[2]);
    if (!page) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      <button key={m.index} type="button" className="notice-link" onClick={() => onGo(page)}>
        {m[1]}
        <Icon name="right" size={12} />
      </button>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <p className="notice-text">
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </p>
  );
}

/* ---------- 위 메뉴 줄 띠 ---------- */
export function NoticeTicker({ compact = false }: { compact?: boolean }) {
  const list = tickerList(useNoticeList());
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (list.length < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % list.length), 5000);
    return () => clearInterval(t);
  }, [list.length, paused]);
  if (!list.length) return null;
  const n = list[i % list.length];
  const unread = new Date(n.created_at).getTime() > seenAt();
  return (
    <button
      type="button"
      className={'nt-bar' + (compact ? ' compact' : '')}
      onClick={() => openNotice(n.id)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-label={`공지: ${n.title}${list.length > 1 ? ` (${(i % list.length) + 1}/${list.length})` : ''}`}
    >
      <Icon name="megaphone" size={15} />
      {unread && <i className="nt-dot" aria-hidden />}
      <span className="nt-win" aria-hidden>
        <span key={n.id} className="nt-title">
          {n.title}
        </span>
      </span>
      {!compact && list.length > 1 && (
        <small className="nt-count" aria-hidden>
          {(i % list.length) + 1}/{list.length}
        </small>
      )}
    </button>
  );
}

/* ---------- 공지 창 ---------- */
function NoticeModal({ list, startId, onClose, onGo }: { list: NoticeItem[]; startId: string; onClose: () => void; onGo: (p: LobbyPage) => void }) {
  const box = useDialogFocus<HTMLDivElement>();
  useEscape(onClose, true, true);
  const [id, setId] = useState(startId);
  const idx = Math.max(0, list.findIndex((n) => n.id === id));
  const n = list[idx];
  if (!n) return null;
  return (
    <div className="modal-bg nt-modal-bg" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="modal has-x nt-modal" role="dialog" aria-modal aria-labelledby="nt-title" onClick={(e) => e.stopPropagation()}>
        <div className="nt-head">
          <span className="nt-kicker">
            <Icon name="megaphone" size={14} /> 공지 {list.length > 1 ? `${idx + 1}/${list.length}` : ''}
          </span>
          <button type="button" className="icon-btn sm modal-x" aria-label="닫기" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <article key={n.id} className="nt-article">
          <h3 id="nt-title">
            {n.pinned && <span className="notice-pin">고정</span>} {n.title}
          </h3>
          <small className="muted">{fmt(n.created_at)}</small>
          <NoticeText text={n.body} onGo={(p) => (onClose(), onGo(p))} />
        </article>
        {list.length > 1 && (
          <div className="nt-nav">
            <button type="button" className="btn sm ghost" disabled={idx === 0} onClick={() => setId(list[idx - 1].id)}>
              <Icon name="left" size={14} /> 이전
            </button>
            <span className="nt-dots" aria-hidden>
              {list.map((x) => (
                <i key={x.id} className={x.id === n.id ? 'on' : ''} />
              ))}
            </span>
            <button type="button" className="btn sm ghost" disabled={idx === list.length - 1} onClick={() => setId(list[idx + 1].id)}>
              다음 <Icon name="right" size={14} />
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => (onClose(), onGo('notices'))}>
            공지 모두 보기
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/** 로비에 하나: 띠에서 연 공지 창 + 새 공지가 있으면 한 번 자동으로 */
export function NoticeCenter({ onGo, quiet }: { onGo: (p: LobbyPage) => void; /** 로그인·환영 창 등 다른 일을 하는 중이면 자동으로 띄우지 않음 */ quiet?: boolean }) {
  const list = useNoticeList();
  const opened = useOpenNotice();
  const [auto, setAuto] = useState<string | null>(null);
  useEffect(() => {
    if (quiet || auto || opened || !list.length) return;
    let popped = 0;
    try {
      // 처음 온 날(환영 창을 처음 본 창)이나 튜토리얼을 하는 중이면 자동으로 띄우지 않음 — 다음에 들어올 때
      if (sessionStorage.getItem('stockduel.onboarding') || sessionStorage.getItem('stockduel.tourQ')) return;
      popped = Number(localStorage.getItem(POPPED_KEY)) || 0;
    } catch {
      return;
    }
    const fresh = list.filter(relevant).filter((n) => new Date(n.created_at).getTime() > Math.max(popped, seenAt()) && Date.now() - new Date(n.created_at).getTime() < 30 * DAY);
    if (!fresh.length) return;
    // 다른 창이 떠 있으면 그게 닫힌 뒤에 (2초마다 다시 봄)
    const t = setInterval(() => {
      if (document.querySelector('.modal-bg, .sheet-bg, .welcome-bg')) return;
      clearInterval(t);
      setAuto(fresh.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0].id);
    }, 2000);
    return () => clearInterval(t);
  }, [list, quiet, auto, opened]);
  const show = opened ?? auto;
  if (!show || !list.length) return null;
  // 창 안에서 넘겨 볼 순서: 고정 → 최신
  const ordered = list.filter(relevant).sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at));
  const close = () => {
    markAllSeen(list);
    setAuto(null);
    openNotice(null);
  };
  return <NoticeModal list={ordered} startId={show} onClose={close} onGo={onGo} />;
}

/** 공지가 새로 쓰였을 때(운영자) 띠·창이 바로 알게 */
export function refreshNotices() {
  load(true);
}
