/**
 * '개미폰' — 게임 안 휴대폰 (design/news-phone.md).
 * 소식은 화면이 이미 받는 공개 소식(뉴스·커뮤니티 글·장 전 소문)만 — 새 정보·진위는 없음.
 * 내 주식·증강 앱은 게임 화면의 같은 부품을 그대로 넣음. 읽음·알림 켜고 끄기는 이 기기에만 저장.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NewsEvent } from '../game/market';
import { gameTime, clockOf, PLATFORMS, type Platform, type PublicPost } from '../game/community';
import { SECTOR_MAP, STOCK_MAP } from '../game/stocks';
import { pct, tone, wonShort } from '../lib/format';
import { Icon, SectorIcon } from './Icon';
import { PlatformIcon, prePostsOf } from './CommunityFeed';
import { AntHead, artHash, PostArt } from './PostArt';
import { play } from '../lib/sound';

export type PhoneApp = 'news' | 'sns' | 'stock' | 'aug' | 'settings';
const APP_ORDER: PhoneApp[] = ['news', 'sns', 'stock', 'aug', 'settings'];
type FeedApp = 'news' | 'sns';

/** 앱 하나에 들어가는 소식 한 줄 (알림·배지·알림 모음이 같이 씀) */
interface Item {
  key: string;
  app: FeedApp;
  platform?: Platform;
  at: number;
  title: string;
  post?: PublicPost;
  time?: string;
}

/* ---------- 알림 켜고 끄기 (이 기기) — 앱(뉴스·피드)과 피드 안 모양별 ---------- */
const NOTIF_KEY = 'stockduel.phoneNotif';
const NOTIF_DEFAULT: Record<string, boolean> = { live: false };
function loadNotif(): Record<string, boolean> {
  try {
    return { ...NOTIF_DEFAULT, ...(JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}') as Record<string, boolean>) };
  } catch {
    return { ...NOTIF_DEFAULT };
  }
}
function saveNotif(v: Record<string, boolean>) {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(v));
  } catch {
    /* 저장 못 해도 이번 화면에선 그대로 */
  }
}
const notifOn = (n: Record<string, boolean>, x: Item) => n[x.app] !== false && (!x.platform || n[x.platform] !== false);

/* ---------- 읽음 (이 판·이 창) ---------- */
function loadSeen(key: string): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveSeen(key: string, s: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...s].slice(-800)));
  } catch {
    /* 무시 */
  }
}

export interface PhoneWallet {
  equity: number;
  ret: number;
  cash: number;
  top: { sym: string; name: string; value: number; ch: number }[];
}

interface Props {
  /** 읽음 기록을 판마다 따로 */
  roomKey: string;
  day: number;
  daySec?: number;
  /** 상태 줄 시각 ('1일차 0:42', '장 전') */
  clock: string;
  pre: boolean;
  live: boolean;
  news: NewsEvent[];
  posts: PublicPost[];
  pastPosts: PublicPost[];
  rumors: { text: string; sector: string; symbol?: string; tone: 'good' | 'bad'; verdict?: 'true' | 'false' }[];
  /** 뉴스 앱 안에 그릴 지금의 뉴스 칸 (관련 종목 칩·감별기·튜토리얼이 그대로 동작하게) */
  newsApp: ReactNode;
  /** 내 주식 앱 = 게임의 내 재산 칸 */
  stockApp: ReactNode;
  /** 증강(또는 찬스 카드) 앱 = 게임의 같은 칸 */
  augApp: ReactNode;
  augName: string;
  /** 홈 화면 증강 위젯 안 (고른 증강 문양) */
  augWidget?: ReactNode;
  /** 오늘 고를 차례 등 눌러 볼 일이 있음 */
  augAlert?: boolean;
  wallet: PhoneWallet;
  /** 나에게 걸린 효과 알림 (홈 화면 위 카드) */
  alerts?: ReactNode[];
  onSelect: (s: string) => void;
  onSelectSector: (s: string) => void;
  /** 뉴스를 넓게 보기 (PC) */
  onExpand?: () => void;
  /** framed = PC 칸 속 휴대폰 틀, full = 휴대폰 화면 전체로 올린 상태, inline = 틀 없이 */
  mode: 'framed' | 'full' | 'inline';
  /** full 일 때 휴대폰 내리기 */
  onLower?: () => void;
  /** 튜토리얼처럼 한 앱을 열어 두어야 할 때 */
  lockApp?: PhoneApp;
}

