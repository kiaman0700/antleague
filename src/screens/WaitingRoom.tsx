import { shareOrCopy } from '../lib/copy';
import { botInfo, BOT_LEVELS, MAX_BOTS } from '../engine/botInfo';
import { Avatar } from '../components/Avatar';
import { useEffect, useRef, useState } from 'react';
import { EmptyState, IconList, Loading, OfflineBanner, SectionTitle } from '../components/ui';
import { ask } from '../components/ConfirmHost';
import { api, useLiveView } from '../net/api';
import { estimateMinutes, graceSentence, loadUi, saveUi, turnLabel as labelOfTurn, type Session, type UiMode } from '../session';
import { ModePicker } from './Lobby';
import { Icon } from '../components/Icon';
import { GRANT_EVERY, START_CARDS } from '../game/items';
import { Sheet } from '../components/PrefsPanel';
import { useAccount } from '../net/account';
import { refreshFriends, useFriends } from './Friends';
import { setFlash } from '../lib/flash';

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
      {!d && <Loading inline />}
      {d && list.length === 0 && <p className="muted small">아직 친구가 없어요. 홈의 '친구' 메뉴에서 닉네임으로 추가할 수 있어요.</p>}
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
      <p className="muted small">초대는 5분 동안 유효해요. 받은 친구는 홈 화면에서 바로 '입장'할 수 있어요 (비밀방도 비밀번호 없이). 친구가 실수로 거절했으면 다시 초대하면 돼요.</p>
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
  // 봇 추가: 난이도를 고르는 빈자리 번호 (훅은 맨 위 — 아래 이른 return 보다 먼저)
  const [botSlot, setBotSlot] = useState<number | null>(null);
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
        <EmptyState
          icon="door"
          title="방에서 나오게 됐어요"
          desc="방장이 방을 닫았거나 나를 내보냈어요. 다른 방을 찾아보세요."
          action={
            <button className="btn primary" onClick={onLeave}>
              홈으로
            </button>
          }
        />
      </div>
    );
  }
  if (!view) {
    return (
      <div className="center-msg">
        {error ? <EmptyState icon="warn" tone="error" title={error} /> : <Loading label="대기실에 들어가는 중…" />}
        {error && (
          <button className="btn" onClick={onLeave}>
            홈으로
          </button>
        )}
      </div>
    );
  }

  const room = view.room;
  const me = view.players.find((p) => p.id === playerId);
  const others = view.players.filter((p) => p.id !== playerId);
  const isHost = room.hostId === playerId;
  // 커스텀 방 방장은 빈자리에 봇을 넣을 수 있음 (매칭·랭킹 방 제외, 봇 5명까지)
  const canAddBot = isHost && room.status === 'waiting' && (room.kind ?? 'custom') === 'custom' && !room.ranked && view.players.filter((p) => p.bot).length < MAX_BOTS;
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

  // 휴대폰·태블릿은 공유 창, PC 는 바로 복사. 복사가 안 되면 방 코드를 알려 줌
  const copy = async () => {
    const r = await shareOrCopy({ title: '개미리그 초대', text: `방 코드 ${room.code}`, url: link });
    if (r === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else if (r === 'fail') setErr(`링크를 복사하지 못했어요. 친구에게 방 코드 ${room.code} 를 알려 주세요.`);
  };

  const changeUi = (m: UiMode) => {
    setUi(m);
    saveUi(m);
    run(() => api('mode', { roomId, mode: m }));
  };

  const leave = async () => {
    // 방장은 봇에게 안 넘어감 → 사람이 나 혼자면(봇만 남아도) 방이 닫힘
    const humans = view.players.filter((p) => !p.bot).length;
    if (isHost && humans > 1 && !(await ask('방장이 나가면 다음 사람에게 방장이 넘어가요. 나갈까요?', { ok: '나가기' }))) return;
    if (isHost && humans <= 1 && !(await ask(view.players.length > 1 ? '사람은 나 혼자라 나가면 방이 닫혀요(봇도 함께 나가요). 나갈까요?' : '혼자 있는 방이라 나가면 방이 닫혀요. 나갈까요?', { ok: '나가기' }))) return;
    api('leave', { roomId })
      .then(() => setFlash(isHost && humans <= 1 ? '방을 닫았어요' : '방에서 나왔어요'))
      .catch(() => {})
      .finally(onLeave);
  };
  const readyCount = view.players.filter((p) => p.ready || p.id === room.hostId).length;

  return (
    <div className="waiting wr-client">
      <OfflineBanner />
      <header className="wr-top">
        <button className="icon-btn" onClick={leave} aria-label="방에서 나가기" title="나가기">
          <Icon name="back" size={18} />
        </button>
        <div className="wr-title">
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
                  <b>{canAddBot && botSlot === i ? '어떤 봇을 넣을까요?' : '빈 자리'}</b>
                  {canAddBot && botSlot === i ? (
                    <div className="slot-bot-pick" role="group" aria-label="봇 난이도">
                      {BOT_LEVELS.map((lv) => (
                        <button key={lv.level} className="btn sm" title={lv.desc} onClick={() => { setBotSlot(null); void run(() => api('addBot', { roomId, level: lv.level })); }}>
                          {lv.label}
                        </button>
                      ))}
                    </div>
                  ) : canAddBot ? (
                    <button className="btn sm slot-add-bot" onClick={() => setBotSlot(i)}>
                      <Icon name="bot" size={14} /> 봇 추가
                    </button>
                  ) : (
                    <small>초대를 기다리는 중</small>
                  )}
                </div>
              );
            const host = room.hostId === p.id;
            if (p.bot) {
              const info = botInfo(p.bot);
              return (
                <div key={p.id} className="slot ready bot">
                  <Avatar id="__bot" name={p.nickname} size={44} className="slot-av" />
                  <b>
                    {p.nickname}
                    <span className="bot-tag">봇</span>
                  </b>
                  <small className="slot-state">난이도 {info?.label ?? ''}</small>
                  <small className="muted">{info?.desc}</small>
                  {isHost && (
                    <button className="slot-kick" onClick={() => void run(() => api('kick', { roomId, target: p.id }))} aria-label={`${p.nickname} 빼기`} title="봇 빼기">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              );
            }
            return (
              <div key={p.id} className={'slot' + (p.ready || host ? ' ready' : '') + (p.id === playerId ? ' me' : '')}>
                <Avatar id={p.avatar} name={p.nickname} size={44} guest={!p.avatar} className="slot-av" />
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
          <SectionTitle>이 방은 이렇게 진행돼요</SectionTitle>
          <IconList
            items={[
              { icon: 'calendar', body: <><b>{room.totalDays}일</b> 동안 겨뤄요. 하루 장은 <b>{turnLabel}</b>이에요. 보통 <b>약 {estimateMinutes(room.totalDays, room.turnSeconds).typical}분</b>이면 끝나요.</> },
              { icon: 'timer', body: <>모두 장 마감을 누르면 바로 다음 날로 가요. {graceSentence(view.players.length >= 2 ? view.players.length : room.maxPlayers, room.turnSeconds)}</> },
              { icon: 'news', body: '날마다(첫날 포함) 장이 열리기 전에 커뮤니티 글을 보고 예약 주문을 걸 수 있어요.' },
              { icon: 'cards', body: <>찬스 카드는 시작할 때 {START_CARDS}장, {GRANT_EVERY}일마다 1장 무료로 받아요. 상대를 방해하는 카드도 있어요.</> },
              { icon: 'trophy', body: '마지막 날 재산이 가장 많은 사람이 이겨요.' },
            ]}
          />
        </section>
        </div>

        <aside className="wr-side">
          {view.players.length >= room.maxPlayers ? (
            // 자리가 다 차면 초대 코드·버튼 대신 안내 (들어올 수 없는 코드를 보내지 않게)
            <div className="panel pad wr-invite">
              <h3>자리가 다 찼어요</h3>
              <p className="muted small">{room.maxPlayers}명이 모두 모였어요. 누가 나가면 다시 초대할 수 있어요.</p>
            </div>
          ) : (
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
              {room.isPrivate && <p className="muted small">비밀방이에요. 방 목록에서 들어오려면 비밀번호가 필요해요</p>}
            </div>
          )}
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
