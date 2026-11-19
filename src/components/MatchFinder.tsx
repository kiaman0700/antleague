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
import { StageChart } from './StageChart';
import { useAccount } from '../net/account';
import { useMissions } from './Missions';
import { ToonIcon } from './ToonIcon';
import { pct, tone } from '../lib/format';

export type { Matched };

const PREF = 'stockduel.match';
/** 선택지 아래 작은 글씨: 설명 + 지금 기다리는 사람 수 */
const waitTag = (base: string, n: number) => (n > 0 ? `${base} · ${n}명 대기` : base);
export const loadPref = (): { kind: QueueKind; size: QueueSize; speed: QueueSpeed } => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF) ?? 'null');
    if (v && ['ranked', 'casual'].includes(v.kind) && ['duel', 'multi'].includes(v.size) && ['quick', 'normal'].includes(v.speed)) return { kind: v.kind, size: v.size, speed: v.speed };
  } catch {
    /* 저장소 없음 */
  }
  return { kind: 'casual', size: 'duel', speed: 'quick' };
};
/** 매칭 설정 저장 + 알림 (위 메뉴 플레이 팝업 ↔ 랭킹전·일반전 화면이 같은 값을 씀) */
export const PREF_EVENT = 'stockduel:matchpref';
export function savePref(p: { kind: QueueKind; size: QueueSize; speed: QueueSpeed }) {
  try {
    localStorage.setItem(PREF, JSON.stringify(p));
  } catch {
    /* 저장 못 해도 괜찮음 */
  }
  window.dispatchEvent(new Event(PREF_EVENT));
}
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
  /** 매칭되면 (지금은 쓰지 않음 — 로비 틀이 매칭 결과를 받아 게임으로 이동) */
  onMatched?: (m: Matched) => void;
  /** 일반전 파티 (2명이면 다인전으로만, 파티장만 찾기 시작, 파티원은 자동으로 따라감) */
  party?: { isLeader: boolean; searching: boolean; size: number; queue?: string | null; waiting?: boolean } | null;
  /** 로비 '플레이 무대' 모양 (큰 제목·뒤 차트·큰 버튼) */
  stage?: boolean;
  /** 혼자 오래 기다릴 때 '그만 찾고 봇전' (찾기를 멈춘 뒤 봇전 창을 엶) */
  onBots?: () => void;
}

const parseQueueName = (q: string) => {
  const [kind, size, speed] = q.split('_') as [QueueKind, QueueSize, QueueSpeed];
  return { kind, size, speed };
};

