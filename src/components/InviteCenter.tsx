/**
 * 친구 초대 알림 (로비에서만): 받은 방 초대·1대1 신청을 팝업으로, 내가 보낸 1대1 신청은 답을 기다리는 창으로
 * 6초마다 서버에 물어봄(회원·화면이 보일 때만). 게임·대기실 중에는 방해하지 않음
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { Icon } from './Icon';
import { SPEED_PRESET } from '../engine/matching';
import { loadUi, type Session, type UiMode } from '../session';
import { play } from '../lib/sound';

export interface IncomingInvite {
  id: string;
  kind: 'room' | 'duel' | 'party';
  from: string;
  title: string | null;
  speed: 'quick' | 'normal' | null;
  expiresAt: string;
}
export interface SentDuel {
  id: string;
  to: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  speed: 'quick' | 'normal' | null;
  expiresAt: string;
  roomId?: string;
  playerId?: string;
  code?: string;
  nickname?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** 1대1 신청을 보낸 직후 바로 다시 확인하게 */
export function pokeInvites() {
  listeners.forEach((f) => f());
}

const secsLeft = (iso: string, now: number) => Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));

export function InviteCenter({ member, onWaiting, onGame, onParty }: { member: boolean; onWaiting: (roomId: string, playerId: string, nickname: string, code: string) => void; onGame: (s: Session) => void; onParty?: () => void }) {
  const [incoming, setIncoming] = useState<IncomingInvite[]>([]);
  const [duel, setDuel] = useState<SentDuel | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const seen = useRef(new Set<string>());
  const entered = useRef(false);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ incoming: IncomingInvite[]; duel: SentDuel | null }>('invites')
        .then((r) => {
          if (!alive) return;
          setIncoming(r.incoming ?? []);
          setDuel(r.duel ?? null);
          for (const x of r.incoming ?? [])
            if (!seen.current.has(x.id)) {
              seen.current.add(x.id);
              play('news');
            }
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 6000);
    listeners.add(load);
    const onVis = () => load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(id);
      listeners.delete(load);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [member]);

  // 남은 시간 표시용 1초 시계 (초대가 있을 때만)
  const active = incoming.length > 0 || duel?.status === 'pending';
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // 내가 보낸 1대1 이 수락되면 바로 게임으로
  useEffect(() => {
    if (!duel || entered.current) return;
    if (duel.status === 'accepted' && duel.roomId && duel.playerId) {
      entered.current = true;
      play('win');
      onGame({ mode: 'multi', roomId: duel.roomId, code: duel.code ?? '', playerId: duel.playerId, nickname: duel.nickname ?? '', ui: loadUi() as UiMode });
    }
  }, [duel, onGame]);

  // 거절·만료 결과는 한 번만 알림
  useEffect(() => {
    if (!duel || seen.current.has('d:' + duel.id)) return;
    const expiredNow = duel.status === 'pending' && secsLeft(duel.expiresAt, now) === 0;
    if (duel.status === 'declined' || duel.status === 'expired' || expiredNow) {
      seen.current.add('d:' + duel.id);
      // 방금 보낸 신청에 대해서만 (예전 기록이면 조용히)
      if (Date.now() - new Date(duel.expiresAt).getTime() < 60_000) setNote(duel.status === 'declined' ? `${duel.to} 님이 이번엔 어렵대요. 친구 목록에서 다시 신청할 수 있어요.` : `${duel.to} 님의 답이 없었어요. 다시 신청해 보세요.`);
    }
  }, [duel, now]);

  if (!member) return null;

  const respond = async (inv: IncomingInvite, accept: boolean) => {
    setErr('');
    setBusy(true);
    try {
      const r = await api<{ kind: string; roomId: string; playerId: string; code: string; nickname: string }>('inviteRespond', { id: inv.id, accept, mode: loadUi() });
      setIncoming((xs) => xs.filter((x) => x.id !== inv.id));
      if (!accept) return;
      if (r.kind === 'party') onParty?.();
      else if (r.kind === 'room') onWaiting(r.roomId, r.playerId, r.nickname, r.code);
      else onGame({ mode: 'multi', roomId: r.roomId, code: r.code, playerId: r.playerId, nickname: r.nickname, ui: loadUi() as UiMode });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setIncoming((xs) => xs.filter((x) => x.id !== inv.id));
    } finally {
      setBusy(false);
    }
  };

  const inv = incoming.find((x) => !dismissed.has(x.id) && secsLeft(x.expiresAt, now) > 0);
  const waitingDuel = duel && duel.status === 'pending' && secsLeft(duel.expiresAt, now) > 0 ? duel : null;

  return (
    <>
      {inv && (
        <div className="modal-bg">
          <div className="modal invite-pop" role="dialog" aria-modal aria-label="친구 초대">
            <h3>
              <Icon name={inv.kind === 'room' ? 'door' : 'users'} size={18} /> {inv.kind === 'duel' ? '1대1 대결 신청' : inv.kind === 'party' ? '파티 초대' : '방 초대'}
            </h3>
            <p>
              <b>{inv.from}</b> 님이 {inv.kind === 'duel' ? '1대1 대결을 신청했어요.' : inv.kind === 'party' ? '파티에 불렀어요. 일반전 다인전을 같이 찾아요.' : <>'<b>{inv.title}</b>' 방에 초대했어요.</>}
            </p>
            {inv.kind === 'duel' && inv.speed && (
              <p className="muted small">
                {SPEED_PRESET[inv.speed].label} ({SPEED_PRESET[inv.speed].minutes}) · 랭킹 점수는 바뀌지 않아요 · 수락하면 바로 시작해요
              </p>
            )}
            <p className="muted small">{secsLeft(inv.expiresAt, now)}초 안에 답해 주세요</p>
            {err && <p className="error small">{err}</p>}
            <div className="modal-actions">
              <button className="btn ghost" disabled={busy} onClick={() => respond(inv, false)}>
                거절
              </button>
              <button className="icon-btn" aria-label="나중에" title="나중에 (이 창만 닫기)" onClick={() => setDismissed((d) => new Set(d).add(inv.id))}>
                <Icon name="x" />
              </button>
              <button className="btn primary" disabled={busy} autoFocus onClick={() => respond(inv, true)}>
                {inv.kind === 'duel' ? '수락하고 시작' : inv.kind === 'party' ? '파티 들어가기' : '입장'}
              </button>
            </div>
          </div>
        </div>
      )}
      {!inv && waitingDuel && (
        <div className="modal-bg">
          <div className="modal invite-pop" role="dialog" aria-modal aria-label="1대1 신청 대기">
            <div className="mf-spin" aria-hidden />
            <h3>{waitingDuel.to} 님의 답을 기다려요</h3>
            <p className="muted small">
              1대1 · {waitingDuel.speed ? SPEED_PRESET[waitingDuel.speed].label : ''} · {secsLeft(waitingDuel.expiresAt, now)}초 남음
            </p>
            <button
              className="btn ghost"
              onClick={() => {
                api('inviteCancel', { id: waitingDuel.id }).catch(() => {});
                setDuel({ ...waitingDuel, status: 'cancelled' });
                seen.current.add('d:' + waitingDuel.id);
              }}
            >
              신청 취소
            </button>
          </div>
        </div>
      )}
      {note && (
        <div className="invite-note" role="status" onClick={() => setNote('')}>
          {note}
          <button className="icon-btn sm" aria-label="닫기" onClick={() => setNote('')}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </>
  );
}
