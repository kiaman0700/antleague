/** 증강(규칙 v27) 화면: 고르기 창 · 내 증강 · 결과 화면의 모두의 증강 */
import { useEffect, useRef, useState } from 'react';
import { AUG_MAP, type AugTag, type AugTier } from '../game/augments';
import type { AugView } from '../engine/engine';
import type { AugIncome } from '../engine/augEffects';
import type { Trade } from '../game/portfolio';
import { STOCK_MAP } from '../game/stocks';
import { Icon } from './Icon';
import { AugArt } from './AugArt';
import { DialogBox, useEscape } from './ui';
import { won } from '../lib/format';

export const TIER_NAME: Record<AugTier, string> = { silver: '실버', gold: '골드', prism: '프리즘' };
const TAG_NAME: Record<AugTag, string> = { money: '돈', info: '정보', trade: '거래', sector: '업종', hold: '버티기', catchup: '따라잡기', fun: '재미' };

export function AugBadge({ id, size = 18 }: { id: string; size?: number }) {
  const a = AUG_MAP[id];
  if (!a) return null;
  return (
    <span className={`aug-badge t-${a.tier}`} style={{ width: size + 12, height: size + 12 }} aria-hidden>
      <AugArt id={id} size={size} />
    </span>
  );
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

/** 고르기 창: 3개 중 하나를 누르고 '이걸로 고르기' — 장이 흐르는 중이라 실수로 바로 정해지지 않게 두 번 */
export function AugPick({ offer, busy, endsIn, onPick, onReroll, onHide, recommend }: { offer: NonNullable<AugView['offer']>; recommend?: string; busy: boolean; endsIn: string | null; onPick: (id: string) => void; onReroll: (slot: number) => void; onHide: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  useEscape(onHide, true, true);
  const chosen = sel && offer.ids.includes(sel) ? sel : null;
  // 처음 뜬 카드는 차례로 올라오고, 다시 뽑아 새로 들어온 카드만 그 칸에서 바뀌는 움직임
  const firstIds = useRef(new Set(offer.ids));
  const listRef = useRef<HTMLDivElement>(null);
  const confirm = () => {
    if (!chosen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-aug="${chosen}"] .aug-badge`);
    if (el) flyToMine(el);
    onPick(chosen);
  };
  return (
    <div className="modal-bg aug-bg" onClick={onHide}>
      <DialogBox className={`modal aug-pick t-${offer.tier}`} aria-label={`${TIER_NAME[offer.tier]} 증강 고르기`} onClick={(e) => e.stopPropagation()}>
        <div className="aug-head">
          <div>
            <h3>
              <span className={`aug-tier t-${offer.tier}`}>{TIER_NAME[offer.tier]}</span> 증강을 골라요
            </h3>
            <p className="muted small">
              판 끝까지 이어지는 내 효과예요. {endsIn ? `${endsIn} 안에` : '오늘 장이 끝나기 전에'} 안 고르면 셋 중 하나가 무작위로 정해져요.
            </p>
          </div>
          <button className="btn ghost small aug-hide" onClick={onHide}>
            <Icon name="chart" size={16} /> 시세 보기
          </button>
        </div>
        <div ref={listRef} className={'aug-list' + (chosen ? ' has-sel' : '')} role="radiogroup" aria-label="증강 3개">
          {offer.ids.map((id, i) => {
            const a = AUG_MAP[id];
            if (!a) return null;
            const c = conds(id);
            const on = chosen === id;
            return (
              <div key={id} data-aug={id} className={'aug-opt' + (on ? ' on' : '') + (firstIds.current.has(id) ? ' enter' : ' swap') + ` t-${a.tier}`} style={{ ['--i' as string]: i }}>
                <button className="aug-card" role="radio" aria-checked={on} aria-label={`${TIER_NAME[a.tier]} ${a.name}. ${a.desc}. ${i + 1}번째`} onClick={() => setSel(id)} disabled={busy}>
                  <AugBadge id={id} size={20} />
                  <span className="aug-body">
                    <b className="aug-name">
                      {a.name}
                      {recommend === id && <span className="aug-rec">처음이라면 추천</span>}
                    </b>
                    <span className="aug-desc">{a.desc}</span>
                    <span className="aug-meta">
                      {TAG_NAME[a.tag]}
                      {c.map((x) => ' · ' + x)}
                    </span>
                  </span>
                  {on && <Icon name="check" size={18} className="aug-check" />}
                </button>
                {!recommend && <button className="btn ghost small aug-reroll" disabled={busy || !offer.canReroll[i]} onClick={() => (setSel(null), onReroll(i))} aria-label={`${i + 1}번째 칸 다시 뽑기`}>
                  <Icon name="refresh" size={14} /> {offer.canReroll[i] ? '다시 뽑기' : '다시 뽑기 끝'}
                </button>}
              </div>
            );
          })}
        </div>
        <button key={chosen ?? 'none'} className={'btn primary block aug-go' + (chosen ? ' ready' : '')} disabled={!chosen || busy} onClick={confirm}>
          {chosen ? `'${AUG_MAP[chosen].name}' 고르기` : '하나를 눌러 고르세요'}
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
      <Icon name="sparkles" size={16} /> {TIER_NAME[tier]} 증강 고르기{endsIn ? ` · ${endsIn}` : ''}
    </button>
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
        <h3>가진 증강 {aug.mine.length}개</h3>
        <span className="muted small">{next != null && next < totalDays ? `다음 고르기 ${next + 1}일차` : '이번 판 고르기 끝'}</span>
      </div>
      {!aug.mine.length && <p className="muted small">아직 고른 증강이 없어요.</p>}
      <ul className="aug-mine">
        {aug.mine.map((m) => {
          const a = AUG_MAP[m.id];
          if (!a) return null;
          const got = sum(m.id);
          return (
            <li key={m.n}>
              <AugBadge id={m.id} />
              <span className="aug-body">
                <b className="aug-name">
                  {a.name} <span className={`aug-tier t-${a.tier}`}>{TIER_NAME[a.tier]}</span>
                  {m.auto && <span className="muted small"> · 자동</span>}
                </b>
                <span className="aug-desc">{a.desc}</span>
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
      {aug.mine.map((m) => (
        <span key={m.n} className="aug-strip-item">
          <AugBadge id={m.id} size={13} />
          {aug.mine.length <= 2 && <span>{AUG_MAP[m.id]?.name}</span>}
        </span>
      ))}
      {!aug.mine.length && <span className="muted small">아직 없음</span>}
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
