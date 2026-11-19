/**
 * 로비 메뉴(네비) + 게스트 시작 안내
 * - PC(861px 이상): 왼쪽 세로 메뉴 (1180px 이상은 글자까지, 그 아래는 아이콘 + 작은 글자)
 * - 모바일·태블릿 세로(860px 이하): 화면 아래 탭바 5칸
 * - 게스트가 온라인 기능을 처음 누르면: 게스트/회원 차이를 보여 주고, '게스트로 시작'일 때만 닉네임을 받음
 */
import { nickNotice } from '../game/nickname';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { TierBadge, tierText } from './TierBadge';
import { HoverPop } from './HoverPop';
import { LevelMeter } from './Missions';
import { titleLabel, titleOf } from '../game/achievements';
import type { MyProfile } from '../net/account';
import { Avatar } from './Avatar';
import { api } from '../net/api';
import { loadNick } from '../session';
import type { AccountState } from '../net/account';
import { Welcome, type WelcomeStep } from './Welcome';

export type NavTab = 'ranked' | 'casual' | 'custom' | 'friends' | 'practice' | 'ranking' | 'records' | 'league' | 'companies' | 'more';

type IconName = Parameters<typeof Icon>[0]['name'];
const MAIN: [NavTab, string, IconName][] = [
  ['ranked', '랭킹전', 'trophy'],
  ['casual', '일반전', 'users'],
  ['custom', '커스텀', 'door'],
  ['friends', '친구', 'userPlus'],
  ['practice', '연습', 'target'],
];

const LAST = 'stockduel.tab';
/** 홈(/)에서 다시 열어 줄 '대결 메뉴' — 친구·설정 같은 화면은 기억하지 않음 */
const PLAY_TABS: NavTab[] = ['ranked', 'casual', 'custom', 'practice'];
export function lastTab(): NavTab {
  try {
    const v = localStorage.getItem(LAST);
    if (v && PLAY_TABS.includes(v as NavTab)) return v as NavTab;
  } catch {
    /* 저장소 없음 */
  }
  return 'casual';
}
export function rememberTab(t: NavTab) {
  if (!PLAY_TABS.includes(t)) return; // 대결 메뉴만 기억 (친구 화면 뒤 '홈으로'가 친구로 가지 않게)
  try {
    localStorage.setItem(LAST, t);
  } catch {
    /* 무시 */
  }
}

interface NavProps {
  active: NavTab | null;
  account: AccountState;
  online: boolean;
  onGo: (t: NavTab) => void;
  onProfile: () => void;
  onLogin: () => void;
  footer?: ReactNode;
  /** 메뉴 칸 옆 숫자 (받은 친구 신청 등) */
  badges?: Partial<Record<NavTab, number>>;
}
const Badge = ({ n }: { n?: number }) => (n ? <i className="ln-badge" aria-label={`새 알림 ${n}개`}>{n > 9 ? '9+' : n}</i> : null);

export function Brand({ compact }: { compact?: boolean }) {
  // 개미리그 가로형 로고 (어두운 배경용). 좁은 곳에서는 마크만
  return (
    <span className="ln-brand">
      {compact ? <img src="/brand/mark.svg" alt="개미리그" width={30} height={30} /> : <img src="/brand/logo-dark.svg" alt="개미리그" height={30} />}
    </span>
  );
}

