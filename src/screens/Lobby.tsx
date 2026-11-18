import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LeagueResultNote } from './LeagueNote';
import { NoticeCenter, NoticeTicker, useHasUnreadNotice } from '../components/NoticeBar';
import { InAppBanner } from '../components/InAppBanner';
import { gameOpenElsewhere } from '../lib/activeTab';
import { EmptyState, ErrorState, IconList, Loading, Toast, useDialogFocus, useEscape, OfflineBanner } from '../components/ui';
import { flashLeft, peekFlash } from '../lib/flash';
import { ask } from '../components/ConfirmHost';
import { FitText } from '../components/FitText';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { FIND_AGAIN, loadPref as loadMatchPref, MatchFinder, playLabel, PlayPicker, PREF_EVENT } from '../components/MatchFinder';
import { cancelMatch, followMatch, getMatch, mmss, okWhileMatching, queueText, useMatch } from '../net/matchStore';
import { Avatar } from '../components/Avatar';
import { TierBadge, TierLadder, tierText } from '../components/TierBadge';
import { DIV_POINTS, ELO_K, isPlaced, PLACEMENT_GAMES, PLACEMENT_MULT, tierOf } from '../game/tier';
import { AccountSection } from '../components/AccountSection';
import { setFlash } from '../lib/flash';
import { CoachTour } from '../components/CoachTour';
import { GROWTH_STEPS, HOME_STEPS, TutorialMenu, TutorialOffer } from '../components/Tours';
import { currentChapter, doneChapters, finishChapter, shouldOfferTutorial, tourSkipped, startTour, stopTour, useChapter, type Chapter } from '../lib/onboarding';
import { markWelcomeSeen, welcomeSeen } from '../session';
import { AccountChip, BottomNav, Brand, lastTab, rememberTab, useGuestGate, useNickCheck, type NavTab } from '../components/LobbyNav';
import { AdminInboxButton, SocialPanel, TopBar } from '../components/ClientChrome';
// 가끔 여는 화면(공부·운영자·계정)은 열 때 받음 — 첫 화면을 가볍게
const NoticesPage = lazy(() => import('./Notices').then((m) => ({ default: m.NoticesPage })));
const League = lazy(() => import('./League').then((m) => ({ default: m.League })));
const InstallGuide = lazy(() => import('../components/InstallGuide').then((m) => ({ default: m.InstallGuide })));
const Companies = lazy(() => import('./Companies').then((m) => ({ default: m.Companies })));
const Admin = lazy(() => import('./Admin').then((m) => ({ default: m.Admin })));
const LoginPage = lazy(() => import('./Account').then((m) => ({ default: m.LoginPage })));
const MyProfilePage = lazy(() => import('./Account').then((m) => ({ default: m.MyProfilePage })));
const RankingPage = lazy(() => import('./Account').then((m) => ({ default: m.RankingPage })));
import { LegalSheet, OPERATOR } from '../components/Legal';
import { FriendsPage, useFriendsPoll } from './Friends';
import { InviteCenter } from '../components/InviteCenter';
import { PartyPanel, useParty, type PartyState } from '../components/PartyPanel';
import { matchKindName, useAccount } from '../net/account';
import { DEFAULT_SOLO_DAY, loadSolo, saveSolo, SOLO_DAY_OPTIONS } from '../engine/soloStore';
import { BOT_LEVELS, MAX_BOTS } from '../engine/botInfo';
import { waitLabel } from '../engine/matching';
import { DailyBoard, DailyFriends, useDailyInfo } from '../components/Daily';
import { MissionsButton } from '../components/Missions';
import { useIsMobile } from '../components/Extras';
import { BADGE_MAP, BADGES, givesTitle, titleLabel, titleOf } from '../game/achievements';
import { AVATARS } from '../game/avatars';
import { pct, tone, wonShort } from '../lib/format';
import { isMuted, setMuted } from '../lib/sound';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { ForgetMe } from '../components/ForgetMe';
import { BadgeIcon, Icon } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { setPrefs, usePrefs } from '../prefs';
import { DAY_OPTIONS, estimateMinutes, graceSentence, loadNick, markTutorialSeen, tutorialSeen, loadUi, saveNick, saveUi, TURN_OPTIONS, turnLabel, type Session, type UiMode } from '../session';

export interface ResumeInfo {
  roomId: string;
  code: string;
  status: 'waiting' | 'playing';
  playerId: string;
  nickname: string;
  mode: string;
}
export interface RoomInfo {
  id: string;
  title: string;
  isPrivate: boolean;
  maxPlayers: number;
  players: number;
  host: string;
  totalDays: number;
  turnSeconds: number;
  joined: boolean;
}
interface MatchResult {
  id: string;
  winner_nickname: string | null;
  results: { nickname: string; equity: number; ret: number; badges?: string[]; /** 봇 자리면 난이도 (2026-11-17부터 기록) */ bot?: number; left?: boolean; idle?: boolean }[];
  /** 내 기록에서: 판 종류 · 랭킹전 · 점수 변화 */
  kind?: string | null;
  ranked?: boolean | null;
  pts?: number | null;
  created_at: string;
  me?: string | null;
}

/** 로비 안의 페이지 (각각 주소가 있음: / · /rooms · /create · /records) */
export type LobbyPage = 'home' | 'ranked' | 'casual' | 'custom' | 'friends' | 'practice' | 'more' | 'rooms' | 'create' | 'records' | 'customize' | 'companies' | 'tutorial' | 'admin' | 'login' | 'signup' | 'me' | 'ranking' | 'notices' | 'league' | 'install';
const PAGE_TITLE: Partial<Record<LobbyPage, string>> = {
  ranked: '랭킹전', casual: '일반전', custom: '커스텀', friends: '친구', practice: '연습', more: '설정·더보기', rooms: '방 찾기', create: '방 만들기',
  records: '업적', customize: '화면 편집', companies: '공부', tutorial: '튜토리얼', admin: '운영자', login: '로그인', signup: '회원가입', me: '마이프로필', ranking: '랭킹', notices: '공지사항', league: '주간 리그', install: '앱처럼 쓰기',
};

interface Props {
  page: LobbyPage;
  go: (page: LobbyPage) => void;
  onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void;
  onGame: (session: Session) => void;
}

type Joined = { roomId: string; playerId: string; code: string };

