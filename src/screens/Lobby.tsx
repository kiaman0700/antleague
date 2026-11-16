import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ask } from '../components/ConfirmHost';
import { FitText } from '../components/FitText';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { FIND_AGAIN, loadPref as loadMatchPref, MatchFinder, playLabel } from '../components/MatchFinder';
import { cancelMatch, followMatch, mmss, okWhileMatching, queueText, useMatch } from '../net/matchStore';
import { TierBadge, TierEmblem } from '../components/TierBadge';
import { isPlaced, PLACEMENT_GAMES, TIERS, tierOf } from '../game/tier';
import { AccountChip, BottomNav, Brand, lastTab, rememberTab, useGuestGate, type NavTab } from '../components/LobbyNav';
import { AdminInboxButton, SocialPanel, TopBar } from '../components/ClientChrome';
import { Companies } from './Companies';
import { Admin } from './Admin';
import { LoginPage, MyProfilePage, RankingPage } from './Account';
import { FriendsPage, useFriendsPoll } from './Friends';
import { InviteCenter } from '../components/InviteCenter';
import { PartyPanel, useParty, type PartyState } from '../components/PartyPanel';
import { useAccount } from '../net/account';
import { DEFAULT_SOLO_DAY, loadSolo, newSolo, saveSolo, SOLO_DAY_OPTIONS } from '../engine/local';
import { BADGES, titleOf } from '../game/achievements';
import { pct } from '../lib/format';
import { isMuted, setMuted } from '../lib/sound';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { BadgeIcon, Icon } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { isCustom, setPrefs, usePrefs } from '../prefs';
import { DAY_OPTIONS, estimateMinutes, graceText, loadNick, markTutorialSeen, tutorialSeen, loadUi, saveNick, saveUi, TURN_OPTIONS, turnLabel, type Session, type UiMode } from '../session';

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
  results: { nickname: string; equity: number; ret: number; badges?: string[] }[];
  created_at: string;
  me?: string | null;
}

/** 로비 안의 페이지 (각각 주소가 있음: / · /rooms · /create · /records) */
export type LobbyPage = 'home' | 'ranked' | 'casual' | 'custom' | 'friends' | 'practice' | 'more' | 'rooms' | 'create' | 'records' | 'customize' | 'companies' | 'tutorial' | 'admin' | 'login' | 'signup' | 'me' | 'ranking';

interface Props {
  page: LobbyPage;
  go: (page: LobbyPage) => void;
  onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void;
  onGame: (session: Session) => void;
}

type Joined = { roomId: string; playerId: string; code: string };

/** 이어하기 코드로 자리를 옮긴 뒤: 대기 중이면 대기실, 진행 중이면 바로 게임 */
function rejoined(
  r: { roomId: string; playerId: string; code: string; status: string; nickname: string; mode: string },
  onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void,
  onGame?: (s: Session) => void,
) {
  if (r.status === 'playing' && onGame) onGame({ mode: 'multi', roomId: r.roomId, code: r.code, playerId: r.playerId, nickname: r.nickname, ui: (r.mode as UiMode) ?? 'easy' });
  else onWaiting(r.roomId, r.playerId, r.nickname, r.code);
}

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
    ? `내가 바꾼 화면으로 · 바탕 ${value === 'easy' ? '초보' : '일반'}`
    : value === 'easy'
      ? '쉬운 말 · 금액 버튼으로 쉽게 사기 · 용어 설명'
      : '캔들 차트 · 수량 주문 · 시가/고가/저가';
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** 하위 페이지 머리: ← 뒤로 · 제목 · 오른쪽 버튼 */
function PageHead({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="page-head">
      <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
        <Icon name="back" size={18} />
      </button>
      <h2>{title}</h2>
      <div className="ph-right">{right}</div>
    </header>
  );
}

type Rejoined = { roomId: string; playerId: string; code: string; status: string; nickname: string; mode: string };