/** 회원이면 프로필 칩, 게스트면 로그인 버튼, 확인 중이면 빈 자리 */
export function AccountChip({ account, online, onProfile, onLogin, onSignup, compact, plain }: { account: AccountState; online: boolean; onProfile: () => void; onLogin: () => void; onSignup?: () => void; compact?: boolean; /** 팝업 없이 누르면 바로 프로필 (더보기 화면 등) */ plain?: boolean }) {
  if (!online) return null;
  if (account.status === 'member' && account.profile && !plain) {
    const p = account.profile;
    return (
      <HoverPop
        className={'acc-pop' + (compact ? ' compact' : '')}
        btnClass={'acc-chip' + (compact ? ' compact' : '')}
        label={`내 프로필: ${p.nickname}`}
        // 누르면 바로 마이프로필 (팝업은 마우스를 올렸을 때만)
        onButtonClick={onProfile}
        btnTitle="마이프로필"
        button={
          <>
            <Avatar id={p.avatar} name={p.nickname} size={30} className="acc-av" />
            {!compact && (
              <span className="acc-txt">
                <b>{p.nickname}</b>
              </span>
            )}
          </>
        }
      >
        <ProfileCard p={p} badges={account.badges} onProfile={onProfile} />
      </HoverPop>
    );
  }
  if (account.status === 'member' && account.profile)
    return (
      <button className={'acc-chip' + (compact ? ' compact' : '')} onClick={onProfile} aria-label="마이프로필">
        <Avatar id={account.profile.avatar} name={account.profile.nickname} size={30} className="acc-av" />
        <span className="acc-txt">
          <b>{account.profile.nickname}</b>
          <small>{tierText(account.profile.rating, account.profile.ranked_games, account.profile.chal)}</small>
        </span>
      </button>
    );
  if (account.status === 'guest' && !plain) {
    const nick = loadNick() || '게스트';
    return (
      <HoverPop
        className={'acc-pop' + (compact ? ' compact' : '')}
        btnClass={'acc-chip guest' + (compact ? ' compact' : '')}
        label="게스트로 하는 중 — 로그인·회원가입"
        button={
          <>
            <Avatar name={nick} guest size={30} className="acc-av" />
            {!compact && (
              <span className="acc-txt">
                <b>게스트</b>
              </span>
            )}
          </>
        }
      >
        <section className="panel pad pfc">
          <div className="pfc-head">
            <Avatar name={nick} guest size={52} className="pfc-av" />
            <span className="pfc-name">
              <b>게스트로 하는 중</b>
              <small className="muted">{nick === '게스트' ? '닉네임은 처음 대결할 때 정해요' : `닉네임: ${nick}`}</small>
            </span>
          </div>
          <p className="muted small pfc-note">회원이 되면 전적·랭킹전·미션 경험치·레벨·친구가 남아요. 지금까지 한 판도 그대로 이어져요.</p>
          <div className="pfc-acts">
            {onSignup && (
              <button className="btn sm primary" onClick={onSignup}>
                회원가입
              </button>
            )}
            <button className="btn sm" onClick={onLogin}>
              로그인
            </button>
          </div>
        </section>
      </HoverPop>
    );
  }
  if (account.status === 'guest' || account.status === 'visitor')
    return (
      <button className={'btn sm primary ln-login' + (compact ? ' compact' : '')} onClick={onLogin}>
        <Icon name="userPlus" size={14} /> 로그인
      </button>
    );
  return <span className="acc-chip-skel" aria-hidden />;
}

/** 메뉴바 내 프로필 팝업: 사진·닉네임·칭호 · 티어 · 레벨(경험치) · 전적 */
function ProfileCard({ p, badges, onProfile }: { p: MyProfile; badges?: Record<string, number>; onProfile: () => void }) {
  // 고른 칭호가 없으면 마이프로필처럼 가장 귀한 업적 칭호를 보여 줌
  const title = titleLabel(p.title)?.name || titleOf(Object.keys(badges ?? {}))?.name || '칭호 없음';
  const rate = p.games > 0 ? Math.round((p.wins / p.games) * 100) : null;
  return (
    <section className="panel pad pfc">
      <div className="pfc-head">
        <Avatar id={p.avatar} name={p.nickname} size={52} className="pfc-av" />
        <span className="pfc-name">
          <b>{p.nickname}</b>
          <small className="muted">{title}</small>
        </span>
      </div>
      <div className="pfc-row">
        <TierBadge rating={p.rating} rankedGames={p.ranked_games} size={34} chal={p.chal} />
        {p.rankPos ? <small className="muted">랭킹 {p.rankPos}위</small> : null}
      </div>
      <LevelMeter xp={p.xp ?? 0} className="pfc-level" title="미션·대결로 경험치를 모아 레벨을 올려요 (최대 Lv.100)" />
      <dl className="pfc-stats">
        <div>
          <dt>판 수</dt>
          <dd>{p.games}</dd>
        </div>
        <div>
          <dt>1위</dt>
          <dd>{p.wins}</dd>
        </div>
        <div>
          <dt>승률</dt>
          <dd>{rate === null ? '-' : rate + '%'}</dd>
        </div>
      </dl>
      <button className="btn sm" onClick={onProfile}>
        마이프로필 열기
      </button>
    </section>
  );
}