/** 화면 모드: 초보 / 일반 / 커스텀. 커스텀은 '바탕 모드'(초보·일반) 위에 내 설정을 덮어씀 */
export function ModePicker({ value, onChange, onEdit }: { value: UiMode; onChange: (m: UiMode) => void; onEdit?: () => void }) {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const custom = prefs.enabled;
  const pick = (m: UiMode) => {
    setPrefs({ enabled: false });
    onChange(m);
  };
  const desc = custom
    ? `내가 바꾼 화면이에요 (바탕은 ${value === 'easy' ? '초보' : '일반'})`
    : value === 'easy'
      ? '쉬운 말과 금액 버튼으로 쉽게 사고, 어려운 말엔 설명이 붙어요'
      : '캔들 차트와 수량 주문, 시가·고가·저가까지 보여요';
  return (
    <div className="mode-pick compact">
      <div className="mp-row" role="radiogroup" aria-label="화면 모드">
        <button role="radio" aria-checked={!custom && value === 'easy'} className={!custom && value === 'easy' ? 'on' : ''} onClick={() => pick('easy')}>
          <Icon name="book" size={16} /> 초보
        </button>
        <button role="radio" aria-checked={!custom && value === 'pro'} className={!custom && value === 'pro' ? 'on' : ''} onClick={() => pick('pro')}>
          <Icon name="bars" size={16} /> 일반
        </button>
        <div className={'mp-custom-pill' + (custom ? ' on' : '')}>
        <button role="radio" aria-checked={custom} className={custom ? 'on' : ''} onClick={() => setPrefs({ enabled: true })}>
          <Icon name="sliders" size={16} /> 커스텀
        </button>
        <button
          className="mp-gear icon-btn sm"
          aria-label="커스텀 모드 화면 편집"
          title="실제 게임 화면에서 편집"
          onClick={() => {
            // 홈: 실제 게임 화면(가상 게임)으로 가서 편집. 대기실 등: 설정 창
            setPrefs({ enabled: true });
            if (onEdit) onEdit();
            else setOpen(true);
          }}
        >
          <Icon name="settings" size={16} />
        </button>
        </div>
      </div>
      <small className="mp-desc muted">{desc}</small>
      {open && (
        <Sheet title={<><Icon name="sliders" size={18} /> 커스텀 모드 설정</>} onClose={() => setOpen(false)}>
          <div className="field">
            <span>바탕 모드 (쉬운 말·주문 방식)</span>
            <div className="seg two">
              <button aria-pressed={value === 'easy'} className={value === 'easy' ? 'on' : ''} onClick={() => onChange('easy')}>
                <b>초보</b>
              </button>
              <button aria-pressed={value === 'pro'} className={value === 'pro' ? 'on' : ''} onClick={() => onChange('pro')}>
                <b>일반</b>
              </button>
            </div>
          </div>
          <PrefsPanel ui={value} />
          {!custom && (
            <button className="btn primary full" onClick={() => (setPrefs({ enabled: true }), setOpen(false))}>
              커스텀 모드로 쓰기
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}

const online = !!supabase;
const nickValid = (n: string) => n.trim().length >= 1 && n.trim().length <= 10;

/** 닉네임·화면 모드 — 모든 로비 페이지가 같은 값을 씀(저장소에 보관) */
function useProfile() {
  const [nick, setNickState] = useState(loadNick);
  const [ui, setUiState] = useState<UiMode>(loadUi);
  return {
    nick,
    ui,
    ok: nickValid(nick),
    setNick: (n: string) => {
      setNickState(n);
      if (nickValid(n)) saveNick(n.trim());
    },
    setUi: (m: UiMode) => {
      setUiState(m);
      saveUi(m);
    },
  };
}

function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const boxRef = useDialogFocus<HTMLDivElement>();
  useEscape(onClose, true, true);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={boxRef} tabIndex={-1} className="modal has-x" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <button type="button" className="icon-btn sm modal-x" aria-label="닫기" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

/** 하위 페이지 머리: ← 뒤로 · 제목 · 오른쪽 버튼 */
function PageHead({ title, onBack, right, top, desc }: { title: string; onBack: () => void; right?: ReactNode; top?: boolean; desc?: string }) {
  return (
    <header className={'page-head' + (top ? ' top' : '')}>
      <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
        <Icon name="back" size={18} />
      </button>
      <h2>{title}</h2>
      {top && desc && <p className="ph-desc muted small">{desc}</p>}
      <div className="ph-right">{right}</div>
    </header>
  );
}

/** 설정의 게스트 닉네임: 형식·회원 닉네임과 겹치는지 바로 알려 줌 (예전엔 방에 들어갈 때야 막혔음) */
function GuestNickField({ nick, setNick }: { nick: string; setNick: (v: string) => void }) {
  const check = useNickCheck(nick, online);
  return (
    <label className={'field' + (check === 'ok' && nick ? ' good' : check === 'taken' || check === 'invalid' ? ' invalid' : '')}>
      <span>게스트 닉네임 (랭킹에는 안 올라가요)</span>
      <input value={nick} maxLength={10} placeholder="예: 개미왕" onChange={(e) => setNick(e.target.value)} autoComplete="off" />
      {check === 'taken' && <small className="error">회원이 쓰는 닉네임이에요. 다른 닉네임을 써 주세요.</small>}
      {check === 'invalid' && <small className="error">1~10자, 글자·숫자로 정해 주세요.</small>}
    </label>
  );
}

function CodeJoin({
  initial,
  onJoined,
  onClose,
}: {
  initial: string;
  onJoined: (r: Joined) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = code.length === 6;
  const submit = async () => {
    setErr('');
    if (!valid) return setErr('6자리 방 코드를 입력해 주세요.');
    setBusy(true);
    try {
      onJoined(await api<Joined>('join', { code, nickname: loadNick().trim(), mode: loadUi() }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={<><Icon name="key" size={18} /> 코드로 입장</>} onClose={onClose}>
      <p className="muted small">친구에게 받은 6자리 초대 코드를 입력하세요. 비밀방도 코드로는 바로 들어갈 수 있어요.</p>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="code-input"
          autoFocus
          value={code}
          maxLength={6}
          placeholder="6자리 방 코드"
          inputMode="text"
          autoCapitalize="characters"
          onChange={(e) => (setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)), setErr(''))}
        />
        <button className="btn primary" disabled={busy || !online}>
          입장
        </button>
      </form>
      {!online && <p className="muted small">인터넷에 연결되면 입장할 수 있어요.</p>}
      {!err && code.length > 0 && code.length < 6 && <p className="muted small">6자리 중 {code.length}자리 입력했어요</p>}
      {err && <p className="error" role="alert">{err}</p>}
    </Modal>
  );
}

function PracticeStart({ onStart, onClose }: { onStart: (days: number, daySec: number) => void; onClose: () => void }) {
  const [days, setDays] = useState(20);
  const [daySec, setDaySec] = useState<number>(DEFAULT_SOLO_DAY);
  return (
    <Modal title={<><Icon name="target" size={18} /> 혼자 연습하기</>} onClose={onClose}>
      <p className="muted small">혼자서 같은 규칙으로 연습해요. 장중에 가격이 실시간으로 움직이고, 다 정했으면 "장 마감"으로 남은 시간을 건너뛸 수 있어요. 이 기기에 저장돼요.</p>
      <div className="field">
        <span>게임 길이</span>
        <div className="seg">
          {DAY_OPTIONS.map((o) => (
            <button key={o.days} aria-pressed={days === o.days} className={days === o.days ? 'on' : ''} onClick={() => setDays(o.days)}>
              <b>{o.label}</b>
              <small>{daySec === 0 ? '시간 제한 없음' : `최대 ${Math.round((o.days * (daySec + 8)) / 60)}분`}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>하루(장) 길이</span>
        <div className="seg">
          {SOLO_DAY_OPTIONS.map((sec) => (
            <button key={sec} aria-pressed={daySec === sec} className={daySec === sec ? 'on' : ''} onClick={() => setDaySec(sec)}>
              <b>{sec === 0 ? '무제한' : sec / 60 + '분'}</b>
              <small>{sec === 0 ? '내가 마감할 때까지' : sec === 60 ? '빠르게' : sec === 180 ? '추천' : '여유'}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn primary" onClick={() => onStart(days, daySec)}>
          시작하기
        </button>
      </div>
    </Modal>
  );
}

/** 봇전: 봇 1~5명 + 난이도 + 판 길이 → 이 기기에서 바로 시작 (설계서 design/bots-daily.md) */
function BotStart({ onStart, onClose }: { onStart: (days: number, daySec: number, bots: number[]) => void; onClose: () => void }) {
  const [bots, setBots] = useState<number[]>([2]);
  const [days, setDays] = useState(10);
  const [daySec, setDaySec] = useState<number>(60);
  const setLevel = (i: number, lv: number) => setBots((b) => b.map((x, j) => (j === i ? lv : x)));
  return (
    <Modal title={<><Icon name="bot" size={18} /> 봇전</>} onClose={onClose}>
      <p className="muted small">기다리지 않고 봇과 바로 한 판 해요. 봇도 사람처럼 뉴스와 차트만 보고 움직여요(미래 가격은 몰라요). 랭킹 점수는 바뀌지 않고, 전적·업적·미션에는 남아요.</p>
      <div className="field">
        <span>상대 봇 ({bots.length}명)</span>
        <ul className="bot-pick">
          {bots.map((lv, i) => (
            <li key={i}>
              <Icon name="bot" size={16} />
              <div className="seg sm" role="radiogroup" aria-label={`봇 ${i + 1} 난이도`}>
                {BOT_LEVELS.map((b) => (
                  <button key={b.level} role="radio" aria-checked={lv === b.level} className={lv === b.level ? 'on' : ''} onClick={() => setLevel(i, b.level)}>
                    {b.label}
                  </button>
                ))}
              </div>
              {bots.length > 1 && (
                <button className="icon-btn sm" aria-label={`봇 ${i + 1} 빼기`} onClick={() => setBots((b) => b.filter((_, j) => j !== i))}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {bots.length < MAX_BOTS && (
          <button className="btn sm" onClick={() => setBots((b) => [...b, b[b.length - 1] ?? 2])}>
            <Icon name="plus" size={14} /> 봇 더하기
          </button>
        )}
        <ul className="bot-levels muted small">
          {BOT_LEVELS.map((b) => (
            <li key={b.level}>
              <b>{b.label}</b> {b.desc}
            </li>
          ))}
        </ul>
      </div>
      <div className="field">
        <span>게임 길이</span>
        <div className="seg">
          {/* 번개전: 5일 × 하루 45초 (약 5분) — 짧은 틈에 한 판 */}
          <button aria-pressed={days === 5} className={days === 5 ? 'on' : ''} onClick={() => (setDays(5), setDaySec(45))}>
            <b>번개</b>
            <small>5일 · 약 5분</small>
          </button>
          {DAY_OPTIONS.filter((o) => o.days <= 20).map((o) => (
            <button key={o.days} aria-pressed={days === o.days} className={days === o.days ? 'on' : ''} onClick={() => (setDays(o.days), daySec === 45 && setDaySec(60))}>
              <b>{o.label}</b>
              <small>최대 {Math.round((o.days * ((daySec === 45 ? 60 : daySec) + 8)) / 60)}분</small>
            </button>
          ))}
        </div>
      </div>
      {days !== 5 && <div className="field">
        <span>하루(장) 길이</span>
        <div className="seg">
          {[60, 180].map((sec) => (
            <button key={sec} aria-pressed={daySec === sec} className={daySec === sec ? 'on' : ''} onClick={() => setDaySec(sec)}>
              <b>{sec / 60}분</b>
              <small>{sec === 60 ? '빠르게' : '여유'}</small>
            </button>
          ))}
        </div>
      </div>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn primary" onClick={() => onStart(days, daySec, bots)}>
          시작하기
        </button>
      </div>
    </Modal>
  );
}

/** 오늘의 도전: 모두 같은 시장으로 하루 한 번 (10일 · 하루 1분), 회원 점수표 */
/** 오늘의 도전은 회원만 (2026-11-18) — 손님에게는 안내와 가입·로그인 버튼만 (서버에 묻지 않아 손님 계정도 안 만듦) */
function DailyMembersOnly({ onClose, onSignup, onLogin }: { onClose: () => void; onSignup: () => void; onLogin: () => void }) {
  return (
    <Modal title={<><Icon name="daily" size={18} /> 오늘의 도전</>} onClose={onClose}>
      <p className="muted small">오늘 하루, 모든 회원이 똑같은 시장으로 한 번씩 겨뤄요. 10일 동안 하루 1분, 100만원으로 시작하고 점수표에 순위가 올라가요.</p>
      <p className="small warn-msg">오늘의 도전은 회원만 할 수 있어요. 가입은 아이디·비밀번호·닉네임만 있으면 돼요.</p>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onLogin}>
          로그인
        </button>
        <button className="btn primary" onClick={onSignup}>
          회원가입
        </button>
      </div>
    </Modal>
  );
}

function DailyStart({ onClose, onGame, member }: { onClose: () => void; onGame: (s: Session) => void; member: boolean }) {
  const { info, err, reload } = useDailyInfo();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const start = async () => {
    setBusy(true);
    setMsg('');
    try {
      const nickname = loadNick().trim();
      const r = await api<{ roomId: string; playerId: string; code: string }>('dailyStart', { nickname, mode: loadUi() });
      onGame({ mode: 'multi', roomId: r.roomId, code: r.code, playerId: r.playerId, nickname, ui: loadUi() });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={<><Icon name="daily" size={18} /> 오늘의 도전</>} onClose={onClose}>
      <p className="muted small">오늘 하루, 모든 사람이 똑같은 시장으로 한 번씩 겨뤄요. 10일 동안 하루 1분, 100만원으로 시작해요. 기회는 하루에 한 번이고, 중간에 나가면 그때 재산으로 기록돼요.</p>
      {err ? (
        <ErrorState what="오늘의 도전" onRetry={reload} compact />
      ) : !info ? (
        <Loading inline />
      ) : !info.ready ? (
        <p className="muted small">아직 준비 중인 기능이에요.</p>
      ) : (
        <>
          <div className="daily-me">
            {info.finished ? (
              <span>
                오늘 기록 <b className={(info.myRet ?? 0) > 0 ? 'up' : (info.myRet ?? 0) < 0 ? 'down' : ''}>{pct(info.myRet ?? 0, 1)}</b>
                {info.myRank ? ` · ${info.total}명 중 ${info.myRank}위` : ''}
              </span>
            ) : info.resume ? (
              <span>하던 도전이 있어요. 이어서 해요.</span>
            ) : info.played ? (
              <span>오늘 도전은 이미 했어요.</span>
            ) : (
              <span>아직 오늘 도전을 안 했어요.</span>
            )}
          </div>
          <DailyFriends info={info} />
          <h4 className="daily-h">오늘 점수표 {info.total ? <small className="muted">{info.total}명</small> : null}</h4>
          <DailyBoard info={info} />
        </>
      )}
      {msg && <p className="error small">{msg}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          닫기
        </button>
        {info?.resume ? (
          <button className="btn primary" onClick={() => onGame({ mode: 'multi', roomId: info.resume!.roomId, code: info.resume!.code, playerId: info.resume!.playerId, nickname: loadNick().trim(), ui: loadUi() })}>
            이어하기
          </button>
        ) : (
          <button className="btn primary" disabled={busy || !info?.ready || !!info?.played} onClick={start}>
            {info?.played ? '내일 다시' : '도전 시작'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={<><Icon name="book" size={18} /> 이렇게 놀아요</>} onClose={onClose}>
      {/* 긴 글 대신 제목 + 짧은 설명 목록 (공통 부품) */}
      <IconList
        items={[
          { icon: 'wallet', title: '100만원으로 시작', body: '아침 뉴스를 보고 오를 것 같은 회사를 골라 사요. 좋은 소식은 시작 가격에 이미 많이 들어가 있을 수 있어요. 기사 아래 관련 종목(거래처·같은 업종은 같이, 경쟁사는 반대로)도 함께 움직여요.' },
          { icon: 'flame', title: '장중 속보', body: '장이 열려 있는 동안 가격은 1초마다 움직이고, 속보가 뜨면 그 순간 크게 뛰어요. 빨리 알아채면 유리해요.' },
          { icon: 'chat', title: '커뮤니티·SNS', body: '장중에도 소문 글이 수시로 올라와요. 진짜 단서도 헛소문도 있고, 인증 배지가 붙은 계정의 글이 더 잘 맞아요. 글이 올라오면 그 종목이 잠깐 들썩이니 늦게 따라 사지 마세요. 뉴스가 나오면 사람들 반응 글도 올라오는데(‘소식 반응’ 표시), 이미 나온 소식 얘기라 단서는 아니에요.' },
          { icon: 'percent', title: '금리·환율·유가', body: '업종마다 다르게 영향을 줘요. 레버리지·인버스 ETF는 총재산의 30%까지만 살 수 있어요.' },
          { icon: 'timer', title: '장 마감', body: '다 정했으면 장 마감. 모두 누르거나 제한 시간이 끝나면 다음 날로 가요.' },
          { icon: 'hourglass', title: '장 전 시간', body: '날마다(첫날 포함) 장이 열리기 전 잠깐(하루 길이에 따라 20~45초) 커뮤니티 글을 보고 예약 주문을 걸 수 있어요. 모두 준비 완료를 누르면 바로 열려요.' },
          { icon: 'calendar', title: '며칠 걸친 사건', body: '[단독] 기사에 "○일차 발표 예정"이 붙으면 일정에도 떠요. 발표 날까지 기대감에 오르다가 그날 장중 속보로 크게 움직여요. 이미 많이 올랐으면 좋은 결과에도 떨어질 수 있고, 직전에 반대 소식(특징주)이 돌기도 해요.' },
          { icon: 'cards', title: '찬스 카드', body: '내일 뉴스를 미리 보거나 상대를 방해해요. 정보 카드는 하루 1장, 방해는 한 사람에게 하루 한 번만 통해요.' },
          { icon: 'crown', title: '랭킹 티어', body: '랭킹전 점수로 브론즈~마스터·챌린저가 정해져요. 한 단계 100점(실버 1,000 · 골드 1,300 · 플래티넘 1,600 · 다이아 1,900 · 마스터 2,200). 다이아부터는 오래 쉬면 점수가 조금씩 줄어요.' },
          { icon: 'medal', title: '주간 리그', body: '회원은 매주 30명이 한 조가 되어 그 주에 모은 경험치로 겨뤄요. 위는 승급, 아래는 강등이고 1~3위는 경험치를 더 받아요.' },
          { icon: 'trophy', title: '승리', body: '마지막 날 재산이 가장 많은 사람이 이겨요. 상대가 기권하면 바로 이겨요 (일반전·랭킹전은 나도 한 번 이상 거래했을 때).' },
        ]}
      />
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          알겠어요
        </button>
      </div>
    </Modal>
  );
}

/* ================= 메뉴별 화면 (랭킹전·일반전·커스텀·연습·더보기) ================= */

type HubTab = 'ranked' | 'casual' | 'custom' | 'practice' | 'more';
type FrameModal = null | 'howto' | 'privacy' | 'terms' | 'feedback';

const TAB_HEAD: Record<HubTab, { title: string; desc: string }> = {
  ranked: { title: '랭킹전', desc: '실력이 비슷한 회원끼리 겨뤄요. 이기면 점수가 올라요' },
  casual: { title: '일반전', desc: '점수 걱정 없이 가볍게 한 판' },
  custom: { title: '커스텀', desc: '친구와 방을 만들어 규칙을 직접 정해요' },
  practice: { title: '연습', desc: '혼자 연습하고 규칙을 익혀요' },
  more: { title: '설정·더보기', desc: '계정, 화면 모드, 도움말' },
};

function Hub({ tab, go, onWaiting, onGame, openModal, party, reloadParty }: Omit<Props, 'page'> & { tab: HubTab; openModal: (m: FrameModal) => void; party: PartyState | null; reloadParty: () => Promise<void> }) {
  const account = useAccount();
  const profile = useProfile();
  const gate = useGuestGate(account, online, () => go('signup'), () => go('login'));
  const [modal, setModal] = useState<null | 'code' | 'practice' | 'bots' | 'daily'>(null);
  // 단계별 튜토리얼 (design/onboarding.md)
  const chapter = useChapter();
  const [tutMenu, setTutMenu] = useState(false);
  const [tutOffer, setTutOffer] = useState(false);
  const goChapter = (c: Chapter | null) => {
    if (c === 'game' || c === 'result') go('tutorial');
    else if (c === 'home' || c === 'growth') go('casual');
  };
  // 처음 하는 사람(튜토리얼 기록·끝낸 판 없음)에게 한 번 권함 — 게스트로 시작했거나 로그인했을 때
  const offerChecked = useRef(false);
  useEffect(() => {
    if (offerChecked.current || !online || (account.status !== 'guest' && account.status !== 'member') || chapter) return;
    offerChecked.current = true;
    const games = account.status === 'member' ? account.profile?.games ?? null : null;
    void shouldOfferTutorial(games).then((ok) => {
      // 다른 창(환영 창·연습 창 등)이 떠 있으면 그 일이 끝난 뒤 다음 번에
      if (ok && !document.querySelector('.modal-bg, .sheet-bg')) setTutOffer(true);
      else if (ok) offerChecked.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 환영 창·다른 창이 닫힐 때 다시 확인
  }, [account.status, chapter, modal, gate.el === null]);
  // 설정·더보기의 공지사항 줄: 이 기기에서 아직 안 본 공지가 있으면 점 (공지 목록은 공개라 로그인 없이도)
  const newNotice = useHasUnreadNotice() && online;
  const [roomList, setRoomList] = useState<RoomInfo[] | null>(null);
  const openRooms = roomList ? roomList.filter((x) => !x.joined).length : null;
  const invite = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', []);
  const member = account.status === 'member' && !!account.profile;

  // 처음 온 사람: 계정 상태를 알고 나서 한 번 — 초대 링크면 코드 입장(고르기 전이면 환영 창 먼저), 아니면 환영 창 (이 기기에서 한 번)
  const firstCheck = useRef(false);
  useEffect(() => {
    if (account.status === 'loading' || firstCheck.current) return;
    firstCheck.current = true;
    if (invite.length === 6) return gate.guard(() => setModal('code'));
    let ask = false;
    try {
      ask = sessionStorage.getItem('stockduel.askWelcome') === '1';
      sessionStorage.removeItem('stockduel.askWelcome');
    } catch {
      /* 무시 */
    }
    if (online && account.status === 'visitor' && (ask || !welcomeSeen())) {
      // 처음 온 날(이 창)에는 공지 창을 자동으로 띄우지 않음 — 환영·튜토리얼에 집중 (공지 띠는 그대로 보임)
      if (!welcomeSeen()) {
        try {
          sessionStorage.setItem('stockduel.onboarding', '1');
        } catch {
          /* 무시 */
        }
      }
      markWelcomeSeen();
      gate.open('intro');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  useEffect(() => {
    if (!online) return;
    const loadRooms = () =>
      api<RoomInfo[]>('rooms')
        .then(setRoomList)
        .catch(() => {});
    loadRooms();
    // 커스텀 메뉴에서는 열린 방 목록을 10초마다 새로
    const id = tab === 'custom' ? setInterval(() => document.visibilityState === 'visible' && loadRooms(), 10_000) : 0;
    // 방에서 나왔거나 기권했으면 바로 새로 (사라진 방이 목록에 남지 않게)
    window.addEventListener('rooms-changed', loadRooms);
    return () => {
      clearInterval(id);
      window.removeEventListener('rooms-changed', loadRooms);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  const nick = () => (member ? account.profile!.nickname : loadNick().trim());
  const joined = (r: Joined) => onWaiting(r.roomId, r.playerId, nick(), r.code);
  // 봇전: 서버 판으로 (기록·업적·미션에 남음). 인터넷 설정이 없으면 이 기기에서
  const startBots = async (days: number, daySec: number, bots: number[]) => {
    if (!online) return startPractice(days, daySec, bots);
    try {
      const nickname = nick() || '나';
      const r = await api<{ roomId: string; playerId: string; code: string }>('botMatch', { levels: bots, totalDays: days, turnSeconds: daySec, nickname, mode: profile.ui });
      setModal(null);
      onGame({ mode: 'multi', roomId: r.roomId, code: r.code, playerId: r.playerId, nickname, ui: profile.ui });
    } catch (e) {
      void ask(e instanceof Error ? e.message : String(e), { ok: '확인' });
    }
  };
  const startPractice = async (days: number, daySec: number, bots: number[] = []) => {
    // 연습 엔진은 시작할 때 불러옴 (로비 첫 로딩을 가볍게)
    const { newSolo } = await import('../engine/local');
    const s = newSolo(nick() || '나', days, daySec, true, bots);
    onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: s.nickname, ui: profile.ui });
  };
  // 연습 메뉴 '오늘의 도전' 칸: 오늘 했는지·순위 (로그인 전이면 서버에 안 물음)
  const dailyTile = useDailyInfo(online && member && tab === 'practice').info;
  const head = TAB_HEAD[tab];
  // 처음 온 사람에게 튜토리얼 권하기 (한 번 닫거나 해 보면 다시 안 나옴)
  const [nudge, setNudge] = useState(() => !tutorialSeen());

  const finder = (kind: 'ranked' | 'casual', stage = false) => (
    <MatchFinder
      stage={stage}
      member={member}
      loading={account.status === 'loading'}
      fixedKind={kind}
      guard={gate.guard}
      nickname={account.profile?.nickname ?? loadNick()}
      nickOk={member || profile.ok}
      ui={profile.ui}
      onNeedNick={() => gate.guard(() => {})}
      onLogin={() => go('login')}
      onBots={() => gate.guard(() => setModal('bots'))}
      party={party ? { isLeader: party.isLeader, searching: party.searching, size: party.members.length, queue: party.queue, waiting: party.members.some((m) => !m.me && m.back === false) } : null}
    />
  );

  const quickRow = (
    <section className="st-quick" aria-label="기다리지 않고 하기">
      <button className="st-qbtn" onClick={() => okWhileMatching('봇전은') && gate.guard(() => setModal('bots'))}>
        <i className="q-bot"><Icon name="bot" size={22} /></i>
        <span>
          <b>봇전</b>
          <small>기다림 없이 바로</small>
        </span>
      </button>
      <button className="st-qbtn" onClick={() => okWhileMatching('오늘의 도전은') && (member ? gate.guard(() => setModal('daily')) : setModal('daily'))}>
        <i className="q-daily"><Icon name="daily" size={22} /></i>
        <span>
          <b>오늘의 도전</b>
          <small>{member ? '모두 같은 시장에서' : '회원만 · 같은 시장'}</small>
        </span>
      </button>
      <button className="st-qbtn" onClick={() => okWhileMatching('튜토리얼은') && gate.guard(() => setTutMenu(true))}>
        <i className="q-tut"><Icon name="play" size={22} /></i>
        <span>
          <b>튜토리얼</b>
          <small>3분이면 규칙을 익혀요</small>
        </span>
      </button>
    </section>
  );

  return (
    <div className={'hub hub-' + tab}>
      <header className={'hub-head' + ((tab === 'casual' && online) || (tab === 'ranked' && online && member) ? ' sr-only' : '')}>
        <div>
          <h2>{head.title}</h2>
          <p className="muted small">{head.desc}</p>
        </div>
      </header>

      {/* 이미 대결 기록이 있는 계정(다른 기기에서 해 본 회원 등)에는 '처음이세요?' 를 띄우지 않음 */}
      {nudge && !chapter && !tourSkipped() && doneChapters().length === 0 && (tab === 'casual' || tab === 'ranked') && !(account.profile?.games ?? 0) && account.recent.length === 0 && (
        <section className="panel pad hub-nudge" aria-label="처음이라면">
          <Icon name="book" size={22} />
          <div>
            <b>처음이세요? 3분 튜토리얼부터 해 보세요</b>
            <p className="muted small">연습 상대와 사고팔기·뉴스·카드를 직접 해 봐요. 진짜 대결이 훨씬 쉬워져요.</p>
          </div>
          <button className="btn primary" onClick={() => okWhileMatching('튜토리얼은') && gate.guard(() => (startTour(), goChapter('home')))}>
            튜토리얼 하기
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              markTutorialSeen();
              setNudge(false);
            }}
          >
            괜찮아요
          </button>
        </section>
      )}

      {tab === 'ranked' &&
        (!online ? (
          <OfflineNote />
        ) : account.status === 'loading' ? (
          <section className="panel pad hub-skel" aria-busy="true">
            <span className="muted small">내 계정을 확인하는 중…</span>
          </section>
        ) : member ? (
          <div className="hub-stage">
            <div className="hs-main">
              {finder('ranked', true)}
              {quickRow}
            </div>
            <aside className="hs-side">
            <section className="panel pad rank-card">
              <h3>
                <Icon name="crown" size={18} /> 내 랭킹
              </h3>
              <div className="rk-big">
                <TierBadge rating={account.profile!.rating} rankedGames={account.profile!.ranked_games} size={56} chal={account.profile!.chal} />
              </div>
              <p className="muted small">
                {isPlaced(account.profile!.ranked_games)
                  ? `${account.profile!.rankPos ? account.profile!.rankPos + '위 · ' : ''}${account.profile!.games}판 ${account.profile!.wins}승`
                  : `랭킹전 ${Math.max(1, PLACEMENT_GAMES - (account.profile!.ranked_games ?? 0))}판 더 하면 티어가 정해져요`}
              </p>
{isPlaced(account.profile!.ranked_games) && <TierProgress rating={account.profile!.rating} />}
              {/* 판 전에 걸린 점수 미리 보기 (비슷한 점수 상대 기준 — 실제는 상대 점수에 따라 조금 달라요) */}
              <p className="rk-stake small">
                비슷한 상대에게 1위면 <b className="up">+{isPlaced(account.profile!.ranked_games) ? ELO_K / 2 : (ELO_K / 2) * PLACEMENT_MULT}점</b> · 꼴찌면 <b className="down">−{isPlaced(account.profile!.ranked_games) ? ELO_K / 2 : (ELO_K / 2) * PLACEMENT_MULT}점</b>쯤
                {!isPlaced(account.profile!.ranked_games) && <span className="muted"> (배치라 크게)</span>}
              </p>
              <details className="rk-help">
                <summary>점수는 어떻게 바뀌나요?</summary>
                <ul className="rk-rules muted small">
                  <li>이기면 오르고 지면 내려가요. 높은 티어를 이기면 더 많이, 낮은 티어에게 지면 더 많이 잃어요</li>
                  <li>점수가 비슷한 사람끼리 만나요. 사람이 적으면 2분 뒤부터 더 넓게 찾아요</li>
                  <li>중간에 기권하거나, 끝까지 거래를 한 번도 안 하면 꼴찌로 계산돼요</li>
                  <li>다이아몬드부터는 쉬면 점수가 줄어요: 랭킹전 한 판마다 쉴 수 있는 날이 다이아 7일(최대 28일)·마스터 1일(최대 14일) 쌓이고, 다 쓰면 매일 다이아 50점·마스터 75점씩 줄어요. 다이아몬드 1 아래로는 안 떨어져요</li>
                  <li>챌린저는 2,500점 넘는 마스터 중 점수 순 상위 1%(최소 3자리, 최근 7일 안에 랭킹전을 한 사람)예요. 7일 쉬면 마스터로 보여요</li>
                </ul>
              </details>
              <button className="btn sm ghost" onClick={() => go('ranking')}>
                <Icon name="trophy" /> 전체 랭킹 보기
              </button>
            </section>
            </aside>
          </div>
        ) : (
          <div className="hub-grid">
            <section className="panel pad ranked-guest">
              <i className="rg-icon">
                <Icon name="trophy" size={34} />
              </i>
              <h3>랭킹전은 회원만 할 수 있어요</h3>
              <p className="muted">가입은 아이디·비밀번호·닉네임만 있으면 돼요.</p>
              <div className="rg-actions">
                <button className="btn primary" onClick={() => go('signup')}>
                  <Icon name="userPlus" /> 회원가입
                </button>
                <button className="btn" onClick={() => go('login')}>
                  로그인
                </button>
              </div>
              <button className="linkish-soft" onClick={() => go('casual')}>
                먼저 일반전으로 해 볼래요
              </button>
            </section>
            {/* 무엇을 얻는지 보여 주기: 티어 사다리 */}
            <TierLadder />
          </div>
        ))}

      {tab === 'casual' &&
        (online ? (
          <div className={'hub-stage' + (member ? '' : ' solo')}>
            <div className="hs-main">
              {finder('casual', true)}
              {quickRow}
            </div>
            {member && (
              <aside className="hs-side">
                <PartyPanel party={party} reload={reloadParty} />
              </aside>
            )}
          </div>
        ) : (
          <OfflineNote />
        ))}

      {tab === 'custom' &&
        (online ? (
          <nav className="home-actions three">
            <button className="tile" onClick={() => okWhileMatching('방 만들기는') && gate.guard(() => go('create'))}>
              <i><Icon name="plus" size={24} /></i>
              <b>방 만들기</b>
              <small>인원·길이·시간을 직접 정해요(점수 없음)</small>
            </button>
            <button className="tile" onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => go('rooms'))}>
              <i><Icon name="search" size={24} /></i>
              <b>방 찾기</b>
              <small>{openRooms === null ? '열린 방 둘러보기' : openRooms > 0 ? `지금 ${openRooms}개 열려 있어요` : '공개방·비밀방 둘러보기'}</small>
            </button>
            <button className="tile" onClick={() => okWhileMatching('코드로 입장은') && gate.guard(() => setModal('code'))}>
              <i><Icon name="key" size={24} /></i>
              <b>코드로 입장</b>
              <small>친구에게 받은 6자리 코드</small>
            </button>
          </nav>
        ) : (
          <OfflineNote />
        ))}
      {tab === 'custom' && online && (
        <section className="panel pad hub-rooms">
          <div className="hr-head">
            <h3>
              <Icon name="door" size={18} /> 지금 열린 방
            </h3>
            <button className="btn sm ghost" onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => go('rooms'))}>
              전체 보기 <Icon name="right" size={14} />
            </button>
          </div>
          {roomList === null && <Loading inline />}
          {roomList !== null && roomList.length === 0 && <p className="muted small">지금 열린 방이 없어요. 방을 만들고 친구에게 코드를 보내 보세요.</p>}
          {roomList !== null && roomList.length > 0 && (
            <ul className="hr-list">
              {roomList.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <button className="hr-row" onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => go('rooms'))}>
                    <span className="hr-title">
                      {r.isPrivate && <Icon name="lock" size={13} />} <FitText>{r.title}</FitText>
                    </span>
                    <small className="muted">
                      {r.totalDays}일 · 하루 {turnLabel(r.turnSeconds)}
                    </small>
                    <span className="hr-count">
                      {r.players}/{r.maxPlayers}명
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {(tab === 'ranked' || tab === 'casual') && member && account.recent.length > 0 && (
        <section className="panel pad hub-recent">
          <div className="hr-head">
            <h3>
              <Icon name="clock" size={18} /> 최근 대결
            </h3>
            <button className="btn sm ghost" onClick={() => go('records')}>
              업적·전적 전체 <Icon name="right" size={14} />
            </button>
          </div>
          <ul className="hr-list">
            {account.recent.slice(0, 5).map((m) => (
              <li key={m.room_id} className="hr-row static">
                <span className={'hr-rank r' + m.rank}>{m.rank}위</span>
                <small className="muted">
                  {matchKindName(m.kind, m.ranked ?? m.rated, m.players)} · {m.players}명 · {new Date(m.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </small>
                <span className={'hr-ret ' + tone(m.ret)}>{pct(m.ret, 1)}</span>
                {m.rated && m.rating_before !== null && m.rating_after !== null && isPlaced(account.profile?.ranked_games) && (
                  <span className={'hr-elo ' + (m.rating_after >= m.rating_before ? 'up' : 'down')}>
                    {m.rating_after >= m.rating_before ? '+' : ''}
                    {m.rating_after - m.rating_before}점
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'practice' && (
        <nav className={'home-actions' + (online ? ' six' : '')}>
          {online && (
            <button className="tile" onClick={() => okWhileMatching('오늘의 도전은') && (member ? gate.guard(() => setModal('daily')) : setModal('daily'))}>
              <i><Icon name="daily" size={24} /></i>
              <b>오늘의 도전</b>
              <small>{!member ? '회원만 · 하루 한 번' : dailyTile?.finished ? `오늘 완료${dailyTile.myRank ? ` · ${dailyTile.myRank}위` : ''}${dailyTile.streak?.streak ? ` · ${dailyTile.streak.streak}일 연속` : ''}` : dailyTile?.resume ? '하던 도전 이어하기' : dailyTile?.streak?.streak ? `${dailyTile.streak.streak}일 연속 중` : '모두 같은 시장, 하루 한 번'}</small>
            </button>
          )}
          <button className="tile" onClick={() => okWhileMatching('봇전은') && gate.guard(() => setModal('bots'))}>
            <i><Icon name="bot" size={24} /></i>
            <b>봇전</b>
            <small>기다림 없이 봇과 한 판</small>
          </button>
          <button className="tile" onClick={() => okWhileMatching('혼자 연습은') && gate.guard(() => setModal('practice'))}>
            <i><Icon name="target" size={24} /></i>
            <b>혼자 연습</b>
            <small>원하는 속도로 혼자 한 판</small>
          </button>
          <button className="tile" onClick={() => okWhileMatching('튜토리얼은') && gate.guard(() => setTutMenu(true))}>
            <i><Icon name="play" size={24} /></i>
            <b>튜토리얼</b>
            <small>연습봇과 한 단계씩</small>
          </button>
          <button className="tile" onClick={() => openModal('howto')}>
            <i><Icon name="help" size={24} /></i>
            <b>게임 방법</b>
            <small>1분 만에 규칙 보기</small>
          </button>
          <button className="tile" onClick={() => go('companies')}>
            <i><Icon name="book" size={24} /></i>
            <b>공부</b>
            <small>투자 기초와 기업 살펴보기</small>
          </button>
        </nav>
      )}

      {tab === 'more' && (
        <div className="more-page">
          <section className="panel pad">
            <h3>내 계정</h3>
            <AccountSection
              account={account}
              online={online}
              member={member}
              go={go}
              openWelcome={(step) => gate.open(step)}
              nickField={<GuestNickField nick={profile.nick} setNick={profile.setNick} />}
              memberRow={
              <button className="more-row more-me" onClick={() => go('me')}>
                <Avatar id={account.profile?.avatar} name={account.profile?.nickname ?? ''} size={44} />
                <span className="mr-t">
                  <b>{account.profile?.nickname}</b>
                  <small>{tierText(account.profile?.rating ?? 1000, account.profile?.ranked_games, account.profile?.chal)} · 마이프로필 · 사진 · 칭호 · 계정</small>
                </span>
                <Icon name="right" size={14} />
              </button>
              }
            />
          </section>
          <section className="panel pad">
            <h3>화면 모드</h3>
            <p className="muted small more-sub">게임 중에도 바꿀 수 있어요</p>
            <ModePicker value={profile.ui} onChange={profile.setUi} onEdit={() => gate.guard(() => go('customize'))} />
          </section>
          <SoundSetting />
          <div className="more-menus">
            {/* 둘러보기: 휴대폰은 아래 탭에 없는 화면들. PC 는 위 메뉴에 이미 있어서 숨김 */}
            <section className="panel pad more-links more-browse">
              <h3 className="more-h">둘러보기</h3>
              {online && (
                <button className="more-row" onClick={() => go('ranking')}>
                  <Icon name="crown" /> <span className="mr-t"><b>랭킹</b><small>회원 순위와 티어</small></span> <Icon name="right" size={14} />
                </button>
              )}
              {online && (
                <button className="more-row" onClick={() => go('league')}>
                  <Icon name="trophy" /> <span className="mr-t"><b>주간 리그</b><small>매주 30명과 경험치로 겨루기</small></span> <Icon name="right" size={14} />
                </button>
              )}
              {online && (
                <button className="more-row" onClick={() => go('records')}>
                  <Icon name="medal" /> <span className="mr-t"><b>업적</b><small>모은 업적·칭호·프로필 사진</small></span> <Icon name="right" size={14} />
                </button>
              )}
              <button className="more-row" onClick={() => go('practice')}>
                <Icon name="target" /> <span className="mr-t"><b>연습</b><small>혼자서 마음껏 연습</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => go('companies')}>
                <Icon name="book" /> <span className="mr-t"><b>공부</b><small>투자 기초와 기업 살펴보기</small></span> <Icon name="right" size={14} />
              </button>
            </section>
            <section className="panel pad more-links">
              <h3 className="more-h">처음이라면</h3>
              <button className="more-row" onClick={() => okWhileMatching('튜토리얼은') && gate.guard(() => setTutMenu(true))}>
                <Icon name="play" /> <span className="mr-t"><b>튜토리얼</b><small>연습봇과 한 판 따라 하기</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('howto')}>
                <Icon name="help" /> <span className="mr-t"><b>게임 방법</b><small>규칙을 한눈에</small></span> <Icon name="right" size={14} />
              </button>
            </section>
            <section className="panel pad more-links">
              <h3 className="more-h">문의·안내</h3>
              <button className="more-row" onClick={() => go('install')}>
                <Icon name="phone" /> <span className="mr-t"><b>앱처럼 쓰기</b><small>홈 화면에 추가하는 방법 (기기별 그림 안내)</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => go('notices')}>
                <Icon name="megaphone" /> <span className="mr-t"><b>공지사항{newNotice && <i className="more-new" aria-label="새 공지" />}</b><small>운영자가 알리는 소식</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('feedback')}>
                <Icon name="bell" /> <span className="mr-t"><b>의견·버그 보내기</b><small>운영자에게 바로 전달돼요</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('privacy')}>
                <Icon name="lock" /> <span className="mr-t"><b>개인정보처리방침</b><small>모으는 정보와 지우는 방법</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('terms')}>
                <Icon name="book" /> <span className="mr-t"><b>이용약관</b><small>서비스 이용 약속</small></span> <Icon name="right" size={14} />
              </button>
            </section>
          </div>
        </div>
      )}

      {modal === 'code' && <CodeJoin initial={invite} onJoined={joined} onClose={() => setModal(null)} />}
      {modal === 'practice' && <PracticeStart onStart={startPractice} onClose={() => setModal(null)} />}
      {modal === 'bots' && <BotStart onStart={startBots} onClose={() => setModal(null)} />}
      {modal === 'daily' && (member ? <DailyStart member={member} onGame={onGame} onClose={() => setModal(null)} /> : <DailyMembersOnly onClose={() => setModal(null)} onSignup={() => (setModal(null), go('signup'))} onLogin={() => (setModal(null), go('login'))} />)}
      {gate.el}
      {tutMenu && (
        <TutorialMenu
          onClose={() => setTutMenu(false)}
          onPick={(c) => {
            setTutMenu(false);
            startTour([c]);
            goChapter(c);
          }}
          onAll={() => {
            setTutMenu(false);
            startTour();
            goChapter('home');
          }}
        />
      )}
      {tutOffer && (
        <TutorialOffer
          onStart={() => {
            setTutOffer(false);
            startTour();
            goChapter('home');
          }}
          onSkip={() => {
            setTutOffer(false);
            stopTour();
          }}
        />
      )}
      {(chapter === 'home' || chapter === 'growth') && (tab === 'casual' || tab === 'ranked') && !tutOffer && (
        <CoachTour
          key={chapter}
          steps={chapter === 'home' ? HOME_STEPS : GROWTH_STEPS}
          chapterTitle={chapter === 'home' ? '홈 둘러보기' : '미션·업적·성장'}
          mobile={document.documentElement.dataset.device !== 'pc'}
          doneLabel={chapter === 'home' ? '연습봇과 한 판' : '끝내기'}
          onDone={() => {
            const was = chapter;
            finishChapter(was, 'done');
            if (was === 'growth') setFlash('튜토리얼을 모두 마쳤어요! 이제 대결을 시작해 보세요.');
            goChapter(currentChapter());
          }}
          onSkip={() => {
            finishChapter(chapter, 'skip');
            goChapter(currentChapter());
          }}
          onStopAll={() => stopTour()}
        />
      )}
    </div>
  );
}

function OfflineNote() {
  return (
    <section className="panel pad">
      <p className="muted">온라인 설정이 없어 이 기능을 쓸 수 없어요. '연습'에서 혼자 할 수 있어요.</p>
    </section>
  );
}

/* ================= 방 찾기 ================= */

function Rooms({ go, onWaiting }: Pick<Props, 'go' | 'onWaiting'>) {
  const profile = useProfile();
  const account = useAccount();
  const gate = useGuestGate(account, online, () => go('signup'), () => go('login'));
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pwRoom, setPwRoom] = useState<RoomInfo | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'private'>('all');

  const [loadErr, setLoadErr] = useState(false);
  const load = () => {
    if (!online) return;
    api<RoomInfo[]>('rooms')
      .then((r) => (setRooms(r), setLoadErr(false)))
      .catch(() => (setRooms((x) => x ?? []), setLoadErr(true)));
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  const shown = (rooms ?? []).filter((r) => filter === 'all' || (filter === 'private' ? r.isPrivate : !r.isPrivate));

  const enter = async (room: RoomInfo, pw?: string) => {
    setErr('');
    setPwErr('');
    if (room.isPrivate && !room.joined && pw === undefined) {
      setPwInput('');
      return setPwRoom(room);
    }
    setBusy(true);
    try {
      const nick = account.profile?.nickname ?? loadNick().trim();
      const r = await api<Joined>('joinRoom', { roomId: room.id, nickname: nick, mode: profile.ui, password: pw });
      setPwRoom(null);
      onWaiting(r.roomId, r.playerId, nick, r.code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (pw !== undefined) setPwErr(msg);
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby page rooms">
      <PageHead
        title="방 찾기"
        onBack={() => go('custom')}
        right={
          <button className="icon-btn" aria-label="새로고침" title="새로고침" onClick={load}>
            <Icon name="refresh" size={18} />
          </button>
        }
      />

      <div className="chip-row">
        {(
          [
            ['all', '전체'],
            ['open', '공개방'],
            ['private', '비밀방'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        <span className="grow" />
        <button className="chip" onClick={() => okWhileMatching('코드로 입장은') && gate.guard(() => setCodeOpen(true))}>
          <Icon name="key" /> 코드로 입장
        </button>
      </div>

      {err && <p className="error" role="alert">{err}</p>}

      <div className="room-list">
        {rooms === null && <Loading />}
        {rooms !== null && shown.length === 0 && (
          <EmptyState
            icon={loadErr ? 'warn' : 'door'}
            tone={loadErr ? 'error' : undefined}
            title={loadErr ? '방 목록을 불러오지 못했어요' : rooms.length === 0 ? '지금 열린 방이 없어요' : '조건에 맞는 방이 없어요'}
            desc={loadErr ? '인터넷 연결을 확인해 주세요. 잠시 뒤 저절로 다시 불러와요.' : '직접 방을 만들고 친구를 불러 보세요.'}
            action={
              <button className="btn primary" onClick={() => okWhileMatching('방 만들기는') && gate.guard(() => go('create'))}>
                <Icon name="plus" /> 방 만들기
              </button>
            }
          />
        )}
        {shown.map((r) => (
          <button key={r.id} className={'room-row' + (r.joined ? ' joined' : '')} disabled={busy} onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => enter(r))}>
            <span className="rr-main">
              <b>
                {r.isPrivate && (
                  <span className="lock" title="비밀방">
                    <Icon name="lock" size={14} />
                    <span className="sr-only">비밀방</span>
                  </span>
                )}
                <FitText>{r.title}</FitText>
              </b>
              <small>
                방장 {r.host} · {r.totalDays}일 · 하루 {turnLabel(r.turnSeconds)}
              </small>
            </span>
            <span className="rr-side">
              <span className="rr-count">
                {Array.from({ length: r.maxPlayers }, (_, i) => (
                  <i key={i} className={i < r.players ? 'on' : ''} />
                ))}
              </span>
              <small>
                {r.players}/{r.maxPlayers}명
              </small>
              <em>{r.joined ? '돌아가기' : '입장'}</em>
            </span>
          </button>
        ))}
      </div>

      {pwRoom && (
        <Modal title={<><Icon name="lock" size={18} /> {pwRoom.title}</>} onClose={() => setPwRoom(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter(pwRoom, pwInput);
            }}
          >
            <p className="muted small">비밀방이에요. 방장에게 받은 비밀번호를 입력해 주세요.</p>
            <label className="field">
              <span>비밀번호</span>
              <input type="password" autoFocus value={pwInput} maxLength={20} autoComplete="off" onChange={(e) => setPwInput(e.target.value)} />
            </label>
            {pwErr && <p className="error">{pwErr}</p>}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setPwRoom(null)}>
                취소
              </button>
              <button type="submit" className="btn primary" disabled={busy || pwInput.length < 4}>
                입장
              </button>
            </div>
          </form>
        </Modal>
      )}
      {codeOpen && (
        <CodeJoin
          initial=""
          onJoined={(r) => onWaiting(r.roomId, r.playerId, account.profile?.nickname ?? loadNick().trim(), r.code)}
          onClose={() => setCodeOpen(false)}
        />
      )}
      {gate.el}
    </div>
  );
}

/* ================= 방 만들기 ================= */

function Create({ go, onWaiting }: Pick<Props, 'go' | 'onWaiting'>) {
  const profile = useProfile();
  const account = useAccount();
  const gate = useGuestGate(account, online, () => go('signup'), () => go('login'));
  const [title, setTitle] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [days, setDays] = useState(20);
  const [turnSec, setTurnSec] = useState(180);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pwOk = !isPrivate || (password.length >= 4 && password.length <= 20);
  const est = estimateMinutes(days, turnSec);
  const create = () => okWhileMatching('방 만들기는') && gate.guard(() => void doCreate());
  const doCreate = async () => {
    setErr('');
    if (!pwOk) return setErr('비밀번호는 4~20자로 정해 주세요.');
    setBusy(true);
    try {
      const nick = account.profile?.nickname ?? loadNick().trim();
      const r = await api<Joined>('create', {
        nickname: nick,
        mode: profile.ui,
        totalDays: days,
        turnSeconds: turnSec,
        maxPlayers,
        title: title.trim(),
        isPrivate,
        password: isPrivate ? password : undefined,
      });
      onWaiting(r.roomId, r.playerId, nick, r.code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby page create">
      <PageHead title="방 만들기" onBack={() => go('custom')} />

      <section className="panel pad">
        <h3 className="sec-h">기본</h3>
        <label className="field">
          <span>방 제목</span>
          <input value={title} maxLength={20} placeholder={`${account.profile?.nickname ?? ((account.status !== 'visitor' && profile.nick.trim()) || '나')}의 방`} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span>인원 (방장 포함)</span>
          <div className="seg five">
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} aria-pressed={maxPlayers === n} className={maxPlayers === n ? 'on' : ''} onClick={() => setMaxPlayers(n)}>
                <b>{n}명</b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel pad">
        <h3 className="sec-h">게임 규칙</h3>
        <div className="field">
          <span>게임 길이</span>
          <div className="seg">
            {DAY_OPTIONS.map((o) => (
              <button key={o.days} aria-pressed={days === o.days} className={days === o.days ? 'on' : ''} onClick={() => setDays(o.days)}>
                <b>{o.label}</b>
                <small>약 {estimateMinutes(o.days, turnSec).typical}분</small>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>하루 제한 시간</span>
          <div className="seg four">
            {TURN_OPTIONS.map((o) => (
              <button key={o.sec} aria-pressed={turnSec === o.sec} className={turnSec === o.sec ? 'on' : ''} onClick={() => setTurnSec(o.sec)}>
                <b>{o.label}</b>
                <small>{o.desc}</small>
              </button>
            ))}
          </div>
          <small className="hint">모두 마감하면 바로 다음 날. {graceSentence(maxPlayers, turnSec)}</small>
        </div>
        <div className="estimate">
          <span>⌛ 예상 게임 시간</span>
          <b>보통 약 {est.typical}분</b>
          <small>매일 시간을 끝까지 쓰면 최대 {est.max}분</small>
        </div>
      </section>

      <section className="panel pad">
        <h3 className="sec-h">공개 설정</h3>
        <div className="seg two">
          <button aria-pressed={!isPrivate} className={!isPrivate ? 'on' : ''} onClick={() => setIsPrivate(false)}>
            <b><Icon name="globe" /> 공개방</b>
            <small>누구나 목록에서 입장</small>
          </button>
          <button aria-pressed={isPrivate} className={isPrivate ? 'on' : ''} onClick={() => setIsPrivate(true)}>
            <b><Icon name="lock" /> 비밀방</b>
            <small>비밀번호 또는 초대 코드</small>
          </button>
        </div>
        {isPrivate && (
          <label className="field pw-field">
            <span>비밀번호 (4~20자)</span>
            <input type="password" value={password} maxLength={20} placeholder="비밀번호" autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
      </section>

      <div className="create-bar">
        <p className="create-sum">
          {maxPlayers}명 · {days}일 · 하루 {turnLabel(turnSec)} · 약 {est.typical}분 · {isPrivate ? '비밀방' : '공개방'}
        </p>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary xl" disabled={busy || !online || !pwOk} onClick={create}>
          {busy ? '만드는 중…' : '방 만들기'}
        </button>
      </div>
      {gate.el}
    </div>
  );
}

/* ================= 기록·업적 ================= */

/** 게임 화면에서 넘어온 짧은 확인 한 줄 (예: 기권한 뒤 '기권했어요') — 한 번만 보여 줌 */
function FlashNote() {
  const [text, setText] = useState(() => peekFlash());
  useEffect(() => {
    const on = () => setText(peekFlash());
    window.addEventListener('flash', on);
    return () => window.removeEventListener('flash', on);
  }, []);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(peekFlash()), flashLeft() + 50);
    return () => clearTimeout(t);
  }, [text]);
  return text ? <Toast text={text} /> : null;
}

function Records({ go }: Pick<Props, 'go'>) {
  const acc = useAccount();
  const [history, setHistory] = useState<MatchResult[] | null>(null);
  const [histErr, setHistErr] = useState(false);
  const [histTry, setHistTry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!online) return setHistory([]);
    setHistErr(false);
    api<MatchResult[]>('history')
      .then(setHistory)
      .catch(() => (setHistory([]), setHistErr(true)));
  }, [histTry]);

  const list = history ?? [];
  // 내 기준 전적: 판 수 · 1위 · 무승부, 판마다 내 순위와 수익률 (다른 사람 이름만 잔뜩 보이지 않게)
  const record = useMemo(() => {
    let wins = 0;
    let draws = 0;
    const rows = list.map((h) => {
      const meR = h.results.find((r) => r.nickname === h.me) ?? null;
      // 혼자 하는 오늘의 도전은 순위·승패가 없음 (비김·1위로 세지 않음)
      const solo = h.results.length === 1;
      const draw = !solo && !h.winner_nickname;
      const won = !draw && h.winner_nickname === h.me;
      // 비긴 판에서 나보다 높은 사람이 없으면 공동 1위 (프로필의 1등과 같은 기준: 공동 1위 포함)
      // 기권·거래 0회(매칭)는 서버가 맨 뒤로 보냄 → 공동 1위가 될 수 없고, 순위는 서버가 정한 차례 그대로 (프로필의 순위와 같게)
      const back = (r: { left?: boolean; idle?: boolean }) => !!(r.left || r.idle);
      const tiedTop = draw && !!meR && !back(meR) && !h.results.some((r) => !back(r) && r.ret > meR.ret);
      if (won || tiedTop) wins++;
      if (draw) draws++;
      // 1위는 서버가 정한 승자(기권 규칙 포함) 기준, 나머지 순위는 수익률 순
      const rank = solo ? null : won || tiedTop ? 1 : meR ? (back(meR) ? h.results.indexOf(meR) + 1 : Math.max(2, h.results.filter((r) => !back(r) && r.ret > meR.ret).length + 1)) : null;
      return { h, meR, draw, won, rank, tiedTop, solo };
    });
    return { wins, draws, games: list.length, rows };
  }, [list]);
  // 회원은 프로필과 같은 숫자(서버 기록)로 — 화면마다 1위 수·승률이 달라 보이지 않게. 손님은 이 기기 기록으로
  const sum = acc.status === 'member' && acc.profile ? { games: acc.profile.games, wins: acc.profile.wins } : { games: record.games, wins: record.wins };
  const myBadges = useMemo(() => {
    const count: Record<string, number> = {};
    for (const h of list) for (const r of h.results) if (r.nickname === h.me) for (const b of r.badges ?? []) count[b] = (count[b] ?? 0) + 1;
    return count;
  }, [list]);
  // 회원이 고른 칭호가 있으면 그것 (마이프로필·프로필 팝업과 같게), 없으면 가장 귀한 것
  const picked = titleLabel(acc.profile?.title);
  const myTitle = picked && givesTitle(picked.id) ? picked : titleOf(Object.keys(myBadges));

  return (
    <div className="lobby page records">
      <PageHead title="업적" onBack={() => go('home')} top desc="모은 업적과 최근 전적" />
      {history === null && <Loading />}
      {history !== null && list.length === 0 &&
        (histErr ? (
          <ErrorState what="기록" onRetry={() => (setHistory(null), setHistTry((n) => n + 1))} />
        ) : (
          <EmptyState icon="trophy" title="아직 끝낸 게임이 없어요" desc="대결을 한 판 끝내면 전적과 업적이 여기에 쌓여요." />
        ))}
      {list.length > 0 && (
        <section className="panel pad">
          <h3>최근 전적</h3>
          <div className="rec-sum">
            <div><b>{sum.games}</b><small>대결</small></div>
            <div><b className="rec-gold">{sum.wins}</b><small>1위</small></div>
            <div><b>{sum.games > 0 ? `${Math.round((sum.wins / sum.games) * 100)}%` : '-'}</b><small>승률{record.draws ? ` · 비김 ${record.draws}` : ''}</small></div>
          </div>
          {/* 롤·배그 전적처럼 한 줄 카드 — 누르면 그 판의 상세(참가자별 순위·수익률·재산·업적)가 펼쳐짐 */}
          <ul className="mr-list">
            {record.rows.slice(0, 20).map(({ h, meR, draw, won, rank, tiedTop, solo }) => {
              const open = openId === h.id;
              const kindName = h.results.length === 1 ? '오늘의 도전' : h.kind ? matchKindName(h.kind, h.ranked, h.results.length) : h.results.some((r) => r.bot) ? '봇전' : h.results.length === 2 ? '1대1' : `${h.results.length}명 대결`;
              return (
                <li key={h.id} className="mr-item">
                  <button className={'mr-row' + (won || tiedTop ? ' win' : '') + (open ? ' open' : '')} onClick={() => setOpenId(open ? null : h.id)} aria-expanded={open}>
                    <span className="mr-mode">
                      <b>{kindName}</b>
                      <small>{new Date(h.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</small>
                    </span>
                    <span className="mr-rank">
                      <b>{solo ? '완주' : tiedTop ? '공동 1위' : draw && !(meR && (meR.left || meR.idle)) ? '무승부' : rank ? `${rank}위` : '-'}</b>
                      <small>/ {h.results.length}명</small>
                    </span>
                    <span className={'mr-ret ' + (meR ? tone(meR.ret) : '')}>{meR ? pct(meR.ret, 1) : '-'}</span>
                    <span className="mr-pts">
                      {h.ranked && h.pts != null ? (
                        <b className={h.pts >= 0 ? 'up' : 'down'}>
                          {h.pts >= 0 ? '+' : ''}
                          {h.pts}점
                        </b>
                      ) : null}
                      <Icon name={open ? 'up' : 'down'} size={14} className="mr-chev" />
                    </span>
                  </button>
                  {open && (
                    <div className="mr-detail">
                      <ol className="mr-players">
                        {h.results.map((r, i) => (
                          <li key={r.nickname + i} className={r.nickname === h.me ? 'me' : ''}>
                            <span className="mr-p-rank">{i + 1}</span>
                            <span className="mr-p-name">
                              {r.nickname}
                              {r.nickname === h.me && <em> (나)</em>}
                              {!!r.bot && <span className="bot-tag">봇</span>}
                              {r.left && <span className="mr-tag">기권</span>}
                              {r.idle && <span className="mr-tag">거래 0회</span>}
                            </span>
                            <span className={'mr-p-ret ' + tone(r.ret)}>{pct(r.ret, 1)}</span>
                            <span className="mr-p-eq muted">{wonShort(r.equity)}</span>
                            {(r.badges ?? []).length > 0 && (
                              <span className="mr-p-badges">
                                {(r.badges ?? []).slice(0, 6).map((b) => (
                                  <span key={b} className="mr-badge" title={BADGE_MAP[b]?.desc}>
                                    <BadgeIcon id={b} size={12} /> {BADGE_MAP[b]?.name ?? b}
                                  </span>
                                ))}
                                {(r.badges ?? []).length > 6 && (
                                  // 마우스를 올리면(PC) · 누르면(휴대폰) 나머지 업적이 작은 팝업으로
                                  <span className="mr-more-wrap">
                                    <button className="mr-badge mr-more" aria-label={'업적 ' + ((r.badges ?? []).length - 6) + '개 더 보기'}>
                                      +{(r.badges ?? []).length - 6}
                                    </button>
                                    <span className="mr-more-pop" role="tooltip">
                                      {(r.badges ?? []).slice(6).map((b) => (
                                        <span key={b} className="mr-badge">
                                          <BadgeIcon id={b} size={12} /> {BADGE_MAP[b]?.name ?? b}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* 기록을 못 받았으면 업적도 숨김 (딴 업적이 모두 잠긴 것처럼 보이지 않게) */}
      {history !== null && !histErr && (
        <section className="panel pad">
          <h3>
            <Icon name="medal" /> 업적 <small className="muted badge-count">{BADGES.filter((b) => myBadges[b.id]).length}/{BADGES.length}</small> {myTitle && <span className="title-tag"><BadgeIcon id={myTitle.id} size={13} /> {myTitle.name}</span>}
          </h3>
          <BadgeShelf mine={myBadges} />
        </section>
      )}
      {/* 되돌릴 수 없는 '모두 지우기'는 맨 아래. 회원은 마이프로필에 같은 칸이 있으니 업적 화면엔 손님일 때만 */}
      {!(acc.status === 'member' && acc.profile) && <ForgetMe />}
    </div>
  );
}

/**
 * 재입장 안내 (배그의 '매치 재입장'처럼): 직접 나가지(기권) 않았는데 게임 밖에 있으면
 * — 창을 닫았거나 인터넷이 끊겼거나 뒤로가기로 빠진 경우 — 로비에 들어올 때 한 번 물어봄
 * 대결: 다시 입장 / 기권 · 대기실: 대기실로 / 나가기 · 연습: 이어하기 / 그만두기
 */
function Reconnect({ onWaiting, onGame, quiet }: Pick<Props, 'onWaiting' | 'onGame'> & { quiet?: boolean }) {
  const [multi, setMulti] = useState<ResumeInfo | null>(null);
  const [solo, setSolo] = useState(() => {
    const s = loadSolo();
    return s && s.data.room.status !== 'finished' ? s : null;
  });
  const [busy, setBusy] = useState(false);
  const gotResume = useRef(false);
  // 초대 링크(?room=)로 왔으면 '코드로 입장' 창이 먼저 — 이 팝업은 작은 띠로만 (두 창이 겹치지 않게)
  // 로그인·가입 화면에서도 작은 띠로만 — 입력하러 온 칸을 팝업이 가리지 않게
  const [hidden, setHidden] = useState(() => new URLSearchParams(location.search).has('room') || !!quiet);
  // 로그인·가입(게스트 기록 가져오기 포함) 화면에 있는 동안은 팝업 대신 작은 띠 — 입력하러 온 칸을 가리지 않게
  useEffect(() => {
    if (quiet) setHidden(true);
  }, [quiet]);
  const [err, setErr] = useState('');
  // 기권·방 나가기가 끝났다는 짧은 확인 (창이 그냥 닫히면 됐는지 알 수 없어서)
  const [done, setDone] = useState('');
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(''), 3500);
    return () => clearTimeout(t);
  }, [done]);
  useEffect(() => {
    if (!online) return;
    api<ResumeInfo | null>('resume')
      .then((r) => {
        // 답이 오는 사이 다른 창(봇전·도전 등)을 이미 열었으면 겹쳐 띄우지 않고 작은 띠로만
        // (이미 이 팝업을 띄웠으면 그건 '다른 창'이 아님 — 개발 모드처럼 두 번 확인해도 숨기지 않게)
        if (r && !gotResume.current && document.querySelector('.modal-bg')) setHidden(true);
        // 같은 대결을 이 기기의 다른 창에서 하고 있으면 '끊겼어요' 팝업 대신 작은 띠만
        if (r && r.status === 'playing' && gameOpenElsewhere(r.roomId)) setHidden(true);
        if (r) gotResume.current = true;
        setMulti(r);
      })
      .catch(() => {});
  }, []);
  const close = () => setHidden(true);
  // 팝업을 닫아도 진행 중인 대결로 돌아갈 길은 남김 (작은 띠)
  if (done && !multi && !solo) return <Toast text={done} />;
  if (hidden) {
    if (!multi && !solo) return null;
    const label = multi ? (multi.status === 'playing' ? '진행 중인 대결' : '들어가 있는 대기실') : '하던 연습 게임';
    return (
      <button className="rc-pill" onClick={() => setHidden(false)}>
        <Icon name="play" size={14} /> {label} · 다시 보기
      </button>
    );
  }
  if (multi) {
    const playing = multi.status === 'playing';
    return (
      <Modal title={<><Icon name={playing ? 'play' : 'door'} size={18} /> {playing ? '진행 중인 대결이 있어요' : '들어가 있는 대기실이 있어요'}</>} onClose={close}>
        <p className="muted small">
          {playing
            ? '연결이 끊겼거나 창이 닫혀서 대결 밖에 있어요. 대결은 계속 진행되고 있어요. 다시 들어갈까요?'
            : '대기실에 자리가 남아 있어요. 돌아가거나, 방에서 나갈 수 있어요.'}
        </p>
        <p className="rc-room">
          {multi.nickname} · 코드 <code>{multi.code}</code>
        </p>
        {err && <p className="error small">{err}</p>}
        <div className="modal-actions rc-actions">
          <button
            className="btn danger ghost"
            disabled={busy}
            onClick={async () => {
              if (playing && !(await ask('기권하면 이 대결에 다시 들어갈 수 없어요. 기권할까요?', { ok: '기권하기', danger: true }))) return;
              setBusy(true);
              setErr('');
              api('leave', { roomId: multi.roomId })
                .then(() => {
                  setDone(playing ? '기권했어요. 이 대결은 여기서 끝났어요.' : '방에서 나왔어요.');
                  setMulti(null);
                  window.dispatchEvent(new Event('rooms-changed'));
                })
                // 실패하면 팝업을 남겨 다시 시도할 수 있게 (기권한 줄 알고 막혀 있지 않게)
                .catch((e) => setErr(e instanceof Error ? e.message : '연결이 불안정해요. 다시 눌러 주세요.'))
                .finally(() => setBusy(false));
            }}
          >
            {playing ? '기권하기' : '방에서 나가기'}
          </button>
          <button
            className="btn primary"
            autoFocus
            onClick={() =>
              playing
                ? onGame({ mode: 'multi', roomId: multi.roomId, code: multi.code, playerId: multi.playerId, nickname: multi.nickname, ui: multi.mode === 'pro' ? 'pro' : 'easy' })
                : onWaiting(multi.roomId, multi.playerId, multi.nickname, multi.code)
            }
          >
            {playing ? '다시 입장' : '대기실로'}
          </button>
        </div>
      </Modal>
    );
  }
  if (solo)
    return (
      <Modal title={<><Icon name="target" size={18} /> 하던 연습 게임이 있어요</>} onClose={close}>
        <p className="muted small">
          연습 중간에 나왔어요 ({solo.data.room.day + 1}일차 / {solo.data.room.total_days}일). 이어서 할까요?
        </p>
        <div className="modal-actions rc-actions">
          <button
            className="btn ghost"
            onClick={() => {
              saveSolo(null);
              setSolo(null);
              setDone('연습을 그만뒀어요');
            }}
          >
            그만두기
          </button>
          <button className="btn primary" autoFocus onClick={() => onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: solo.nickname, ui: loadUi() })}>
            이어하기
          </button>
        </div>
      </Modal>
    );
  return null;
}

const PAGE_TAB: Partial<Record<LobbyPage, NavTab>> = {
  ranked: 'ranked',
  casual: 'casual',
  custom: 'custom',
  friends: 'friends',
  practice: 'practice',
  more: 'more',
  rooms: 'custom',
  create: 'custom',
  ranking: 'ranking',
  records: 'records',
  league: 'league',
  companies: 'companies',
};

/** 로비 틀: 왼쪽 메뉴(PC) / 아래 탭바(모바일) + 고른 화면 */
export function Lobby({ page, go, onWaiting, onGame }: Props) {
  const account = useAccount();
  const [modal, setModal] = useState<FrameModal>(null);
  const [socialOpen, setSocialOpen] = useState(false);
  // 1280px 이상은 소셜 칸이 옆에 붙어 있음 → 친구 버튼은 칸 접기·펴기 (버튼은 늘 그 자리)
  const wideSocial = useIsMobile('(min-width: 1280px)');
  // 넓은 화면(1280px 이상)에서 오른쪽 소셜 칸 접기 — 이 기기에 기억
  const [socialFold, setSocialFold] = useState(() => {
    try {
      return localStorage.getItem('stockduel.socialFold') === '1';
    } catch {
      return false;
    }
  });
  const fold = (v: boolean) => {
    setSocialFold(v);
    try {
      localStorage.setItem('stockduel.socialFold', v ? '1' : '0');
    } catch {
      /* 저장 못 해도 괜찮음 */
    }
  };
  // 옆에서 나오는 친구·파티 패널: Esc 로 닫기 (열린 창이 따로 있으면 그 창이 먼저)
  useEscape(() => setSocialOpen(false), socialOpen);
  // 운영자면 위 메뉴에 의견함 + 안 읽은 수 (30초마다, 운영자 확인은 서버가)
  const [adminUnread, setAdminUnread] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!online || account.status !== 'member') return setAdminUnread(undefined);
    let alive = true;
    let admin = false;
    const tick = () =>
      admin && document.visibilityState === 'visible'
        ? api<{ unread: number }>('adminUnread')
            .then((r) => alive && setAdminUnread(r.unread))
            .catch(() => {})
        : undefined;
    api<{ isAdmin: boolean }>('me')
      .then((m) => {
        admin = !!m.isAdmin;
        if (admin) tick();
      })
      .catch(() => {});
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [account.status]);
  // 받은 친구 신청 수 → 메뉴 배지 (회원만, 30초마다)
  const friends = useFriendsPoll(online && account.status === 'member');
  // 파티 상태는 어느 메뉴에 있든 확인 — 파티장이 찾기를 시작하면 파티원은 일반전 화면으로 데려가 같이 찾음
  const { party, reload: reloadParty } = useParty(online && account.status === 'member');
  const badges = { friends: friends?.incoming.length ?? 0 };
  const resolved: LobbyPage = page === 'home' ? lastTab() : page;
  const active = PAGE_TAB[resolved] ?? null;
  useEffect(() => {
    if (active) rememberTab(active);
  }, [active]);
  // 창(탭) 제목을 화면마다 — 브라우저 기록·탭·화면 읽기 프로그램에서 어느 화면인지 알 수 있게
  useEffect(() => {
    const name = PAGE_TITLE[resolved];
    document.title = name ? `${name} · 개미리그` : '개미리그';
  }, [resolved]);
  const goTab = (t: NavTab) => go(t as LobbyPage);
  const back = () => go('home');

  let body: ReactNode;
  switch (resolved) {
    case 'rooms':
      body = <Rooms go={go} onWaiting={onWaiting} />;
      break;
    case 'create':
      body = <Create go={go} onWaiting={onWaiting} />;
      break;
    case 'records':
      body = <Records go={go} />;
      break;
    case 'league':
      body = (
        <div className="lobby page league">
          <PageHead title="주간 리그" onBack={() => go('home')} top desc="매주 30명이 경험치로 겨뤄요 · 위는 승급, 아래는 강등" />
          <Suspense fallback={<Loading />}>
            <League go={go} />
          </Suspense>
        </div>
      );
      break;
    case 'companies':
      body = (
        <Suspense fallback={<Loading />}>
          <Companies onBack={back} />
        </Suspense>
      );
      break;
    case 'admin':
      body = (
        <Suspense fallback={<Loading />}>
          <Admin onBack={back} onLogin={() => go('login')} onNotices={() => go('notices')} />
        </Suspense>
      );
      break;
    case 'login':
    case 'signup':
      body = (
        <Suspense fallback={<Loading />}>
          <LoginPage key={resolved} initialTab={resolved === 'signup' ? 'signup' : 'login'} onBack={back} onDone={() => go('me')} />
        </Suspense>
      );
      break;
    case 'me':
      body = (
        <Suspense fallback={<Loading />}>
          <MyProfilePage onBack={back} onLogin={() => go('login')} onRanking={() => go('ranking')} onRecords={() => go('records')} />
        </Suspense>
      );
      break;
    case 'notices':
      body = (
        <Suspense fallback={<Loading />}>
          <NoticesPage onBack={back} onGo={go} />
        </Suspense>
      );
      break;
    case 'install':
      body = (
        <div className="lobby page install">
          <PageHead title="앱처럼 쓰기" onBack={back} top desc="홈 화면에 추가하면 주소창 없이 앱처럼 열려요" />
          <Suspense fallback={<Loading />}>
            <InstallGuide />
          </Suspense>
        </div>
      );
      break;
    case 'ranking':
      body = (
        <Suspense fallback={<Loading />}>
          <RankingPage onBack={back} onLogin={() => go('login')} onPlay={() => go('ranked')} />
        </Suspense>
      );
      break;
    case 'friends':
      body = (
        <div className="hub hub-friends">
          <header className="hub-head">
            <div>
              <h2>친구</h2>
              <p className="muted small">닉네임으로 친구를 추가하고 접속 상태를 봐요</p>
            </div>
          </header>
          <FriendsPage onSignup={() => go('signup')} onLogin={() => go('login')} />
        </div>
      );
      break;
    case 'ranked':
    case 'casual':
    case 'custom':
    case 'practice':
    case 'more':
      body = <Hub key={resolved} tab={resolved} go={go} onWaiting={onWaiting} onGame={onGame} openModal={setModal} party={party} reloadParty={reloadParty} />;
      break;
    default:
      body = <Hub key="casual" tab="casual" go={go} onWaiting={onWaiting} onGame={onGame} openModal={setModal} party={party} reloadParty={reloadParty} />;
  }

  // 플레이: 마지막에 찾던 설정(랭킹전/일반전 · 1대1/다인전 · 신속/일반)으로 바로 매칭 대기
  const member = account.status === 'member';
  const inParty = !!party && party.members.length > 1;
  const match = useMatch();
  const matching = match.phase !== 'idle';
  // 파티원: 파티장이 찾기 시작하면 (파티 확인 때마다 다시 보고) 내 쪽도 '찾는 중' — 메뉴는 억지로 옮기지 않음
  useEffect(() => {
    if (party && party.members.length > 1 && party.searching && !party.isLeader && match.phase === 'idle') followMatch(party.queue ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party]);
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!matching) return;
    const id = setInterval(() => setClock(Math.floor((Date.now() - getMatch().startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [matching]);
  const waitedSec = matching ? Math.max(0, Math.floor((Date.now() - match.startedAt) / 1000)) : 0;
  const matchTab: LobbyPage = match.queue?.startsWith('ranked') ? 'ranked' : 'casual';
  const goMatchTab = () => go(matchTab);
  // 찾는 중 화면(랭킹전·일반전)에 이미 크게 보이면 아래 떠 있는 '매칭 중' 띠는 숨김 (같은 내용이 두 번, 내용도 가림)
  const onMatchPage = resolved === matchTab;
  const [, setPrefTick] = useState(0);
  useEffect(() => {
    const on = () => setPrefTick((x) => x + 1);
    window.addEventListener(PREF_EVENT, on);
    return () => window.removeEventListener(PREF_EVENT, on);
  }, []);
  const play = () => {
    if (matching) return goMatchTab();
    if (inParty && !party!.isLeader) return go('casual'); // 파티원은 파티장이 찾기를 시작 (일반전 화면에 안내가 있음)
    const pref = loadMatchPref();
    const t: LobbyPage = pref.kind === 'ranked' && member && !inParty ? 'ranked' : 'casual';
    try {
      localStorage.setItem(FIND_AGAIN, t);
    } catch {
      /* 저장소 없음 */
    }
    if (t !== resolved) return go(t);
    window.dispatchEvent(new Event('stockduel:play'));
  };
  return (
    <div className={'lobby-shell client' + (socialFold ? ' social-folded' : '')}>
      {/* 키보드로 쓸 때: 위 메뉴를 건너뛰고 바로 본문 (Tab 을 처음 누르면 보임) */}
      <a className="skip-link" href="#lobby-main" onClick={(e) => (e.preventDefault(), document.getElementById('lobby-main')?.focus())}>
        본문으로 건너뛰기
      </a>
      <TopBar
        active={active}
        account={account}
        online={online}
        onGo={goTab}
        onPlay={play}
        playLabel={online ? playLabel(member, inParty) : undefined}
        matching={matching ? { text: queueText(match.queue), time: mmss(waitedSec), linking: match.phase === 'linking' } : null}
        onCancelMatch={() => void cancelMatch()}
        onProfile={() => go('me')}
        onLogin={() => go('login')}
        onSignup={() => go('signup')}
        playPicker={online ? <PlayPicker member={member} inParty={inParty} onFind={play} onLogin={() => go('login')} /> : undefined}
        socialBadge={badges.friends}
        socialOpen={wideSocial ? !socialFold : socialOpen}
        // 넓은 화면에서 접어 둔 상태면 위 친구 아이콘으로 다시 펼침, 그 밖엔 덮개 여닫기
        onSocial={() => (wideSocial ? fold(!socialFold) : setSocialOpen((v) => !v))}
        missions={online ? <MissionsButton onSignup={account.status === 'member' ? undefined : () => go('signup')} /> : undefined}
        adminUnread={adminUnread}
        onAdmin={() => go('admin')}
      />
      <div className="cl-body">
        <main className="lobby-main" id="lobby-main" tabIndex={-1}>
          <div className="lobby-topbar">
            <Brand />
            <span className="lt-right">
              {online && <MissionsButton compact onSignup={account.status === 'member' ? undefined : () => go('signup')} />}
              {adminUnread !== undefined && <AdminInboxButton unread={adminUnread} onClick={() => go('admin')} compact />}
              <AccountChip account={account} online={online} onProfile={() => go('me')} onLogin={() => go('login')} onSignup={() => go('signup')} compact />
            </span>
          </div>
          {/* 공지 줄: 위 메뉴 줄 바로 아래 따로 (사용자 2026-11-19 — 공지 때문에 '개미리그' 이름이 가려지지 않게) */}
          {online && <NoticeTicker />}
          <div className="lobby-body">
            <InAppBanner />
            {resolved !== 'league' && <LeagueResultNote member={account.status === 'member'} onOpen={() => go('league')} />}
            {body}
          </div>
          {matching && !onMatchPage && (
            <div className="mm-pill" role="status">
              <span className="mf-spin sm" aria-hidden />
              <button className="mm-txt" onClick={goMatchTab} aria-label="매칭 화면 열기">
                <span className="mm-l1">
                  <b>{match.phase === 'linking' ? '상대를 찾았어요' : match.phase === 'joining' ? '찾기 시작…' : '매칭 중'}</b>
                  <span className="mm-time">{mmss(waitedSec)}</span>
                </span>
                <small>
                  {queueText(match.queue)}
                  {match.phase === 'linking'
                    ? ' · 방 만드는 중'
                    : match.info?.etaSec != null
                      ? ` · 예상 ${waitLabel(match.info.etaSec)}`
                      : match.info && match.info.inQueue > 1
                        ? ` · ${match.info.inQueue - 1}명 함께 찾는 중`
                        : ''}
                </small>
              </button>
              {match.phase !== 'linking' && (
                <button className="mm-x" onClick={() => void cancelMatch()}>
                  취소
                </button>
              )}
            </div>
          )}
          {match.notice && (
            <div className="mm-notice" role="alert">
              {match.notice}
            </div>
          )}
          <footer className="cl-foot">
            <nav className="cl-foot-links" aria-label="안내">
              <button className="linkish-soft" onClick={() => setModal('privacy')}>
                <b>개인정보처리방침</b>
              </button>
              <button className="linkish-soft" onClick={() => setModal('terms')}>
                이용약관
              </button>
              <button className="linkish-soft" onClick={() => setModal('feedback')}>
                의견·버그 보내기
              </button>
            </nav>
            {OPERATOR && <p className="cl-foot-op">개미리그 · 개인 운영 · 운영자 {OPERATOR}</p>}
          </footer>
        </main>
        {online && (
          <div className={'cl-social-wrap' + (socialOpen ? ' open' : '') + (socialFold ? ' folded' : '')}>
            <SocialPanel
              onFold={() => fold(true)}
              account={account}
              party={party}
              reloadParty={reloadParty}
              onFriends={() => (setSocialOpen(false), go('friends'))}
              onLogin={() => go('login')}
              onSignup={() => go('signup')}
              onClose={() => setSocialOpen(false)}
            />
          </div>
        )}
      </div>
      <BottomNav active={active} online={online} onGo={goTab} badges={badges} />
      <Reconnect onWaiting={onWaiting} onGame={onGame} quiet={resolved === 'login' || resolved === 'signup'} />
      <FlashNote />
      {online && <NoticeCenter onGo={go} quiet={resolved === 'login' || resolved === 'signup' || resolved === 'notices'} />}
      <OfflineBanner />
      {online && <InviteCenter member={account.status === 'member'} onWaiting={onWaiting} onGame={onGame} onParty={() => go('casual')} />}
      {modal === 'howto' && <HowTo onClose={() => setModal(null)} />}
      {(modal === 'privacy' || modal === 'terms') && <LegalSheet kind={modal} onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackSheet onClose={() => setModal(null)} />}
    </div>
  );
}

/** 다음 단계까지 막대 (예: 골드 2 32/50) */
function TierProgress({ rating }: { rating: number }) {
  const t = tierOf(rating);
  const pct = t.division ? Math.round((t.points / DIV_POINTS) * 100) : 100;
  return (
    <div className="rk-prog" aria-label={`${t.label} ${t.points}점`}>
      <div className="rk-prog-bar">
        <i style={{ width: pct + '%', background: t.color }} />
      </div>
      <small className="muted">{t.division ? `다음 단계까지 ${DIV_POINTS - t.points}점` : `마스터 +${t.points}점`}</small>
    </div>
  );
}

/** 효과음 켜기/끄기 (이 기기에 기억) */
function SoundSetting() {
  const [m, setM] = useState(isMuted);
  return (
    <section className="panel pad more-sound">
      <div className="ms-row">
        <span>
          <b>효과음</b>
          <small className="muted">장 마감, 체결, 매칭 때 소리가 나요</small>
        </span>
        <button className={'tgl' + (m ? '' : ' on')} role="switch" aria-checked={!m} aria-label="효과음" onClick={() => (setMuted(!m), setM(!m))}>
          <i />
        </button>
      </div>
    </section>
  );
}

/**
 * 업적 목록 (설계서 design/achievements-v2.md): 딴 것만 이름·설명·보상, 못 딴 건 '???' 칸으로 개수만.
 * 귀한 순서(전설 → 희귀 → 일반, 같은 등급은 많이 딴 순), 웃픈 업적은 따로
 */
function BadgeShelf({ mine }: { mine: Record<string, number> }) {
  const got = BADGES.map((b, i) => ({ b, i, n: mine[b.id] ?? 0 })).filter((x) => x.n > 0);
  type G = (typeof got)[number];
  const sortFn = (x: G, y: G) => y.b.rarity - x.b.rarity || y.n - x.n || x.i - y.i;
  const normal = got.filter((x) => !x.b.funny).sort(sortFn);
  const funny = got.filter((x) => x.b.funny).sort(sortFn);
  const hidden = BADGES.length - got.length;
  const reward = (id: string) => {
    const pic = AVATARS.some((a) => a.need === id);
    const title = givesTitle(id);
    return pic && title ? '칭호 · 사진' : pic ? '사진' : '칭호';
  };
  const cell = ({ b, n }: G) => (
    <div key={b.id} className={'bg-cell got r' + b.rarity + (b.funny ? ' funny' : '')} title={b.desc}>
      <i>
        <BadgeIcon id={b.id} />
      </i>
      <b>{b.name}</b>
      <small>{b.desc}</small>
      <small className="bg-reward">
        {reward(b.id)} · ×{n}
      </small>
    </div>
  );
  return (
    <>
      {normal.length > 0 && <div className="badge-grid">{normal.map(cell)}</div>}
      {funny.length > 0 && (
        <>
          <h4 className="deco-sub">웃픈 업적</h4>
          <div className="badge-grid">{funny.map(cell)}</div>
        </>
      )}
      {hidden > 0 && (
        <div className="badge-grid bg-hidden-row">
          {Array.from({ length: Math.min(hidden, 6) }, (_, i) => (
            <div key={i} className="bg-cell hidden" aria-hidden>
              <i>?</i>
              <b>???</b>
            </div>
          ))}
        </div>
      )}
      {hidden > 0 && <p className="muted small deco-hidden">아직 못 찾은 업적 {hidden}개 — 무엇인지는 깨야 알 수 있어요. 좋은 일만 업적이 되는 건 아니에요.</p>}
    </>
  );
}
