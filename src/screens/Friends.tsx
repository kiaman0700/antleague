/**
 * 친구 (회원만): 닉네임으로 신청, 받은 신청 수락·거절, 친구 목록(접속 상태), 삭제·차단, 차단 풀기
 * 서버는 user id 를 보내지 않음 — 화면의 id 는 '친구 관계 줄'의 id
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { ask } from '../components/ConfirmHost';
import { api } from '../net/api';
import { refreshAccount, useAccount } from '../net/account';
import { Icon } from '../components/Icon';
import { pokeInvites } from '../components/InviteCenter';
import { okWhileMatching } from '../net/matchStore';
import { titleLabel } from '../game/achievements';
import { tierShort } from '../components/TierBadge';
import { SPEED_PRESET } from '../engine/matching';
import { Avatar } from '../components/Avatar';

export interface FriendItem {
  chal?: number;
  id: string;
  nickname: string;
  title: string | null;
  rating: number;
  /** 랭킹전 판 수 (2판까지 배치 — 티어 대신 '배치 중') */
  ranked?: number;
  avatar?: string;
  status?: 'online' | 'playing' | 'offline';
  at?: string;
}
export interface FriendsData {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
  blocked: { id: string; nickname: string }[];
  max: number;
}

/* 친구 목록은 메뉴 배지(받은 신청 수)와 친구 화면이 함께 씀 */
let data: FriendsData | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let inflight: Promise<void> | null = null;
/** 마지막으로 받기에 실패했는지 (처음부터 못 받으면 끝없이 '불러오는 중'이 아니라 안내 + 다시 시도) */
let failed = false;
/** fresh: 행동(수락·삭제 등) 직후 — 이미 가고 있던 요청은 행동 전 값이라, 끝난 뒤 한 번 더 받음 */
export function refreshFriends(fresh = false): Promise<void> {
  if (inflight) return fresh ? inflight.then(() => refreshFriends()) : inflight;
  inflight = api<FriendsData>('friends')
    .then((d) => {
      data = d;
      failed = false;
      emit();
    })
    // 로그인이 풀렸으면(403) 계정 상태를 다시 확인 → 게스트 화면으로 (헛된 요청 반복 방지)
    .catch((e) => {
      if ((e as { status?: number })?.status === 403) void refreshAccount();
      else if (!failed) {
        failed = true;
        emit();
      }
    })
    .finally(() => (inflight = null));
  return inflight;
}
export function clearFriends() {
  data = null;
  emit();
}
export function useFriendsFailed() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => failed,
  );
}
export function useFriends() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => data,
  );
}