function CodeJoin({
  initial,
  onJoined,
  onRejoin,
  onClose,
}: {
  initial: string;
  onJoined: (r: Joined) => void;
  onRejoin: (r: Rejoined) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 방 코드(6자리) 또는 다른 기기에서 받은 이어하기 코드(방코드-10자리)
  const isRejoin = code.includes('-');
  const valid = isRejoin ? /^[A-Z0-9]{6}-[A-Z0-9]{10}$/.test(code) : code.length === 6;
  const submit = async () => {
    setErr('');
    if (!valid) return setErr(isRejoin ? '이어하기 코드는 "방코드-10자리" 모양이에요.' : '6자리 방 코드를 입력해 주세요.');
    if (isRejoin) {
      setBusy(true);
      try {
        onRejoin(await api<Rejoined>('rejoin', { code }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
      return;
    }
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
      <p className="muted small">친구에게 받은 6자리 초대 코드를 입력하세요. 비밀방도 코드로는 바로 들어갈 수 있어요. 다른 기기에서 하던 대결은 '이어하기 코드'(방코드-10자리)를 넣으면 이어서 할 수 있어요.</p>
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
          maxLength={17}
          placeholder="방 코드 또는 이어하기 코드"
          inputMode="text"
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-'))}
        />
        <button className="btn primary" disabled={busy || !online}>
          {isRejoin ? '이어하기' : '입장'}
        </button>
      </form>
      {!online && <p className="muted small">인터넷에 연결되면 입장할 수 있어요.</p>}
      {!err && code.length > 0 && !isRejoin && code.length < 6 && <p className="muted small">6자리 중 {code.length}자리 입력했어요</p>}
      {err && <p className="error">{err}</p>}
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
              <small>최대 {Math.round((o.days * (daySec + 8)) / 60)}분</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>하루(장) 길이</span>
        <div className="seg">
          {SOLO_DAY_OPTIONS.map((sec) => (
            <button key={sec} aria-pressed={daySec === sec} className={daySec === sec ? 'on' : ''} onClick={() => setDaySec(sec)}>
              <b>{sec / 60}분</b>
              <small>{sec === 60 ? '빠르게' : sec === 180 ? '추천' : '여유'}</small>
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

/** 운영자·개인정보 보호 책임자 (Vercel 환경변수 VITE_OPERATOR_CONTACT, 예: "홍길동 · contact@example.com") */
const OPERATOR = ((import.meta.env.VITE_OPERATOR_CONTACT as string | undefined) ?? '').trim().slice(0, 120);

/** 개인정보 처리 안내 — 이 게임이 실제로 저장하는 것만 */
function Privacy({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={<><Icon name="lock" size={18} /> 개인정보 처리 안내</>} onClose={onClose}>
      <div className="privacy">
        <p>개미리그는 게스트로도 플레이할 수 있어요. 이름·이메일·전화번호 같은 개인정보는 받지 않아요.</p>
        <h4>저장하는 것</h4>
        <ul>
          <li>이 기기를 구분하는 익명 계정 번호 (로그인용)</li>
          <li>직접 정한 닉네임, 참가한 방, 게임 안의 거래·카드 기록, 전적·업적</li>
          <li>회원으로 가입하면: 아이디, 비밀번호(암호화해서), 랭킹 점수 — 이메일·전화번호는 받지 않아요. 만 14세 미만은 가입할 수 없어요</li>
          <li>이 기기 안에만: 연습 게임 저장, 화면 설정, 관심 종목</li>
        </ul>
        <h4>쓰는 곳</h4>
        <p>게임 진행과 결과·기록 보여 주기에만 써요. 광고나 다른 곳에 넘기지 않아요. 서버는 Supabase(데이터베이스)와 Vercel(웹 호스팅)을 써요.</p>
        <h4>지우기</h4>
        <p>
          홈 → <b>업적</b> → <b>내 데이터 지우기</b>에서 언제든 모두 지울 수 있어요. 끝난 게임의 순위표에는 닉네임과 수익률만 남아요.
        </p>
        <h4>문의</h4>
        <p>
          궁금한 점, 버그·오류, 개인정보 관련 요청(내 데이터 확인·삭제 등)은 홈 아래 또는 게임 중 설정의 <b>의견·버그 보내기</b>로 남겨 주세요. 운영자만 읽고 답변이 필요한 요청은 처리해요. 개인정보 관련 요청은 '개인정보'를 골라 보내 주세요.
        </p>
        {OPERATOR && (
          <>
            <h4>개인정보 보호 책임자</h4>
            <p>{OPERATOR}</p>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          확인
        </button>
      </div>
    </Modal>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={<><Icon name="book" size={18} /> 이렇게 놀아요</>} onClose={onClose}>
      <ol className="howto">
        <li>
          <b>100만원</b>으로 시작해요. <b>아침 뉴스</b>를 보고 오를 것 같은 회사를 골라요. 좋은 뉴스는 <b>아침 시가에 이미 많이 반영</b>돼서 시작부터 올라 있을 수 있어요. 장이 열려 있는 동안 <b>가격이 1초마다 움직이고</b>, <b>장중 속보</b>가 뜨면 그 순간 크게 움직여요 — 빨리 알아채는 사람이 유리!
        </li>
        <li>
          국내·미국 주식과 <b>ETF</b>까지. 금리·환율·유가가 업종마다 다르게 영향을 줘요. 레버리지·인버스 ETF는 위험해서 <b>총재산의 30%까지만</b> 살 수 있어요.
        </li>
        <li>
          다 정했으면 <b>장 마감</b>. 모두 누르거나 <b>제한 시간</b>이 끝나면 하루가 흘러요.
        </li>
        <li>
          <b>장 전 시간</b>: 둘째 날부터 장이 열리기 전 20~30초 동안 <b>찌라시</b>(소문)를 보고 <b>예약 주문</b>을 걸 수 있어요. 모두 <b>준비 완료</b>를 누르면 장이 바로 열려요.
        </li>
        <li>
          어떤 회사는 며칠에 걸친 <b>사건</b>(임상·신작·수주…)이 있어요. '○일 뒤 발표 예정' 뉴스를 기억해 두세요 — 발표 날 크게 움직여요.
        </li>
        <li>
          <b>찬스 카드</b>로 내일 뉴스를 미리 보거나, 상대를 방해하세요. 카드를 누르면 '사용하기'가 나와요. 무료 카드는 모두에게 똑같이 나눠 줘요. 방해 카드는 한 사람에게 하루 한 번만 — 이미 누가 썼으면 내 카드는 쓰이지 않고 그대로 남아요.
        </li>
        <li>마지막 날 재산이 가장 많은 사람이 승리! 상대가 기권하면 바로 이겨요.</li>
      </ol>
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
type FrameModal = null | 'howto' | 'privacy' | 'feedback';

const TAB_HEAD: Record<HubTab, { title: string; desc: string }> = {
  ranked: { title: '랭킹전', desc: '실력이 비슷한 회원끼리 · 이기면 점수가 올라요' },
  casual: { title: '일반전', desc: '부담 없이 한 판 · 점수 변화 없음' },
  custom: { title: '커스텀', desc: '친구와 방을 만들어 규칙을 직접 정해요' },
  practice: { title: '연습', desc: '혼자 연습하고 규칙을 익혀요' },
  more: { title: '설정·더보기', desc: '내 계정 · 화면 모드 · 도움말' },
};

function Hub({ tab, go, onWaiting, onGame, openModal, party, reloadParty }: Omit<Props, 'page'> & { tab: HubTab; openModal: (m: FrameModal) => void; party: PartyState | null; reloadParty: () => Promise<void> }) {
  const account = useAccount();
  const profile = useProfile();
  const gate = useGuestGate(account, online, () => go('signup'), () => go('login'));
  const [modal, setModal] = useState<null | 'code' | 'practice'>(null);
  const [roomList, setRoomList] = useState<RoomInfo[] | null>(null);
  const openRooms = roomList ? roomList.filter((x) => !x.joined).length : null;
  const invite = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', []);
  const member = account.status === 'member' && !!account.profile;

  useEffect(() => {
    if (invite.length === 6) gate.guard(() => setModal('code'));
    if (!online) return;
    const loadRooms = () =>
      api<RoomInfo[]>('rooms')
        .then(setRoomList)
        .catch(() => {});
    loadRooms();
    // 커스텀 메뉴에서는 열린 방 목록을 10초마다 새로
    const id = tab === 'custom' ? setInterval(() => document.visibilityState === 'visible' && loadRooms(), 10_000) : 0;
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  const nick = () => (member ? account.profile!.nickname : loadNick().trim());
  const joined = (r: Joined) => onWaiting(r.roomId, r.playerId, nick(), r.code);
  const startPractice = (days: number, daySec: number) => {
    const s = newSolo(nick() || '나', days, daySec);
    onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: s.nickname, ui: profile.ui });
  };
  const head = TAB_HEAD[tab];
  // 처음 온 사람에게 튜토리얼 권하기 (한 번 닫거나 해 보면 다시 안 나옴)
  const [nudge, setNudge] = useState(() => !tutorialSeen());

  const finder = (kind: 'ranked' | 'casual') => (
    <MatchFinder
      member={member}
      loading={account.status === 'loading'}
      fixedKind={kind}
      guard={gate.guard}
      nickname={account.profile?.nickname ?? loadNick()}
      nickOk={member || profile.ok}
      ui={profile.ui}
      onNeedNick={() => gate.guard(() => {})}
      onLogin={() => go('login')}
      party={party ? { isLeader: party.isLeader, searching: party.searching, size: party.members.length, queue: party.queue } : null}
    />
  );

  return (
    <div className={'hub hub-' + tab}>
      <header className="hub-head">
        <div>
          <h2>{head.title}</h2>
          <p className="muted small">{head.desc}</p>
        </div>
      </header>

      {nudge && (tab === 'casual' || tab === 'ranked') && (
        <section className="panel pad hub-nudge" aria-label="처음이라면">
          <Icon name="book" size={22} />
          <div>
            <b>처음이세요? 3분 튜토리얼부터 해 보세요</b>
            <p className="muted small">연습 상대와 사고팔기·뉴스·카드를 직접 해 봐요. 진짜 대결이 훨씬 쉬워져요.</p>
          </div>
          <button className="btn primary" onClick={() => okWhileMatching('튜토리얼은') && go('tutorial')}>
            튜토리얼 하기
          </button>
          <button
            className="linkish-soft"
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
          <div className="hub-grid">
            {finder('ranked')}
            <section className="panel pad rank-card">
              <h3>
                <Icon name="crown" size={18} /> 내 랭킹
              </h3>
              <div className="rk-big">
                <TierBadge rating={account.profile!.rating} rankedGames={account.profile!.ranked_games} size={56} />
              </div>
              <p className="muted small">
                {isPlaced(account.profile!.ranked_games)
                  ? `${account.profile!.rankPos ?? '-'}위 · ${account.profile!.games}판 ${account.profile!.wins}승`
                  : `배치 ${account.profile!.ranked_games ?? 0}/${PLACEMENT_GAMES}판 · 끝나면 티어가 정해져요`}
              </p>
{isPlaced(account.profile!.ranked_games) && <TierProgress rating={account.profile!.rating} />}
              <details className="rk-help">
                <summary>점수는 어떻게 바뀌나요?</summary>
                <ul className="rk-rules muted small">
                  <li>이기면 오르고 지면 내려가요. 높은 티어를 이기면 더 많이, 낮은 티어에게 지면 더 많이 잃어요</li>
                  <li>점수가 비슷한 사람끼리 만나요. 사람이 적으면 2분 뒤부터 더 넓게 찾아요</li>
                  <li>중간에 기권하면 꼴찌로 계산돼요</li>
                </ul>
              </details>
              <button className="btn sm ghost" onClick={() => go('ranking')}>
                <Icon name="trophy" /> 전체 랭킹 보기
              </button>
            </section>
          </div>
        ) : (
          <div className="hub-grid">
            <section className="panel pad ranked-guest">
              <i className="rg-icon">
                <Icon name="trophy" size={34} />
              </i>
              <h3>랭킹전은 회원만 할 수 있어요</h3>
              <p className="muted">실력이 비슷한 회원끼리 겨루고, 이기면 랭킹 점수가 올라요. 가입은 아이디·비밀번호·닉네임만 있으면 돼요.</p>
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
            <section className="panel pad tier-ladder" aria-label="랭킹 티어">
              <h3>
                <Icon name="crown" size={18} /> 랭킹 티어
              </h3>
              <p className="muted small">처음 2판은 배치 경기예요. 그 뒤 점수에 따라 티어가 정해져요.</p>
              <ol>
                {[...TIERS].reverse().map((t) => (
                  <li key={t.id}>
                    <TierEmblem rating={t.id === 'bronze' ? 900 : t.min} size={30} />
                    <b style={{ color: t.color }}>{t.name}</b>
                    <small className="muted">{t.id === 'bronze' ? '시작' : t.min.toLocaleString() + '점부터'}</small>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ))}

      {tab === 'casual' &&
        (online ? (
          <div className="hub-grid">
            {finder('casual')}
            {member ? <PartyPanel party={party} reload={reloadParty} /> : <MatchFlow />}
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
              <small>인원·길이·시간을 직접 · 점수 없음</small>
            </button>
            <button className="tile" onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => go('rooms'))}>
              <i><Icon name="search" size={24} /></i>
              <b>방 찾기</b>
              <small>{openRooms === null ? '열린 방 둘러보기' : openRooms > 0 ? `지금 ${openRooms}개 열려 있어요` : '지금 열린 방이 없어요'}</small>
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
          {roomList === null && <p className="muted small">불러오는 중…</p>}
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
                <span className={'hr-rank r' + m.rank}>{m.rank}등</span>
                <small className="muted">
                  {m.players}명 · {new Date(m.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </small>
                <span className={'hr-ret ' + (m.ret >= 0 ? 'up' : 'down')}>{pct(m.ret, 1)}</span>
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
        <nav className="home-actions">
          <button className="tile" onClick={() => okWhileMatching('혼자 연습은') && setModal('practice')}>
            <i><Icon name="target" size={24} /></i>
            <b>혼자 연습</b>
            <small>나만의 속도로 · 이 기기에 저장</small>
          </button>
          <button className="tile" onClick={() => okWhileMatching('튜토리얼은') && go('tutorial')}>
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
            <small>종목·업종 알아보기</small>
          </button>
        </nav>
      )}

      {tab === 'more' && (
        <div className="more-page">
          <section className="panel pad">
            <h3>내 계정</h3>
            {member ? (
              <div className="more-acc">
                <AccountChip account={account} online={online} onProfile={() => go('me')} onLogin={() => go('login')} />
              </div>
            ) : account.status === 'loading' ? (
              <p className="muted small">내 계정을 확인하는 중…</p>
            ) : (
              <>
                <label className={'field' + (profile.nick && !profile.ok ? ' invalid' : '')}>
                  <span>게스트 닉네임 · 랭킹에는 안 올라가요</span>
                  <input value={profile.nick} maxLength={10} placeholder="예: 개미왕" onChange={(e) => profile.setNick(e.target.value)} />
                </label>
                {online && (
                  <div className="rg-actions">
                    <button className="btn sm primary" onClick={() => go('signup')}>
                      <Icon name="userPlus" /> 회원가입
                    </button>
                    <button className="btn sm" onClick={() => go('login')}>
                      로그인
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          <section className="panel pad">
            <div className="field">
              <span>화면 모드 · 게임 중에도 바꿀 수 있어요</span>
              <ModePicker value={profile.ui} onChange={profile.setUi} onEdit={() => go('customize')} />
            </div>
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
                <button className="more-row" onClick={() => go('records')}>
                  <Icon name="medal" /> <span className="mr-t"><b>업적</b><small>모은 업적·칭호·프로필 사진</small></span> <Icon name="right" size={14} />
                </button>
              )}
              <button className="more-row" onClick={() => go('practice')}>
                <Icon name="target" /> <span className="mr-t"><b>연습</b><small>혼자서 마음껏 연습</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => go('companies')}>
                <Icon name="book" /> <span className="mr-t"><b>공부</b><small>투자 기초 · 기업 살펴보기</small></span> <Icon name="right" size={14} />
              </button>
            </section>
            <section className="panel pad more-links">
              <h3 className="more-h">처음이라면</h3>
              <button className="more-row" onClick={() => okWhileMatching('튜토리얼은') && go('tutorial')}>
                <Icon name="play" /> <span className="mr-t"><b>튜토리얼</b><small>연습봇과 한 판 따라 하기</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('howto')}>
                <Icon name="help" /> <span className="mr-t"><b>게임 방법</b><small>규칙을 한눈에</small></span> <Icon name="right" size={14} />
              </button>
            </section>
            <section className="panel pad more-links">
              <h3 className="more-h">문의·안내</h3>
              <button className="more-row" onClick={() => openModal('feedback')}>
                <Icon name="bell" /> <span className="mr-t"><b>의견·버그 보내기</b><small>운영자에게 바로 전달돼요</small></span> <Icon name="right" size={14} />
              </button>
              <button className="more-row" onClick={() => openModal('privacy')}>
                <Icon name="lock" /> <span className="mr-t"><b>개인정보 처리 안내</b><small>모으는 정보와 지우는 방법</small></span> <Icon name="right" size={14} />
              </button>
            </section>
          </div>
        </div>
      )}

      {modal === 'code' && <CodeJoin initial={invite} onJoined={joined} onRejoin={(r) => rejoined(r, onWaiting, onGame)} onClose={() => setModal(null)} />}
      {modal === 'practice' && <PracticeStart onStart={startPractice} onClose={() => setModal(null)} />}
      {gate.el}
    </div>
  );
}

/** 한 판이 흘러가는 순서 (처음 온 사람용) */
function MatchFlow() {
  const steps: [string, string, string][] = [
    ['search', '대결 찾기', '비슷한 사람과 자동으로 묶여요. 모두 같은 시장·같은 뉴스로 시작해요.'],
    ['news', '장 전', '둘째 날부터 장이 열리기 전에 찌라시(소문)를 보고 예약 주문을 걸어요.'],
    ['activity', '장중', '가격이 1초마다 움직여요. 속보를 보고 사고팔고, 찬스 카드를 써요.'],
    ['trophy', '결과', '마지막 날 재산이 가장 많은 사람이 이겨요.'],
  ];
  return (
    <section className="panel pad match-flow" aria-label="한 판 진행 순서">
      <h3>한 판은 이렇게 진행돼요</h3>
      <ol>
        {steps.map(([icon, t, d]) => (
          <li key={t}>
            <i>
              <Icon name={icon as 'search'} size={18} />
            </i>
            <span>
              <b>{t}</b>
              <small className="muted">{d}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
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

      {err && <p className="error">{err}</p>}

      <div className="room-list">
        {rooms === null && <p className="muted small center">불러오는 중…</p>}
        {rooms !== null && shown.length === 0 && (
          <div className="empty-state">
            <i><Icon name="door" size={32} /></i>
            <b>{loadErr ? '방 목록을 불러오지 못했어요' : rooms.length === 0 ? '지금 열린 방이 없어요' : '조건에 맞는 방이 없어요'}</b>
            {loadErr && <small>인터넷 연결을 확인해 주세요. 6초마다 다시 시도해요.</small>}
            <small>직접 방을 만들고 친구를 불러 보세요.</small>
            <button className="btn primary" onClick={() => okWhileMatching('방 만들기는') && gate.guard(() => go('create'))}>
              <Icon name="plus" /> 방 만들기
            </button>
          </div>
        )}
        {shown.map((r) => (
          <button key={r.id} className={'room-row' + (r.joined ? ' joined' : '')} disabled={busy} onClick={() => okWhileMatching('방 들어가기는') && gate.guard(() => enter(r))}>
            <span className="rr-main">
              <b>
                {r.isPrivate && (
                  <span className="lock" title="비밀방">
                    <Icon name="lock" size={14} />
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
          onRejoin={(r) => rejoined(r, onWaiting)}
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
          <input value={title} maxLength={20} placeholder={`${account.profile?.nickname ?? (profile.nick.trim() || '나')}의 방`} onChange={(e) => setTitle(e.target.value)} />
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
          <small className="hint">모두 마감하면 바로 다음 날로 가요. {graceText(maxPlayers)} 카운트다운이 시작되고, 시간이 끝나면 자동으로 넘어가요. 마감은 넘어가기 전까지 취소할 수 있어요.</small>
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
        {err && <p className="error">{err}</p>}
        <button className="btn primary xl" disabled={busy || !online || !pwOk} onClick={create}>
          {busy ? '만드는 중…' : '방 만들기'}
        </button>
      </div>
      {gate.el}
    </div>
  );
}

/* ================= 기록·업적 ================= */

/** 내 데이터 모두 지우기 (개인정보 파기) */
function ForgetMe() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const forget = async () => {
    if (!(await ask('이 기기의 계정과 게임 기록(전적·업적·연습 저장·화면 설정)을 모두 지울까요? 되돌릴 수 없어요.', { ok: '모두 지우기', danger: true }))) return;
    setBusy(true);
    setErr('');
    try {
      if (online) await api('forgetMe');
      try {
        await supabase?.auth.signOut();
      } catch {
        /* 이미 지워진 계정 */
      }
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('stockduel') || k.startsWith('sb-')) localStorage.removeItem(k);
      } catch {
        /* 저장소 접근 불가 */
      }
      location.assign('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <section className="panel pad forget">
      <div>
        <b>내 데이터 지우기</b>
        <small className="muted">이 기기의 익명 계정, 전적·업적, 연습 저장, 화면 설정을 모두 지워요.</small>
      </div>
      <button className="btn sm danger" onClick={forget} disabled={busy}>
        {busy ? '지우는 중…' : '모두 지우기'}
      </button>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function Records({ go }: Pick<Props, 'go'>) {
  const [history, setHistory] = useState<MatchResult[] | null>(null);
  const [histErr, setHistErr] = useState(false);
  const [histTry, setHistTry] = useState(0);
  useEffect(() => {
    if (!online) return setHistory([]);
    setHistErr(false);
    api<MatchResult[]>('history')
      .then(setHistory)
      .catch(() => (setHistory([]), setHistErr(true)));
  }, [histTry]);

  const list = history ?? [];
  const record = useMemo(() => {
    const wins: Record<string, number> = {};
    let draws = 0;
    for (const h of list) {
      if (h.winner_nickname) wins[h.winner_nickname] = (wins[h.winner_nickname] ?? 0) + 1;
      else draws++;
    }
    return { wins: Object.entries(wins).sort((a, b) => b[1] - a[1]), draws };
  }, [list]);
  const myBadges = useMemo(() => {
    const count: Record<string, number> = {};
    for (const h of list) for (const r of h.results) if (r.nickname === h.me) for (const b of r.badges ?? []) count[b] = (count[b] ?? 0) + 1;
    return count;
  }, [list]);
  const myTitle = titleOf(Object.keys(myBadges));

  return (
    <div className="lobby page records">
      <PageHead title="업적" onBack={() => go('home')} />
      {history === null && <p className="muted small center">불러오는 중…</p>}
      {history !== null && list.length === 0 && (
        <div className="empty-state">
          <i><Icon name="trophy" size={32} /></i>
          <b>{histErr ? '기록을 불러오지 못했어요' : '아직 끝낸 게임이 없어요'}</b>
          {histErr ? (
            <>
              <small>인터넷 연결을 확인하고 다시 시도해 주세요.</small>
              <button className="btn sm" onClick={() => (setHistory(null), setHistTry((n) => n + 1))}>
                <Icon name="refresh" size={14} /> 다시 시도
              </button>
            </>
          ) : (
            <small>대결을 한 판 끝내면 전적과 업적이 여기에 쌓여요.</small>
          )}
        </div>
      )}
      {list.length > 0 && (
        <section className="panel pad">
          <h3>최근 전적</h3>
          <div className="record">
            {record.wins.map(([n, w]) => (
              <div key={n} className="record-item">
                <span>{n}</span>
                <b>{w}승</b>
              </div>
            ))}
            {record.draws > 0 && (
              <div className="record-item">
                <span>무승부</span>
                <b>{record.draws}</b>
              </div>
            )}
          </div>
          <ul className="recent">
            {list.slice(0, 10).map((h) => (
              <li key={h.id}>
                <span className="date">{new Date(h.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                {h.results.map((r, i) => (
                  <span key={i} className={r.nickname === h.winner_nickname ? 'winner' : ''}>
                    {r.nickname} {pct(r.ret, 1)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {history !== null && (
        <section className="panel pad">
          <h3>
            <Icon name="medal" /> 업적 {myTitle && <span className="title-tag"><BadgeIcon id={myTitle.id} size={13} /> {myTitle.name}</span>}
          </h3>
          <div className="badge-grid">
            {BADGES.map((b) => (
              <div key={b.id} className={'bg-cell r' + b.rarity + (myBadges[b.id] ? ' got' : '')} title={b.desc}>
                <i>{myBadges[b.id] ? <BadgeIcon id={b.id} /> : <Icon name="lock" size={20} />}</i>
                <b>{b.name}</b>
                <small>{myBadges[b.id] ? '×' + myBadges[b.id] : b.desc}</small>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* 되돌릴 수 없는 '모두 지우기'는 맨 아래 (실수로 누르기 쉬운 가운데 자리에서 옮김) */}
      <ForgetMe />
    </div>
  );
}

/**
 * 재입장 안내 (배그의 '매치 재입장'처럼): 직접 나가지(기권) 않았는데 게임 밖에 있으면
 * — 창을 닫았거나 인터넷이 끊겼거나 뒤로가기로 빠진 경우 — 로비에 들어올 때 한 번 물어봄
 * 대결: 다시 입장 / 기권 · 대기실: 대기실로 / 나가기 · 연습: 이어하기 / 그만두기
 */
function Reconnect({ onWaiting, onGame }: Pick<Props, 'onWaiting' | 'onGame'>) {
  const [multi, setMulti] = useState<ResumeInfo | null>(null);
  const [solo, setSolo] = useState(() => {
    const s = loadSolo();
    return s && s.data.room.status !== 'finished' ? s : null;
  });
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!online) return;
    api<ResumeInfo | null>('resume').then(setMulti).catch(() => {});
  }, []);
  const close = () => setHidden(true);
  // 팝업을 닫아도 진행 중인 대결로 돌아갈 길은 남김 (작은 띠)
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
                .then(() => setMulti(null))
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
          연습 중에 창이 닫혔어요 ({solo.data.room.day + 1}일차 / {solo.data.room.total_days}일). 이어서 할까요?
        </p>
        <div className="modal-actions rc-actions">
          <button
            className="btn ghost"
            onClick={() => {
              saveSolo(null);
              setSolo(null);
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
  companies: 'companies',
};

/** 로비 틀: 왼쪽 메뉴(PC) / 아래 탭바(모바일) + 고른 화면 */
export function Lobby({ page, go, onWaiting, onGame }: Props) {
  const account = useAccount();
  const [modal, setModal] = useState<FrameModal>(null);
  const [socialOpen, setSocialOpen] = useState(false);
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
    case 'companies':
      body = <Companies onBack={back} />;
      break;
    case 'admin':
      body = <Admin onBack={back} onLogin={() => go('login')} />;
      break;
    case 'login':
    case 'signup':
      body = <LoginPage key={resolved} initialTab={resolved === 'signup' ? 'signup' : 'login'} onBack={back} onDone={() => go('me')} />;
      break;
    case 'me':
      body = <MyProfilePage onBack={back} onLogin={() => go('login')} onRanking={() => go('ranking')} onRecords={() => go('records')} />;
      break;
    case 'ranking':
      body = <RankingPage onBack={back} onLogin={() => go('login')} />;
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
    const id = setInterval(() => setClock((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [matching]);
  const waitedSec = matching ? Math.max(0, Math.floor((Date.now() - match.startedAt) / 1000)) : 0;
  const goMatchTab = () => go(match.queue?.startsWith('ranked') ? 'ranked' : 'casual');
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
    <div className="lobby-shell client">
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
        socialBadge={badges.friends}
        socialOpen={socialOpen}
        onSocial={() => setSocialOpen((v) => !v)}
        adminUnread={adminUnread}
        onAdmin={() => go('admin')}
      />
      <div className="cl-body">
        <main className="lobby-main">
          <div className="lobby-topbar">
            <Brand />
            <span className="lt-right">
              {adminUnread !== undefined && <AdminInboxButton unread={adminUnread} onClick={() => go('admin')} compact />}
              <AccountChip account={account} online={online} onProfile={() => go('me')} onLogin={() => go('login')} compact />
            </span>
          </div>
          <div className="lobby-body">{body}</div>
          {matching && (
            <div className="mm-pill" role="status">
              <span className="mf-spin sm" aria-hidden />
              <button className="mm-txt" onClick={goMatchTab}>
                <b>{match.phase === 'linking' ? '방 만드는 중…' : '매칭 중'}</b>
                <small>
                  {queueText(match.queue)} · {mmss(waitedSec)}
                </small>
              </button>
              {match.phase !== 'linking' && (
                <button className="mm-x" onClick={() => void cancelMatch()} aria-label="그만 찾기">
                  <Icon name="x" size={16} />
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
            <button className="linkish-soft" onClick={() => setModal('feedback')}>
              의견·버그 보내기
            </button>
            <span aria-hidden> · </span>
            <button className="linkish-soft" onClick={() => setModal('privacy')}>
              개인정보 처리 안내
            </button>
          </footer>
        </main>
        {online && (
          <div className={'cl-social-wrap' + (socialOpen ? ' open' : '')}>
            <SocialPanel
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
      <Reconnect onWaiting={onWaiting} onGame={onGame} />
      {online && <InviteCenter member={account.status === 'member'} onWaiting={onWaiting} onGame={onGame} onParty={() => go('casual')} />}
      {modal === 'howto' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'privacy' && <Privacy onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackSheet onClose={() => setModal(null)} />}
    </div>
  );
}

/** 다음 단계까지 막대 (예: 골드 II 32/50) */
function TierProgress({ rating }: { rating: number }) {
  const t = tierOf(rating);
  const pct = t.division ? Math.round((t.points / 50) * 100) : 100;
  return (
    <div className="rk-prog" aria-label={`${t.label} ${t.points}점`}>
      <div className="rk-prog-bar">
        <i style={{ width: pct + '%', background: t.color }} />
      </div>
      <small className="muted">{t.division ? `다음 단계까지 ${50 - t.points}점` : `마스터 +${t.points}점`}</small>
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
          <small className="muted">마감·체결·매칭 소리</small>
        </span>
        <button className={'tgl' + (m ? '' : ' on')} role="switch" aria-checked={!m} onClick={() => (setMuted(!m), setM(!m))}>
          <i />
        </button>
      </div>
    </section>
  );
}
