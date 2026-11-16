import { useEffect, useRef, useState } from 'react';
import { api, useLiveView } from '../net/api';
import { loadUi, saveUi, turnLabel as labelOfTurn, type Session, type UiMode } from '../session';
import { ModePicker } from './Lobby';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/PrefsPanel';
import { useAccount } from '../net/account';
import { refreshFriends, useFriends } from './Friends';

/** 대기실에서 친구 초대 (회원만): 접속 중인 친구가 위로, 초대하면 5분 동안 비밀번호 없이 들어올 수 있음 */
function InviteFriends({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const d = useFriends();
  const [sent, setSent] = useState<Record<string, 'ok' | string>>({});
  useEffect(() => {
    refreshFriends();
  }, []);
  const invite = async (id: string) => {
    try {
      await api('inviteRoom', { roomId, friendId: id });
      setSent((x) => ({ ...x, [id]: 'ok' }));
    } catch (e) {
      setSent((x) => ({ ...x, [id]: e instanceof Error ? e.message : '초대하지 못했어요' }));
    }
  };
  const list = d?.friends ?? [];
  return (
    <Sheet title={<><Icon name="userPlus" size={18} /> 친구 초대</>} onClose={onClose}>
      {!d && <p className="muted small">불러오는 중…</p>}
      {d && list.length === 0 && <p className="muted small">아직 친구가 없어요. 로비의 '친구'에서 닉네임으로 추가할 수 있어요.</p>}
      <ul className="fr-list">
        {list.map((f) => (
          <li key={f.id} className="fr-row">
            <span className={'fr-av st-' + (f.status ?? 'offline')}>{f.nickname.slice(0, 1)}</span>
            <span className="fr-txt">
              <b>{f.nickname}</b>
              <small className="muted">{f.status === 'online' ? '접속 중' : f.status === 'playing' ? '게임 중' : '오프라인'}</small>
              {sent[f.id] && sent[f.id] !== 'ok' && <small className="error">{sent[f.id]}</small>}
            </span>
            <span className="fr-act">
              <button className="btn sm" disabled={sent[f.id] === 'ok'} onClick={() => invite(f.id)}>
                {sent[f.id] === 'ok' ? <><Icon name="check" size={14} /> 보냄</> : '초대'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">초대는 5분 동안 유효해요. 받은 친구는 로비에서 바로 '입장'할 수 있어요 (비밀방도 비밀번호 없이).</p>
    </Sheet>
  );
}

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const member = useAccount().status === 'member';
  const started = useRef(false);

  useEffect(() => {
    if (!view || started.current) return;
    if (view.room.status !== 'waiting') {
      started.current = true;
      onStart({ mode: 'multi', roomId, code: view.room.code, playerId, nickname, ui });
    }
  }, [view, roomId, playerId, nickname, ui, onStart]);

  // 방장이 내보냈거나 방이 사라졌으면 멈춘 화면 대신 바로 안내
  const gone = !!error && /참가하지 않았어요|찾을 수 없어요|잘못된 방/.test(error);
  if (gone) {
    return (
      <div className="center-msg">
        <Icon name="door" size={28} />
        <p>방에서 나오게 됐어요</p>
        <p className="muted small">방장이 방을 닫았거나 나를 내보냈어요. 다른 방을 찾아보세요.</p>
        <button className="btn primary" onClick={onLeave}>
          로비로
        </button>
      </div>
    );
  }
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
  const others = view.players.filter((p) => p.id !== playerId);
  const isHost = room.hostId === playerId;
  const notReady = others.filter((p) => !p.ready && p.id !== room.hostId);
  const link = `${location.origin}/room/${room.code}`;
  const canStart = isHost && view.players.length >= 2 && notReady.length === 0;
  const turnLabel = labelOfTurn(room.turnSeconds);

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
        <h2 className="room-title">
          {room.isPrivate && <span title="비밀방"><Icon name="lock" size={16} /> </span>}
          {room.title}
        </h2>
        <p className="muted">초대 코드</p>
        <div className="big-code">{room.code}</div>
        <button className="btn sm" onClick={copy}>
          {copied ? <><Icon name="check" /> 복사됐어요!</> : <><Icon name="share" /> 초대 링크 보내기</>}
        </button>
        {member && view.players.length < room.maxPlayers && (
          <button className="btn sm primary" onClick={() => setInviteOpen(true)}>
            <Icon name="userPlus" /> 친구 초대
          </button>
        )}
        {inviteOpen && <InviteFriends roomId={roomId} onClose={() => setInviteOpen(false)} />}
        <p className="muted small">
          최대 {room.maxPlayers}명 · {room.totalDays}일 · 하루 제한 시간 {turnLabel}
          {room.isPrivate && <> · 방 목록에선 비밀번호 필요</>}
        </p>
      </div>

      <div className="slots">
        {Array.from({ length: room.maxPlayers }, (_, i) => {
          const p = view.players[i];
          if (!p)
            return (
              <div key={i} className="slot empty">
                <div className="avatar empty"><Icon name="userPlus" size={18} /></div>
                <b>빈 자리</b>
                <small>초대를 기다리는 중</small>
              </div>
            );
          const host = room.hostId === p.id;
          return (
            <div key={p.id} className={'slot' + (p.ready || host ? ' ready' : '') + (p.id === playerId ? ' me' : '')}>
              <div className={'avatar c' + (i % 6)}>{p.nickname.slice(0, 1)}</div>
              <b>
                {p.nickname}
                {p.id === playerId && <em> (나)</em>}
              </b>
              <small>{host ? <><Icon name="crown" size={12} /> 방장</> : p.ready ? <><Icon name="check" size={12} /> 준비 완료</> : '대기 중'}</small>
              <small className="muted">{p.mode === 'easy' ? '초보 모드' : '일반 모드'}</small>
              {isHost && p.id !== playerId && (
                <button
                  className="slot-kick"
                  onClick={() => window.confirm(`${p.nickname} 님을 내보낼까요?`) && run(() => api('kick', { roomId, target: p.id }))}
                  aria-label={`${p.nickname} 내보내기`}
                  title="내보내기"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          );
        })}
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
            {canStart ? `게임 시작! (${view.players.length}명)` : view.players.length < 2 ? '한 명 이상 더 들어와야 해요' : `${notReady.map((p) => p.nickname).join(', ')} 님의 준비를 기다리는 중…`}
          </button>
        ) : (
          <button className={'btn xl ' + (me?.ready ? '' : 'primary')} onClick={() => run(() => api('ready', { roomId, ready: !me?.ready }))}>
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>
        )}
        <button
          className="btn ghost full"
          onClick={() => {
            if (isHost && view.players.length > 1 && !window.confirm('방장이 나가면 다음 사람에게 방장이 넘어가요. 나갈까요?')) return;
            if (isHost && view.players.length <= 1 && !window.confirm('혼자 있는 방이라 나가면 방이 닫혀요. 나갈까요?')) return;
            api('leave', { roomId }).catch(() => {}).finally(onLeave);
          }}
        >
          나가기
        </button>
        {(err || error) && <p className="error">{err || error}</p>}
      </div>
    </div>
  );
}
