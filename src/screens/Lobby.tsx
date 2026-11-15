import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FitText } from '../components/FitText';
import { Companies } from './Companies';
import { DEFAULT_SOLO_DAY, loadSolo, newSolo, saveSolo, SOLO_DAY_OPTIONS } from '../engine/local';
import { BADGES, titleOf } from '../game/achievements';
import { pct } from '../lib/format';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { BadgeIcon, Icon } from '../components/Icon';
import { PrefsPanel, Sheet } from '../components/PrefsPanel';
import { isCustom, setPrefs, usePrefs } from '../prefs';
import { DAY_OPTIONS, estimateMinutes, graceText, loadNick, loadUi, saveNick, saveUi, TURN_OPTIONS, turnLabel, type Session, type UiMode } from '../session';

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
export type LobbyPage = 'home' | 'rooms' | 'create' | 'records' | 'customize' | 'companies' | 'tutorial';

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
  return (
    <div className="mode-pick three">
      <button className={!custom && value === 'easy' ? 'on' : ''} onClick={() => pick('easy')}>
        <span className="mp-emoji"><Icon name="book" size={22} /></span>
        <b>초보 모드</b>
        <small>쉬운 말 · 금액으로 사기 · 용어 설명 · 첫 판 안내</small>
      </button>
      <button className={!custom && value === 'pro' ? 'on' : ''} onClick={() => pick('pro')}>
        <span className="mp-emoji"><Icon name="bars" size={22} /></span>
        <b>일반 모드</b>
        <small>캔들 차트 · 수량 주문 · 시가/고가/저가 정보</small>
      </button>
      <div className={'mp-custom' + (custom ? ' on' : '')}>
        <button className="mp-main" onClick={() => setPrefs({ enabled: true })}>
          <span className="mp-emoji"><Icon name="sliders" size={22} /></span>
          <b>커스텀 모드</b>
          <small>{custom ? `내 화면 사용 중 · 바탕 ${value === 'easy' ? '초보' : '일반'}` : '내 화면으로 바꿔 쓰기'}</small>
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
      {open && (
        <Sheet title={<><Icon name="sliders" size={18} /> 커스텀 모드 설정</>} onClose={() => setOpen(false)}>
          <div className="field">
            <span>바탕 모드 (쉬운 말·주문 방식)</span>
            <div className="seg two">
              <button className={value === 'easy' ? 'on' : ''} onClick={() => onChange('easy')}>
                <b>초보</b>
              </button>
              <button className={value === 'pro' ? 'on' : ''} onClick={() => onChange('pro')}>
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

/** 닉네임이 없을 때만 보이는 입력 칸 (주소로 바로 들어온 경우) */
function NickGate({ profile }: { profile: ReturnType<typeof useProfile> }) {
  const [shown] = useState(() => !profile.ok);
  if (!shown) return null;
  return (
    <div className="panel pad nick-gate">
      <label className="field">
        <span>먼저 닉네임을 정해 주세요</span>
        <input value={profile.nick} maxLength={10} placeholder="예: 개미왕" onChange={(e) => profile.setNick(e.target.value)} />
      </label>
    </div>
  );
}

type Rejoined = { roomId: string; playerId: string; code: string; status: string; nickname: string; mode: string };

function CodeJoin({
  initial,
  profile,
  onJoined,
  onRejoin,
  onClose,
}: {
  initial: string;
  profile: ReturnType<typeof useProfile>;
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
    if (!profile.ok) return setErr('닉네임을 먼저 1~10자로 정해 주세요.');
    setBusy(true);
    try {
      onJoined(await api<Joined>('join', { code, nickname: profile.nick.trim(), mode: profile.ui }));
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
        <button className="btn primary" disabled={busy || !online || !valid}>
          {isRejoin ? '이어하기' : '입장'}
        </button>
      </form>
      {err && <p className="error">{err}</p>}
    </Modal>
  );
}

function PracticeStart({ profile, onStart, onClose }: { profile: ReturnType<typeof useProfile>; onStart: (days: number, daySec: number) => void; onClose: () => void }) {
  const [days, setDays] = useState(20);
  const [daySec, setDaySec] = useState<number>(DEFAULT_SOLO_DAY);
  const [err, setErr] = useState('');
  return (
    <Modal title={<><Icon name="target" size={18} /> 혼자 연습하기</>} onClose={onClose}>
      <p className="muted small">혼자서 같은 규칙으로 연습해요. 장중에 가격이 실시간으로 움직이고, 다 정했으면 "장 마감"으로 남은 시간을 건너뛸 수 있어요. 이 기기에 저장돼요.</p>
      <div className="field">
        <span>게임 길이</span>
        <div className="seg">
          {DAY_OPTIONS.map((o) => (
            <button key={o.days} className={days === o.days ? 'on' : ''} onClick={() => setDays(o.days)}>
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
            <button key={sec} className={daySec === sec ? 'on' : ''} onClick={() => setDaySec(sec)}>
              <b>{sec / 60}분</b>
              <small>{sec === 60 ? '빠르게' : sec === 180 ? '추천' : '여유'}</small>
            </button>
          ))}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          취소
        </button>
        <button className="btn primary" onClick={() => (profile.ok ? onStart(days, daySec) : setErr('닉네임을 먼저 1~10자로 정해 주세요.'))}>
          시작하기
        </button>
      </div>
    </Modal>
  );
}

/** 개인정보 처리 안내 — 이 게임이 실제로 저장하는 것만 */
function Privacy({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={<><Icon name="lock" size={18} /> 개인정보 처리 안내</>} onClose={onClose}>
      <div className="privacy">
        <p>주식 대결은 회원가입 없이 익명으로 플레이해요. 이름·이메일·전화번호 같은 개인정보는 받지 않아요.</p>
        <h4>저장하는 것</h4>
        <ul>
          <li>이 기기를 구분하는 익명 계정 번호 (로그인용)</li>
          <li>직접 정한 닉네임, 참가한 방, 게임 안의 거래·카드 기록, 전적·업적</li>
          <li>이 기기 안에만: 연습 게임 저장, 화면 설정, 관심 종목</li>
        </ul>
        <h4>쓰는 곳</h4>
        <p>게임 진행과 결과·기록 보여 주기에만 써요. 광고나 다른 곳에 넘기지 않아요. 서버는 Supabase(데이터베이스)와 Vercel(웹 호스팅)을 써요.</p>
        <h4>지우기</h4>
        <p>
          홈 → <b>기록·업적</b> → <b>내 데이터 지우기</b>에서 언제든 모두 지울 수 있어요. 끝난 게임의 순위표에는 닉네임과 수익률만 남아요.
        </p>
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
          <b>아침 뉴스</b>를 보고 오를 것 같은 회사를 골라요. 좋은 뉴스는 <b>아침 시가에 이미 많이 반영</b>돼서 시작부터 올라 있을 수 있어요. 장이 열려 있는 동안 <b>가격이 5초마다 움직이고</b>, <b>장중 속보</b>가 뜨면 그 순간 크게 움직여요 — 빨리 알아채는 사람이 유리!
        </li>
        <li>
          국내·미국 주식과 <b>ETF</b>까지. 금리·환율·유가가 업종마다 다르게 영향을 줘요.
        </li>
        <li>
          다 정했으면 <b>장 마감</b>. 모두 누르거나 <b>제한 시간</b>이 끝나면 하루가 흘러요.
        </li>
        <li>
          <b>찬스 카드</b>로 내일 뉴스를 미리 보거나, 상대를 방해하세요. 무료 카드는 모두에게 똑같이 나눠 줘요. 한 사람에게 같은 날 방해가 몰리면 두 번째부터는 효과가 없어요.
        </li>
        <li>마지막 날 재산이 가장 많은 사람이 승리!</li>
      </ol>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          알겠어요
        </button>
      </div>
    </Modal>
  );
}

/* ================= 홈 ================= */

function Home({ go, onWaiting, onGame }: Omit<Props, 'page'>) {
  const profile = useProfile();
  const [modal, setModal] = useState<null | 'code' | 'practice' | 'howto' | 'prefs' | 'privacy'>(null);
  const prefs = usePrefs();
  const [nickErr, setNickErr] = useState(false);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [openRooms, setOpenRooms] = useState<number | null>(null);
  const [soloSave, setSoloSave] = useState(() => {
    const s = loadSolo();
    return s && s.data.room.status !== 'finished' ? s : null;
  });
  const nickRef = useRef<HTMLInputElement>(null);
  const invite = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) ?? '', []);

  useEffect(() => {
    if (invite.length === 6) setModal('code');
    if (!online) return;
    api<ResumeInfo | null>('resume').then(setResume).catch(() => {});
    api<RoomInfo[]>('rooms')
      .then((r) => setOpenRooms(r.filter((x) => !x.joined).length))
      .catch(() => {});
  }, [invite]);

  /** 닉네임이 있어야 하는 행동 */
  const need = (fn: () => void) => () => {
    if (profile.ok) return fn();
    setNickErr(true);
    nickRef.current?.focus();
  };

  const joined = (r: Joined) => onWaiting(r.roomId, r.playerId, profile.nick.trim(), r.code);
  const startPractice = (days: number, daySec: number) => {
    const s = newSolo(profile.nick.trim(), days, daySec);
    onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: s.nickname, ui: profile.ui });
  };
  const doResume = () => {
    if (!resume) return;
    if (resume.status === 'waiting') return onWaiting(resume.roomId, resume.playerId, resume.nickname, resume.code);
    onGame({ mode: 'multi', roomId: resume.roomId, code: resume.code, playerId: resume.playerId, nickname: resume.nickname, ui: resume.mode === 'pro' ? 'pro' : 'easy' });
  };

  return (
    <div className="lobby home">
      <header className="hero compact">
        <div className="hero-mark">
          <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden>
            <rect width="64" height="64" rx="18" fill="url(#hg)" />
            <path d="M14 42 L26 30 L34 36 L50 20" stroke="#0b0d12" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="50" cy="20" r="4" fill="#0b0d12" />
            <defs>
              <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffe08a" />
                <stop offset="1" stopColor="#f5b83d" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <h1>
            주식 <em>대결</em>
          </h1>
          <p className="sub">같은 시장, 같은 뉴스. 누가 더 벌까?</p>
        </div>
      </header>

      {(resume || soloSave) && (
        <div className="resume-list">
          {resume && (
            <div className="resume-card">
              <span className="rc-text">
                <b>{resume.status === 'waiting' ? '대기 중인 방' : '진행 중인 게임'}</b>
                <small>
                  {resume.nickname} · 코드 <code>{resume.code}</code>
                </small>
              </span>
              <button className="btn sm primary" onClick={doResume}>
                {resume.status === 'waiting' ? '대기실로' : '이어하기'}
              </button>
              <button className="icon-btn sm" aria-label="닫기" onClick={() => setResume(null)}>
                <Icon name="x" />
              </button>
            </div>
          )}
          {soloSave && (
            <div className="resume-card">
              <span className="rc-text">
                <b>하던 연습 게임</b>
                <small>
                  {soloSave.data.room.day + 1}일차 / {soloSave.data.room.total_days}일
                </small>
              </span>
              <button className="btn sm primary" onClick={() => onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: soloSave.nickname, ui: profile.ui })}>
                이어하기
              </button>
              <button
                className="icon-btn sm"
                aria-label="연습 기록 버리기"
                title="버리기"
                onClick={() => {
                  saveSolo(null);
                  setSoloSave(null);
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          )}
        </div>
      )}

      <section className="panel pad profile">
        <label className={'field' + (nickErr && !profile.ok ? ' invalid' : '')}>
          <span>닉네임</span>
          <input
            ref={nickRef}
            value={profile.nick}
            maxLength={10}
            placeholder="예: 개미왕"
            onChange={(e) => {
              profile.setNick(e.target.value);
              setNickErr(false);
            }}
          />
          {nickErr && !profile.ok && <small className="error">닉네임을 1~10자로 입력해 주세요.</small>}
        </label>
        <div className="field">
          <span>화면 모드 · 게임 중에도 바꿀 수 있어요</span>
          <ModePicker value={profile.ui} onChange={profile.setUi} onEdit={() => go('customize')} />
        </div>
      </section>

      <nav className="home-actions">
        <button className="tile primary" disabled={!online} onClick={need(() => go('rooms'))}>
          <i><Icon name="search" size={24} /></i>
          <b>방 찾기</b>
          <small>{!online ? '온라인 설정 필요' : openRooms === null ? '열린 방 둘러보기' : openRooms > 0 ? `지금 ${openRooms}개 열려 있어요` : '지금 열린 방이 없어요'}</small>
        </button>
        <button className="tile" disabled={!online} onClick={need(() => go('create'))}>
          <i><Icon name="plus" size={24} /></i>
          <b>방 만들기</b>
          <small>인원·길이·시간 설정</small>
        </button>
        <button className="tile" disabled={!online} onClick={need(() => setModal('code'))}>
          <i><Icon name="key" size={24} /></i>
          <b>코드로 입장</b>
          <small>초대 코드 6자리</small>
        </button>
        <button className="tile" onClick={need(() => setModal('practice'))}>
          <i><Icon name="target" size={24} /></i>
          <b>혼자 연습</b>
          <small>나만의 속도로</small>
        </button>
      </nav>

      <div className="home-links">
        <button className="btn ghost sm" onClick={() => go('tutorial')}>
          <Icon name="play" /> 튜토리얼
        </button>
        <button className="btn ghost sm" onClick={() => go('companies')}>
          <Icon name="book" /> 기업 도감
        </button>
        <button className="btn ghost sm" onClick={() => setModal('howto')}>
          <Icon name="help" /> 게임 방법
        </button>
        {online && (
          <button className="btn ghost sm" onClick={() => go('records')}>
            <Icon name="trophy" /> 기록·업적
          </button>
        )}
      </div>
      <p className="home-foot">
        <button className="linkish-soft" onClick={() => setModal('privacy')}>
          개인정보 처리 안내
        </button>
      </p>

      {modal === 'code' && <CodeJoin initial={invite} profile={profile} onJoined={joined} onRejoin={(r) => rejoined(r, onWaiting, onGame)} onClose={() => setModal(null)} />}
      {modal === 'practice' && <PracticeStart profile={profile} onStart={startPractice} onClose={() => setModal(null)} />}
      {modal === 'howto' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'privacy' && <Privacy onClose={() => setModal(null)} />}
      {modal === 'prefs' && (
        <Sheet title={<><Icon name="sliders" size={18} /> 내 화면 설정</>} onClose={() => setModal(null)}>
          <PrefsPanel ui={profile.ui} />
        </Sheet>
      )}
    </div>
  );
}

