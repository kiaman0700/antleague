/**
 * 공지 띠 + 새 공지 팝업:
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

const READ_KEY = 'stockduel.noticeRead';
function readIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
function markRead(id: string) {
  try {
    const ids = [id, ...[...readIds()].filter((x) => x !== id)].slice(0, 60);
    localStorage.setItem(READ_KEY, JSON.stringify(ids));
  } catch {
    /* 무시 */
  }
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
function tickerList(list: NoticeItem[]) {
  const now = Date.now();
  return list.filter((n) => n.pinned || now - new Date(n.created_at).getTime() < 14 * DAY).slice(0, 5);
}

/* ---------- 글 (링크는 사이트 안 화면만) ---------- */
const LINK = /\[([^\]\n]{1,40})\]\((\/[a-z-]{0,20})\)/g;
export function NoticeText({ text, onGo }: { text: string; onGo: (p: LobbyPage) => void }) {
  // 한 줄 안의 [글자](/주소) 링크 (우리 화면 주소일 때만)
  const inline = (line: string, base: number) => {
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of line.matchAll(LINK)) {
      const page = lobbyPageOf(m[2]);
      if (!page) continue;
      parts.push(line.slice(last, m.index));
      parts.push(
        <button key={base + (m.index ?? 0)} type="button" className="notice-link" onClick={() => onGo(page)}>
          {m[1]}
          <Icon name="right" size={12} />
        </button>,
      );
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(line.slice(last));
    return parts.map((x, i) => <Fragment key={i}>{x}</Fragment>);
  };
  // 줄마다: 빈 줄은 문단 사이, '·'·'-'·'•' 로 시작하는 줄은 목록 (길어서 넘어간 둘째 줄이 점 뒤 글자와 같은 자리에서 시작하게)
  return (
    <div className="notice-text">
      {text.split(/\r?\n/).map((line, i) => {
        if (!line.trim()) return <span key={i} className="nt-gap" aria-hidden />;
        const li = /^\s*[·•-]\s+/.exec(line);
        return li ? (
          <span key={i} className="nt-li">
            <span className="nt-bul" aria-hidden>·</span>
            <span>{inline(line.slice(li[0].length), i * 1000)}</span>
          </span>
        ) : (
          <span key={i} className="nt-line">{inline(line, i * 1000)}</span>
        );
      })}
    </div>
  );
}

/* ---------- 위 메뉴 줄 아래 공지 줄 ----------
 * 움직이지 않는 한 줄 (계속 넘어가는 띠는 멈춤 버튼이 필요(WCAG 2.2.2)하고 위 시세 띠와 겹쳐 정신없음)
 * 고정 공지 → 최신 순으로 맨 앞 하나 + '외 n개', 누르면 공지 창 */
export function NoticeTicker() {
  const list = tickerList(useNoticeList());
  const [, force] = useState(0);
  useEffect(() => onReadChange(() => force((x) => x + 1)), []);
  if (!list.length) return null;
  const n = list[0];
  const read = readIds();
  const unread = list.some((x) => !read.has(x.id));
  return (
    <div className="nt-strip">
      <button type="button" className="nt-bar" onClick={() => openNotice(n.id)} aria-label={`공지: ${n.title}${list.length > 1 ? ` 외 ${list.length - 1}개` : ''}`}>
        <span className="nt-tag">
          <Icon name="megaphone" size={14} /> 공지
          {unread && <i className="nt-dot" aria-hidden />}
        </span>
        <span className="nt-win" aria-hidden>
          <span className="nt-title">{n.title}</span>
        </span>
        {list.length > 1 && (
          <small className="nt-count" aria-hidden>
            외 {list.length - 1}개
          </small>
        )}
        <Icon name="right" size={14} />
      </button>
    </div>
  );
}
const readSubs = new Set<() => void>();
const onReadChange = (f: () => void) => {
  readSubs.add(f);
  return () => void readSubs.delete(f);
};
/** 공지 하나를 읽음으로 (공지 창·공지사항 화면 같은 기준) */
export function markNoticeRead(id: string) {
  markRead(id);
  readSubs.forEach((f) => f());
}
/** 이 기기에서 아직 안 읽은 공지가 있는지 (설정·더보기 '공지사항' 점) */
export function useHasUnreadNotice(): boolean {
  const list = useNoticeList();
  const [, force] = useState(0);
  useEffect(() => onReadChange(() => force((x) => x + 1)), []);
  const read = readIds();
  return list.some((x) => !read.has(x.id));
}

/* ---------- 공지 창 ---------- */
function NoticeModal({ list, startId, onClose, onGo }: { list: NoticeItem[]; startId: string; onClose: () => void; onGo: (p: LobbyPage) => void }) {
  const box = useDialogFocus<HTMLDivElement>();
  useEscape(onClose, true, true);
  const [id, setId] = useState(startId);
  // 휴대폰: 목록 ↔ 본문 (PC 는 둘 다 보임)
  const [listView, setListView] = useState(false);
  const [read, setRead] = useState(readIds);
  const n = list.find((x) => x.id === id) ?? list[0];
  useEffect(() => {
    if (!n) return;
    markNoticeRead(n.id);
    setRead(readIds());
  }, [n?.id]);
  if (!n) return null;
  return (
    <div className="modal-bg nt-modal-bg" onClick={onClose}>
      <div ref={box} tabIndex={-1} className={'modal nt-center' + (listView ? ' show-list' : '')} role="dialog" aria-modal aria-labelledby="nt-title" onClick={(e) => e.stopPropagation()}>
        <header className="ntc-head">
          <b>
            <Icon name="megaphone" size={16} /> 공지사항
          </b>
          <button type="button" className="icon-btn sm" aria-label="닫기" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="ntc-body">
          <nav className="ntc-list" aria-label="공지 목록">
            {list.map((x) => (
              <button key={x.id} type="button" className={'ntc-item' + (x.id === n.id ? ' on' : '')} aria-current={x.id === n.id ? 'true' : undefined} onClick={() => (setId(x.id), setListView(false))}>
                <span className="ntc-item-top">
                  {x.pinned && <span className="notice-pin">고정</span>}
                  {!read.has(x.id) && <i className="ntc-dot" aria-label="안 읽음" />}
                  <small>{fmt(x.created_at)}</small>
                </span>
                <span className="ntc-item-title">{x.title}</span>
              </button>
            ))}
          </nav>
          <article key={n.id} className="ntc-detail">
            {list.length > 1 && (
              <button type="button" className="ntc-back" onClick={() => setListView(true)}>
                <Icon name="left" size={14} /> 목록 ({list.length})
              </button>
            )}
            <h3 id="nt-title">
              {n.pinned && <span className="notice-pin">고정</span>} {n.title}
            </h3>
            <small className="muted">{fmt(n.created_at)}</small>
            <NoticeText text={n.body} onGo={(p) => (onClose(), onGo(p))} />
          </article>
        </div>
        <footer className="ntc-foot">
          <button type="button" className="btn ghost sm" onClick={() => (onClose(), onGo('notices'))}>
            공지사항 페이지
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            확인
          </button>
        </footer>
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
    const fresh = list.filter((n) => new Date(n.created_at).getTime() > Math.max(popped, seenAt()) && Date.now() - new Date(n.created_at).getTime() < 30 * DAY);
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
  const ordered = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.created_at) - +new Date(a.created_at));
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
