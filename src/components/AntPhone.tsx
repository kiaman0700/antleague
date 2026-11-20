/**
 * '개미폰' — 게임 안 소식 칸을 휴대폰처럼 (design/news-phone.md).
 * 화면이 이미 받는 공개 소식(뉴스·커뮤니티 글·장 전 소문)만 앱별로 나눠 보여 줌 — 새 정보·진위는 없음.
 * 읽음·알림 켜고 끄기는 이 기기에만 저장.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NewsEvent } from '../game/market';
import { gameTime, clockOf, type Platform, type PublicPost } from '../game/community';
import { SECTOR_MAP, STOCK_MAP } from '../game/stocks';
import { Icon, SectorIcon } from './Icon';
import { PlatformIcon, prePostsOf } from './CommunityFeed';
import { artHash, PostArt } from './PostArt';
import { play } from '../lib/sound';

export type PhoneApp = 'news' | Platform | 'settings';
const APP_ORDER: PhoneApp[] = ['news', 'square', 'board', 'chirp', 'feedgram', 'talk', 'live', 'settings'];
const APP_NAME: Record<PhoneApp, string> = { news: '개미경제', square: '개미광장', board: '종목토론방', chirp: '짹짹', feedgram: '피드그램', talk: '개미톡', live: '개미TV', settings: '설정' };
const APP_KIND: Record<PhoneApp, string> = { news: '뉴스', square: '커뮤니티', board: '커뮤니티', chirp: 'SNS', feedgram: '사진 SNS', talk: '메신저', live: '방송', settings: '' };

/* ---------- 알림 켜고 끄기 (이 기기) ---------- */
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
const notifOn = (n: Record<string, boolean>, app: PhoneApp) => n[app] !== false;

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

/** 앱 하나에 들어가는 소식 한 줄 (알림·배지·알림 모음이 같이 씀) */
interface Item {
  key: string;
  app: PhoneApp;
  at: number;
  title: string;
  post?: PublicPost;
  time?: string;
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
  /** 뉴스 앱 안에 그릴 지금의 소식 칸 (관련 종목 칩·감별기·튜토리얼이 그대로 동작하게) */
  newsApp: ReactNode;
  onSelect: (s: string) => void;
  onSelectSector: (s: string) => void;
  /** PC: 둥근 휴대폰 틀 */
  framed?: boolean;
  /** 튜토리얼처럼 한 앱을 열어 두어야 할 때 */
  lockApp?: PhoneApp;
}

