/**
 * 대결 찾기 (매칭): 랭킹전/일반전 × 1대1/다인전 × 신속/일반 → 실력이 비슷한 사람끼리 자동으로 방이 만들어지고 바로 시작
 * 대기는 로비 전체에서 하나(matchStore): 찾는 동안 다른 메뉴를 둘러봐도 되고, 위 '플레이' 버튼에 대기 시간이 흐름
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../net/api';
import { cancelMatch, clearMatchErr, getMatch, mmss, startMatch, useMatch, type Matched } from '../net/matchStore';
import { SPEED_PRESET, waitLabel, type QueueKind, type QueueSize, type QueueSpeed } from '../engine/matching';
import { Icon } from './Icon';
import { loadNick } from '../session';

export type { Matched };

const PREF = 'stockduel.match';
/** 선택지 아래 작은 글씨: 설명 + 지금 기다리는 사람 수 */
const waitTag = (base: string, n: number) => (n > 0 ? `${base} · ${n}명 대기` : base);
export const loadPref = (): { kind: QueueKind; size: QueueSize; speed: QueueSpeed } => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF) ?? 'null');
    if (v && v.kind && v.size && v.speed) return v;
  } catch {
    /* 저장소 없음 */
  }
  return { kind: 'casual', size: 'duel', speed: 'quick' };
};
/** 결과 화면 '다시 찾기'·위 메뉴 '플레이' → 그 메뉴에 오면 바로 찾기 */
export const FIND_AGAIN = 'stockduel.findAgain';

interface Props {
  member: boolean;
  /** 계정 상태를 아직 모름 (게스트 안내를 잠깐 보였다 숨기지 않게) */
  loading?: boolean;
  /** 메뉴에서 랭킹전/일반전을 이미 골랐으면 고정 (종류 고르는 칸을 숨김) */
  fixedKind?: QueueKind;
  /** 찾기 전에 확인할 것 (게스트 닉네임 안내 등). 확인되면 go() 를 부름 */
  guard?: (go: () => void) => void;
  nickname: string;
  nickOk: boolean;
  ui: string;
  onNeedNick: () => void;
  onLogin: () => void;
  /** (예전) 매칭되면 — 이제는 로비 틀이 매칭 결과를 받아 게임으로 이동 */
  onMatched?: (m: Matched) => void;
  /** 일반전 파티 (2명이면 다인전으로만, 파티장만 찾기 시작, 파티원은 자동으로 따라감) */
  party?: { isLeader: boolean; searching: boolean; size: number; queue?: string | null } | null;
}

const parseQueueName = (q: string) => {
  const [kind, size, speed] = q.split('_') as [QueueKind, QueueSize, QueueSpeed];
  return { kind, size, speed };
};

