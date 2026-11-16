/**
 * 로비 메뉴(네비) + 게스트 시작 안내
 * - PC(861px 이상): 왼쪽 세로 메뉴 (1180px 이상은 글자까지, 그 아래는 아이콘 + 작은 글자)
 * - 모바일·태블릿 세로(860px 이하): 화면 아래 탭바 5칸
 * - 게스트가 온라인 기능을 처음 누르면: 게스트/회원 차이를 보여 주고, '게스트로 시작'일 때만 닉네임을 받음
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { tierText } from './TierBadge';
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
const SUB: [NavTab, string, IconName][] = [
  ['ranking', '랭킹', 'crown'],
  ['records', '업적', 'medal'],
  ['companies', '기업 공부', 'book'],
  ['more', '설정·더보기', 'settings'],
];

const LAST = 'stockduel.tab';
export function lastTab(): NavTab {
  try {
    const v = localStorage.getItem(LAST);
    if (v && [...MAIN, ...SUB].some(([k]) => k === v)) return v as NavTab;
  } catch {
    /* 저장소 없음 */
  }
  return 'casual';
}
export function rememberTab(t: NavTab) {
  if (!MAIN.some(([k]) => k === t)) return; // 큰 메뉴(대결 종류)만 기억
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

export function Brand() {
  // 같은 화면에 로고가 두 번(숨긴 왼쪽 메뉴·위 머리줄) 있어도 색이 사라지지 않게 id 를 따로
  const gid = 'lng' + useId().replace(/:/g, '');
  return (
    <span className="ln-brand">
      <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden>
        <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
        <path d="M14 42 L26 30 L34 36 L50 20" stroke="#0b0d12" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="50" cy="20" r="4" fill="#0b0d12" />
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#f5b83d" />
          </linearGradient>
        </defs>
      </svg>
      <b>
        주식 <em>대결</em>
      </b>
    </span>
  );
}

/** 회원이면 프로필 칩, 게스트면 로그인 버튼, 확인 중이면 빈 자리 */
export function AccountChip({ account, online, onProfile, onLogin, compact }: { account: AccountState; online: boolean; onProfile: () => void; onLogin: () => void; compact?: boolean }) {
  if (!online) return null;
  if (account.status === 'member' && account.profile)
    return (
      <button className={'acc-chip' + (compact ? ' compact' : '')} onClick={onProfile} aria-label="마이프로필">
        <span className="acc-av">{account.profile.nickname.slice(0, 1)}</span>
        <span className="acc-txt">
          <b>{account.profile.nickname}</b>
          <small>{tierText(account.profile.rating, account.profile.ranked_games)}</small>
        </span>
      </button>
    );
  if (account.status === 'guest')
    return (
      <button className={'btn sm primary ln-login' + (compact ? ' compact' : '')} onClick={onLogin}>
        <Icon name="userPlus" size={14} /> 로그인
      </button>
    );
  return <span className="acc-chip-skel" aria-hidden />;
}

/** PC·태블릿 가로: 왼쪽 세로 메뉴 */
export function SideNav({ active, account, online, onGo, onProfile, onLogin, footer, badges }: NavProps) {
  const item = ([k, label, icon]: [NavTab, string, IconName]) => (
    <button key={k} className={'ln-item' + (active === k ? ' on' : '')} aria-current={active === k ? 'page' : undefined} onClick={() => onGo(k)}>
      <span className="ln-ic">
        <Icon name={icon} size={20} />
        <Badge n={badges?.[k]} />
      </span>
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="lobby-side" aria-label="메뉴">
      <Brand />
      <div className="ln-acc">
        <AccountChip account={account} online={online} onProfile={onProfile} onLogin={onLogin} />
      </div>
      <div className="ln-group">{MAIN.filter(([k]) => online || k === 'practice').map(item)}</div>
      <div className="ln-sep" />
      <div className="ln-group sub">{SUB.filter(([k]) => online || (k !== 'ranking' && k !== 'records')).map(item)}</div>
      <div className="ln-foot">{footer}</div>
    </nav>
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
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal guest-start" role="dialog" aria-modal aria-label="게스트로 시작하기" onClick={(e) => e.stopPropagation()}>
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
