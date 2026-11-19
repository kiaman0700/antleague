/**
 * 일반전 파티 (회원, 최대 2명): 친구를 파티로 불러 일반전 다인전을 같이 찾음
 * 파티장이 '찾기'를 누르면 파티원 화면도 자동으로 '찾는 중'이 되고, 매칭되면 같은 방으로 들어감
 * 랭킹전·1대1 에는 파티로 못 들어감 (점수 몰아주기·다구리 방지)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loading } from './ui';
import { ask } from './ConfirmHost';
import { api } from '../net/api';
import { refreshAccount } from '../net/account';
import { tierShort } from './TierBadge';
import { okWhileMatching } from '../net/matchStore';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { refreshFriends, useFriends } from '../screens/Friends';

export interface PartyState {
  isLeader: boolean;
  members: { nickname: string; rating: number; ranked?: number; avatar?: string; leader: boolean; me: boolean; back?: boolean }[];
  searching: boolean;
  queue: string | null;
}

/** 파티 상태: 3초마다(화면이 보일 때) — 파티장이 찾기 시작하면 파티원도 바로 따라가게 */
export function useParty(member: boolean) {
  const [party, setParty] = useState<PartyState | null>(null);
  const lastAt = useRef(0);
  const inParty = useRef(false);
  const load = useCallback((force?: unknown) => {
    const since = Date.now() - lastAt.current;
    // 창이 뒤에 있어도 10초마다는 확인 — 로비에 있는 파티원이 다른 탭을 봐도 '돌아옴'(15초)이 풀려 파티장 찾기를 막지 않게
    if (!member || (document.visibilityState !== 'visible' && since < 10_000)) return Promise.resolve();
    // 파티가 없으면 12초마다만 (초대·수락은 그 자리에서 바로 다시 불러옴)
    if (force !== true && !inParty.current && since < 12_000) return Promise.resolve();
    lastAt.current = Date.now();
    return api<{ party: PartyState | null }>('party')
      .then((r) => {
        inParty.current = !!r.party;
        setParty(r.party);
      })
      .catch((e) => {
        if ((e as { status?: number })?.status === 403) void refreshAccount();
      });
  }, [member]);
  useEffect(() => {
    if (!member) return setParty(null);
    load(true);
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [member, load]);
  return { party, reload: useCallback(() => load(true), [load]) };
}

export function PartyPanel({ party, reload }: { party: PartyState | null; reload: () => Promise<void> }) {
  const friends = useFriends();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) refreshFriends();
  }, [open]);
  const inParty = !!party && party.members.length > 1;
  const full = !!party && party.members.length >= 2;
  const canInvite = !party || (party.isLeader && !full);

  const invite = async (id: string) => {
    setErr('');
    if (!okWhileMatching('파티 부르기는')) return;
    try {
      await api('partyInvite', { friendId: id });
      setSent((x) => ({ ...x, [id]: 'ok' }));
      setFresh((x) => ({ ...x, [id]: true }));
      setTimeout(() => setFresh((x) => ({ ...x, [id]: false })), 5000);
      await reload();
    } catch (e) {
      setSent((x) => ({ ...x, [id]: e instanceof Error ? e.message : '초대하지 못했어요' }));
    }
  };
  const leave = async () => {
    if (!(await ask(party?.isLeader ? '파티를 없앨까요? (같이 찾던 대기도 취소돼요)' : '파티에서 나갈까요?', { ok: party?.isLeader ? '파티 없애기' : '나가기', danger: true }))) return;
    await api('partyLeave').catch(() => {});
    await reload();
  };
  const online = (friends?.friends ?? []).filter((f) => f.status !== 'offline');

  return (
    <section className="panel pad party-panel">
      <div className="hr-head">
        <h3>
          파티 {inParty ? `${party!.members.length}/2` : ''}
        </h3>
        {party && (
          <button className="btn sm ghost" onClick={leave}>
            {party.isLeader ? '파티 없애기' : '나가기'}
          </button>
        )}
      </div>
      {!inParty && <p className="muted small">친구 1명과 파티를 만들어 일반전 다인전을 같이 찾을 수 있어요. 4명 방이 기본이고, 1분 30초 넘게 못 모이면 3명 방에도 들어가요.</p>}
      {party && (
        <ul className="party-members">
          {party.members.map((m, i) => (
            <li key={i} className={m.me ? 'me' : ''}>
              <Avatar id={m.avatar} name={m.nickname} size={30} className="fr-av" />
              <b>{m.nickname}</b>
              {m.leader && <em className="party-leader">파티장</em>}
              <small className="muted">{tierShort(m.rating, m.ranked)}</small>
              {/* 판이 끝난 뒤 파티로 돌아왔는지 (롤처럼 모두 돌아와야 다시 찾기) */}
              {!m.me && m.back === false && <em className="party-away">아직 안 돌아옴</em>}
              {!m.me && m.back === true && party.members.length > 1 && <em className="party-back"><Icon name="check" size={11} /> 돌아옴</em>}
            </li>
          ))}
          {!full && <li className="party-empty muted small">초대한 친구가 수락하면 여기에 들어와요</li>}
        </ul>
      )}
      {inParty && !party!.isLeader && <p className="muted small">파티장이 '일반전 찾기'를 누르면 같이 찾기 시작해요.</p>}
      {canInvite && (
        <button className="btn sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon name="userPlus" size={14} /> 친구 파티에 부르기
        </button>
      )}
      {open && canInvite && (
        <div className="party-invite">
          {!friends && <Loading inline />}
          {friends && online.length === 0 && <p className="muted small">지금 접속 중인 친구가 없어요.</p>}
          <ul className="fr-list">
            {online.map((f) => (
              <li key={f.id} className="fr-row">
                <span className={'fr-av st-' + (f.status ?? 'offline')}>{f.nickname.slice(0, 1)}</span>
                <span className="fr-txt">
                  <b>{f.nickname}</b>
                  {sent[f.id] && sent[f.id] !== 'ok' && <small className="error">{sent[f.id]}</small>}
                  {sent[f.id] === 'ok' && <small className="good-msg">불렀어요. 2분 안에 수락하면 들어와요 (못 받았으면 다시 부르기)</small>}
                </span>
                <span className="fr-act">
                  <button className="btn sm" disabled={!!fresh[f.id]} onClick={() => invite(f.id)}>
                    {fresh[f.id] ? '보냄' : sent[f.id] === 'ok' ? '다시 부르기' : '부르기'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </section>
  );
}