/** 모바일·태블릿 세로: 아래 탭바 */
export function BottomNav({ active, onGo, online, badges }: Pick<NavProps, 'active' | 'onGo' | 'online' | 'badges'>) {
  // 아래 탭은 5칸: 연습은 온라인이면 '더보기' 안으로
  const tabs: [NavTab, string, IconName][] = [...MAIN.filter(([k]) => (online ? k !== 'practice' : k === 'practice')), ['more', '더보기', 'grid']];
  const isSub = active !== null && !tabs.some(([k]) => k === active);
  return (
    <nav className="lobby-bottom" aria-label="메뉴">
      {tabs.map(([k, label, icon]) => {
        const on = active === k || (k === 'more' && isSub);
        return (
          <button key={k} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => onGo(k)}>
            <span className="ln-ic">
              <Icon name={icon} size={20} />
              <Badge n={badges?.[k]} />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ================= 게스트 시작 안내 ================= */

const nickValid = (n: string) => n.trim().length >= 1 && n.trim().length <= 10 && !nickNotice(n);

/**
 * '하는' 버튼 앞에 끼우는 확인 (design/onboarding.md).
 * - 둘러보기 중(세션 없음) → 환영 창(게스트로 시작 / 로그인 / 회원가입) → 고르면 실행
 * - 게스트인데 닉네임이 없음 → 닉네임 → 실행
 * - 회원·닉네임 있는 게스트·인터넷 설정 없음 → 바로 실행
 * open(step) 으로 직접 띄울 수도 있음 (처음 온 사람·설정의 '시작하기')
 */
export function useGuestGate(account: AccountState, online: boolean, onSignup: () => void, onLogin: () => void) {
  const [pending, setPending] = useState<null | { fn: () => void; step: WelcomeStep }>(null);
  const visitor = online && (account.status === 'visitor' || account.status === 'loading');
  const guard = (fn: () => void) => {
    if (!online || account.status === 'member') return fn();
    if (account.status === 'guest' && nickValid(loadNick())) return fn();
    setPending({ fn, step: account.status === 'guest' ? 'nick' : 'intro' });
  };
  const open = (step: WelcomeStep = 'intro', fn: () => void = () => {}) => setPending({ fn, step });
  const el = pending ? (
    <Welcome
      key={pending.step}
      initial={pending.step}
      visitor={visitor}
      onClose={() => setPending(null)}
      onSignup={() => (setPending(null), onSignup())}
      onLogin={() => (setPending(null), onLogin())}
      onStart={() => {
        const fn = pending.fn;
        setPending(null);
        fn();
      }}
    />
  ) : null;
  return { guard, open, el, visitor };
}

export type NickCheck = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';
/** 게스트 닉네임: 입력할 때마다(잠깐 멈추면) 형식·회원 닉네임과 겹치는지 확인 (게스트 시작 창·설정 화면) */
export function useNickCheck(nick: string, on: boolean): NickCheck {
  const [check, setCheck] = useState<NickCheck>('idle');
  const seq = useRef(0);
  useEffect(() => {
    if (!on) return;
    if (!nickValid(nick)) return setCheck(nick ? 'invalid' : 'idle');
    const my = ++seq.current;
    setCheck('checking');
    const t = setTimeout(() => {
      api<{ nickname?: string }>('checkAvailable', { nickname: nick.trim() })
        .then((r) => my === seq.current && setCheck(r.nickname === 'taken' ? 'taken' : r.nickname === 'invalid' ? 'invalid' : 'ok'))
        .catch(() => my === seq.current && setCheck('ok')); // 확인 못 해도 서버가 들어갈 때 다시 확인
    }, 400);
    return () => clearTimeout(t);
  }, [nick, on]);
  return check;
}
