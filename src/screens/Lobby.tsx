import { useEffect, useMemo, useState } from 'react';
import { loadSolo, newSolo, saveSolo } from '../engine/local';
import { BADGES, titleOf } from '../game/achievements';
import { pct } from '../lib/format';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { DAY_OPTIONS, loadNick, loadUi, saveNick, saveUi, TURN_OPTIONS, type Session, type UiMode } from '../session';

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

interface Props {
  onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void;
  onGame: (session: Session) => void;
}

export function ModePicker({ value, onChange }: { value: UiMode; onChange: (m: UiMode) => void }) {
  return (
    <div className="mode-pick">
      <button className={value === 'easy' ? 'on' : ''} onClick={() => onChange('easy')}>
        <span className="mp-emoji">🌱</span>
        <b>초보 모드</b>
        <small>쉬운 말 · 금액으로 사기 · 용어 설명 · 첫 판 안내</small>
      </button>
      <button className={value === 'pro' ? 'on' : ''} onClick={() => onChange('pro')}>
        <span className="mp-emoji">📊</span>
        <b>일반 모드</b>
        <small>캔들 차트 · 수량 주문 · 시가/고가/저가 정보</small>
      </button>
    </div>
  );
}

export function Lobby({ onWaiting, onGame }: Props) {
  const [nick, setNick] = useState(loadNick);
  const [ui, setUi] = useState<UiMode>(loadUi);
  const [days, setDays] = useState(20);
  const [turnSec, setTurnSec] = useState(90);
  const [title, setTitle] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [pwRoom, setPwRoom] = useState<RoomInfo | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase().slice(0, 6) ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<MatchResult[]>([]);
  const [resume, setResume] = useState<ResumeInfo | null>(null);
  const [soloSave, setSoloSave] = useState(() => {
    const s = loadSolo();
    return s && s.data.room.status !== 'finished' ? s : null;
  });
  const online = !!supabase;

  useEffect(() => {
    if (!online) return;
    api<MatchResult[]>('history').then(setHistory).catch(() => {});
    api<ResumeInfo | null>('resume').then(setResume).catch(() => {});
  }, [online]);

  const loadRooms = () => {
    if (!online) return;
    api<RoomInfo[]>('rooms')
      .then(setRooms)
      .catch(() => setRooms([]));
  };
  useEffect(() => {
    loadRooms();
    const id = setInterval(loadRooms, 6000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const record = useMemo(() => {
    const wins: Record<string, number> = {};
    let draws = 0;
    for (const h of history) {
      if (h.winner_nickname) wins[h.winner_nickname] = (wins[h.winner_nickname] ?? 0) + 1;
      else draws++;
    }
    return { wins: Object.entries(wins).sort((a, b) => b[1] - a[1]), draws };
  }, [history]);

  const myBadges = useMemo(() => {
    const count: Record<string, number> = {};
    for (const h of history) for (const r of h.results) if (r.nickname === h.me) for (const b of r.badges ?? []) count[b] = (count[b] ?? 0) + 1;
    return count;
  }, [history]);
  const myTitle = titleOf(Object.keys(myBadges));

  const nickOk = nick.trim().length >= 1 && nick.trim().length <= 10;

  async function run(fn: () => Promise<void>) {
    setErr('');
    if (!nickOk) return setErr('닉네임을 1~10자로 입력해 주세요.');
    saveNick(nick.trim());
    saveUi(ui);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const create = () => {
    setCreating(true);
    return run(async () => {
      if (isPrivate && (password.length < 4 || password.length > 20)) throw new Error('비밀번호는 4~20자로 정해 주세요.');
      const r = await api<{ roomId: string; playerId: string; code: string }>('create', {
        nickname: nick.trim(),
        mode: ui,
        totalDays: days,
        turnSeconds: turnSec,
        maxPlayers,
        title: title.trim(),
        isPrivate,
        password: isPrivate ? password : undefined,
      });
      onWaiting(r.roomId, r.playerId, nick.trim(), r.code);
    });
  };

  const joinListed = async (room: RoomInfo, pw?: string) => {
    setErr('');
    setPwErr('');
    if (!nickOk) return setErr('닉네임을 먼저 1~10자로 입력해 주세요.');
    saveNick(nick.trim());
    saveUi(ui);
    setBusy(true);
    try {
      const r = await api<{ roomId: string; playerId: string; code: string }>('joinRoom', { roomId: room.id, nickname: nick.trim(), mode: ui, password: pw });
      setPwRoom(null);
      onWaiting(r.roomId, r.playerId, nick.trim(), r.code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (pw !== undefined) setPwErr(msg);
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  };
  const enterRoom = (room: RoomInfo) => {
    setCreating(false);
    if (room.isPrivate && !room.joined) {
      setPwInput('');
      setPwErr('');
      setPwRoom(room);
    } else joinListed(room);
  };

  const join = () => {
    setCreating(false);
    return run(async () => {
      if (code.trim().length !== 6) throw new Error('6자리 방 코드를 입력해 주세요.');
      const r = await api<{ roomId: string; playerId: string; code: string }>('join', { code, nickname: nick.trim(), mode: ui });
      onWaiting(r.roomId, r.playerId, nick.trim(), r.code);
    });
  };

  const solo = () =>
    run(async () => {
      const s = newSolo(nick.trim(), days);
      onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: s.nickname, ui });
    });

  const doResume = () => {
    if (!resume) return;
    if (resume.status === 'waiting') return onWaiting(resume.roomId, resume.playerId, resume.nickname, resume.code);
    onGame({ mode: 'multi', roomId: resume.roomId, code: resume.code, playerId: resume.playerId, nickname: resume.nickname, ui: resume.mode === 'pro' ? 'pro' : 'easy' });
  };

  return (
    <div className="lobby">
      <header className="hero">
        <div className="hero-mark">
          <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
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
        <h1>
          주식 <em>대결</em>
        </h1>
        <p className="sub">같은 시장, 같은 뉴스. 둘 중 누가 더 벌까?</p>
      </header>

      {soloSave && (
        <div className="panel pad resume">
          <div>
            하던 연습 게임이 있어요 · <b>{soloSave.data.room.day + 1}일차</b> / {soloSave.data.room.total_days}일
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: soloSave.nickname, ui })}>
              연습 이어하기
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                saveSolo(null);
                setSoloSave(null);
              }}
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {resume && (
        <div className="panel pad resume">
          <div>
            <b>{resume.nickname}</b>님, {resume.status === 'waiting' ? '대기 중인' : '진행 중인'} 방 <code>{resume.code}</code>이 있어요.
          </div>
          <div className="row">
            <button className="btn primary" onClick={doResume}>
              {resume.status === 'waiting' ? '대기실로' : '이어하기'}
            </button>
            <button className="btn ghost" onClick={() => setResume(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      <div className="panel pad">
        <label className="field">
          <span>닉네임</span>
          <input value={nick} maxLength={10} placeholder="예: 개미왕" onChange={(e) => setNick(e.target.value)} />
        </label>
        <div className="field">
          <span>화면 모드 (게임 중에도 바꿀 수 있어요)</span>
          <ModePicker value={ui} onChange={setUi} />
        </div>
      </div>

      <div className="panel pad">
        <div className="panel-head">
          <h3>🔎 방 목록</h3>
          <button className="btn sm ghost" onClick={loadRooms} disabled={!online}>
            ↻ 새로고침
          </button>
        </div>
        {!online && <p className="muted small">온라인 설정이 없어서 방 목록을 볼 수 없어요.</p>}
        {online && rooms === null && <p className="muted small">불러오는 중…</p>}
        {online && rooms?.length === 0 && <p className="empty small">지금 열린 방이 없어요. 아래에서 방을 만들어 보세요!</p>}
        <div className="room-list">
          {rooms?.map((r) => (
            <button key={r.id} className={'room-row' + (r.joined ? ' joined' : '')} disabled={busy} onClick={() => enterRoom(r)}>
              <span className="rr-main">
                <b>
                  {r.isPrivate && <span className="lock" title="비밀방">🔒</span>}
                  {r.title}
                </b>
                <small>
                  방장 {r.host} · {r.totalDays}일 · {TURN_OPTIONS.find((t) => t.sec === r.turnSeconds)?.label ?? r.turnSeconds + '초'}
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
        <div className="divider">
          <span>초대 코드가 있다면</span>
        </div>
        <div className="join">
          <input
            className="code-input"
            value={code}
            maxLength={6}
            placeholder="방 코드 6자리"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button className="btn" disabled={busy || !online} onClick={join}>
            입장
          </button>
        </div>
        {err && !creating && <p className="error">{err}</p>}
      </div>

      <div className="panel pad">
        <h3>➕ 방 만들기</h3>
        <label className="field">
          <span>방 제목</span>
          <input value={title} maxLength={20} placeholder={`${nick.trim() || '나'}의 방`} onChange={(e) => setTitle(e.target.value)} />
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
        <div className="field">
          <span>게임 길이</span>
          <div className="seg">
            {DAY_OPTIONS.map((o) => (
              <button key={o.days} className={days === o.days ? 'on' : ''} onClick={() => setDays(o.days)}>
                <b>{o.label}</b>
                <small>{o.desc}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>하루 고민 시간 (시간이 다 되면 자동으로 장 마감)</span>
          <div className="seg four">
            {TURN_OPTIONS.map((o) => (
              <button key={o.sec} className={turnSec === o.sec ? 'on' : ''} onClick={() => setTurnSec(o.sec)}>
                <b>{o.label}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="switch-row">
            <span>
              <b>🔒 비밀방</b>
              <small>방 목록에서 들어오려면 비밀번호가 필요해요. 초대 코드로는 바로 들어올 수 있어요.</small>
            </span>
            <input type="checkbox" className="switch" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          </label>
          {isPrivate && (
            <input type="password" value={password} maxLength={20} placeholder="비밀번호 4~20자" autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          )}
        </div>
        <button className="btn primary xl" disabled={busy || !online} onClick={create}>
          방 만들기
        </button>
        {err && creating && <p className="error">{err}</p>}
        <button className="btn ghost full" disabled={busy} onClick={solo} style={{ marginTop: 10 }}>
          혼자 연습하기
        </button>
      </div>

      {pwRoom && (
        <div className="modal-bg" onClick={() => setPwRoom(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              joinListed(pwRoom, pwInput);
            }}
          >
            <h3>🔒 {pwRoom.title}</h3>
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
        </div>
      )}

      <div className="panel pad rules">
        <h3>이렇게 놀아요</h3>
        <ol>
          <li>
            <b>아침 뉴스</b>를 보고 오를 것 같은 회사를 골라요. 뉴스 아래 <b>관련 종목</b>을 누르면 바로 이동해요.
          </li>
          <li>
            국내·미국 주식과 <b>ETF</b>(지수·레버리지·인버스·원유·달러)까지. 금리·환율·유가가 업종마다 다르게 영향을 줘요.
          </li>
          <li>
            다 정했으면 <b>장 마감</b>. 둘 다 누르면 하루가 흘러요.
          </li>
          <li>
            <b>찬스 카드</b>로 내일 뉴스를 미리 보거나, 상대를 방해하세요.
          </li>
          <li>마지막 날 재산이 더 많은 사람이 승리!</li>
        </ol>
      </div>

      {history.length > 0 && (
        <div className="panel pad">
          <h3>
            🏅 내 업적 {myTitle && <span className="title-tag">{myTitle.emoji} {myTitle.name}</span>}
          </h3>
          <div className="badge-grid">
            {BADGES.map((b) => (
              <div key={b.id} className={'bg-cell r' + b.rarity + (myBadges[b.id] ? ' got' : '')} title={b.desc}>
                <i>{myBadges[b.id] ? b.emoji : '🔒'}</i>
                <b>{b.name}</b>
                <small>{myBadges[b.id] ? '×' + myBadges[b.id] : b.desc}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel pad">
          <h3>우리의 전적</h3>
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
            {history.slice(0, 5).map((h) => (
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
        </div>
      )}
    </div>
  );
}
