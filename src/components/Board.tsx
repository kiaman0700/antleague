import { useEffect as useEffectT, useState as useStateT } from 'react';
import { useEscape } from './ui';
import { FitText } from './FitText';
import { CardIcon, Icon, type IconName } from './Icon';
/** 여럿이 할 때 순위표, 카드 대상 고르기, 시장 지표 그리드 */
import type { PublicPlayer } from '../engine/engine';
import { ITEM_MAP, type ItemKind } from '../game/items';
import { barNow, KR_INDEX_BASE, US_INDEX_BASE, type Market } from '../game/market';
import { pct, tone, wonShort } from '../lib/format';
import { graceText } from '../session';
import { ScrollChips } from './StockBrowser';
import { Term } from './Term';

export const PLAYER_COLORS = ['var(--me)', 'var(--opp)', '#34d399', '#60a5fa', '#f472b6', '#fb923c'];
/** 순위 표시: 1~3위는 금·은·동 동그라미, 나머지는 숫자 */
const rankBadge = (i: number) => <span className={'rank-badge r' + (i + 1)}>{i + 1}</span>;

export interface RankRow {
  id: string;
  nickname: string;
  equity: number;
  ended: boolean;
  me: boolean;
  /** on = 접속 중, away = 자리 비움, left = 나감(기권) */
  status: 'on' | 'away' | 'left';
  /** 상대 수익률 구간(%) — 상대의 정확한 재산은 보이지 않음 */
  band?: [number, number] | null;
  rank?: number;
  /** 회원(로그인) — 이름 옆 인증 표시 */
  verified?: boolean;
  /** 수익률 (시작 돈 기준 — 방 규칙마다 시작 돈이 다름) */
  ret: number;
}

/** 수익률 구간 글자: [4,6] → "+4~6%", [-2,0] → "-2~0%" */
export function bandText(b: [number, number]) {
  const f = (v: number) => (v > 0 ? '+' + v : String(v));
  return `${f(b[0])}~${b[1] > 0 && b[0] >= 0 ? b[1] : f(b[1])}%`;
}

const STATUS_TEXT = { away: '자리 비움', left: '나감' } as const;

/** 내 자산은 화면에서 계산한 최신값으로 덮어써서 순위 계산 */
export function rankRows(players: PublicPlayer[], meId: string, myEquity: number, day: number, start: number): RankRow[] {
  return players
    .map((p) => ({ ret: (p.id === meId ? myEquity : p.equity) / start - 1, id: p.id, nickname: p.nickname, equity: p.id === meId ? myEquity : p.equity, ended: p.endedDay >= day, me: p.id === meId, status: p.id === meId ? ('on' as const) : (p.status ?? 'on'), band: p.id === meId ? null : (p.band ?? null), rank: p.rank, verified: !!p.verified }))
    // 순위는 서버가 정확한 재산으로 정한 것 (예전 서버면 재산 순)
    .sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : b.equity - a.equity));
}

