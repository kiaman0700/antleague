import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createRoom, fetchHistory, fetchPlayer, fetchRoom, joinRoom, measureClockOffset, randomSeed, type MatchResult, type Room } from '../net/room';
import { DAY_OPTIONS, loadNick, loadSaved, loadSolo, loadUi, saveMulti, saveNick, saveSolo, saveUi, TURN_OPTIONS, type Session, type UiMode } from '../session';
import { pct } from '../lib/format';

interface Props {
  onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void;
  onGame: (session: Session, offset: number) => void;
}

export function roomToSession(room: Room, playerId: string, nickname: string, ui: UiMode): Session {
  return { mode: "multi", roomId: room.id, playerId, nickname, seed: room.seed, totalDays: room.total_days, turnSeconds: room.turn_seconds, ui, code: room.code };
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
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<MatchResult[]>([]);
  const [resume, setResume] = useState<{ room: Room; playerId: string; nickname: string; ui: UiMode } | null>(null);
  const online = !!supabase;
  const [soloSave, setSoloSave] = useState(() => {
    const s = loadSolo();
    return s && s.day < s.session.totalDays ? s : null;
  });

  useEffect(() => {
    fetchHistory().then(setHistory).catch(() => {});
    const saved = loadSaved();
    if (saved && online) {
      Promise.all([fetchRoom(saved.roomId), fetchPlayer(saved.playerId)])
        .then(([room, player]) => {
          if (!room || !player || room.status === 'finished') return saveMulti(null);
          setResume({ room, playerId: player.id, nickname: player.nickname, ui: player.mode });
        })
        .catch(() => {});
    }
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

  const create = () =>
    run(async () => {
      const { room, player } = await createRoom(nick.trim(), ui, days, turnSec);
      saveMulti({ roomId: room.id, playerId: player.id, nickname: player.nickname });
      onWaiting(room.id, player.id, player.nickname, room.code);
    });

  const join = () =>
    run(async () => {
      if (code.trim().length !== 4) throw new Error('4자리 방 코드를 입력해 주세요.');
      const { room, player } = await joinRoom(code, nick.trim(), ui);
      saveMulti({ roomId: room.id, playerId: player.id, nickname: player.nickname });
      onWaiting(room.id, player.id, player.nickname, room.code);
    });

  const solo = () =>
    run(async () => {
      onGame({ mode: 'solo', roomId: null, playerId: 'me', nickname: nick.trim(), seed: randomSeed(), totalDays: days, turnSeconds: 0, ui }, 0);
    });

  const doResume = async () => {
    if (!resume) return;
    if (resume.room.status === 'waiting') return onWaiting(resume.room.id, resume.playerId, resume.nickname, resume.room.code);
    const offset = await measureClockOffset();
    onGame(roomToSession(resume.room, resume.playerId, resume.nickname, resume.ui), offset);
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
            하던 연습 게임이 있어요 · <b>{soloSave.day + 1}일차</b> / {soloSave.session.totalDays}일
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => onGame(soloSave.session, 0)}>
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
            <b>{resume.nickname}</b>님, 진행 중인 방 <code>{resume.room.code}</code>이 있어요.
          </div>
          <div className="row">
            <button className="btn primary" onClick={doResume}>
              이어하기
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                saveMulti(null);
                setResume(null);
              }}
            >
              무시
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
        <h3>방 만들기</h3>
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
        <button className="btn primary xl" disabled={busy || !online} onClick={create}>
          방 만들고 초대하기
        </button>
        <div className="divider">
          <span>또는 초대받았다면</span>
        </div>
        <div className="join">
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="방 코드 4자리"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
          />
          <button className="btn" disabled={busy || !online} onClick={join}>
            입장
          </button>
        </div>
        <button className="btn ghost full" disabled={busy} onClick={solo}>
          혼자 연습하기
        </button>
        {!online && <p className="warn">Supabase 설정이 없어서 지금은 혼자 연습만 할 수 있어요.</p>}
        {err && <p className="error">{err}</p>}
      </div>

      <div className="panel pad rules">
        <h3>이렇게 놀아요</h3>
        <ol>
          <li>
            <b>아침 뉴스</b>를 보고 오를 것 같은 회사를 골라요. 같은 업종·연관 업종도 함께 움직여요.
          </li>
          <li>
            금리·환율·유가가 바뀌면 업종마다 다르게 반응해요. <b>[루머]</b>는 틀릴 수도 있어요.
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
