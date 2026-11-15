import { useEffect, useRef, useState } from 'react';
import { api, useLiveView } from '../net/api';
import { loadUi, saveUi, TURN_OPTIONS, type Session, type UiMode } from '../session';
import { ModePicker } from './Lobby';

interface Props {
  roomId: string;
  playerId: string;
  nickname: string;
  onLeave: () => void;
  onStart: (session: Session) => void;
}

export function WaitingRoom({ roomId, playerId, nickname, onLeave, onStart }: Props) {
  const { view, error, refresh } = useLiveView(roomId);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [ui, setUi] = useState<UiMode>(loadUi);
  const started = useRef(false);

  useEffect(() => {
    if (!view || started.current) return;
    if (view.room.status !== 'waiting') {
      started.current = true;
      onStart({ mode: 'multi', roomId, code: view.room.code, playerId, nickname, ui });
    }
  }, [view, roomId, playerId, nickname, ui, onStart]);

  if (!view) {
    return (
      <div className="center-msg">
        {error ? <p className="error">{error}</p> : <div className="spinner" />}
        {error && (
          <button className="btn" onClick={onLeave}>
            로비로
          </button>
        )}
      </div>
    );
  }

  const room = view.room;
  const me = view.players.find((p) => p.id === playerId);
  const other = view.players.find((p) => p.id !== playerId);
  const isHost = room.hostId === playerId;
  const link = `${location.origin}/room/${room.code}`;
  const canStart = isHost && !!other && other.ready;
  const turnLabel = TURN_OPTIONS.find((t) => t.sec === room.turnSeconds)?.label ?? `${room.turnSeconds}초`;

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const copy = async () => {
    try {
      if (navigator.share) await navigator.share({ title: '주식 대결 초대', text: `방 코드 ${room.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* 공유 취소 */
    }
  };

  const changeUi = (m: UiMode) => {
    setUi(m);
    saveUi(m);
    run(() => api('mode', { roomId, mode: m }));
  };

  return (
    <div className="waiting">
      <div className="panel pad center">
        <p className="muted">방 코드</p>
        <div className="big-code">{room.code}</div>
        <button className="btn sm" onClick={copy}>
          {copied ? '복사됐어요!' : '🔗 초대 링크 보내기'}
        </button>
        <p className="muted small">
          {room.totalDays}일 · 하루 고민 시간 {turnLabel}
        </p>
      </div>

      <div className="vs-row">
        <div className="slot ready">
          <div className="avatar">🙂</div>
          <b>{nickname}</b>
          <small>{isHost ? '방장' : me?.ready ? '준비 완료' : '대기 중'}</small>
        </div>
        <div className="vs">VS</div>
        <div className={'slot' + (other ? (other.ready ? ' ready' : '') : ' empty')}>
          <div className="avatar">{other ? '😎' : '⏳'}</div>
          <b>{other?.nickname ?? '상대를 기다리는 중'}</b>
          <small>{other ? (room.hostId === other.id ? '방장' : other.ready ? '준비 완료' : '대기 중') : '코드나 링크를 보내 주세요'}</small>
          {other && <small className="muted">{other.mode === 'easy' ? '🌱 초보 모드' : '📊 일반 모드'}</small>}
        </div>
      </div>

      <div className="panel pad">
        <div className="field">
          <span>내 화면 모드</span>
          <ModePicker value={ui} onChange={changeUi} />
        </div>
      </div>

      <div className="stack">
        {isHost ? (
          <button className="btn primary xl" disabled={!canStart} onClick={() => run(() => api('start', { roomId }))}>
            {canStart ? '게임 시작!' : other ? '상대가 준비하면 시작할 수 있어요' : '상대를 기다리는 중…'}
          </button>
        ) : (
          <button className={'btn xl ' + (me?.ready ? '' : 'primary')} onClick={() => run(() => api('ready', { roomId, ready: !me?.ready }))}>
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>
        )}
        <button className="btn ghost full" onClick={() => api('leave', { roomId }).catch(() => {}).finally(onLeave)}>
          나가기
        </button>
        {(err || error) && <p className="error">{err || error}</p>}
      </div>
    </div>
  );
}
