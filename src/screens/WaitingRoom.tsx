import { useEffect, useRef, useState } from 'react';
import { leaveRoom, measureClockOffset, setReady, startRoom, useRoomLive } from '../net/room';
import { GAME_LENGTHS, Session } from '../session';
import { roomToSession } from './Lobby';

interface Props {
  roomId: string;
  playerId: string;
  nickname: string;
  onLeave: () => void;
  onStart: (session: Session, offset: number) => void;
}

export function WaitingRoom({ roomId, playerId, nickname, onLeave, onStart }: Props) {
  const { room, players } = useRoomLive(roomId);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const me = players.find((p) => p.id === playerId);
  const other = players.find((p) => p.id !== playerId);
  const isHost = room?.host_id === playerId;

  useEffect(() => {
    if (!room || started.current) return;
    if (room.status === 'playing' && room.started_at) {
      started.current = true;
      measureClockOffset().then((offset) => onStart(roomToSession(room, playerId, nickname), offset));
    }
  }, [room, playerId, nickname, onStart]);

  if (!room) return <div className="center-msg">방 불러오는 중…</div>;

  const length = GAME_LENGTHS.find((g) => g.days === room.total_days && g.dayMs === room.day_ms);
  const link = `${location.origin}/?room=${room.code}`;
  const canStart = isHost && !!other && other.ready;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 무시 */
    }
  };

  return (
    <div className="waiting">
      <div className="card">
        <p className="muted">방 코드</p>
        <div className="big-code">{room.code}</div>
        <button className="btn ghost small" onClick={copy}>
          {copied ? '복사됨!' : '초대 링크 복사'}
        </button>
        <p className="muted">{length ? `${length.label} · ${length.desc}` : `${room.total_days}일`}</p>
      </div>

      <div className="vs-row">
        <div className={'player-slot me' + (me?.ready || isHost ? ' ready' : '')}>
          <div className="avatar">🙂</div>
          <b>{nickname}</b>
          <small>{isHost ? '방장' : me?.ready ? '준비 완료' : '대기 중'}</small>
        </div>
        <div className="vs">VS</div>
        <div className={'player-slot' + (other ? (other.ready || room.host_id === other.id ? ' ready' : '') : ' empty')}>
          <div className="avatar">{other ? '😎' : '…'}</div>
          <b>{other?.nickname ?? '상대 기다리는 중'}</b>
          <small>{other ? (room.host_id === other.id ? '방장' : other.ready ? '준비 완료' : '대기 중') : '코드를 알려주세요'}</small>
        </div>
      </div>

      <div className="card actions">
        {isHost ? (
          <button
            className="btn primary big"
            disabled={!canStart}
            onClick={() => startRoom(room.id).catch((e) => setErr(String(e.message ?? e)))}
          >
            {canStart ? '게임 시작!' : other ? '상대가 준비하면 시작할 수 있어요' : '상대를 기다리는 중…'}
          </button>
        ) : (
          <button className={'btn big ' + (me?.ready ? '' : 'primary')} onClick={() => setReady(playerId, !me?.ready)}>
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>
        )}
        <button
          className="btn ghost"
          onClick={async () => {
            await leaveRoom(playerId).catch(() => {});
            onLeave();
          }}
        >
          나가기
        </button>
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
