/** 증강(규칙 v27) 화면: 고르기 창 · 내 증강 · 결과 화면의 모두의 증강 */
import { useEffect, useRef, useState } from 'react';
import { AUG_MAP, type AugTag, type AugTier } from '../game/augments';
import type { AugView } from '../engine/engine';
import type { AugIncome } from '../engine/augEffects';
import type { Trade } from '../game/portfolio';
import { STOCK_MAP } from '../game/stocks';
import { Icon, type IconName } from './Icon';
import { AugArt } from './AugArt';
import { AugCorner, AugCrest, AugGems, AugMedal } from './AugFrame';
import { DialogBox, useEscape } from './ui';
import { won } from '../lib/format';

export const TIER_NAME: Record<AugTier, string> = { silver: '실버', gold: '골드', prism: '프리즘' };
const TAG_ICON: Record<AugTag, IconName> = { money: 'coins', info: 'news', trade: 'activity', sector: 'grid', hold: 'shield', catchup: 'trend', fun: 'sparkles' };
const TAG_NAME: Record<AugTag, string> = { money: '돈', info: '정보', trade: '거래', sector: '업종', hold: '버티기', catchup: '따라잡기', fun: '재미' };

export function AugBadge({ id, size = 18 }: { id: string; size?: number }) {
  const a = AUG_MAP[id];
  if (!a) return null;
  return (
    <span className="aug-badge" aria-hidden>
      <AugArt id={id} size={size + 10} />
    </span>
  );
}

/** 설명 속 숫자(금액·%·횟수)를 굵게 — 카드에서 핵심 값이 먼저 보이게 */
function hl(text: string) {
  return text.split(/([+−-]?\d[\d.,]*(?:\s?(?:만원|천원|원|%|번|일|개|배|주))?)/g).map((part, i) => (i % 2 ? <em key={i} className="aug-num">{part}</em> : part));
}

/** 증강 이름 옆 조건 표시 (⏳ 시간 · 👥 여럿 · 🎯 업종) — 글자로 */
function conds(id: string) {
  const a = AUG_MAP[id];
  const out: string[] = [];
  if (a.needDays) out.push(`${a.needDays}일 이상 남았을 때`);
  if (a.multi) out.push('여럿이 하는 판');
  if (a.unique) out.push('판에 한 명만');
  return out;
}

/**
 * 증강 고르기 (롤토체스 구성): 상자 없이 세로 카드 3장이 게임 화면 위에 뜸. 등급은 테두리 색으로만,
 * 한 번 눌러 바로 선택, 카드마다 아래에 새로고침, 맨 아래 가운데 숨기기. 안 고르면 장이 끝날 때 무작위
 */