/** PC 점수줄: 가로 순위 칩 */
export function RankStrip({ rows }: { rows: RankRow[] }) {
  return (
    <div className="rank-strip" role="list" aria-label="순위">
      {rows.map((r, i) => (
        <div key={r.id} role="listitem" className={'rank-chip' + (r.me ? ' me' : '') + (i === 0 ? ' lead' : '')}>
          <span className="rk">{rankBadge(i)}</span>
          <span className="rn">
            <b>
              <FitText>
                {r.nickname}
                {r.verified && <Icon name="check" size={11} className="verified" />}
              </FitText>
            </b>
            {r.band ? (
              <small className={tone(r.band[0] + r.band[1])} title="상대의 정확한 재산은 보이지 않아요 (수익률 구간)">
                수익률 {bandText(r.band)}
              </small>
            ) : (
              <small className={tone(r.ret)}>
                {wonShort(r.equity)} · {pct(r.ret, 1)}
              </small>
            )}
          </span>
          {r.status !== 'on' ? (
            <span className={'rs gone ' + r.status} title={r.status === 'left' ? '게임에서 나갔어요 (기다리지 않아요)' : '한동안 응답이 없어요 (기다리지 않아요)'}>
              {STATUS_TEXT[r.status]}
            </span>
          ) : (
            <span className={'rs' + (r.ended ? ' ok' : '')} title={r.ended ? '장 마감 완료' : '고민 중'}>
              {r.ended ? <Icon name="check" size={13} /> : '…'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** 오늘 누가 장 마감을 눌렀는지 + 카운트다운 조건 안내 */
export function EndStatus({ rows: all, countdown, compact }: { rows: RankRow[]; countdown: boolean; compact?: boolean }) {
  // 나간·자리 비운 사람은 기다리지 않으므로 마감 인원 계산에서 뺌
  const rows = all.filter((r) => r.status === 'on');
  const gone = all.filter((r) => r.status !== 'on');
  const done = rows.filter((r) => r.ended).length;
  const hint = !countdown && done < rows.length ? `${graceText(rows.length)} 카운트다운` : null;
  return (
    <div className={'end-status' + (compact ? ' compact' : '')} aria-label={`장 마감 ${done}/${rows.length}명`}>
      <span className="es-title">
        장 마감 <b>{done}</b>/{rows.length}
      </span>
      <span className="es-list">
        {rows.map((r) => (
          <span key={r.id} className={'es-p' + (r.ended ? ' ok' : '') + (r.me ? ' me' : '')} title={r.ended ? '장 마감 완료' : '고민 중'}>
            <i>{r.ended ? <Icon name="check" size={12} /> : '…'}</i>
            {r.nickname}
          </span>
        ))}
        {gone.map((r) => (
          <span key={r.id} className={'es-p gone ' + r.status} title={r.status === 'left' ? '나갔어요' : '자리 비움 — 기다리지 않아요'}>
            <i>
              <Icon name="door" size={12} />
            </i>
            {r.nickname}
          </span>
        ))}
      </span>
      {hint && <small className="es-hint">{hint}</small>}
      {countdown && <small className="es-hint hurry"><Icon name="timer" size={12} /> 카운트다운 중!</small>}
    </div>
  );
}

/** 모바일 시트 / 어디서나 쓰는 세로 순위표 */
export function RankList({ rows }: { rows: RankRow[] }) {
  return (
    <div className="rank-list">
      <p className="muted small">상대의 정확한 재산은 보이지 않고 수익률 구간(2%p)만 보여요. 순위는 정확해요.</p>
      {rows.map((r, i) => (
        <div key={r.id} className={'rank-row' + (r.me ? ' me' : '')}>
          <span className="rk">{rankBadge(i)}</span>
          <span className="rn">
            <b>
              <FitText>
                {r.nickname}
                {r.verified && <Icon name="check" size={12} className="verified" />}
                {r.me && <em> (나)</em>}
              </FitText>
            </b>
            <small>{r.ended ? <><Icon name="check" size={12} /> 장 마감</> : '고민 중…'}</small>
          </span>
          <span className="rv">
            {r.band ? (
              <>
                <b className={tone(r.band[0] + r.band[1])}>{bandText(r.band)}</b>
                <small className="muted">수익률 구간</small>
              </>
            ) : (
              <>
                <b>{wonShort(r.equity)}</b>
                <small className={tone(r.ret)}>{pct(r.ret)}</small>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 방해·염탐 카드를 누구에게 쓸지 */
export function TargetPicker({ kind, rows, onPick, onCancel }: { kind: ItemKind; rows: RankRow[]; onPick: (id: string) => void; onCancel: () => void }) {
  const d = ITEM_MAP[kind];
  useEscape(onCancel);
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          <CardIcon kind={kind} /> {d.name} — 누구에게?
        </h3>
        <p className="muted small">{d.desc}</p>
        <div className="target-list">
          {rows.filter((r) => !r.me && r.status !== 'left').length === 0 && <p className="muted">쓸 상대가 없어요. 모두 나갔어요.</p>}
          {rows
            .filter((r) => !r.me && r.status !== 'left')
            .map((r) => (
              <button key={r.id} className="target-row" onClick={() => onPick(r.id)}>
                <b>{r.nickname}</b>
                <span>
                  {r.band ? <small className={tone(r.band[0] + r.band[1])}>수익률 {bandText(r.band)}</small> : <>{wonShort(r.equity)} <small className={tone(r.ret)}>{pct(r.ret, 1)}</small></>}
                </span>
              </button>
            ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 시장 지표: 값 · 변화 · 무엇에 영향을 주는지 ---------------- */

interface Tile {
  key: string;
  label: string;
  term: string;
  value: string;
  ch: number | null;
  chText: string;
  hint: string;
}

export function marketTiles(m: Market, day: number, closed: boolean): Tile[] {
  const mac = m.macro[day] ?? m.macro0;
  const prev = day > 0 ? m.macro[day - 1] : m.macro0;
  const idx = m.index[day];
  const idxNow = barNow(m, idx, day, closed);
  const idxPrev = day === 0 ? KR_INDEX_BASE : m.index[day - 1].close;
  const us = m.usIndex[day];
  const usNow = barNow(m, us, day, closed);
  const usPrev = day === 0 ? US_INDEX_BASE : m.usIndex[day - 1].close;
  const dir = (d: number, up: string, down: string) => (Math.abs(d) < 1e-9 ? '어제와 같아요' : d > 0 ? up : down);
  const pctTxt = (d: number) => (Math.abs(d) < 1e-9 ? '변동 없음' : pct(d));
  const ppTxt = (d: number) => (Math.abs(d) < 1e-9 ? '변동 없음' : `${d > 0 ? '+' : ''}${d.toFixed(2)}%p`);
  return [
    { key: 'kr', label: '국내 지수', term: '지수', value: idxNow.toFixed(2), ch: idxNow / idxPrev - 1, chText: pctTxt(idxNow / idxPrev - 1), hint: dir(idxNow - idxPrev, '국내 시장 분위기 좋음', '국내 시장 분위기 약함') },
    { key: 'us', label: '미국 500', term: '지수', value: usNow.toFixed(2), ch: usNow / usPrev - 1, chText: pctTxt(usNow / usPrev - 1), hint: dir(usNow - usPrev, '미국 주식 강세 → 국내도 영향', '미국 주식 약세 → 국내도 영향') },
    { key: 'rate', label: '한국 금리', term: '금리', value: mac.rate.toFixed(2) + '%', ch: mac.rate - prev.rate, chText: ppTxt(mac.rate - prev.rate), hint: dir(mac.rate - prev.rate, '은행 ↑ · IT·바이오·건설 ↓', '성장주·건설 ↑ · 은행 ↓') },
    { key: 'usRate', label: '미국 금리', term: '금리', value: mac.usRate.toFixed(2) + '%', ch: mac.usRate - prev.usRate, chText: ppTxt(mac.usRate - prev.usRate), hint: dir(mac.usRate - prev.usRate, '미국 기술주 ↓ · 달러 강세', '미국 기술주 ↑ · 달러 약세') },
    { key: 'fx', label: '환율', term: '환율', value: mac.fx.toLocaleString() + '원', ch: mac.fx / prev.fx - 1, chText: pctTxt(mac.fx / prev.fx - 1), hint: dir(mac.fx - prev.fx, '수출주·미국주식 원화가치 ↑ · 항공 ↓', '항공·식품 ↑ · 수출주 ↓') },
    { key: 'oil', label: '유가', term: '유가', value: '$' + mac.oil.toFixed(1), ch: mac.oil / prev.oil - 1, chText: pctTxt(mac.oil / prev.oil - 1), hint: dir(mac.oil - prev.oil, '정유·에너지 ↑ · 항공 ↓', '항공·여행 ↑ · 정유 ↓') },
  ];
}

/* ---------------- 모바일 상단 시장 티커: 그룹별로 돌아가며 보여주고, 고정한 건 그대로 ---------------- */

const GROUPS: string[][] = [
  ['kr', 'us'],
  ['rate', 'usRate'],
  ['fx', 'oil'],
];
const PIN_KEY = 'stockduel.pins';
export const MAX_PINS = 3;

export function loadPins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}
export function savePins(p: string[]) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(p.slice(0, MAX_PINS)));
  } catch {
    /* 무시 */
  }
}

export function MarketTicker({ market, day, closed, pins, onOpen }: { market: Market; day: number; closed: boolean; pins: string[]; onOpen: () => void }) {
  const tiles = marketTiles(market, day, closed);
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  const [tick, setTick] = useStateT(0);
  useEffectT(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // 자리는 그룹 순서(지수·금리·환율/유가)로 고정. 고정한 지표는 자기 그룹 자리에 그대로 들어감
  let slots: { keys: string[]; pinned: boolean }[] = [];
  for (const g of GROUPS) {
    const pinnedHere = g.filter((k) => pins.includes(k) && byKey[k]);
    if (pinnedHere.length) pinnedHere.forEach((k) => slots.push({ keys: [k], pinned: true }));
    else slots.push({ keys: g, pinned: false });
  }
  // 3칸이 넘으면 돌아가는 칸부터 뺌
  while (slots.length > 3) {
    const idx = slots.map((s) => s.pinned).lastIndexOf(false);
    if (idx < 0) break;
    slots.splice(idx, 1);
  }
  slots = slots.slice(0, 3);

  return (
    <button className="ticker" onClick={onOpen} aria-label="오늘의 시장 자세히 보기">
      {slots.map((sl, i) => {
        const at = tick % sl.keys.length;
        const k = sl.keys[at];
        const t = byKey[k];
        const flat = t.ch === null || Math.abs(t.ch) < 1e-9;
        return (
          <span key={i} className={'tk' + (sl.pinned ? ' tk-pinned' : '')}>
            {sl.pinned ? (
              <i className="tk-pin" aria-label="고정됨"><Icon name="star" size={10} /></i>
            ) : (
              <i className="tk-dots" aria-hidden>
                {sl.keys.map((_, j) => (
                  <i key={j} className={j === at ? 'on' : ''} />
                ))}
              </i>
            )}
            <span className="tk-body" key={k}>
              <small>{t.label}</small>
              <b>{t.value}</b>
              <em className={flat ? 'flat' : tone(t.ch!)}>{flat ? '변동 없음' : t.chText}</em>
            </span>
          </span>
        );
      })}
    </button>
  );
}

/** 고정 버튼이 있는 시장 그리드 (시트용) */
export function MarketGridPinnable({ market, day, closed, pins, onTogglePin }: { market: Market; day: number; closed: boolean; pins: string[]; onTogglePin: (k: string) => void }) {
  return (
    <div className="mgrid">
      {marketTiles(market, day, closed).map((t) => {
        const on = pins.includes(t.key);
        return (
          <div key={t.key} className={'mtile' + (on ? ' mtile-pinned' : '')}>
            <div className="mt-top">
              <small>
                <Term k={t.term}>{t.label}</Term>
              </small>
              <button
                className={'pin-btn' + (on ? ' on' : '')}
                onClick={() => onTogglePin(t.key)}
                disabled={!on && pins.length >= MAX_PINS}
                aria-label={on ? '고정 해제' : '상단에 고정'}
                title={on ? '고정 해제' : pins.length >= MAX_PINS ? `최대 ${MAX_PINS}개까지 고정` : '상단에 고정'}
              >
                <Icon name="star" size={14} />
              </button>
            </div>
            <b>{t.value}</b>
            <span className={t.ch === null || Math.abs(t.ch) < 1e-9 ? 'flat' : tone(t.ch)}>{t.chText}</span>
            <em>{t.hint}</em>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- 일정 전용 띠 ---------------- */

const EV_ICON2: Record<string, IconName> = { fomc: 'dollar', bok: 'bank', earnings: 'bars', expiry: 'warn', dividend: 'coins' };

const EV_SHORT: Record<string, string> = { fomc: '미 연준 금리', bok: '한은 금통위', earnings: '실적 시즌', expiry: '옵션 만기', dividend: '배당 기준일' };

/** 모바일 상단 일정 영역: 짧은 칩을 가로로 넘겨 보고, 누르면 전체 일정 */
export function ScheduleStrip({ market, day, onOpen }: { market: Market; day: number; onOpen: () => void }) {
  const seen = new Set<string>();
  const evs = market.events.filter((e) => {
    if (e.day < day) return false;
    const k = e.day + e.kind;
    if (seen.has(k)) return false;
    seen.add(k);
    // 이어지는 실적 발표 주간은 첫날만 (진행 중이면 오늘로)
    if (e.kind === 'earnings' && e.day - 1 >= day && market.events.some((x) => x.kind === 'earnings' && x.day === e.day - 1)) return false;
    return true;
  });
  return (
    <div className="sched-wrap" role="list" aria-label="다가오는 일정">
      <ScrollChips onMore={onOpen} moreLabel="일정">
      {evs.length === 0 && <span className="sched-none"><Icon name="calendar" size={13} /> 남은 일정이 없어요</span>}
      {evs.map((e, i) => {
        const dd = e.day - day;
        return (
          <button key={i} role="listitem" className={'sched-chip k-' + e.kind + (dd === 0 ? ' today' : dd <= 2 ? ' soon' : '')} onClick={onOpen}>
            <b>{dd === 0 ? '오늘' : 'D-' + dd}</b>
            <span>
              <Icon name={EV_ICON2[e.kind]} size={13} className={'ev ev-' + e.kind} /> {EV_SHORT[e.kind]}
            </span>
          </button>
        );
      })}
      </ScrollChips>
    </div>
  );
}