export function MatchFinder({ member, loading, fixedKind, guard, nickname, nickOk, ui, onNeedNick, onLogin, party }: Props) {
  const [pref, setPref] = useState(loadPref);
  const m = useMatch();
  const searching = m.phase !== 'idle';
  const info = m.info;
  const linking = m.phase === 'linking';
  const joining = m.phase === 'joining';
  const [localErr, setLocalErr] = useState('');
  const err = localErr || m.err;
  const inParty = !!party && party.size > 1;
  const sizeEff: QueueSize = inParty ? 'multi' : pref.size;
  const want = fixedKind ?? pref.kind;
  const kind: QueueKind = want === 'ranked' && !member ? 'casual' : want;
  // 화면의 흐르는 대기 시간 (1초마다)
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const waited = searching ? Math.max(0, Math.floor((Date.now() - m.startedAt) / 1000)) : 0;
  const save = (p: typeof pref) => {
    setPref(p);
    try {
      localStorage.setItem(PREF, JSON.stringify(p));
    } catch {
      /* 저장 못 해도 괜찮음 */
    }
  };

  const begin = async (over?: { size: QueueSize; speed: QueueSpeed }) => {
    // 위 메뉴 '플레이'가 같은 설정으로 바로 찾을 수 있게 마지막 종류도 기억
    if (pref.kind !== kind) save({ ...pref, kind });
    const size = over?.size ?? sizeEff;
    const speed = over?.speed ?? pref.speed;
    await startMatch(`${kind}_${size}_${speed}`, (member ? nickname : loadNick() || nickname).trim(), ui === 'pro' ? 'pro' : 'easy');
  };
  const start = async () => {
    setLocalErr('');
    clearMatchErr();
    if (guard && !member) return guard(() => void begin());
    if (!member && !nickOk) return onNeedNick();
    return begin();
  };
  const cancel = () => void cancelMatch();

  // 대기열마다 지금 기다리는 사람 수 (사람이 적을 때 붐비는 쪽을 고르게)
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [eta, setEta] = useState<Record<string, number | null>>({});
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ counts: Record<string, number>; eta?: Record<string, number | null>; online?: number }>('queueCounts')
        .then((r) => {
          if (!alive) return;
          setCounts(r.counts ?? {});
          setEta(r.eta ?? {});
          setOnline(r.online ?? null);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, searching ? 5000 : 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [searching]);
  const waitingIn = (size: QueueSize, speed: QueueSpeed) => counts[`${kind}_${size}_${speed}`] ?? 0;
  const label = (size: QueueSize, speed: QueueSpeed) => `${size === 'duel' ? '1대1' : '다인전'} ${SPEED_PRESET[speed].label}`;
  /** 지금 찾는 대기열 (다른 메뉴에서 시작했으면 그 대기열) */
  const curQ = m.queue ? parseQueueName(m.queue) : null;
  const sameKind = !curQ || curQ.kind === kind;
  /** 오래 기다리면: 사람이 기다리는 다른 대기열(같은 랭킹전/일반전)로 바꾸기 제안 */
  const alt = (() => {
    if (!info || linking || inParty || !curQ || !sameKind) return null;
    const opts: [QueueSize, QueueSpeed][] = (['duel', 'multi'] as QueueSize[]).flatMap((z) => (['quick', 'normal'] as QueueSpeed[]).map((p) => [z, p] as [QueueSize, QueueSpeed]));
    const others = opts.filter(([z, p]) => !(z === curQ.size && p === curQ.speed)).map(([z, p]) => ({ size: z, speed: p, n: waitingIn(z, p) }));
    const busy = others.filter((o) => o.n > 0).sort((a, b) => b.n - a.n)[0];
    if (waited >= 25 && busy) return busy;
    if (waited >= 45 && curQ.size === 'multi') return { size: 'duel' as QueueSize, speed: curQ.speed, n: waitingIn('duel', curQ.speed) };
    return null;
  })();
  const switchTo = async (o: { size: QueueSize; speed: QueueSpeed }) => {
    save({ ...pref, size: o.size, speed: o.speed });
    await cancelMatch();
    await begin(o);
  };

  // 위 메뉴 '플레이' (이미 이 화면이면 신호로 바로 시작) — 늘 지금 화면의 설정으로
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    const onPlay = () => {
      try {
        const again = localStorage.getItem(FIND_AGAIN);
        if (again && (!fixedKind || again === fixedKind)) {
          localStorage.removeItem(FIND_AGAIN);
          if (getMatch().phase === 'idle') void startRef.current();
        }
      } catch {
        /* 무시 */
      }
    };
    window.addEventListener('stockduel:play', onPlay);
    return () => window.removeEventListener('stockduel:play', onPlay);
  }, [fixedKind]);

  // 결과 화면 '다시 찾기'·플레이로 왔으면 바로 시작 (회원인지 확인이 끝난 뒤에 — 회원에게 게스트 안내가 뜨지 않게)
  useEffect(() => {
    if (loading) return;
    try {
      const again = localStorage.getItem(FIND_AGAIN);
      if (again && (!fixedKind || again === fixedKind || again === '1')) {
        localStorage.removeItem(FIND_AGAIN);
        if (getMatch().phase === 'idle') void startRef.current();
      }
    } catch {
      /* 무시 */
    }
  }, [loading, fixedKind]);

  const seg = <T extends string>(value: T, items: [T, string, string?][], on: (v: T) => void) => (
    <div className="seg mf-seg" role="radiogroup">
      {items.map(([v, l, sub]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={searching} onClick={() => on(v)}>
          <b>{l}</b>
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );

  return (
    <section className={'panel pad match-finder' + (searching ? ' is-searching' : '')}>
      {!fixedKind && (
        <h3>
          <Icon name="users" size={18} /> 대결 찾기
        </h3>
      )}
      {!fixedKind && seg(kind, [['ranked', '랭킹전', member ? '점수가 오르내려요' : '회원 전용'], ['casual', '일반전', '부담 없이']], (v) => (v === 'ranked' && !member ? onLogin() : save({ ...pref, kind: v })))}
      {inParty ? (
        <p className="muted small mf-note">
          파티는 <b>다인전</b>으로 같이 찾아요. 4명 방이 기본이고, 1분 30초 넘게 못 모이면 3명 방으로 시작해요.
        </p>
      ) : (
        seg(sizeEff, [['duel', '1대1', waitTag('두 명', waitingIn('duel', pref.speed))], ['multi', '다인전', waitTag('3~4명', waitingIn('multi', pref.speed))]], (v) => save({ ...pref, size: v }))
      )}
      {seg(pref.speed, [['quick', SPEED_PRESET.quick.label, waitTag(SPEED_PRESET.quick.minutes, waitingIn(sizeEff, 'quick'))], ['normal', SPEED_PRESET.normal.label, waitTag(SPEED_PRESET.normal.minutes, waitingIn(sizeEff, 'normal'))]], (v) => save({ ...pref, speed: v }))}
      {!member && !loading && !fixedKind && (
        <p className="muted small mf-note">
          게스트는 일반전만 할 수 있어요. <button className="linkish-soft" onClick={onLogin}>로그인하면 랭킹전</button>
        </p>
      )}
      {err && <p className="error">{err}</p>}
      {!searching && online !== null && (
        <p className="mf-eta" aria-live="polite">
          <Icon name="hourglass" size={14} /> 예상 대기 <b>{waitLabel(eta[`${kind}_${sizeEff}_${pref.speed}`] ?? null)}</b>
          {waitingIn(sizeEff, pref.speed) > 0 && <small className="muted"> · {waitingIn(sizeEff, pref.speed)}명 기다리는 중</small>}
        </p>
      )}
      {inParty && kind === 'ranked' && <p className="muted small mf-note">랭킹전은 파티 없이 혼자 찾아요 (친구도 각자 찾으면 같은 판에서 만날 수 있어요). 파티에서 나오면 찾을 수 있어요.</p>}

      {!searching && (
        <div className="mf-spec" aria-label="이 대결의 규칙">
          <div>
            <b>{sizeEff === 'duel' ? '2' : '3~4'}</b>
            <small>명</small>
          </div>
          <div>
            <b>{SPEED_PRESET[pref.speed].days}</b>
            <small>일</small>
          </div>
          <div>
            <b>{SPEED_PRESET[pref.speed].turnSeconds}</b>
            <small>초 / 하루</small>
          </div>
          <div>
            <b>{SPEED_PRESET[pref.speed].minutes.replace('약 ', '').replace(/분$/, '')}</b>
            <small>분 · 한 판</small>
          </div>
        </div>
      )}
      {searching ? (
        <div className="mf-live" role="status" aria-live="polite">
          <div className="mf-live-top">
            <span className="mf-spin sm" aria-hidden />
            <b>{linking ? '상대를 찾았어요! 방을 만드는 중…' : '상대를 찾고 있어요'}</b>
            <span className="mf-clock">{mmss(waited)}</span>
          </div>
          <small className="muted">
            예상 대기 {waitLabel(info?.etaSec ?? null)}
            {/* inQueue 에는 나도 들어 있음 → '나 말고' 몇 명인지로 (혼자인데 '1명 대기 중'이라 헷갈리지 않게) */}
            {info ? (info.inQueue > 1 ? ` · 나 말고 ${info.inQueue - 1}명이 찾는 중` : ' · 아직 찾는 사람이 나뿐이에요') : ''}
          </small>
          <div className="mf-live-act">
            {alt && (
              <button className="btn sm mf-alt" onClick={() => switchTo(alt)}>
                <Icon name="refresh" size={14} /> {label(alt.size, alt.speed)}으로 바꿔 찾기{alt.n > 0 ? ` · ${alt.n}명 대기 중` : ''}
              </button>
            )}
            {!linking && (
              <button className="btn ghost" onClick={cancel}>
                그만 찾기
              </button>
            )}
          </div>
        </div>
      ) : (
        <button className="btn primary xl full" onClick={start} disabled={loading || joining || (inParty && (!party!.isLeader || kind === 'ranked'))}>
          <Icon name="search" size={18} /> {joining ? '준비 중…' : inParty && !party!.isLeader ? '파티장이 찾기를 시작해요' : `${kind === 'ranked' ? '랭킹전' : '일반전'} ${inParty ? '파티로 ' : ''}찾기`}
        </button>
      )}
    </section>
  );
}

/** 플레이 버튼 아래 글자: "일반전 · 1대1 · 신속" */
export function playLabel(member: boolean, inParty = false) {
  const p = loadPref();
  const kind = p.kind === 'ranked' && member && !inParty ? 'ranked' : 'casual';
  const size = inParty ? 'multi' : p.size;
  return `${kind === 'ranked' ? '랭킹전' : '일반전'} · ${size === 'duel' ? '1대1' : '다인전'} · ${SPEED_PRESET[p.speed].label}`;
}