export function AugPick({ offer, busy, endsIn, onPick, onReroll, onHide, recommend }: { offer: NonNullable<AugView['offer']>; recommend?: string; busy: boolean; endsIn: string | null; onPick: (id: string) => void; onReroll: (slot: number) => void; onHide: () => void }) {
  /** 고른 카드 — 빛나며 커지고 나머지가 사라지는 동안 잠깐 */
  const [picked, setPicked] = useState<string | null>(null);
  useEscape(onHide, true, true);
  // 처음 뜬 카드는 함께 나타나고, 새로고침으로 들어온 카드만 그 칸에서 바뀌는 움직임
  const firstIds = useRef(new Set(offer.ids));
  const listRef = useRef<HTMLDivElement>(null);
  const choose = (id: string) => {
    if (busy || picked) return;
    setPicked(id);
    const go = () => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-aug="${id}"] .aug-badge`);
      if (el) flyToMine(el);
      onPick(id);
    };
    if (reduced()) go();
    else window.setTimeout(go, 420);
  };
  return (
    <div className="aug-float" onClick={onHide}>
      <DialogBox className={`aug-stage t-${offer.tier}`} aria-label={`${TIER_NAME[offer.tier]} 증강 고르기`} onClick={(e) => e.stopPropagation()}>
        <p className="aug-cap">
          <b>증강 선택</b> · 하나를 누르면 바로 정해져요 · {endsIn ? `${endsIn} 안에` : '오늘 장이 끝나기 전에'} 안 고르면 무작위
        </p>
        <div ref={listRef} className={'aug-list aug-row3' + (picked ? ' picked' : '')} role="group" aria-label={`${TIER_NAME[offer.tier]} 증강 3개`}>
          {offer.ids.map((id, i) => {
            const a = AUG_MAP[id];
            if (!a) return null;
            const c = conds(id);
            return (
              <div key={id} data-aug={id} className={'aug-opt' + (picked === id ? ' on' : '') + (firstIds.current.has(id) ? ' enter' : ' swap') + ` t-${a.tier}`} style={{ ['--i' as string]: i }}>
                <AugCrest tier={a.tier} />
                <button className="aug-card" aria-label={`${TIER_NAME[a.tier]} ${a.name}. ${a.desc}. ${i + 1}번째. 누르면 바로 선택`} onClick={() => choose(id)} disabled={busy || !!picked}>
                  {(['tl', 'tr', 'bl', 'br'] as const).map((p) => (
                    <AugCorner key={p} tier={a.tier} pos={p} />
                  ))}
                  <span className="aug-pic" aria-hidden>
                    <AugMedal tier={a.tier} />
                    <span className="aug-pic-in">
                      <AugArt id={id} size={72} />
                    </span>
                  </span>
                  <b className="aug-name">{a.name}</b>
                  {recommend === id && <span className="aug-rec">처음이라면 추천</span>}
                  <span className="aug-rule" aria-hidden />
                  <span className="aug-desc">{hl(a.desc)}</span>
                  <span className="aug-foot">
                    <span className="aug-tag">
                      <Icon name={TAG_ICON[a.tag]} size={13} /> {TAG_NAME[a.tag]}
                      {c.length > 0 && ' · ' + c.join(' · ')}
                    </span>
                    <AugGems tier={a.tier} />
                  </span>
                </button>
                {!recommend && (
                  <button className="aug-reroll" disabled={busy || !!picked || !offer.canReroll[i]} onClick={() => onReroll(i)} aria-label={`${i + 1}번째 칸 새로고침${offer.canReroll[i] ? '' : ' (다 씀)'}`} title="이 칸만 새로고침">
                    <Icon name="refresh" size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button className="aug-hide" onClick={onHide} aria-label="증강 창 숨기고 시세 보기">
          <Icon name="eyeOff" size={16} /> 숨기기
        </button>
      </DialogBox>
    </div>
  );
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 고른 증강 그림이 '내 증강' 자리(PC 옆 칸 띠·휴대폰 아래 '증강' 탭)로 날아감 — 처음·끝 자리를 재고 transform 만 움직임(FLIP).
 * 창이 닫혀도 따로 떠 있는 복사본이라 끊기지 않음. 움직임 줄이기면 하지 않음
 */
function flyToMine(from: HTMLElement) {
  if (reduced() || typeof document === 'undefined') return;
  const target = [...document.querySelectorAll<HTMLElement>('.aug-strip, .bottom-nav [data-tab="cards"]')].find((x) => x.offsetParent !== null);
  if (!target) return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '130', pointerEvents: 'none' });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1.15)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(0.9)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.45)`, opacity: 0.2 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.05,0.7,0.1,1)' },
  );
  anim.onfinish = () => {
    ghost.remove();
    target.classList.remove('aug-land');
    void target.offsetWidth;
    target.classList.add('aug-land');
    window.setTimeout(() => target.classList.remove('aug-land'), 400);
  };
}