export function AntPhone(p: Props) {
  const APP_NAME: Record<PhoneApp, string> = { news: '개미경제', sns: '개미피드', stock: '개미증권', aug: p.augName, settings: '설정' };
  const seenKey = `stockduel.phoneSeen:${p.roomKey}`;
  const [app, setApp] = useState<PhoneApp | null>(p.lockApp ?? null);
  useEffect(() => {
    if (p.lockApp) setApp(p.lockApp);
  }, [p.lockApp]);
  const [notif, setNotif] = useState(loadNotif);
  const [seen, setSeen] = useState(() => loadSeen(seenKey));
  const [shade, setShade] = useState(false);
  const [banner, setBanner] = useState<Item | null>(null);
  // 알림을 눌러 열었으면 그 글로 스크롤하고 잠깐 강조
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');

  // 오늘 소식 (뉴스 앱·피드 앱)
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const n of p.news) if (n.day === p.day) out.push({ key: `n:${n.day}:${n.headline}`, app: 'news', at: n.at ?? -1, title: n.headline.replace('[루머] ', '') });
    for (const { p: post, time } of prePostsOf(p.rumors, p.day)) out.push({ key: `pre:${p.day}:${post.text}`, app: 'sns', platform: post.platform, at: -0.5, title: post.text, post, time: time(p.daySec) });
    for (const post of p.posts) out.push({ key: `p:${post.day}:${post.id}`, app: 'sns', platform: post.platform, at: post.at, title: post.text, post });
    return out;
  }, [p.news, p.posts, p.rumors, p.day, p.daySec]);

  const unread = (a: PhoneApp) => (a === 'news' || a === 'sns' ? items.filter((x) => x.app === a && !seen.has(x.key)).length : 0);

  // 열려 있는 앱의 소식은 읽음으로
  useEffect(() => {
    if (app !== 'news' && app !== 'sns') return;
    const add = items.filter((x) => x.app === app && !seen.has(x.key));
    if (!add.length) return;
    const next = new Set(seen);
    for (const x of add) next.add(x.key);
    setSeen(next);
    saveSeen(seenKey, next);
  }, [app, items, seen, seenKey]);

  // 새로 온 소식 → 알림 켠 곳이면 위쪽 배너 (처음 그릴 때 있던 소식은 알림 없음)
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(items.map((x) => x.key));
      return;
    }
    const fresh = items.filter((x) => !known.current!.has(x.key));
    for (const x of fresh) known.current.add(x.key);
    const show = fresh.filter((x) => notifOn(notif, x) && x.app !== app).sort((a, b) => b.at - a.at)[0];
    if (show) {
      setBanner(show);
      play('noti');
    }
  }, [items, notif, app]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  const open = (a: PhoneApp, key?: string) => {
    setShade(false);
    setBanner(null);
    if (a === 'sns' && key) setFeedFilter('all');
    setApp(a);
    setFocusKey(key ?? null);
  };
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-k="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('ap-focus');
        setTimeout(() => el.classList.remove('ap-focus'), 1800);
      }
      setFocusKey(null);
    }, 120);
    return () => clearTimeout(t);
  }, [focusKey, app]);
  const goHome = () => !p.lockApp && (setApp(null), setShade(false));

  // 상태 줄을 끌어내리면 알림 모음
  const drag = useRef<number | null>(null);
  const statusBar = (
    <div
      className="ap-status"
      role="button"
      tabIndex={0}
      aria-label={shade ? '알림 모음 닫기' : '알림 모음 열기'}
      aria-expanded={shade}
      onClick={() => setShade((v) => !v)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setShade((v) => !v))}
      onPointerDown={(e) => (drag.current = e.clientY)}
      onPointerMove={(e) => {
        if (drag.current !== null && e.clientY - drag.current > 28) {
          drag.current = null;
          setShade(true);
        }
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <span className="ap-clock">{p.clock}</span>
      <span className="ap-pull" aria-hidden />
      <span className="ap-sys" aria-hidden>
        <svg width="15" height="11" viewBox="0 0 15 11"><rect x="0" y="7" width="2.6" height="4" rx=".6" fill="currentColor" /><rect x="4" y="5" width="2.6" height="6" rx=".6" fill="currentColor" /><rect x="8" y="2.5" width="2.6" height="8.5" rx=".6" fill="currentColor" /><rect x="12" y="0" width="2.6" height="11" rx=".6" fill="currentColor" /></svg>
        <svg width="14" height="11" viewBox="0 0 14 11"><path d="M7 10.2 l1.8 -2.1 a2.6 2.6 0 0 0 -3.6 0 z M2.6 5.6 l1.3 1.4 a4.4 4.4 0 0 1 6.2 0 l1.3 -1.4 a6.3 6.3 0 0 0 -8.8 0 z M0 2.9 l1.3 1.4 a8.2 8.2 0 0 1 11.4 0 L14 2.9 a10.1 10.1 0 0 0 -14 0 z" fill="currentColor" /></svg>
        <svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="2.6" fill="none" stroke="currentColor" opacity=".55" /><rect x="2.2" y="2.2" width="14" height="6.6" rx="1.4" fill="currentColor" /><rect x="21.6" y="3.6" width="1.6" height="3.8" rx=".8" fill="currentColor" opacity=".55" /></svg>
      </span>
    </div>
  );

  // 휴대폰을 올린 상태: 맨 위 손잡이를 누르거나 아래로 쓸면 내림
  const lowerDrag = useRef<number | null>(null);
  const lowerBar = p.mode === 'full' && p.onLower && (
    <button
      type="button"
      className="ap-lower"
      onClick={p.onLower}
      onPointerDown={(e) => (lowerDrag.current = e.clientY)}
      onPointerMove={(e) => {
        if (lowerDrag.current !== null && e.clientY - lowerDrag.current > 36) {
          lowerDrag.current = null;
          p.onLower?.();
        }
      }}
      onPointerUp={() => (lowerDrag.current = null)}
      aria-label="개미폰 내리기"
    >
      <span>
        <Icon name="down" size={14} /> 내리기
      </span>
    </button>
  );

  const shadeList = items
    .filter((x) => notifOn(notif, x))
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);
  const timeOf = (x: Item) => x.time ?? (x.at < 0 ? '아침' : p.daySec ? gameTime(x.at, p.daySec) : clockOf(x.at));
  const notiIcon = (x: Item) => (x.app === 'news' ? <AppIcon id="news" small /> : x.platform ? <PlatformIcon id={x.platform} size={20} /> : <AppIcon id="sns" small />);
  const notiName = (x: Item) => (x.app === 'news' ? APP_NAME.news : `${APP_NAME.sns} · ${x.platform ? PLATFORMS[x.platform].name : ''}`);

  const body = (() => {
    if (!app) {
      const w = p.wallet;
      const unreadAll = items.filter((x) => !seen.has(x.key)).length;
      return (
        <div className="ap-home">
          {(p.alerts ?? []).map((a, i) => (
            <div key={i} className="ap-alert" role="status">
              <Icon name="bell" size={15} /> <span>{a}</span>
            </div>
          ))}
          <button type="button" className="ap-w ap-w-wallet" onClick={() => open('stock')} aria-label={`내 재산 ${wonShort(w.equity)}, ${pct(w.ret, 1)} — 개미증권 열기`}>
            <span className="ap-w-h">
              <AppIcon id="stock" small /> 내 재산
            </span>
            <span className="ap-w-big">
              {wonShort(w.equity)} <em className={tone(w.ret)}>{pct(w.ret, 1)}</em>
            </span>
            <span className="ap-w-sub">현금 {wonShort(w.cash)}</span>
            {w.top.length > 0 ? (
              <span className="ap-w-hold">
                {w.top.map((h) => (
                  <span key={h.sym}>
                    <b>{h.name}</b>
                    <small>{wonShort(h.value)}</small>
                    <em className={tone(h.ch)}>{pct(h.ch, 1)}</em>
                  </span>
                ))}
              </span>
            ) : (
              <span className="ap-w-sub">아직 산 주식이 없어요</span>
            )}
          </button>
          <div className="ap-w-row">
            <button type="button" className={'ap-w ap-w-aug' + (p.augAlert ? ' due' : '')} onClick={() => open('aug')} aria-label={`${p.augName} 열기${p.augAlert ? ' — 지금 고를 차례' : ''}`}>
              <span className="ap-w-h">
                <AppIcon id="aug" small /> {p.augName}
              </span>
              <span className="ap-w-aug-in">{p.augWidget}</span>
              {p.augAlert && <span className="ap-w-due">지금 고를 차례예요</span>}
            </button>
            <button type="button" className="ap-w ap-w-day" onClick={() => setShade(true)} aria-label={`오늘 소식 ${items.length}개, 안 읽은 ${unreadAll}개 — 알림 모음 열기`}>
              <span className="ap-w-h">{p.pre ? '장 열리기 전' : p.live ? '장 열려 있음' : '오늘 장 정리'}</span>
              <span className="ap-w-big">{unreadAll}</span>
              <span className="ap-w-sub">안 읽은 소식 · 오늘 {items.length}개</span>
            </button>
          </div>
          <ul className="ap-grid" aria-label="앱">
            {APP_ORDER.map((a) => {
              const n = unread(a);
              const due = a === 'aug' && p.augAlert;
              const muted = (a === 'news' || a === 'sns') && notif[a] === false;
              return (
                <li key={a}>
                  <button type="button" className="ap-app" data-app={a} onClick={() => open(a)} aria-label={`${APP_NAME[a]}${n ? `, 안 읽은 소식 ${n}개` : ''}${due ? ', 고를 차례' : ''}`}>
                    <span className="ap-ic">
                      <AppIcon id={a} />
                      {n > 0 && <i className="ap-badge">{n > 99 ? '99+' : n}</i>}
                      {due && <i className="ap-badge">!</i>}
                      {muted && (
                        <i className="ap-muted" aria-hidden>
                          <Icon name="mute" size={10} />
                        </i>
                      )}
                    </span>
                    <span className="ap-name">{APP_NAME[a]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="ap-hint">위 상태 줄을 내리면 알림이 모여 있어요</p>
        </div>
      );
    }
    return (
      <div className={'ap-appview app-' + app}>
        <header className="ap-bar">
          {!p.lockApp && (
            <button type="button" className="ap-back" onClick={goHome} aria-label="홈 화면으로">
              <Icon name="left" size={18} />
            </button>
          )}
          <span className="ap-title">
            <AppIcon id={app} small /> {APP_NAME[app]}
          </span>
          {app === 'news' && p.onExpand && (
            <button type="button" className="ap-text-btn ap-expand" onClick={p.onExpand}>
              <Icon name="grid" size={14} /> 크게 보기
            </button>
          )}
        </header>
        <div className="ap-body">
          {app === 'news' ? (
            p.newsApp
          ) : app === 'stock' ? (
            <div className="ap-embed">{p.stockApp}</div>
          ) : app === 'aug' ? (
            <div className="ap-embed">{p.augApp}</div>
          ) : app === 'settings' ? (
            <Settings notif={notif} onChange={(n) => (setNotif(n), saveNotif(n))} />
          ) : (
            <SnsApp filter={feedFilter} setFilter={setFeedFilter} day={p.day} daySec={p.daySec} items={items.filter((x) => x.app === 'sns')} past={p.pastPosts.filter((x) => x.day === p.day - 1)} live={p.live} onSelect={p.onSelect} onSelectSector={p.onSelectSector} />
          )}
        </div>
      </div>
    );
  })();

  return (
    <section ref={rootRef} className={'antphone m-' + p.mode} aria-label="개미폰">
      <div className="ap-screen">
        {lowerBar}
        {statusBar}
        {banner && (
          <button type="button" className="ap-banner" onClick={() => open(banner.app, banner.key)} aria-live="polite">
            {notiIcon(banner)}
            <span>
              <b>
                {notiName(banner)} <small>· 방금</small>
              </b>
              <em>{banner.title}</em>
            </span>
          </button>
        )}
        {shade && (
          <div className="ap-shade" role="dialog" aria-label="알림 모음">
            <header>
              <b>알림</b>
              <button
                type="button"
                className="ap-text-btn"
                onClick={() => {
                  const next = new Set(seen);
                  for (const x of items) next.add(x.key);
                  setSeen(next);
                  saveSeen(seenKey, next);
                }}
              >
                모두 읽음
              </button>
              <button type="button" className="ap-text-btn" onClick={() => setShade(false)} aria-label="알림 모음 닫기">
                <Icon name="up" size={16} />
              </button>
            </header>
            {shadeList.length === 0 ? (
              <p className="ap-empty">아직 알림이 없어요. 장이 열리면 소식이 올라와요.</p>
            ) : (
              <ul>
                {shadeList.map((x) => (
                  <li key={x.key}>
                    <button type="button" className={'ap-noti' + (seen.has(x.key) ? '' : ' unread')} onClick={() => open(x.app, x.key)}>
                      {notiIcon(x)}
                      <span>
                        <b>
                          {notiName(x)} <small>{timeOf(x)}</small>
                        </b>
                        <em>{x.title}</em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="ap-shade-close" onClick={() => setShade(false)} aria-label="알림 모음 닫기" />
          </div>
        )}
        {body}
        {/* 아래 홈 막대: 누르면 홈 화면 (진짜 휴대폰처럼) */}
        {!p.lockApp && (
          <button type="button" className="ap-homebar" onClick={goHome} aria-label="개미폰 홈 화면" disabled={!app}>
            <i aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- 앱 아이콘 — 개미리그 개미가 들어간 그림 ---------- */
function AppIcon({ id, small }: { id: PhoneApp; small?: boolean }) {
  const s = small ? 20 : 48;
  const tile = (fill: string, children: ReactNode, stroke?: string) => (
    <svg className="pf-icon" width={s} height={s} viewBox="0 0 30 30" aria-hidden>
      <rect width="30" height="30" rx="8" fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : 0} />
      {children}
    </svg>
  );
  switch (id) {
    case 'news': // 신문 1면 사진 칸에 개미 기자
      return tile(
        '#e5484d',
        <>
          <rect x="5.5" y="6.5" width="19" height="17" rx="2" fill="#fff" />
          <rect x="8" y="9" width="8" height="7" rx="1.2" fill="#ffe1e2" />
          <AntHead cx={12} cy={13.4} r={2.6} fill="#e5484d" />
          <path d="M18.2 9.6 h4 M18.2 12.4 h4 M18.2 15.2 h4 M8 19 h14.2 M8 21.2 h9" stroke="#e5484d" strokeWidth="1.3" strokeLinecap="round" />
        </>,
      );
    case 'sns': // 말풍선 속 개미 얼굴 + 하트
      return tile(
        '#6b58ee',
        <>
          <path d="M15 5.6 c6 0 10 3.6 10 8.2 s-4 8.2 -10 8.2 c-1.2 0 -2.3 -.1 -3.3 -.4 l-4.6 2.6 l1.2 -4.1 c-2 -1.5 -3.3 -3.7 -3.3 -6.3 c0 -4.6 4 -8.2 10 -8.2 z" fill="#fff" />
          <AntHead cx={15} cy={14.6} r={4.4} fill="#6b58ee" />
          <path d="M22.6 6.4 c.9 -1.2 2.9 -.6 2.6 1 c-.2 1.1 -2.2 2.3 -2.6 2.6 c-.4 -.3 -2.4 -1.5 -2.6 -2.6 c-.3 -1.6 1.7 -2.2 2.6 -1 z" fill="#ff8a95" />
        </>,
      );
    case 'stock': // 오르는 차트 위로 고개 내민 개미
      return tile(
        '#1c1c1c',
        <>
          <path d="M5 19 l5 -4.5 l4 2.8 l7.4 -8" fill="none" stroke="#e5484d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18.4 8.8 h3.6 v3.6" fill="none" stroke="#e5484d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <AntHead cx={19.5} cy={23} r={4.4} fill="#8b7bff" />
        </>,
        '#3a3a40',
      );
    case 'aug': // 더듬이 달린 보석 (증강)
      return tile(
        '#2b2140',
        <>
          <path d="M11.6 8.6 q-1.6 -3.2 -4 -3 M18.4 8.6 q1.6 -3.2 4 -3" stroke="#f5b83d" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="7.6" cy="5.6" r="1.3" fill="#f5b83d" />
          <circle cx="22.4" cy="5.6" r="1.3" fill="#f5b83d" />
          <path d="M15 8 l7.6 5 l-7.6 11 l-7.6 -11 z" fill="#f5b83d" />
          <path d="M7.4 13 h15.2 M15 8 l-3.4 5 l3.4 11 l3.4 -11 z" fill="none" stroke="#a8761b" strokeWidth="1" strokeLinejoin="round" />
          <path d="M15 8 l3.4 5 h4.2 z" fill="#ffd98a" />
        </>,
      );
    case 'settings':
      return tile(
        '#5b5f6b',
        <>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
            <rect key={d} x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform={`rotate(${d} 15 15)`} />
          ))}
          <circle cx="15" cy="15" r="6.6" fill="#fff" />
          <circle cx="15" cy="15" r="2.7" fill="#5b5f6b" />
        </>,
      );
  }
}

function Settings({ notif, onChange }: { notif: Record<string, boolean>; onChange: (n: Record<string, boolean>) => void }) {
  const row = (key: string, icon: ReactNode, name: string, kind: string, sub?: boolean) => {
    const on = notif[key] !== false;
    const parentOff = sub && notif.sns === false;
    return (
      <li key={key} className={sub ? 'sub' : ''}>
        {icon}
        <span>
          <b>{name}</b>
          <small>{parentOff ? '개미피드 알림이 꺼져 있어요' : kind}</small>
        </span>
        <button type="button" className={'tgl' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={`${name} 알림`} disabled={parentOff} onClick={() => onChange({ ...notif, [key]: !on })}>
          <i />
        </button>
      </li>
    );
  };
  return (
    <div className="ap-settings">
      <h4>알림</h4>
      <p className="muted small">끄면 위쪽 알림만 안 떠요. 앱 안에서는 늘 다 보여요.</p>
      <ul>
        {row('news', <AppIcon id="news" small />, '개미경제', '뉴스·장중 속보')}
        {row('sns', <AppIcon id="sns" small />, '개미피드', '커뮤니티·SNS 글 전체')}
      </ul>
      <h4 className="ap-set-h2">개미피드 안에서</h4>
      <ul>{(Object.keys(PLATFORMS) as Platform[]).map((pf) => row(pf, <PlatformIcon id={pf} size={20} />, PLATFORMS[pf].name, PLATFORMS[pf].kind, true))}</ul>
    </div>
  );
}

/* ---------- 개미피드: 여러 SNS 모양의 글이 한 줄로 흐름 ---------- */
type FeedFilter = 'all' | 'board' | 'chirp' | 'feedgram' | 'talk' | 'live';
const FILTERS: { id: FeedFilter; name: string; of: Platform[] }[] = [
  { id: 'all', name: '전체', of: ['square', 'board', 'chirp', 'feedgram', 'talk', 'live'] },
  { id: 'board', name: '게시판', of: ['square', 'board'] },
  { id: 'chirp', name: '짹짹', of: ['chirp'] },
  { id: 'feedgram', name: '사진', of: ['feedgram'] },
  { id: 'talk', name: '단톡방', of: ['talk'] },
  { id: 'live', name: '라이브', of: ['live'] },
];

function SnsApp({ filter, setFilter, day, daySec, items, past, live, onSelect, onSelectSector }: { filter: FeedFilter; setFilter: (f: FeedFilter) => void; day: number; daySec?: number; items: Item[]; past: PublicPost[]; live: boolean; onSelect: (s: string) => void; onSelectSector: (s: string) => void }) {
  const f = FILTERS.find((x) => x.id === filter)!;
  const mixed = filter === 'all';
  const list = items.filter((x) => x.platform && f.of.includes(x.platform)).sort((a, b) => b.at - a.at);
  const old = past.filter((x) => f.of.includes(x.platform)).sort((a, b) => b.at - a.at);
  const when = (x: Item) => x.time ?? (daySec ? gameTime(x.at, daySec) : clockOf(x.at));
  const tag = (post: PublicPost) => {
    const target = post.symbol && STOCK_MAP[post.symbol] ? STOCK_MAP[post.symbol].name : (SECTOR_MAP[post.sector]?.name ?? post.sector);
    return (
      <button type="button" className={'sp-tag ' + post.tone} onClick={() => (post.symbol && STOCK_MAP[post.symbol] ? onSelect(post.symbol) : onSelectSector(post.sector))}>
        <SectorIcon id={post.sector} /> #{target} {post.re ? (post.tone === 'good' ? '좋은 소식 반응' : '나쁜 소식 반응') : post.tone === 'good' ? '호재설' : '악재설'}
      </button>
    );
  };
  const author = (post: PublicPost) => (
    <b className="ap-author">
      {post.author}
      {post.verified && (
        <span className="ap-verified" title="인증된 계정이에요 — 본인이 맞다는 표시예요">
          인증
        </span>
      )}
    </b>
  );
  const stamp = (post: PublicPost) => post.verdict && <em className={'rb-stamp ' + post.verdict}>{post.verdict === 'true' ? '맞았어요' : '헛소문'}</em>;
  const stats = (post: PublicPost) => (
    <span className="cf-stats">
      <span className="sp-stat" aria-label={`공감 ${post.likes}`}>
        <Icon name="heart" size={13} /> {post.likes.toLocaleString('ko-KR')}
      </span>
      <span className="sp-stat" aria-label={`댓글 ${post.replies}`}>
        <Icon name="chat" size={13} /> {post.replies}
      </span>
    </span>
  );
  // 글쓴이 사진 = 이름으로 고른 개미 얼굴색 (진위와 무관)
  const av = (post: PublicPost, size = 34) => {
    const hue = ['#8b7bff', '#e5484d', '#3b82f6', '#2fb380', '#f5b83d', '#d16bd9'][artHash(post.author) % 6];
    return (
      <span className="ap-av" aria-hidden style={{ width: size, height: size }}>
        <svg viewBox="0 0 30 30" width={size} height={size}>
          <rect width="30" height="30" fill="#24222e" />
          <AntHead cx={15} cy={17.5} r={8} fill={hue} />
        </svg>
      </span>
    );
  };
  const src = (post: PublicPost) =>
    mixed && (
      <div className="ap-src">
        <PlatformIcon id={post.platform} size={16} /> {PLATFORMS[post.platform].name}
      </div>
    );
  const one = (x: Item, isOld?: boolean) => {
    const post = x.post!;
    const t = isOld ? `${post.day + 1}일차` : when(x);
    switch (post.platform) {
      case 'square':
      case 'board':
        return (
          <li key={x.key} data-k={x.key} className={'ap-row pf-' + post.platform}>
            {src(post)}
            <p className="ap-row-t">{post.text}</p>
            <div className="ap-row-m">
              {author(post)} <span className="muted">{t}</span> {stats(post)}
            </div>
            <div className="ap-row-f">{tag(post)}</div>
            {stamp(post)}
          </li>
        );
      case 'chirp':
        return (
          <li key={x.key} data-k={x.key} className="ap-chirp">
            {av(post)}
            <div>
              {src(post)}
              <div className="ap-row-m">
                {author(post)} <span className="muted">· {t}</span>
              </div>
              <p className="ap-row-t">{post.text}</p>
              {artHash(post.text) % 5 < 2 && <PostArt p={post} only={['chart', 'ant', 'broadcast', 'tower']} />}
              <div className="ap-row-f">
                {tag(post)} {stats(post)}
              </div>
            </div>
            {stamp(post)}
          </li>
        );
      case 'feedgram':
        return (
          <li key={x.key} data-k={x.key} className="ap-gram">
            <div className="ap-gram-h">
              {av(post, 28)}
              {author(post)} <span className="muted">{t}</span>
              {mixed && (
                <span className="ap-src-inline">
                  <PlatformIcon id="feedgram" size={14} /> 피드그램
                </span>
              )}
            </div>
            <PostArt p={post} ratio="square" label={`${post.author}의 사진`} />
            <div className="ap-row-f">{stats(post)}</div>
            <p className="ap-row-t">
              <b>{post.author}</b> {post.text}
            </p>
            <div className="ap-row-f">{tag(post)}</div>
            {stamp(post)}
          </li>
        );
      case 'talk':
        return (
          <li key={x.key} data-k={x.key} className={'ap-talk' + (mixed ? ' boxed' : '')}>
            {src(post)}
            <div className="ap-talk-in">
              {av(post, 32)}
              <div>
                {author(post)}
                <div className="ap-bubble-row">
                  <p className="ap-bubble">{post.text}</p>
                  <small className="muted">{t}</small>
                </div>
                <div className="ap-row-f">{tag(post)}</div>
              </div>
            </div>
            {stamp(post)}
          </li>
        );
      case 'live':
        return mixed ? (
          <li key={x.key} data-k={x.key} className="ap-livecard">
            <div className="ap-livecard-th">
              <PostArt p={post} only={['broadcast']} label="개미TV 방송 화면" />
            </div>
            <div className="ap-livecard-t">
              {src(post)}
              <p className="ap-row-t">
                {author(post)} {post.text}
              </p>
              <div className="ap-row-f">
                <span className="muted small">{t}</span> {tag(post)}
              </div>
            </div>
            {stamp(post)}
          </li>
        ) : (
          <li key={x.key} data-k={x.key} className="ap-livechat">
            {author(post)} <span className="ap-livechat-t">{post.text}</span> <small className="muted">{t}</small>
            <div className="ap-row-f">{tag(post)}</div>
            {stamp(post)}
          </li>
        );
    }
  };
  return (
    <div className="ap-feed">
      <div className="ap-chips" role="tablist" aria-label="글 모양 고르기">
        {FILTERS.map((x) => {
          const n = items.filter((i) => i.platform && x.of.includes(i.platform)).length;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={filter === x.id} className={'ap-chip' + (filter === x.id ? ' on' : '')} onClick={() => setFilter(x.id)}>
              {x.name}
              {x.id !== 'all' && n > 0 && <small>{n}</small>}
            </button>
          );
        })}
      </div>
      {filter === 'live' && (
        <div className="ap-live-top">
          <PostArt p={{ id: 'live-' + day, text: 'live-' + day, sector: list[0]?.post?.sector ?? 'kr_etf', tone: list[0]?.post?.tone ?? 'good' }} only={['broadcast']} label="개미TV 장중 라이브 화면" />
          <div className="ap-live-meta">
            <b>
              {live ? (
                <>
                  <i className="ap-onair" aria-hidden /> 장중 라이브 · 개미TV 주식방
                </>
              ) : (
                '개미TV 주식방 · 장이 열리면 방송해요'
              )}
            </b>
            <small className="muted">시청자 {(1200 + ((day * 977) % 4000)).toLocaleString('ko-KR')}명 · 채팅이 실시간으로 올라와요</small>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="ap-empty">{live ? '아직 올라온 글이 없어요. 장중에 수시로 올라와요.' : '장이 열리면 글이 올라오기 시작해요.'}</p>
      ) : (
        <ul className={'ap-list list-' + (mixed ? 'mix' : filter)}>{list.map((x) => one(x))}</ul>
      )}
      {old.length > 0 && (
        <details className="cf-old">
          <summary>어제 올라온 글 {old.length}개 (맞았는지 보기)</summary>
          <ul className={'ap-list list-' + (mixed ? 'mix' : filter)}>{old.map((post) => one({ key: 'old:' + post.id, app: 'sns', platform: post.platform, at: post.at, title: post.text, post }, true))}</ul>
        </details>
      )}
    </div>
  );
}
