import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createRoom, fetchHistory, fetchPlayer, fetchRoom, joinRoom, measureClockOffset, MatchResult, randomSeed, Room } from '../net/room';
import { GAME_LENGTHS, loadNick, loadSaved, saveMulti, saveNick, Session } from '../session';
import { TICKS_PER_DAY } from '../game/market';
import { pct } from '../lib/format';

interface Props {
  onWaiting: (roomId: string, playerId: string, nickname: string) => void;
  onGame: (session: Session, offset: number) => void;
}

export function roomToSession(room: Room, playerId: string, nickname: string): Session {
  return {
    mode: 'multi',
    roomId: room.id,
    playerId,
    nickname,
    seed: room.seed,
    dayMs: room.day_ms,
    totalDays: room.total_days,
    startedAt: new Date(room.started_at!).getTime(),
  };
}

export function Lobby({ onWaiting, onGame }: Props) {
  const [nick, setNick] = useState(loadNick);
  const [lengthId, setLengthId] = useState<string>('normal');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<MatchResult[]>([]);
  const [resume, setResume] = useState<{ room: Room; playerId: string; nickname: string } | null>(null);

  const online = !!supabase;
  const length = GAME_LENGTHS.find((g) => g.id === lengthId)!;

  useEffect(() => {
    fetchHistory().then(setHistory).catch(() => {});
    const saved = loadSaved();
    if (saved && online) {
      Promise.all([fetchRoom(saved.roomId), fetchPlayer(saved.playerId)]).then(([room, player]) => {
        if (!room || !player) return saveMulti(null);
        if (room.status === 'finished') return saveMulti(null);
        if (room.status === 'playing' && room.started_at) {
          const end = new Date(room.started_at).getTime() + room.total_days * room.day_ms;
          if (Date.now() > end + 60_000) return saveMulti(null);
        }
        setResume({ room, playerId: player.id, nickname: player.nickname });
      });
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

  const nickOk = nick.trim().length >= 1 && nick.trim().length <= 12;

  async function run(fn: () => Promise<void>) {
    setErr('');
    if (!nickOk) return setErr('닉네임을 1~12자로 입력해 주세요.');
    saveNick(nick.trim());
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
      const { room, player } = await createRoom(nick.trim(), length.dayMs, length.days);
      saveMulti({ roomId: room.id, playerId: player.id, nickname: player.nickname });
      onWaiting(room.id, player.id, player.nickname);
    });

  const join = () =>
    run(async () => {
      if (code.trim().length !== 4) throw new Error('4자리 방 코드를 입력해 주세요.');
      const { room, player } = await joinRoom(code, nick.trim());
      saveMulti({ roomId: room.id, playerId: player.id, nickname: player.nickname });
      onWaiting(room.id, player.id, player.nickname);
    });

  const solo = () =>
    run(async () => {
      onGame(
        {
          mode: 'solo',
          roomId: null,
          playerId: 'me',
          nickname: nick.trim(),
          seed: randomSeed(),
          // 개발 중 빠른 확인용: ?fast
          dayMs: import.meta.env.DEV && location.search.includes('fast') ? 1000 : length.dayMs,
          totalDays: length.days,
          startedAt: Date.now() + 3000,
        },
        0,
      );
    });

  const doResume = async () => {
    if (!resume) return;
    if (resume.room.status === 'waiting') return onWaiting(resume.room.id, resume.playerId, resume.nickname);
    const offset = await measureClockOffset();
    onGame(roomToSession(resume.room, resume.playerId, resume.nickname), offset);
  };

  return (
    <div className="lobby">
      <header className="hero">
        <div className="hero-ticker" aria-hidden>
          <span className="up">NEOT ▲2.4%</span> <span className="down">HBIO ▼5.1%</span> <span className="up">CORE ▲1.2%</span>{' '}
          <span className="up">BLOK ▲12.8%</span> <span className="down">STAR ▼0.7%</span> <span className="up">PIXL ▲3.3%</span>
        </div>
        <h1>
          주식 <em>대결</em>
        </h1>
        <p className="sub">같은 시장, 같은 뉴스. 누가 더 많이 벌까?</p>
      </header>

      {resume && (
        <div className="card resume">
          <div>
            <b>{resume.nickname}</b> 님, 진행 중인 방 <code>{resume.room.code}</code> 이 있어요.
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

      <div className="card">
        <label className="field">
          <span>닉네임</span>
          <input value={nick} maxLength={12} placeholder="예: 개미왕" onChange={(e) => setNick(e.target.value)} />
        </label>

        <div className="field">
          <span>게임 길이</span>
          <div className="seg">
            {GAME_LENGTHS.map((g) => (
              <button key={g.id} className={g.id === lengthId ? 'on' : ''} onClick={() => setLengthId(g.id)}>
                <b>{g.label}</b>
                <small>{g.desc}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="actions">
          <button className="btn primary big" disabled={busy || !online} onClick={create}>
            방 만들기
          </button>
          <div className="join">
            <input
              className="code-input"
              value={code}
              maxLength={4}
              placeholder="방 코드"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
            <button className="btn" disabled={busy || !online} onClick={join}>
              입장
            </button>
          </div>
          <button className="btn ghost" disabled={busy} onClick={solo}>
            혼자 연습하기
          </button>
        </div>
        {!online && <p className="warn">Supabase 설정이 없어서 지금은 혼자 연습만 가능해요.</p>}
        {err && <p className="error">{err}</p>}
      </div>

      <div className="card rules">
        <h3>규칙</h3>
        <ul>
          <li>
            시작 자금 <b>1,000만원</b>, 가상 종목 8개. 하루마다 주가가 {TICKS_PER_DAY}번 움직여요.
          </li>
          <li>매일 아침 뉴스가 떠요. 뉴스 직후 주가가 가장 크게 반응하니 빨리 판단하세요.</li>
          <li>
            <b>[루머]</b> 뉴스는 반대로 움직일 수도 있어요.
          </li>
          <li>상대의 총자산은 실시간으로 보이지만, 뭘 샀는지는 게임이 끝나야 공개돼요.</li>
          <li>매매 수수료 0.1%. 마지막 날 종가 기준 총자산이 많은 사람이 승리!</li>
        </ul>
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3>전적</h3>
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