export function MatchFinder({ member, loading, fixedKind, guard, nickname, nickOk, ui, onNeedNick, onLogin, party, stage = false, onBots }: Props) {
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
    // 0.5초마다 보고 보이는 초가 바뀔 때만 다시 그림 (1초 간격이면 늦은 한 번에 숫자를 건너뜀)
    const id = setInterval(() => setNowTick(Math.floor((Date.now() - getMatch().startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [searching]);
  const waited = searching ? Math.max(0, Math.floor((Date.now() - m.startedAt) / 1000)) : 0;
  const save = (p: typeof pref) => {
    setPref(p);
    savePref(p);
  };
  // 위 메뉴 플레이 팝업에서 바꾸면 이 화면도 따라 바뀜
  useEffect(() => {
    const on = () => setPref(loadPref());
    window.addEventListener(PREF_EVENT, on);
    return () => window.removeEventListener(PREF_EVENT, on);
  }, []);

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
  const nWaitOf = (size: QueueSize) => waitingIn(size, pref.speed);
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

  const seg = <T extends string>(value: T, items: [T, string, string?][], on: (v: T) => void, label?: string) => (
    <div className="seg mf-seg" role="radiogroup" aria-label={label}>
      {items.map(([v, l, sub]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={searching} onClick={() => on(v)}>
          <b>{l}</b>
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );

  const preset = SPEED_PRESET[pref.speed];
  const acc = useAccount();
  const returning = acc.status === 'member' && ((acc.profile?.games ?? 0) > 0 || acc.recent.length > 0);
  const minutes = preset.minutes.replace('약 ', '');
  const nWait = waitingIn(sizeEff, pref.speed);
  const findLabel = joining ? '준비 중…' : inParty && !party!.isLeader ? '파티장만 찾을 수 있어요' : inParty && party!.waiting ? '파티원이 돌아오길 기다려요' : stage ? '대결 찾기' : `${kind === 'ranked' ? '랭킹전' : '일반전'} ${inParty ? '파티로 ' : ''}찾기`;
  const findDisabled = loading || joining || (inParty && (!party!.isLeader || kind === 'ranked' || !!party!.waiting));

  if (stage)
    return (
      <section className={'mf-stage' + (searching ? ' is-searching' : '')} aria-label={`${kind === 'ranked' ? '랭킹전' : '일반전'} 대결 찾기`}>
        <StageChart />
        <div className={'st-copy' + (returning ? ' is-back' : '')}>
          <span className="st-eyebrow">{kind === 'ranked' ? '랭킹전 · 이기면 점수가 올라요' : '일반전 · 점수 없이 가볍게'}</span>
          <h1 className={'st-title' + (returning ? ' sm' : '')}>
            {sizeEff === 'duel' ? '두 명이 겨루는' : '3~4명이 겨루는'}
            {returning ? ' ' : <br />}
            {minutes} 한 판
          </h1>
          {/* 다시 온 사람은 규칙 설명 대신 내 진행 한 줄 (처음 온 사람에게만 설명) */}
          {returning ? (
            <ProgressStrip />
          ) : (
            <p className="st-desc">
              같은 시장, 같은 뉴스. {preset.days}일 동안 하루 {preset.turnSeconds}초씩 사고팔아 마지막 날 재산이 많은 사람이 이겨요.
            </p>
          )}
        </div>
        <div className="st-pick">
          <div className="st-field">
            <span className="st-label" id="st-size">몇 명이서</span>
            {inParty ? (
              <p className="muted small mf-note">파티는 다인전으로 같이 찾아요 (4명, 1분 30초 뒤엔 3명도).</p>
            ) : (
              <div className="st-seg" role="radiogroup" aria-labelledby="st-size">
                {([['duel', '1대1', '2명', nWaitOf('duel')], ['multi', '다인전', '3~4명', nWaitOf('multi')]] as [QueueSize, string, string, number][]).map(([v, l, who, n]) => (
                  <button key={v} role="radio" aria-checked={sizeEff === v} className={sizeEff === v ? 'on' : ''} disabled={searching} onClick={() => save({ ...pref, size: v })}>
                    <span>{l}</span>
                    <small>
                      {who}
                      {n > 0 && ` · ${n}명 대기`}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="st-field">
            <span className="st-label" id="st-speed">얼마나 빨리</span>
            <div className="st-seg" role="radiogroup" aria-labelledby="st-speed">
              {(['quick', 'normal'] as QueueSpeed[]).map((v) => (
                <button key={v} role="radio" aria-checked={pref.speed === v} className={pref.speed === v ? 'on' : ''} disabled={searching} onClick={() => save({ ...pref, speed: v })}>
                  <span>{SPEED_PRESET[v].label}</span>
                  <small>{SPEED_PRESET[v].minutes.replace('약 ', '')}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        {inParty && kind === 'ranked' && <p className="muted small mf-note">랭킹전은 파티 없이 혼자 찾아요. 파티에서 나오면 찾을 수 있어요.</p>}
        {err && <p className="error">{err}</p>}
        <div className="st-go">
          {searching ? (
            <div className="mf-live" role="status" aria-live="polite">
              <div className="mf-live-top">
                <span className="mf-spin sm" aria-hidden />
                <b>{linking ? '상대를 찾았어요. 곧 시작해요' : '상대를 찾고 있어요'}</b>
                <span className="mf-clock">{mmss(waited)}</span>
              </div>
              <small className="muted">
                예상 대기 {waitLabel(info?.etaSec ?? null)}
                {info ? (info.inQueue > 1 ? `. 나 말고 ${info.inQueue - 1}명이 찾고 있어요` : '. 지금은 나만 찾고 있어요') : ''}
              </small>
              <div className="mf-live-act">
                {alt && (
                  <button className="btn sm mf-alt" onClick={() => switchTo(alt)}>
                    <Icon name="refresh" size={14} /> {label(alt.size, alt.speed)}으로 바꿔 찾기{alt.n > 0 ? ` (${alt.n}명 대기 중)` : ''}
                  </button>
                )}
                {/* 다른 대기열에도 사람이 없고 30초 넘게 혼자면: 기다리는 대신 봇전 (파티는 제외) */}
                {!alt && !linking && !party && onBots && waited >= 30 && (info?.inQueue ?? 1) <= 1 && (
                  <button className="btn sm mf-alt" onClick={() => void cancelMatch().then(() => onBots())}>
                    <Icon name="bot" size={14} /> 그만 찾고 봇전 하기
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
            <>
              <button className="btn primary st-btn" onClick={start} disabled={findDisabled}>
                <span className="st-btn-main">{findLabel}</span>
                {/* 지금 고른 설정을 버튼 안에 — 고르지 않고 눌러도 무엇으로 찾는지 보이게 */}
                {!findDisabled && <small className="st-btn-sub">{`${sizeEff === 'duel' ? '1대1' : '다인전'} · ${preset.label} · ${minutes}`}</small>}
              </button>
              {online !== null && (
                <div className="st-status" aria-live="polite">
                  <span>
                    <i className={'st-dot' + (nWait > 0 ? ' live' : '')} aria-hidden />
                    {nWait > 0 ? `지금 ${nWait}명이 찾는 중` : '지금 찾는 사람이 없어요'}
                  </span>
                  <small>
                    {/* 모르는 대기 시간은 숫자 대신 바로 할 수 있는 길만 */}
                    {(nWait > 0 || eta[`${kind}_${sizeEff}_${pref.speed}`] != null) && <>예상 대기 {waitLabel(eta[`${kind}_${sizeEff}_${pref.speed}`] ?? null)}</>}
                    {nWait === 0 && onBots && !party && (
                      <>
                        {eta[`${kind}_${sizeEff}_${pref.speed}`] != null && ' · '}
                        <button type="button" className="st-bots" onClick={onBots}>
                          봇전은 바로 시작
                        </button>
                      </>
                    )}
                  </small>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );

  return (
    <section className={'panel pad match-finder' + (searching ? ' is-searching' : '')}>
      {!fixedKind && (
        <h3>
          대결 찾기
        </h3>
      )}
      {!fixedKind && seg(kind, [['ranked', '랭킹전', member ? '점수가 오르내려요' : '회원 전용'], ['casual', '일반전', '점수 없이']], (v) => (v === 'ranked' && !member ? onLogin() : save({ ...pref, kind: v })), '대결 종류')}
      {inParty ? (
        <p className="muted small mf-note">
          파티는 <b>다인전</b>으로 같이 찾아요. 보통 4명이 모이고, 1분 30초가 지나면 3명으로도 시작해요.
        </p>
      ) : (
        seg(sizeEff, [['duel', '1대1', waitTag('두 명', waitingIn('duel', pref.speed))], ['multi', '다인전', waitTag('3~4명', waitingIn('multi', pref.speed))]], (v) => save({ ...pref, size: v }), '몇 명이서')
      )}
      {seg(pref.speed, [['quick', SPEED_PRESET.quick.label, waitTag(SPEED_PRESET.quick.minutes, waitingIn(sizeEff, 'quick'))], ['normal', SPEED_PRESET.normal.label, waitTag(SPEED_PRESET.normal.minutes, waitingIn(sizeEff, 'normal'))]], (v) => save({ ...pref, speed: v }), '얼마나 빨리')}
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
            <small>분 / 한 판</small>
          </div>
        </div>
      )}
      {searching ? (
        <div className="mf-live" role="status" aria-live="polite">
          <div className="mf-live-top">
            <span className="mf-spin sm" aria-hidden />
            <b>{linking ? '상대를 찾았어요. 곧 시작해요' : '상대를 찾고 있어요'}</b>
            <span className="mf-clock">{mmss(waited)}</span>
          </div>
          <small className="muted">
            예상 대기 {waitLabel(info?.etaSec ?? null)}
            {/* inQueue 에는 나도 들어 있음 → '나 말고' 몇 명인지로 (혼자인데 '1명 대기 중'이라 헷갈리지 않게) */}
            {info ? (info.inQueue > 1 ? `. 나 말고 ${info.inQueue - 1}명이 찾고 있어요` : '. 지금은 나만 찾고 있어요') : ''}
          </small>
          <div className="mf-live-act">
            {alt && (
              <button className="btn sm mf-alt" onClick={() => switchTo(alt)}>
                <Icon name="refresh" size={14} /> {label(alt.size, alt.speed)}으로 바꿔 찾기{alt.n > 0 ? ` (${alt.n}명 대기 중)` : ''}
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
        <button className="btn primary xl full" onClick={start} disabled={loading || joining || (inParty && (!party!.isLeader || kind === 'ranked' || !!party!.waiting))}>
          <Icon name="search" size={18} /> {joining ? '준비 중…' : inParty && !party!.isLeader ? '파티장만 찾을 수 있어요' : inParty && party!.waiting ? '파티원이 돌아오길 기다려요' : `${kind === 'ranked' ? '랭킹전' : '일반전'} ${inParty ? '파티로 ' : ''}찾기`}
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

/**
 * 위 메뉴 '플레이'에 마우스를 올리면 뜨는 모드 고르기.
 * 고르면 바로 저장(랭킹전·일반전 화면과 같은 값), '이대로 찾기'로 찾기 시작. 손님은 랭킹전 잠금, 파티면 일반전·다인전만
 */
export function PlayPicker({ member, inParty, onFind, onLogin }: { member: boolean; inParty: boolean; onFind: () => void; onLogin: () => void }) {
  const [p, setP] = useState(loadPref);
  useEffect(() => {
    const on = () => setP(loadPref());
    window.addEventListener(PREF_EVENT, on);
    return () => window.removeEventListener(PREF_EVENT, on);
  }, []);
  const set = (next: Partial<typeof p>) => {
    const v = { ...p, ...next };
    setP(v);
    savePref(v);
  };
  const kind: QueueKind = p.kind === 'ranked' && member && !inParty ? 'ranked' : 'casual';
  const size: QueueSize = inParty ? 'multi' : p.size;
  const seg = <T extends string>(label: string, value: T, items: [T, string, string, boolean?][], on: (v: T) => void) => (
    <div className="pp-row">
      <span className="pp-label">{label}</span>
      <div className="st-seg pp-seg" role="radiogroup" aria-label={label}>
        {items.map(([v, l, sub, off]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={off} onClick={() => on(v)}>
            <span>{l}</span>
            <small>{sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section className="panel pad play-picker">
      {seg('모드', kind, [['casual', '일반전', '점수 없이'], ['ranked', '랭킹전', member ? (inParty ? '파티는 못 해요' : '점수가 바뀌어요') : '회원만', !member || inParty]], (v) => set({ kind: v }))}
      {!member && (
        <button className="linkish-soft pp-login" onClick={onLogin}>
          로그인하면 랭킹전도 할 수 있어요
        </button>
      )}
      {seg('인원', size, [['duel', '1대1', '2명', inParty], ['multi', '다인전', '3~4명']], (v) => set({ size: v }))}
      {seg('길이', p.speed, (['quick', 'normal'] as QueueSpeed[]).map((v) => [v, SPEED_PRESET[v].label, SPEED_PRESET[v].minutes.replace('약 ', '')] as [QueueSpeed, string, string]), (v) => set({ speed: v }))}
      <button className="btn primary block pp-go" onClick={onFind}>
        <Icon name="search" size={16} /> 이대로 찾기
      </button>
    </section>
  );
}

/** 다시 온 회원: 오늘 미션 · 연속 기록 · 지난 판 — 값이 없는 칩은 빼고, 자리는 늘 잡아 둠(불러와도 화면이 튀지 않게) */
function ProgressStrip() {
  const acc = useAccount();
  const { info } = useMissions(true);
  const today = info?.today.list ?? [];
  const done = today.filter((m) => m.done).length;
  const s = acc.streak;
  const last = acc.recent[0];
  return (
    <div className="st-strip" aria-label="내 진행">
      {today.length > 0 && (
        <span className={'st-chip' + (done === today.length ? ' all' : '')} aria-label={`오늘 미션 ${today.length}개 중 ${done}개 완료`}>
          {done === today.length ? '미션 완료' : `미션 ${done}/${today.length}`}
        </span>
      )}
      {s && s.streak > 0 && (
        <span className={'st-chip' + (s.playedToday ? '' : ' wait')} aria-label={`연속 ${s.streak}일${s.playedToday ? '' : ', 오늘은 아직'}`}>
          <ToonIcon name="flame" size={16} /> 연속 {s.streak}일
        </span>
      )}
      {last && (
        <span className="st-chip" aria-label={`지난 판 ${last.players}명 중 ${last.rank}위, 수익률 ${pct(last.ret, 1)}`}>
          지난 판 {last.players > 1 ? `${last.rank}위 ` : ''}
          <b className={tone(last.ret)}>{pct(last.ret, 1)}</b>
        </span>
      )}
    </div>
  );
}
