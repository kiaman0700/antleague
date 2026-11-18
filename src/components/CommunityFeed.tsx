/**
 * (v20) 커뮤니티·SNS 피드 (design/community-news-v20.md)
 * 플랫폼 아이콘은 이 게임에서 직접 그린 단색 그림 (실제 서비스 로고 아님)
 */
import { clockOf, gameTime, NICKS, PLATFORMS, type Platform, type PublicPost } from '../game/community';
import { SECTOR_MAP, STOCK_MAP } from '../game/stocks';
import { Icon, SectorIcon } from './Icon';

export function PlatformIcon({ id, size = 30 }: { id: Platform; size?: number }) {
  const c = PLATFORMS[id].color;
  const g = (() => {
    switch (id) {
      case 'square': // 게시판: 목록 줄이 있는 말풍선
        return (
          <>
            <path d="M6 7.5 h16 a2.5 2.5 0 0 1 2.5 2.5 v8 a2.5 2.5 0 0 1 -2.5 2.5 h-9 l-4.5 3.5 v-3.5 h-2.5 a2.5 2.5 0 0 1 -2.5 -2.5 v-8 a2.5 2.5 0 0 1 2.5 -2.5 z" fill="#fff" />
            <path d="M8.5 12 h11 M8.5 15.5 h7.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case 'board': // 종목토론방: 오르는 선이 그려진 말풍선
        return (
          <>
            <path d="M5.5 8 h17 a2 2 0 0 1 2 2 v9 a2 2 0 0 1 -2 2 h-4 l-3.5 3.5 l-3.5 -3.5 h-6 a2 2 0 0 1 -2 -2 v-9 a2 2 0 0 1 2 -2 z" fill="#fff" />
            <path d="M8.5 17.5 l3.5 -3.5 l2.5 2 l4.5 -5" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );
      case 'chirp': // 짹짹: 동그란 병아리 (실제 서비스 로고와 다른 그림)
        return (
          <>
            <circle cx="14" cy="16.5" r="7.2" fill="#fff" />
            <circle cx="18.6" cy="10.8" r="4.2" fill="#fff" />
            <path d="M22.4 10.4 l3.4 1.1 l-3.4 1.2 z" fill="#ffb020" />
            <circle cx="19.4" cy="10.2" r="0.95" fill={c} />
            <path d="M10.5 16.5 q3 2.6 6.5 0" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
          </>
        );
      case 'feedgram': // 피드그램: 사진 액자(산·해)
        return (
          <>
            <rect x="6" y="7.5" width="18" height="15" rx="2.5" fill="#fff" />
            <path d="M7.8 20.5 l4.6 -5.4 l3.2 3.5 l2.4 -2.6 l4.2 4.5 z" fill={c} />
            <circle cx="19.2" cy="11.6" r="1.8" fill={c} />
          </>
        );
      case 'talk': // 개미톡 오픈채팅: 겹친 말풍선
        return (
          <>
            <ellipse cx="13.5" cy="13" rx="8" ry="6" fill="#fff" />
            <path d="M9.5 17.5 l-2 3.8 l4.6 -2.3 z" fill="#fff" />
            <ellipse cx="18.5" cy="18" rx="5.5" ry="4.2" fill="#fff" stroke={c} strokeWidth="1.5" />
          </>
        );
      case 'live': // 주식 방송: 안테나 달린 TV + 'LIVE' 점
        return (
          <>
            <path d="M11 6.5 l4 3.5 l4 -3.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="5.5" y="10" width="19" height="13" rx="2.5" fill="#fff" />
            <circle cx="10" cy="16.5" r="2" fill={c} />
            <path d="M14 14.5 h7 M14 18.5 h5" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
          </>
        );
    }
  })();
  return (
    <svg className="pf-icon" width={size} height={size} viewBox="0 0 30 30" role="img" aria-label={PLATFORMS[id].name}>
      <rect width="30" height="30" rx="8" fill={c} />
      {g}
    </svg>
  );
}

export function Post({ p, onSelect, onSelectSector, past, time, daySec }: { p: PublicPost; onSelect: (s: string) => void; onSelectSector: (s: string) => void; past?: boolean; /** 시각 대신 보일 글 ('장 전') */ time?: string; daySec?: number }) {
  const pf = PLATFORMS[p.platform];
  const target = p.symbol && STOCK_MAP[p.symbol] ? STOCK_MAP[p.symbol].name : (SECTOR_MAP[p.sector]?.name ?? p.sector);
  return (
    <li className={'cf-post pf-' + p.platform + (p.verified ? ' is-verified' : '') + (p.verdict ? ' v-' + p.verdict : '')}>
      <PlatformIcon id={p.platform} size={34} />
      <div className="cf-main">
        <div className="cp-head">
          <b className="cf-author">
            {p.author}
            {p.verified && (
              // 인증 배지: 이 게임만의 톱니 도장 + '인증' 글자 (진짜라는 보증이 아니라 '본인 맞음' 표시)
              <span className="cf-verified" role="img" title="인증된 계정이에요 — 본인이 맞다는 표시예요. 글이 더 잘 맞지만 틀릴 때도 있어요" aria-label="인증된 계정">
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                  <path d="M8 .8 l1.9 1.4 2.3 -.1 .7 2.2 1.9 1.4 -.7 2.2 .7 2.2 -1.9 1.4 -.7 2.2 -2.3 -.1 L8 15.2 6.1 13.8 3.8 13.9 3.1 11.7 1.2 10.3 1.9 8.1 1.2 5.9 3.1 4.5 3.8 2.3 6.1 2.4 Z" fill="#fff" />
                  <path d="M5 8.2 l2 2 l4 -4.2" fill="none" stroke="#6b58ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                인증
              </span>
            )}
          </b>
          <span className="cf-meta">
            {pf.name} · {past ? `${p.day + 1}일차 ` : ''}
            {time ?? (daySec ? gameTime(p.at, daySec) : clockOf(p.at))}
          </span>
        </div>
        <p className="cf-text">{p.text}</p>
        <div className="cf-foot">
          <button className={'sp-tag ' + p.tone} onClick={() => (p.symbol && STOCK_MAP[p.symbol] ? onSelect(p.symbol) : onSelectSector(p.sector))} title={p.symbol ? '이 종목 보기' : '이 업종 종목 보기'}>
            <SectorIcon id={p.sector} /> #{target} {p.tone === 'good' ? '호재설' : '악재설'}
          </button>
          <span className="sp-stat" aria-label={`공감 ${p.likes}`}>
            <Icon name="heart" size={13} /> {p.likes.toLocaleString('ko-KR')}
          </span>
          <span className="sp-stat" aria-label={`댓글 ${p.replies}`}>
            <Icon name="chat" size={13} /> {p.replies}
          </span>
        </div>
      </div>
      {p.verdict && <em className={'rb-stamp ' + p.verdict}>{p.verdict === 'true' ? '맞았어요' : '헛소문'}</em>}
    </li>
  );
}

/** 오늘 장중 피드(새 글이 위) + 지난 글(진위가 밝혀진 것) */
export function CommunityFeed({ today, past, day, live, daySec, onSelect, onSelectSector }: { today: PublicPost[]; past: PublicPost[]; day: number; live: boolean; daySec?: number; onSelect: (s: string) => void; onSelectSector: (s: string) => void }) {
  const now = [...today].sort((a, b) => b.at - a.at);
  const old = past.filter((p) => p.day === day - 1).sort((a, b) => b.at - a.at);
  return (
    <section className="cf" aria-label="커뮤니티·SNS 실시간 글">
      <header className="rb-head">
        <b>실시간 커뮤니티·SNS</b>
        {live && (
          <span className="rb-live">
            <i aria-hidden />
            지금 올라오는 글
          </span>
        )}
        <small className="muted">보라색 '인증' 배지가 붙은 사람(대표·애널리스트 등)의 글은 더 잘 맞지만 틀릴 수도 있어요. 헛소문도 잠깐은 가격을 흔들어요.</small>
      </header>
      {now.length === 0 ? (
        <p className="muted small cf-empty">{live ? '아직 오늘 올라온 글이 없어요. 장중에 수시로 올라와요.' : '장이 열리면 글이 올라오기 시작해요.'}</p>
      ) : (
        <ul className="cf-list">
          {now.map((p) => (
            <Post key={p.id} p={p} daySec={daySec} onSelect={onSelect} onSelectSector={onSelectSector} />
          ))}
        </ul>
      )}
      {old.length > 0 && (
        <details className="cf-old">
          <summary>어제 올라온 글 {old.length}개 (맞았는지 보기)</summary>
          <ul className="cf-list">
            {old.map((p) => (
              <Post key={p.id} p={p} past daySec={daySec} onSelect={onSelect} onSelectSector={onSelectSector} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** (v20+) 장 전 커뮤니티 글을 실시간 피드와 같은 모양으로 — 플랫폼·글쓴이는 글 내용으로만 정한 꾸밈(진위와 상관없음) */
export function PrePosts({ rumors, day, daySec, onSelect, onSelectSector }: { daySec?: number; rumors: { text: string; sector: string; symbol?: string; tone: 'good' | 'bad'; verdict?: 'true' | 'false' }[]; day: number; onSelect: (s: string) => void; onSelectSector: (s: string) => void }) {
  const ids: Platform[] = ['square', 'board', 'chirp', 'feedgram', 'talk', 'live'];
  const nicks = NICKS;
  const h = (t: string) => {
    let x = 2166136261;
    for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return (
    <ul className="cf-list">
      {rumors
        .map((r, i) => ({ r, i, k: h(day + ':' + r.text) }))
        .sort((a, b) => ((b.k >>> 21) % 49) - ((a.k >>> 21) % 49))
        .map(({ r, i, k }) => {
        const p: PublicPost = { id: 'pre-' + i, day, at: 0, platform: ids[k % ids.length], author: nicks[(k >>> 4) % nicks.length] + ((k >>> 9) % 2 ? String(10 + ((k >>> 11) % 90)) : ''), verified: null, text: r.text, symbol: r.symbol, sector: r.sector, tone: r.tone, likes: 20 + ((k >>> 13) % 600), replies: (k >>> 17) % 90, verdict: r.verdict };
        return <Post key={i} p={p} time={daySec ? '장 전' : `장 전 08:${String(10 + ((k >>> 21) % 49)).padStart(2, '0')}`} onSelect={onSelect} onSelectSector={onSelectSector} />;
      })}
    </ul>
  );
}