export function AntPhone(p: Props) {
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

  // 앱마다 오늘 소식
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const n of p.news) if (n.day === p.day) out.push({ key: `n:${n.day}:${n.headline}`, app: 'news', at: n.at ?? -1, title: n.headline.replace('[루머] ', '') });
    for (const { p: post, time } of prePostsOf(p.rumors, p.day)) out.push({ key: `pre:${p.day}:${post.text}`, app: post.platform, at: -0.5, title: post.text, post, time: time(p.daySec) });
    for (const post of p.posts) out.push({ key: `p:${post.day}:${post.id}`, app: post.platform, at: post.at, title: post.text, post });
    return out;
  }, [p.news, p.posts, p.rumors, p.day, p.daySec]);

  const unread = (a: PhoneApp) => items.filter((x) => x.app === a && !seen.has(x.key)).length;

  // 열려 있는 앱의 소식은 읽음으로
  useEffect(() => {
    if (!app || app === 'settings') return;
    const add = items.filter((x) => x.app === app && !seen.has(x.key));
    if (!add.length) return;
    const next = new Set(seen);
    for (const x of add) next.add(x.key);
    setSeen(next);
    saveSeen(seenKey, next);
  }, [app, items, seen, seenKey]);

  // 새로 온 소식 → 알림 켠 앱이면 위쪽 배너 (처음 그릴 때 있던 소식은 알림 없음)
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (known.current === null) {
      known.current = new Set(items.map((x) => x.key));
      return;
    }
    const fresh = items.filter((x) => !known.current!.has(x.key));
    for (const x of fresh) known.current.add(x.key);
    const show = fresh.filter((x) => notifOn(notif, x.app) && x.app !== app).sort((a, b) => b.at - a.at)[0];
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
  const back = () => !p.lockApp && setApp(null);

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

  const shadeList = items
    .filter((x) => notifOn(notif, x.app))
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);

  const body = (() => {
    if (!app)
      return (
        <div className="ap-home">
          <div className="ap-widget">
            <b>{p.pre ? '장 열리기 전' : p.live ? '지금 장이 열려 있어요' : '오늘 장 정리 중'}</b>
            <small>
              오늘 소식 {items.length}개 · 안 읽은 {items.filter((x) => !seen.has(x.key)).length}개
            </small>
          </div>
          <ul className="ap-grid" aria-label="앱">
            {APP_ORDER.map((a) => {
              const n = a === 'settings' ? 0 : unread(a);
              return (
                <li key={a}>
                  <button type="button" className="ap-app" onClick={() => open(a)} aria-label={`${APP_NAME[a]}${n ? `, 안 읽은 소식 ${n}개` : ''}`}>
                    <span className="ap-ic">
                      <AppIcon id={a} />
                      {n > 0 && <i className="ap-badge">{n > 99 ? '99+' : n}</i>}
                      {a !== 'settings' && !notifOn(notif, a) && <i className="ap-muted" aria-hidden><Icon name="mute" size={10} /></i>}
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
    return (
      <div className={'ap-appview app-' + app}>
        <header className="ap-bar">
          {!p.lockApp && (
            <button type="button" className="ap-back" onClick={back} aria-label="홈 화면으로">
              <Icon name="left" size={18} />
            </button>
          )}
          <span className="ap-title">
            <AppIcon id={app} small /> {APP_NAME[app]}
          </span>
          {APP_KIND[app] && <small className="ap-kind">{APP_KIND[app]}</small>}
        </header>
        <div className="ap-body">
          {app === 'news' ? (
            p.newsApp
          ) : app === 'settings' ? (
            <Settings notif={notif} onChange={(n) => (setNotif(n), saveNotif(n))} />
          ) : (
            <PlatformApp app={app} day={p.day} daySec={p.daySec} items={items.filter((x) => x.app === app)} past={p.pastPosts.filter((x) => x.platform === app && x.day === p.day - 1)} live={p.live} onSelect={p.onSelect} onSelectSector={p.onSelectSector} />
          )}
        </div>
      </div>
    );
  })();

  return (
    <section ref={rootRef} className={'antphone' + (p.framed ? ' framed' : '')} aria-label="개미폰 — 소식">
      <div className="ap-screen">
        {statusBar}
        {banner && (
          <button type="button" className="ap-banner" onClick={() => open(banner.app, banner.key)} aria-live="polite">
            <AppIcon id={banner.app} small />
            <span>
              <b>
                {APP_NAME[banner.app]} <small>· 방금</small>
              </b>
              <em>{banner.title}</em>
            </span>
          </button>
        )}
        {shade && (
          <div className="ap-shade" role="dialog" aria-label="알림 모음">
            <header>
              <b>알림</b>
              <button type="button" className="ap-text-btn" onClick={() => {
                const next = new Set(seen);
                for (const x of items) next.add(x.key);
                setSeen(next);
                saveSeen(seenKey, next);
              }}>
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
                      <AppIcon id={x.app} small />
                      <span>
                        <b>
                          {APP_NAME[x.app]} <small>{x.time ?? (x.at < 0 ? '아침' : p.daySec ? gameTime(x.at, p.daySec) : clockOf(x.at))}</small>
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
      </div>
    </section>
  );
}

function AppIcon({ id, small }: { id: PhoneApp; small?: boolean }) {
  const s = small ? 20 : 46;
  if (id === 'news')
    return (
      <svg className="pf-icon" width={s} height={s} viewBox="0 0 30 30" aria-hidden>
        <rect width="30" height="30" rx="8" fill="#e5484d" />
        <rect x="6.5" y="7.5" width="17" height="15" rx="2" fill="#fff" />
        <rect x="9" y="10" width="7" height="5" rx="1" fill="#e5484d" />
        <path d="M18 10.5 h3.5 M18 13.5 h3.5 M9 17.5 h12.5 M9 20 h9" stroke="#e5484d" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  if (id === 'settings')
    return (
      <svg className="pf-icon" width={s} height={s} viewBox="0 0 30 30" aria-hidden>
        <rect width="30" height="30" rx="8" fill="#5b5f6b" />
        <rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(0 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(45 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(90 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(135 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(180 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(225 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(270 15 15)"  /><rect x="13.4" y="5.2" width="3.2" height="4" rx="1" fill="#fff" transform="rotate(315 15 15)"  />
        <circle cx="15" cy="15" r="6.6" fill="#fff" />
        <circle cx="15" cy="15" r="2.7" fill="#5b5f6b" />
      </svg>
    );
  return <PlatformIcon id={id} size={s} />;
}

function Settings({ notif, onChange }: { notif: Record<string, boolean>; onChange: (n: Record<string, boolean>) => void }) {
  return (
    <div className="ap-settings">
      <h4>알림</h4>
      <p className="muted small">끄면 위쪽 알림만 안 떠요. 앱 안에서는 늘 다 보여요.</p>
      <ul>
        {APP_ORDER.filter((a) => a !== 'settings').map((a) => {
          const on = notifOn(notif, a);
          return (
            <li key={a}>
              <AppIcon id={a} small />
              <span>
                <b>{APP_NAME[a]}</b>
                <small>{APP_KIND[a]}</small>
              </span>
              <button type="button" className={'tgl' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={`${APP_NAME[a]} 알림`} onClick={() => onChange({ ...notif, [a]: !on })}>
                <i />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 앱마다 다른 모양 (같은 글, 플랫폼다운 화면) */
function PlatformApp({ app, day, daySec, items, past, live, onSelect, onSelectSector }: { app: Platform; day: number; daySec?: number; items: Item[]; past: PublicPost[]; live: boolean; onSelect: (s: string) => void; onSelectSector: (s: string) => void }) {
  const list = [...items].sort((a, b) => b.at - a.at);
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
      {post.verified && <span className="ap-verified" title="인증된 계정이에요 — 본인이 맞다는 표시예요">인증</span>}
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
  const one = (x: Item, old?: boolean) => {
    const post = x.post!;
    const t = old ? `${post.day + 1}일차` : when(x);
    switch (app) {
      case 'square':
      case 'board':
        return (
          <li key={x.key} data-k={x.key} className="ap-row">
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
            <span className="ap-av" aria-hidden>{post.author.slice(0, 1)}</span>
            <div>
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
              <span className="ap-av" aria-hidden>{post.author.slice(0, 1)}</span>
              {author(post)} <span className="muted">{t}</span>
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
          <li key={x.key} data-k={x.key} className="ap-talk">
            <span className="ap-av" aria-hidden>{post.author.slice(0, 1)}</span>
            <div>
              {author(post)}
              <div className="ap-bubble-row">
                <p className="ap-bubble">{post.text}</p>
                <small className="muted">{t}</small>
              </div>
              <div className="ap-row-f">{tag(post)}</div>
            </div>
            {stamp(post)}
          </li>
        );
      case 'live':
        return (
          <li key={x.key} data-k={x.key} className="ap-livechat">
            {author(post)} <span className="ap-livechat-t">{post.text}</span> <small className="muted">{t}</small>
            <div className="ap-row-f">{tag(post)}</div>
            {stamp(post)}
          </li>
        );
    }
  };
  return (
    <div className={'ap-feed'}>
      {app === 'live' && (
        <div className="ap-live-top">
          <PostArt p={{ id: 'live-' + day, text: 'live-' + day, sector: list[0]?.post?.sector ?? 'kr_etf', tone: list[0]?.post?.tone ?? 'good' }} only={['broadcast']} label="개미TV 장중 라이브 화면" />
          <div className="ap-live-meta">
            <b>{live ? <><i className="ap-onair" aria-hidden /> 장중 라이브 · 개미TV 주식방</> : '개미TV 주식방 · 장이 열리면 방송해요'}</b>
            <small className="muted">시청자 {(1200 + (day * 977) % 4000).toLocaleString('ko-KR')}명 · 채팅이 실시간으로 올라와요</small>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="ap-empty">{live ? '아직 올라온 글이 없어요. 장중에 수시로 올라와요.' : '장이 열리면 글이 올라오기 시작해요.'}</p>
      ) : (
        <ul className={'ap-list list-' + app}>{list.map((x) => one(x))}</ul>
      )}
      {past.length > 0 && (
        <details className="cf-old">
          <summary>어제 올라온 글 {past.length}개 (맞았는지 보기)</summary>
          <ul className={'ap-list list-' + app}>{past.sort((a, b) => b.at - a.at).map((post) => one({ key: 'old:' + post.id, app, at: post.at, title: post.text, post }, true))}</ul>
        </details>
      )}
    </div>
  );
}