/** 금액이 바뀌면 예전 값에서 새 값까지 굴러 올라감 (700ms) */
export function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value || reduced()) return setShown(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

function Got({ value }: { value: number }) {
  const v = useCountUp(value);
  if (!value) return null;
  return <span className={'aug-got ' + (value > 0 ? 'plus' : 'minus')}>{v > 0 ? '+' : ''}{won(v)}</span>;
}

/** 창을 접었을 때 다시 여는 띠 */
export function AugPill({ tier, endsIn, onOpen }: { tier: AugTier; endsIn: string | null; onOpen: () => void }) {
  return (
    <button className={`aug-pill t-${tier}`} onClick={onOpen}>
      <Icon name="eye" size={16} /> 증강 선택 열기{endsIn ? ` · ${endsIn}` : ''}
    </button>
  );
}

/** 고르는 날마다 한 칸: 고른 증강의 문양, 아직이면 빈 칸과 열리는 날 (늘 보이는 내 증강 줄) */
export function AugSlots({ aug, size = 30 }: { aug: AugView; size?: number }) {
  return (
    <span className="aug-slots" style={{ ['--s' as string]: `${size}px` }}>
      {aug.days.map((d, n) => {
        const m = aug.mine.find((x) => x.n === n);
        const a = m ? AUG_MAP[m.id] : null;
        return a ? (
          <span key={n} className="aug-slot" title={`${a.name} — ${a.desc}`}>
            <AugArt id={m!.id} size={size} />
          </span>
        ) : (
          <span key={n} className="aug-slot empty" title={`${d + 1}일차에 골라요`}>
            <span className="aug-slot-in">{d + 1}</span>
          </span>
        );
      })}
    </span>
  );
}

const USE_LABEL: Record<string, string> = { detector: '소식 진위 보기', scout: '오를지 내릴지 보기', paper: '내일 헤드라인 보기', analyst: '강한 업종 보기' };

/** 내 증강 칸: 가진 증강·받은 돈·쓸 수 있는 정보·다음 고르는 날 */
export function AugPanel({ aug, day, totalDays, selected, todayTrades, canAct, busy, onUse }: { aug: AugView; day: number; totalDays: number; selected: string; todayTrades: Trade[]; canAct: boolean; busy: boolean; onUse: (kind: string, payload?: Record<string, string>) => void }) {
  const sum = (id: string) => aug.income.filter((x) => x.aug === id).reduce((a, x) => a + x.amount, 0);
  const next = aug.days.find((x) => x > day);
  const uses = (['detector', 'scout', 'paper', 'analyst'] as const).filter((k) => aug.left[k] > 0);
  const tradeUse = (['timing', 'undo'] as const).filter((k) => aug.left[k] > 0);
  return (
    <div className="aug-panel">
      <div className="aug-sec-head">
        <AugSlots aug={aug} size={38} />
        <span className="muted small">{next != null && next < totalDays ? `다음 고르기 ${next + 1}일차` : '이번 판 고르기 끝'}</span>
      </div>
      {!aug.mine.length && <p className="muted small">아직 고른 증강이 없어요.</p>}
      <ul className="aug-mine">
        {aug.mine.map((m) => {
          const a = AUG_MAP[m.id];
          if (!a) return null;
          const got = sum(m.id);
          return (
            <li key={m.n} className={`aug-own t-${a.tier}`}>
              <span className="aug-badge" aria-hidden>
                <AugArt id={m.id} size={36} />
              </span>
              <span className="aug-body">
                <b className="aug-name">
                  {a.name} <span className={`aug-tier t-${a.tier}`}>{TIER_NAME[a.tier]}</span>
                  {m.auto && <span className="muted small"> · 자동</span>}
                </b>
                <span className="aug-desc">{hl(a.desc)}</span>
              </span>
              <Got value={got} />
            </li>
          );
        })}
      </ul>
      {uses.length > 0 && (
        <div className="aug-uses">
          <h4>정보 쓰기 <span className="muted small">종류마다 하루 한 번</span></h4>
          {uses.map((k) => (
            <button key={k} className="btn secondary small" disabled={!canAct || busy || aug.usedToday.includes(k) || (k === 'paper' && day + 1 >= totalDays)} onClick={() => onUse(k)}>
              {USE_LABEL[k]}
              {k === 'scout' && selected ? ` (${STOCK_MAP[selected]?.name ?? selected})` : ''} · {aug.left[k]}번
            </button>
          ))}
        </div>
      )}
      {tradeUse.length > 0 && (
        <div className="aug-uses">
          <h4>{tradeUse.map((k) => (k === 'timing' ? '타이밍의 신' : '되돌리기')).join(' · ')} <span className="muted small">판에 한 번 · 오늘 거래에</span></h4>
          {!todayTrades.length && <p className="muted small">오늘 한 거래가 생기면 여기서 고를 수 있어요.</p>}
          <ul className="aug-trades">
            {todayTrades.map((t) => (
              <li key={t.id}>
                <span>
                  {STOCK_MAP[t.symbol]?.name ?? t.symbol} {t.qty}주 {t.side === 'buy' ? '삼' : '팖'}
                </span>
                {tradeUse.includes('timing') && t.side === 'buy' && (
                  <button className="btn text small" disabled={!canAct || busy} onClick={() => onUse('timing', { trade: t.id! })}>
                    최저가로
                  </button>
                )}
                {tradeUse.includes('undo') && (
                  <button className="btn text small" disabled={!canAct || busy} onClick={() => onUse('undo', { trade: t.id! })}>
                    없던 일로
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** PC 옆 칸·휴대폰 위 작은 줄: 내 증강 아이콘만 */
export function AugStrip({ aug, onOpen }: { aug: AugView; onOpen: () => void }) {
  return (
    <button className="aug-strip" onClick={onOpen} aria-label={`내 증강 ${aug.mine.length}개 보기`}>
      <span className="aug-strip-label">내 증강</span>
      <AugSlots aug={aug} size={28} />
      {aug.mine.length === 1 && <span className="aug-strip-item">{AUG_MAP[aug.mine[0].id]?.name}</span>}
      <Icon name="right" size={14} className="aug-strip-go" />
    </button>
  );
}

/** 결과 화면: 모두의 증강과 그 증강으로 번 돈 */
export function AugReveal({ players, augs, income }: { players: { id: string; nickname: string }[]; augs: Record<string, { id: string; auto: boolean }[]>; income?: Record<string, AugIncome[]> }) {
  return (
    <div className="panel pad aug-reveal">
      <h3>{players.length > 1 ? '모두의 증강' : '이번 판 증강'}</h3>
      <ul>
        {players.map((p) => {
          const xs = augs[p.id] ?? [];
          const total = (income?.[p.id] ?? []).reduce((a, x) => a + x.amount, 0);
          return (
            <li key={p.id}>
              <b className="aug-who">{p.nickname}</b>
              <span className="aug-row">
                {xs.map((x, i) => (
                  <span key={i} className="aug-chip" title={AUG_MAP[x.id]?.desc}>
                    <AugBadge id={x.id} size={12} /> {AUG_MAP[x.id]?.name ?? x.id}
                    {x.auto && <span className="muted"> (자동)</span>}
                  </span>
                ))}
              </span>
              {total !== 0 && <span className={'aug-got ' + (total > 0 ? 'plus' : 'minus')}>{total > 0 ? '+' : ''}{won(total)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const AUG_RULES_TEXT = '정해진 날(10일 판이면 1·4·7일차)마다 증강 3개 중 1개를 골라요. 고른 증강은 판 끝까지 켜져 있어요. 칸마다 한 번 다시 뽑을 수 있고, 그날 장이 끝날 때까지 안 고르면 하나가 무작위로 정해져요. 같은 판 사람들은 같은 등급(실버·골드·프리즘)을 받고, 상대가 무엇을 골랐는지는 판이 끝나야 보여요.';

/** 공부 화면: 등급별 증강 도감 */
export function AugGuideBody() {
  const tiers: AugTier[] = ['silver', 'gold', 'prism'];
  return (
    <div className="aug-guide">
      {tiers.map((t) => (
        <section key={t} className="panel pad">
          <h3>
            <span className={`aug-tier t-${t}`}>{TIER_NAME[t]}</span> {Object.values(AUG_MAP).filter((a) => a.tier === t).length}개
          </h3>
          <ul className="aug-mine">
            {Object.values(AUG_MAP)
              .filter((a) => a.tier === t)
              .map((a) => (
                <li key={a.id}>
                  <AugBadge id={a.id} />
                  <span className="aug-body">
                    <b className="aug-name">{a.name}</b>
                    <span className="aug-desc">{a.desc}</span>
                    <span className="aug-meta">
                      {TAG_NAME[a.tag]}
                      {conds(a.id).map((x) => ' · ' + x)}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