/* ================= 방 찾기 ================= */

function Rooms({ go, onWaiting }: Pick<Props, 'go' | 'onWaiting'>) {
  const profile = useProfile();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pwRoom, setPwRoom] = useState<RoomInfo | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'private'>('all');

  const load = () => {
    if (!online) return;
    api<RoomInfo[]>('rooms')
      .then(setRooms)
      .catch(() => setRooms([]));
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
    if (!profile.ok) return setErr('닉네임을 먼저 1~10자로 정해 주세요.');
    if (room.isPrivate && !room.joined && pw === undefined) {
      setPwInput('');
      return setPwRoom(room);
    }
    setBusy(true);
    try {
      const r = await api<Joined>('joinRoom', { roomId: room.id, nickname: profile.nick.trim(), mode: profile.ui, password: pw });
      setPwRoom(null);
      onWaiting(r.roomId, r.playerId, profile.nick.trim(), r.code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (pw !== undefined) setPwErr(msg);
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby page">
      <PageHead
        title="방 찾기"
        onBack={() => go('home')}
        right={
          <button className="icon-btn" aria-label="새로고침" title="새로고침" onClick={load}>
            <Icon name="refresh" size={18} />
          </button>
        }
      />
      <NickGate profile={profile} />

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
        <button className="chip" onClick={() => setCodeOpen(true)}>
          <Icon name="key" /> 코드로 입장
        </button>
      </div>

      {err && <p className="error">{err}</p>}

      <div className="room-list">
        {rooms === null && <p className="muted small center">불러오는 중…</p>}
        {rooms !== null && shown.length === 0 && (
          <div className="empty-state">
            <i><Icon name="door" size={32} /></i>
            <b>{rooms.length === 0 ? '지금 열린 방이 없어요' : '조건에 맞는 방이 없어요'}</b>
            <small>직접 방을 만들고 친구를 불러 보세요.</small>
            <button className="btn primary" onClick={() => go('create')}>
              <Icon name="plus" /> 방 만들기
            </button>
          </div>
        )}
        {shown.map((r) => (
          <button key={r.id} className={'room-row' + (r.joined ? ' joined' : '')} disabled={busy} onClick={() => enter(r)}>
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
          profile={profile}
          onJoined={(r) => onWaiting(r.roomId, r.playerId, profile.nick.trim(), r.code)}
          onRejoin={(r) => rejoined(r, onWaiting)}
          onClose={() => setCodeOpen(false)}
        />
      )}
    </div>
  );
}

/* ================= 방 만들기 ================= */

function Create({ go, onWaiting }: Pick<Props, 'go' | 'onWaiting'>) {
  const profile = useProfile();
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
  const create = async () => {
    setErr('');
    if (!profile.ok) return setErr('닉네임을 먼저 1~10자로 정해 주세요.');
    if (!pwOk) return setErr('비밀번호는 4~20자로 정해 주세요.');
    setBusy(true);
    try {
      const r = await api<Joined>('create', {
        nickname: profile.nick.trim(),
        mode: profile.ui,
        totalDays: days,
        turnSeconds: turnSec,
        maxPlayers,
        title: title.trim(),
        isPrivate,
        password: isPrivate ? password : undefined,
      });
      onWaiting(r.roomId, r.playerId, profile.nick.trim(), r.code);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lobby page create">
      <PageHead title="방 만들기" onBack={() => go('home')} />
      <NickGate profile={profile} />

      <section className="panel pad">
        <h3 className="sec-h">기본</h3>
        <label className="field">
          <span>방 제목</span>
          <input value={title} maxLength={20} placeholder={`${profile.nick.trim() || '나'}의 방`} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="field">
          <span>인원 (방장 포함)</span>
          <div className="seg five">
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={maxPlayers === n ? 'on' : ''} onClick={() => setMaxPlayers(n)}>
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
              <button key={o.days} className={days === o.days ? 'on' : ''} onClick={() => setDays(o.days)}>
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
              <button key={o.sec} className={turnSec === o.sec ? 'on' : ''} onClick={() => setTurnSec(o.sec)}>
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
          <button className={!isPrivate ? 'on' : ''} onClick={() => setIsPrivate(false)}>
            <b><Icon name="globe" /> 공개방</b>
            <small>누구나 목록에서 입장</small>
          </button>
          <button className={isPrivate ? 'on' : ''} onClick={() => setIsPrivate(true)}>
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
    </div>
  );
}

/* ================= 기록·업적 ================= */

/** 내 데이터 모두 지우기 (개인정보 파기) */
function ForgetMe() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const forget = async () => {
    if (!window.confirm('이 기기의 계정과 게임 기록(전적·업적·연습 저장·화면 설정)을 모두 지울까요? 되돌릴 수 없어요.')) return;
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
  useEffect(() => {
    if (!online) return setHistory([]);
    api<MatchResult[]>('history')
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

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
    <div className="lobby page">
      <PageHead title="기록·업적" onBack={() => go('home')} />
      {history === null && <p className="muted small center">불러오는 중…</p>}
      {history !== null && list.length === 0 && (
        <div className="empty-state">
          <i><Icon name="trophy" size={32} /></i>
          <b>아직 끝낸 게임이 없어요</b>
          <small>친구와 한 판 끝내면 전적과 업적이 여기에 쌓여요.</small>
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
      <ForgetMe />
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
    </div>
  );
}

export function Lobby({ page, go, onWaiting, onGame }: Props) {
  if (page === 'rooms') return <Rooms go={go} onWaiting={onWaiting} />;
  if (page === 'create') return <Create go={go} onWaiting={onWaiting} />;
  if (page === 'records') return <Records go={go} />;
  if (page === 'companies') return <Companies onBack={() => go('home')} />;
  return <Home go={go} onWaiting={onWaiting} onGame={onGame} />;
}
