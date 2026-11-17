/**
 * 로비 메뉴(네비) + 게스트 시작 안내
 * - PC(861px 이상): 왼쪽 세로 메뉴 (1180px 이상은 글자까지, 그 아래는 아이콘 + 작은 글자)
 * - 모바일·태블릿 세로(860px 이하): 화면 아래 탭바 5칸
 * - 게스트가 온라인 기능을 처음 누르면: 게스트/회원 차이를 보여 주고, '게스트로 시작'일 때만 닉네임을 받음
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useDialogFocus } from './ui';
import { TierBadge, tierText } from './TierBadge';
import { HoverPop } from './HoverPop';
import { LevelMeter } from './Missions';
import type { MyProfile } from '../net/account';
import { Avatar } from './Avatar';
import { api } from '../net/api';
import { loadNick, saveNick } from '../session';
import type { AccountState } from '../net/account';

export type NavTab = 'ranked' | 'casual' | 'custom' | 'friends' | 'practice' | 'ranking' | 'records' | 'companies' | 'more';

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
        <ProfileCard p={p} onProfile={onProfile} />
      </HoverPop>
    );
  }
  if (account.status === 'member' && account.profile)
    return (
      <button className={'acc-chip' + (compact ? ' compact' : '')} onClick={onProfile} aria-label="마이프로필">
        <Avatar id={account.profile.avatar} name={account.profile.nickname} size={30} className="acc-av" />
        <span className="acc-txt">
          <b>{account.profile.nickname}</b>
          <small>{tierText(account.profile.rating, account.profile.ranked_games)}</small>
        </span>
      </button>
    );
  if (account.status === 'guest' && !plain) {
    const nick = loadNick() || '손님';
    return (
      <HoverPop
        className={'acc-pop' + (compact ? ' compact' : '')}
        btnClass={'acc-chip guest' + (compact ? ' compact' : '')}
        label="손님으로 하는 중 — 로그인·회원가입"
        button={
          <>
            <Avatar name={nick} guest size={30} className="acc-av" />
            {!compact && (
              <span className="acc-txt">
                <b>손님</b>
              </span>
            )}
          </>
        }
      >
        <section className="panel pad pfc">
          <div className="pfc-head">
            <Avatar name={nick} guest size={52} className="pfc-av" />
            <span className="pfc-name">
              <b>{nick === '손님' ? '손님' : nick}</b>
              <small className="muted">손님으로 하는 중</small>
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
  if (account.status === 'guest')
    return (
      <button className={'btn sm primary ln-login' + (compact ? ' compact' : '')} onClick={onLogin}>
        <Icon name="userPlus" size={14} /> 로그인
      </button>
    );
  return <span className="acc-chip-skel" aria-hidden />;
}

/** 메뉴바 내 프로필 팝업: 사진·닉네임·칭호 · 티어 · 레벨(경험치) · 전적 */
function ProfileCard({ p, onProfile }: { p: MyProfile; onProfile: () => void }) {
  const rate = p.games > 0 ? Math.round((p.wins / p.games) * 100) : null;
  return (
    <section className="panel pad pfc">
      <div className="pfc-head">
        <Avatar id={p.avatar} name={p.nickname} size={52} className="pfc-av" />
        <span className="pfc-name">
          <b>{p.nickname}</b>
          <small className="muted">{p.title ?? '칭호 없음'}</small>
        </span>
      </div>
      <div className="pfc-row">
        <TierBadge rating={p.rating} rankedGames={p.ranked_games} size={34} />
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

const nickValid = (n: string) => n.trim().length >= 1 && n.trim().length <= 10;

/**
 * 온라인 기능 앞에 끼우는 확인. 회원이거나 이미 게스트 닉네임이 있으면 바로 실행,
 * 아니면 안내 창 → (게스트로 시작) 닉네임 → 실행
 */
export function useGuestGate(account: AccountState, online: boolean, onSignup: () => void, onLogin: () => void) {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const guard = (fn: () => void) => {
    if (!online || account.status === 'member' || nickValid(loadNick())) return fn();
    setPending(() => fn);
  };
  const el = pending ? (
    <GuestStart
      onClose={() => setPending(null)}
      onSignup={() => (setPending(null), onSignup())}
      onLogin={() => (setPending(null), onLogin())}
      onStart={() => {
        const fn = pending;
        setPending(null);
        fn();
      }}
    />
  ) : null;
  return { guard, el };
}

function GuestStart({ onClose, onSignup, onLogin, onStart }: { onClose: () => void; onSignup: () => void; onLogin: () => void; onStart: () => void }) {
  const [step, setStep] = useState<'intro' | 'nick'>('intro');
  const [nick, setNick] = useState(loadNick());
  const [check, setCheck] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const seq = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // 입력할 때마다(잠깐 멈추면) 회원 닉네임과 겹치는지 확인
  useEffect(() => {
    if (step !== 'nick') return;
    if (!nickValid(nick)) return setCheck(nick ? 'invalid' : 'idle');
    const my = ++seq.current;
    setCheck('checking');
    const t = setTimeout(() => {
      api<{ nickname?: string }>('checkAvailable', { nickname: nick.trim() })
        .then((r) => my === seq.current && setCheck(r.nickname === 'taken' ? 'taken' : r.nickname === 'invalid' ? 'invalid' : 'ok'))
        .catch(() => my === seq.current && setCheck('ok')); // 확인 못 해도 서버가 들어갈 때 다시 확인
    }, 400);
    return () => clearTimeout(t);
  }, [nick, step]);
  const ready = nickValid(nick) && (check === 'ok' || check === 'checking');
  const go = () => {
    if (!nickValid(nick) || check === 'taken' || check === 'invalid') return;
    saveNick(nick.trim());
    onStart();
  };
  const boxRef = useDialogFocus<HTMLDivElement>();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={boxRef} tabIndex={-1} className="modal guest-start" role="dialog" aria-modal aria-label="게스트로 시작하기" onClick={(e) => e.stopPropagation()}>
        {step === 'intro' ? (
          <>
            <h3>
              <Icon name="userPlus" size={18} /> 어떻게 시작할까요?
            </h3>
            <p className="muted small">회원가입은 무료예요. 아이디·비밀번호·닉네임만 받고 이메일·전화번호는 받지 않아요.</p>
            <table className="gs-compare">
              <thead>
                <tr>
                  <th />
                  <th>게스트</th>
                  <th className="gs-member">회원</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>일반전 · 커스텀 방</td>
                  <td className="y">가능</td>
                  <td className="y">가능</td>
                </tr>
                <tr>
                  <td>랭킹전 · 랭킹 등록</td>
                  <td className="n">안 돼요</td>
                  <td className="y">가능</td>
                </tr>
                <tr>
                  <td>기록 보관</td>
                  <td className="n">이 기기에만 (브라우저 기록을 지우면 사라져요)</td>
                  <td className="y">어느 기기든 로그인하면 그대로</td>
                </tr>
                <tr>
                  <td>닉네임</td>
                  <td className="n">다른 게스트와 겹칠 수 있어요</td>
                  <td className="y">나만 쓰는 닉네임 · 회원 표시</td>
                </tr>
              </tbody>
            </table>
            <div className="gs-actions">
              <button className="btn primary full" onClick={onSignup}>
                <Icon name="userPlus" size={16} /> 회원가입하고 시작
              </button>
              <button className="btn full" onClick={onLogin}>
                이미 회원이에요 · 로그인
              </button>
              <button className="btn ghost full" onClick={() => setStep('nick')}>
                게스트로 시작
              </button>
            </div>
            <small className="muted">게스트로 하다가 나중에 가입해도 지금 기록이 그대로 이어져요.</small>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <h3>
              <Icon name="users" size={18} /> 게스트 닉네임
            </h3>
            <label className={'field' + (check === 'ok' ? ' good' : check === 'taken' || check === 'invalid' ? ' invalid' : '')}>
              <span>대결에서 보일 이름 (1~10자)</span>
              <input autoFocus value={nick} maxLength={10} placeholder="예: 개미왕" onChange={(e) => setNick(e.target.value)} />
              {check === 'taken' && <small className="error">회원이 쓰는 닉네임이에요. 다른 닉네임을 써 주세요.</small>}
              {check === 'invalid' && nick && <small className="error">1~10자, 글자·숫자로 정해 주세요.</small>}
              {check === 'ok' && <small className="good-msg">쓸 수 있어요</small>}
            </label>
            <small className="muted">나중에 '설정·더보기'에서 바꿀 수 있어요.</small>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setStep('intro')}>
                뒤로
              </button>
              <button type="submit" className="btn primary" disabled={!ready}>
                게스트로 시작
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