/** 회원이면 30초마다(화면이 보일 때만) 친구·신청을 다시 받아 옴 → 메뉴 배지 */
export function useFriendsPoll(member: boolean) {
  useEffect(() => {
    if (!member) return clearFriends();
    refreshFriends();
    const id = setInterval(() => document.visibilityState === 'visible' && refreshFriends(), 30_000);
    const onVis = () => document.visibilityState === 'visible' && refreshFriends();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [member]);
  return useFriends();
}

const STATUS: Record<string, [string, string]> = {
  playing: ['게임 중', 'st-playing'],
  online: ['접속 중', 'st-online'],
  offline: ['오프라인', 'st-offline'],
};
const titleName = (t: string | null) => titleLabel(t)?.name ?? null;

export function FriendsPage({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  const acc = useAccount();
  const member = acc.status === 'member';
  const d = useFriends();
  const loadFailed = useFriendsFailed();
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    if (member) refreshFriends();
  }, [member]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await fn();
      if (ok) setMsg(ok);
      await refreshFriends(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setMenu(null);
    }
  }, []);

  if (acc.status === 'loading')
    return (
      <section className="panel pad hub-skel" aria-busy="true">
        <span className="muted small">내 계정을 확인하는 중…</span>
      </section>
    );
  if (!member)
    return (
      <section className="panel pad ranked-guest">
        <i className="rg-icon">
          <Icon name="users" size={34} />
        </i>
        <h3>친구 기능은 회원만 쓸 수 있어요</h3>
        <p className="muted">친구를 추가하면 접속 중인지 보이고, 앞으로 방 초대·1대1 신청도 할 수 있어요. 가입은 아이디·비밀번호·닉네임만 있으면 돼요.</p>
        <div className="rg-actions">
          <button className="btn primary" onClick={onSignup}>
            <Icon name="userPlus" /> 회원가입
          </button>
          <button className="btn" onClick={onLogin}>
            로그인
          </button>
        </div>
      </section>
    );

  const confirmThen = (q: string, fn: () => Promise<unknown>, ok: string) => {
    void ask(q, { danger: true }).then((yes) => { if (yes) void run(fn, ok); });
  };

  return (
    <div className="friends">
      <section className="panel pad fr-add">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = nick.trim();
            if (!n) return;
            run(async () => {
              const r = await api<{ status: string }>('friendRequest', { nickname: n });
              setNick('');
              setMsg(r.status === 'accepted' ? `${n} 님과 친구가 됐어요!` : `${n} 님에게 친구 신청을 보냈어요.`);
            });
          }}
        >
          <label className="field">
            <span>닉네임으로 친구 추가 (정확히 입력)</span>
            <div className="fr-add-row">
              <input value={nick} maxLength={10} placeholder="친구 닉네임" onChange={(e) => (setNick(e.target.value), setErr(""))} autoComplete="off" />
              <button className="btn primary" disabled={busy || !nick.trim()}>
                <Icon name="userPlus" size={16} /> 신청
              </button>
            </div>
          </label>
        </form>
        {msg && <p className="good-msg small" role="status">{msg}</p>}
        {err && <p className="error small" role="alert">{err}</p>}
      </section>

      {d && d.incoming.length > 0 && (
        <section className="panel pad fr-in">
          <h3 className="fr-h">
            받은 신청 <span className="fr-count">{d.incoming.length}</span>
          </h3>
          <ul className="fr-list">
            {d.incoming.map((f) => (
              <li key={f.id} className="fr-row">
                <Avatar id={f.avatar} name={f.nickname} size={38} className="fr-av" />
                <span className="fr-txt">
                  <b>{f.nickname}</b>
                  <small className="muted">
                    {titleName(f.title) ? `${titleName(f.title)} · ` : ''}
                    {tierShort(f.rating, f.ranked, f.chal)}
                  </small>
                </span>
                <span className="fr-act">
                  <button className="btn sm primary" disabled={busy} onClick={() => run(() => api('friendRespond', { id: f.id, accept: true }), `${f.nickname} 님과 친구가 됐어요!`)}>
                    수락
                  </button>
                  <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api('friendRespond', { id: f.id, accept: false }))}>
                    거절
                  </button>
                  <button className="btn sm ghost fr-block" aria-label={`${f.nickname} 차단`} disabled={busy} onClick={() => confirmThen(`${f.nickname} 님을 차단할까요? 이 사람의 신청이 더 오지 않아요. (상대에게는 알리지 않아요)`, () => api('friendBlock', { id: f.id }), '차단했어요')}>
                    차단
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel pad fr-main">
        <h3 className="fr-h">
          친구 <span className="fr-count">{d ? `${d.friends.length}/${d.max}` : ''}</span>
        </h3>
        {!d && (loadFailed ? <ErrorState compact what="친구 목록" onRetry={() => void refreshFriends()} /> : <Loading inline />)}
        {d && d.friends.length === 0 && <EmptyState compact icon="users" title="아직 친구가 없어요" desc="친구 닉네임을 정확히 입력해 신청해 보세요." />}
        {d && d.friends.length > 0 && (
          <ul className="fr-list">
            {d.friends.map((f) => {
              const [label, cls] = STATUS[f.status ?? 'offline'];
              return (
                <li key={f.id} className="fr-row">
                  <Avatar id={f.avatar} name={f.nickname} size={38} className={'fr-av ' + cls} />
                  <span className="fr-txt">
                    <b>{f.nickname}</b>
                    <small className="muted">
                      <span className={'fr-dot ' + cls} aria-hidden /> {label} · {tierShort(f.rating, f.ranked, f.chal)}{titleName(f.title) ? ` · ${titleName(f.title)}` : ''}
                    </small>
                  </span>
                  <span className="fr-act">
                    <button
                      className="btn sm"
                      // 접속 중인 친구에게만 (오프라인·게임 중이면 90초 안에 받을 수 없어 신청이 그냥 사라짐).
                      // 버튼은 흐리게만 하고 누르면 이유를 알려 줌 (휴대폰은 마우스 올림 안내가 없어서)
                      disabled={busy}
                      aria-disabled={f.status !== 'online'}
                      data-off={f.status !== 'online' || undefined}
                      title={f.status === 'online' ? '친구에게 1대1 대결 신청 (신속 · 점수 없음)' : undefined}
                      onClick={() =>
                        f.status !== 'online'
                          ? setMsg(f.status === 'playing' ? `${f.nickname} 님은 게임 중이에요. 끝나면 1대1을 신청할 수 있어요.` : `${f.nickname} 님이 접속 중일 때 1대1을 신청할 수 있어요.`)
                          : okWhileMatching('1대1 신청은') && run(async () => (await api('challenge', { friendId: f.id, speed: 'quick' }), pokeInvites()))
                      }
                    >
                      <Icon name="users" size={14} /> 1대1
                    </button>
                    <button className="icon-btn sm" aria-label={`${f.nickname} 메뉴`} aria-expanded={menu === f.id} onClick={() => setMenu(menu === f.id ? null : f.id)}>
                      <Icon name="list" size={16} />
                    </button>
                    {menu === f.id && (
                      <span className="fr-menu" role="menu">
                        <button role="menuitem" aria-disabled={f.status !== 'online'} data-off={f.status !== 'online' || undefined} onClick={() => (setMenu(null), f.status !== 'online' ? setMsg(f.status === 'playing' ? `${f.nickname} 님은 게임 중이에요. 끝나면 1대1을 신청할 수 있어요.` : `${f.nickname} 님이 접속 중일 때 1대1을 신청할 수 있어요.`) : okWhileMatching('1대1 신청은') && run(async () => (await api('challenge', { friendId: f.id, speed: 'normal' }), pokeInvites())))}>
                          1대1 신청 · 일반 ({SPEED_PRESET.normal.minutes})
                        </button>
                        <button role="menuitem" onClick={() => confirmThen(`${f.nickname} 님을 친구에서 뺄까요?`, () => api('friendRemove', { id: f.id }), '친구에서 뺐어요')}>
                          친구 끊기
                        </button>
                        <button role="menuitem" className="danger" onClick={() => confirmThen(`${f.nickname} 님을 차단할까요? 친구에서도 빠지고, 신청이 더 오지 않아요. (상대에게는 알리지 않아요)`, () => api('friendBlock', { id: f.id }), '차단했어요')}>
                          차단
                        </button>
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted small fr-note">친구에게만 내 접속 상태(접속 중·게임 중)가 보여요. 아이디는 누구에게도 보이지 않아요.</p>
      </section>

      {d && d.outgoing.length > 0 && (
        <section className="panel pad fr-out">
          <h3 className="fr-h">보낸 신청</h3>
          <ul className="fr-list">
            {d.outgoing.map((f) => (
              <li key={f.id} className="fr-row">
                <Avatar id={f.avatar} name={f.nickname} size={38} className="fr-av" />
                <span className="fr-txt">
                  <b>{f.nickname}</b>
                  <small className="muted">답을 기다리는 중이에요. 7일 뒤 자동으로 사라져요</small>
                </span>
                <span className="fr-act">
                  <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api('friendRemove', { id: f.id }), '신청을 취소했어요')}>
                    취소
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d && d.blocked.length > 0 && (
        <section className="panel pad fr-block">
          <h3 className="fr-h">차단한 사람</h3>
          <ul className="fr-list">
            {d.blocked.map((x) => (
              <li key={x.id} className="fr-row">
                <span className="fr-av">{x.nickname.slice(0, 1)}</span>
                <span className="fr-txt">
                  <b>{x.nickname}</b>
                </span>
                <span className="fr-act">
                  <button className="btn sm ghost" disabled={busy} onClick={() => run(() => api('unblock', { id: x.id }), '차단을 풀었어요')}>
                    차단 풀기
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
