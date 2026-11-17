/**
 * PC 게임 클라이언트 틀: 위 메뉴바(로고 · 플레이 · 메뉴 · 내 계정) + 오른쪽 소셜 패널(파티 · 친구)
 * 1280px 이상은 소셜 패널이 늘 보이고, 861~1279px 은 위 메뉴의 친구 버튼으로 열고 닫음. 860px 이하는 모바일 틀(아래 탭바)
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Loading } from './ui';
import { Icon } from './Icon';
import { AccountChip, Brand, type NavTab } from './LobbyNav';
import type { AccountState } from '../net/account';
import { api } from '../net/api';
import { refreshFriends, useFriends } from '../screens/Friends';
import { pokeInvites } from './InviteCenter';
import { okWhileMatching } from '../net/matchStore';
import type { PartyState } from './PartyPanel';
import { tierShort } from './TierBadge';
import { Avatar } from './Avatar';
import { HoverPop } from './HoverPop';

type IconName = Parameters<typeof Icon>[0]['name'];
const MAIN: [NavTab, string][] = [
  ['ranked', '랭킹전'],
  ['casual', '일반전'],
  ['custom', '커스텀'],
  ['practice', '연습'],
];
const SUB: [NavTab, string, IconName][] = [
  ['ranking', '랭킹', 'crown'],
  ['records', '업적', 'medal'],
  ['companies', '공부', 'book'],
  ['more', '설정', 'settings'],
];

export function TopBar({
  active,
  account,
  online,
  onGo,
  onPlay,
  playLabel,
  matching,
  onCancelMatch,
  onProfile,
  onLogin,
  socialBadge,
  onSocial,
  socialOpen,
  adminUnread,
  onAdmin,
  missions,
  onSignup,
  playPicker,
}: {
  active: NavTab | null;
  account: AccountState;
  online: boolean;
  onGo: (t: NavTab) => void;
  onPlay: () => void;
  /** 플레이 버튼 아래: 마지막에 찾던 설정 */
  playLabel?: string;
  /** 매칭 대기 중이면 대기열·흐르는 시간 */
  matching?: { text: string; time: string; linking: boolean } | null;
  onCancelMatch?: () => void;
  onProfile: () => void;
  onLogin: () => void;
  socialBadge: number;
  onSocial: () => void;
  socialOpen: boolean;
  /** 운영자 계정이면 의견함 (안 읽은 수). 운영자가 아니면 undefined */
  adminUnread?: number;
  onAdmin?: () => void;
  /** 오늘의 미션 버튼 (마우스를 올리면 팝업) */
  missions?: ReactNode;
  onSignup?: () => void;
  /** 플레이에 마우스를 올리면 뜨는 모드 고르기 */
  playPicker?: ReactNode;
}) {
  return (
    <header className="cl-top">
      <div className="cl-left">
        <Brand />
        {online && (
          matching ? (
            <span className="cl-play-wrap">
              <button className="cl-play searching" onClick={onPlay} title="찾고 있는 대결 보기">
                <span>{matching.linking ? '방 만드는 중' : '매칭 중'} {matching.time}</span>
                <small>{matching.text}</small>
              </button>
              {!matching.linking && (
                <button className="cl-play-x" onClick={onCancelMatch} aria-label="그만 찾기" title="그만 찾기">
                  <Icon name="x" size={16} />
                </button>
              )}
            </span>
          ) : (
            playPicker ? (
              // 누르면 바로 찾기, 마우스를 0.3초 올려 두면 모드 고르기 팝업
              <HoverPop
                className="play-hpop"
                btnClass="cl-play"
                label={playLabel ? `플레이: ${playLabel}으로 바로 찾기 (마우스를 올리면 모드 바꾸기)` : '플레이'}
                openDelay={300}
                onButtonClick={onPlay}
                button={
                  <>
                    <span>플레이</span>
                    {playLabel && <small>{playLabel}</small>}
                  </>
                }
              >
                {playPicker}
              </HoverPop>
            ) : (
              <button className="cl-play" onClick={onPlay} title={playLabel ? `${playLabel}으로 바로 매칭 대기` : undefined}>
                <span>플레이</span>
                {playLabel && <small>{playLabel}</small>}
              </button>
            )
          )
        )}
      </div>
      <nav className="cl-nav" aria-label="메뉴">
        {MAIN.filter(([k]) => online || k === 'practice').map(([k, label]) => (
          <button key={k} className={'cl-tab' + (active === k ? ' on' : '')} aria-current={active === k ? 'page' : undefined} onClick={() => onGo(k)}>
            {label}
          </button>
        ))}
        <span className="cl-sep" aria-hidden />
        {/* 보조 메뉴는 한 묶음으로 (대결 메뉴와 구분) */}
        <span className="cl-subs">
          {SUB.filter(([k]) => online || (k !== 'ranking' && k !== 'records')).map(([k, label, icon]) => (
            <button key={k} className={'cl-sub' + (active === k ? ' on' : '')} aria-current={active === k ? 'page' : undefined} onClick={() => onGo(k)} title={label}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
        </span>
      </nav>
      <div className="cl-right">
        {adminUnread !== undefined && onAdmin && <AdminInboxButton unread={adminUnread} onClick={onAdmin} />}
        {missions}
        <AccountChip account={account} online={online} onProfile={onProfile} onLogin={onLogin} onSignup={onSignup} />
        {online && (
          <button className={'cl-social-btn' + (socialOpen ? ' on' : '')} onClick={onSocial} aria-label="친구·파티" aria-expanded={socialOpen} title="친구·파티">
            <Icon name="users" size={18} />
            {socialBadge > 0 && <i className="ln-badge">{socialBadge > 9 ? '9+' : socialBadge}</i>}
          </button>
        )}
      </div>
    </header>
  );
}

/** 오른쪽 소셜 패널: 파티 칸 + 친구 목록(게임 중·접속 중·오프라인) + 받은 신청 */
export function SocialPanel({
  account,
  party,
  reloadParty,
  onFriends,
  onLogin,
  onSignup,
  onClose,
  onFold,
}: {
  account: AccountState;
  party: PartyState | null;
  reloadParty: () => Promise<void>;
  onFriends: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onClose?: () => void;
  /** 넓은 화면: 접기 (오른쪽 얇은 줄로) */
  onFold?: () => void;
}) {
  const member = account.status === 'member';
  const d = useFriends();
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (member) refreshFriends();
  }, [member]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(''), 3500);
    return () => clearTimeout(t);
  }, [note]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      setNote(ok);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const friends = d?.friends ?? [];
  const groups: [string, typeof friends][] = [
    ['게임 중', friends.filter((f) => f.status === 'playing')],
    ['접속 중', friends.filter((f) => f.status === 'online')],
    ['오프라인', friends.filter((f) => f.status === 'offline' || !f.status)],
  ];
  const inParty = !!party && party.members.length > 1;
  const canInvite = !party || (party.isLeader && party.members.length < 2);

  return (
    <aside className="cl-social" aria-label="친구·파티">
      <div className="cs-head">
        <b>소셜</b>
        {member && <small className="muted">{friends.filter((f) => f.status !== 'offline').length}명 접속 중</small>}
        <span className="grow" />
        {member && (
          <button className="icon-btn sm" onClick={onFriends} aria-label="친구 추가·관리" title="친구 추가·관리">
            <Icon name="userPlus" size={16} />
          </button>
        )}
        {onFold && (
          <button className="icon-btn sm cs-fold" onClick={onFold} aria-label="소셜 칸 접기" title="접기">
            <Icon name="right" size={16} />
          </button>
        )}
        {onClose && (
          <button className="icon-btn sm" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      {account.status === 'loading' ? (
        // 계정을 불러오는 동안은 비워 둠 (회원인데 손님 안내가 잠깐 보였다 바뀌지 않게)
        <div className="cs-guest" aria-busy="true" />
      ) : !member ? (
        <div className="cs-guest">
          <Icon name="users" size={28} />
          <p>로그인하면 친구를 추가하고, 파티로 같이 찾고, 1대1을 신청할 수 있어요.</p>
          <button className="btn sm primary" onClick={onSignup}>
            회원가입
          </button>
          <button className="btn sm ghost" onClick={onLogin}>
            로그인
          </button>
        </div>
      ) : (
        <>
          {party && (
          <div className="cs-party">
            <div className="cs-sub">
              파티 <small className="muted">일반전 다인전을 같이</small>
              {party && (
                <button
                  className="linkish-soft"
                  onClick={() =>
                    act('leave', async () => {
                      await api('partyLeave');
                      await reloadParty();
                    }, party.isLeader ? '파티를 없앴어요' : '파티에서 나왔어요')
                  }
                >
                  {party.isLeader ? '해산' : '나가기'}
                </button>
              )}
            </div>
            <div className="cs-slots">
              {(party?.members ?? [{ nickname: account.profile?.nickname ?? '나', rating: account.profile?.rating ?? 1000, ranked: account.profile?.ranked_games ?? 0, avatar: account.profile?.avatar, leader: true, me: true }]).map((m, i) => (
                <div key={i} className={'cs-slot filled' + (m.me ? ' me' : '')} title={`${m.nickname} · ${tierShort(m.rating, m.ranked)}`}>
                  <Avatar id={m.avatar} name={m.nickname} size={36} className="cs-av" />
                  <small>{m.nickname}</small>
                  {m.leader && inParty && <em>파티장</em>}
                </div>
              ))}
              {!inParty && (
                <div className="cs-slot empty" title="아래 친구 목록에서 '파티'를 눌러 부르세요">
                  <span className="cs-av">+</span>
                  <small>빈 자리</small>
                </div>
              )}
            </div>
          </div>
          )}

          {d && d.incoming.length > 0 && (
            <button className="cs-req" onClick={onFriends}>
              <Icon name="bell" size={14} /> 받은 친구 신청 {d.incoming.length}개 <Icon name="right" size={12} />
            </button>
          )}

          <div className="cs-list">
            {!d && <Loading inline />}
            {d && friends.length === 0 && (
              <div className="cs-empty">
                <p className="muted small">아직 친구가 없어요.</p>
                <button className="btn sm" onClick={onFriends}>
                  <Icon name="userPlus" size={14} /> 친구 추가
                </button>
              </div>
            )}
            {groups.map(([label, list]) =>
              list.length ? (
                <div key={label} className="cs-group">
                  <div className="cs-glabel">
                    {label} <small>{list.length}</small>
                  </div>
                  {list.map((f) => (
                    <div key={f.id} className={'cs-friend st-' + (f.status ?? 'offline')}>
                      <span className="cs-av-wrap">
                        <Avatar id={f.avatar} name={f.nickname} size={32} className="cs-av" />
                        <i className="cs-dot" />
                      </span>
                      <span className="cs-name">
                        <b>{f.nickname}</b>
                        <small>{f.status === 'playing' ? '게임 중' : f.status === 'online' ? '접속 중' : '오프라인'} · {tierShort(f.rating, f.ranked)}</small>
                      </span>
                      {f.status === 'online' && (
                        <span className="cs-act">
                          <button
                            className="cs-mini"
                            disabled={!!busy}
                            title="1대1 신청 (신속 · 점수 없음)"
                            onClick={() =>
                              okWhileMatching('1대1 신청은') &&
                              act('c' + f.id, async () => {
                                await api('challenge', { friendId: f.id, speed: 'quick' });
                                pokeInvites();
                              }, `${f.nickname} 님에게 1대1을 신청했어요`)
                            }
                          >
                            1대1
                          </button>
                          {canInvite && (
                            <button
                              className="cs-mini"
                              disabled={!!busy}
                              title="파티에 부르기 (일반전 다인전 같이 찾기)"
                              onClick={() =>
                                okWhileMatching('파티 부르기는') &&
                                act('p' + f.id, async () => {
                                  await api('partyInvite', { friendId: f.id });
                                  await reloadParty();
                                }, `${f.nickname} 님을 파티에 불렀어요`)
                              }
                            >
                              파티
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null,
            )}
          </div>
        </>
      )}
      {note && <div className="cs-note" role="status">{note}</div>}
    </aside>
  );
}

/** 운영자 전용 의견함 버튼 (위 메뉴에 고정, 안 읽은 의견 수) */
export function AdminInboxButton({ unread, onClick, compact }: { unread: number; onClick: () => void; compact?: boolean }) {
  return (
    <button className={'cl-admin' + (unread > 0 ? ' has' : '') + (compact ? ' compact' : '')} onClick={onClick} title="운영자 화면 (현황·의견함·공지)" aria-label={`운영자 화면, 안 읽은 의견 ${unread}개`}>
      <Icon name="bell" size={17} />
      {!compact && <span>운영자</span>}
      {unread > 0 && <i className="ln-badge">{unread > 99 ? '99+' : unread}</i>}
    </button>
  );
}
