import { useEffect, useRef, useState } from 'react';
import { ask } from '../components/ConfirmHost';
import { api, useLiveView } from '../net/api';
import { estimateMinutes, graceText, loadUi, saveUi, turnLabel as labelOfTurn, type Session, type UiMode } from '../session';
import { ModePicker } from './Lobby';
import { Icon } from '../components/Icon';
import { GRANT_EVERY, START_CARDS } from '../game/items';
import { Sheet } from '../components/PrefsPanel';
import { useAccount } from '../net/account';
import { refreshFriends, useFriends } from './Friends';

/** 대기실에서 친구 초대 (회원만): 접속 중인 친구가 위로, 초대하면 5분 동안 비밀번호 없이 들어올 수 있음 */
function InviteFriends({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const d = useFriends();
  const [sent, setSent] = useState<Record<string, 'ok' | string>>({});
  // 방금 보낸 친구는 5초 동안만 '보냄' — 그 뒤엔 다시 초대 가능 (실수로 거절했거나 못 봤을 때)
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  useEffect(() => {
    refreshFriends();
  }, []);
  const invite = async (id: string) => {
    try {
      await api('inviteRoom', { roomId, friendId: id });
      setSent((x) => ({ ...x, [id]: 'ok' }));
      setFresh((x) => ({ ...x, [id]: true }));
      setTimeout(() => setFresh((x) => ({ ...x, [id]: false })), 5000);
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
              <button className="btn sm" disabled={!!fresh[f.id]} onClick={() => invite(f.id)}>
                {fresh[f.id] ? <><Icon name="check" size={14} /> 보냄</> : sent[f.id] === 'ok' ? '다시 초대' : '초대'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">초대는 5분 동안 유효해요. 받은 친구는 로비에서 바로 '입장'할 수 있어요 (비밀방도 비밀번호 없이). 친구가 실수로 거절했으면 다시 초대하면 돼요.</p>
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
      if (navigator.share) await navigator.share({ title: '개미리그 초대', text: `방 코드 ${room.code}`, url: link });
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

  const leave = async () => {
    if (isHost && view.players.length > 1 && !(await ask('방장이 나가면 다음 사람에게 방장이 넘어가요. 나갈까요?', { ok: '나가기' }))) return;
    if (isHost && view.players.length <= 1 && !(await ask('혼자 있는 방이라 나가면 방이 닫혀요. 나갈까요?', { ok: '나가기' }))) return;
    api('leave', { roomId }).catch(() => {}).finally(onLeave);
  };
  const readyCount = view.players.filter((p) => p.ready || p.id === room.hostId).length;

  return (
    <div className="waiting wr-client">
      <header className="wr-top">
        <button className="icon-btn" onClick={leave} aria-label="방에서 나가기" title="나가기">
          <Icon name="back" size={18} />
        </button>
        <div className="wr-title">
          <small>대기실</small>
          <h2 className="room-title">
            {room.isPrivate && (
              <span title="비밀방">
                <Icon name="lock" size={16} />{' '}
              </span>
            )}
            {room.title}
          </h2>
        </div>
        <div className="wr-info">
          <span>
            <b>{view.players.length}</b>/{room.maxPlayers}명
          </span>
          <span>
            <b>{room.totalDays}</b>일
          </span>
          <span>
            하루 <b>{turnLabel}</b>
          </span>
        </div>
      </header>

      <div className="wr-main">
        <div className="wr-left">
        <section className="wr-slots slots" aria-label="참가자">
          {Array.from({ length: room.maxPlayers }, (_, i) => {
            const p = view.players[i];
            if (!p)
              return (
                <div key={i} className="slot empty">
                  <div className="avatar empty">
                    <Icon name="userPlus" size={18} />
                  </div>
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
                <small className="slot-state">{host ? <><Icon name="crown" size={12} /> 방장</> : p.ready ? <><Icon name="check" size={12} /> 준비 완료</> : '대기 중'}</small>
                <small className="muted">{p.mode === 'easy' ? '초보 모드' : '일반 모드'}</small>
                {isHost && p.id !== playerId && (
                  <button
                    className="slot-kick"
                    onClick={() => void ask(`${p.nickname} 님을 내보낼까요?`, { ok: '내보내기', danger: true }).then((yes) => { if (yes) void run(() => api('kick', { roomId, target: p.id })); })}
                    aria-label={`${p.nickname} 내보내기`}
                    title="내보내기"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </section>
        {/* 기다리는 동안 이 방이 어떻게 진행되는지 (빈 공간 대신 쓸모 있는 안내) */}
        <section className="panel pad wr-rules" aria-label="이 방 규칙">
          <h3>이 방은 이렇게 진행돼요</h3>
          <ul>
            <li>
              <Icon name="calendar" size={16} />
              <span>
                <b>{room.totalDays}일</b> 동안 겨뤄요. 하루 장은 <b>{turnLabel}</b>이에요. 보통 <b>약 {estimateMinutes(room.totalDays, room.turnSeconds).typical}분</b>이면 끝나요.
              </span>
            </li>
            <li>
              <Icon name="timer" size={16} />
              <span>
                모두 장 마감을 누르면 바로 다음 날로 가요. {graceText(room.maxPlayers)} 뒤에 자동으로 넘어가요.
              </span>
            </li>
            <li>
              <Icon name="news" size={16} />
              <span>둘째 날부터는 장이 열리기 전에 찌라시(소문)를 보고 예약 주문을 걸 수 있어요.</span>
            </li>
            <li>
              <Icon name="cards" size={16} />
              <span>찬스 카드는 시작할 때 {START_CARDS}장, {GRANT_EVERY}일마다 1장 무료로 받아요. 상대를 방해하는 카드도 있어요.</span>
            </li>
            <li>
              <Icon name="trophy" size={16} />
              <span>마지막 날 재산이 가장 많은 사람이 이겨요.</span>
            </li>
          </ul>
        </section>
        </div>

        <aside className="wr-side">
          <div className="panel pad wr-invite">
            <h3>친구 부르기</h3>
            <p className="muted small">초대 코드</p>
            <div className="big-code">{room.code}</div>
            <div className="wr-btns">
              <button className="btn sm" onClick={copy}>
                {copied ? <><Icon name="check" /> 복사됐어요!</> : <><Icon name="share" /> 초대 링크 보내기</>}
              </button>
              {member && view.players.length < room.maxPlayers && (
                <button className="btn sm primary" onClick={() => setInviteOpen(true)}>
                  <Icon name="userPlus" /> 친구 초대
                </button>
              )}
            </div>
            {room.isPrivate && <p className="muted small">비밀방 · 방 목록에서는 비밀번호가 필요해요</p>}
          </div>
          <div className="panel pad">
            <div className="field">
              <span>내 화면 모드</span>
              <ModePicker value={ui} onChange={changeUi} />
            </div>
          </div>
        </aside>
      </div>

      <footer className="wr-bar">
        <div className="wr-status">
          <b>
            준비 {readyCount}/{view.players.length}
          </b>
          <small className="muted">{isHost ? (canStart ? '모두 준비됐어요. 시작하세요!' : view.players.length < 2 ? '한 명 이상 더 들어와야 해요' : `${notReady.map((p) => p.nickname).join(', ')} 님의 준비를 기다리는 중`) : me?.ready ? '방장이 시작하면 바로 게임이 열려요' : '준비가 되면 준비 완료를 눌러 주세요'}</small>
          {(err || error) && <p className="error">{err || error}</p>}
        </div>
        {isHost ? (
          <button className="wr-go" disabled={!canStart} onClick={() => run(() => api('start', { roomId }))}>
            {canStart ? `게임 시작 (${view.players.length}명)` : '기다리는 중'}
          </button>
        ) : (
          <button className={'wr-go' + (me?.ready ? ' off' : '')} onClick={() => run(() => api('ready', { roomId, ready: !me?.ready }))}>
            {me?.ready ? '준비 취소' : '준비 완료'}
          </button>
        )}
      </footer>
      {inviteOpen && <InviteFriends roomId={roomId} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
