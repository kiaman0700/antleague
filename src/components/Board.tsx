/** 여럿이 할 때 순위표, 카드 대상 고르기, 시장 지표 그리드 */
import type { PublicPlayer } from '../engine/engine';
import { ITEM_MAP, type ItemKind } from '../game/items';
import { KR_INDEX_BASE, US_INDEX_BASE, type Market } from '../game/market';
import { START_CASH } from '../game/portfolio';
import { pct, tone, wonShort } from '../lib/format';
import { Term } from './Term';

export const PLAYER_COLORS = ['var(--me)', 'var(--opp)', '#34d399', '#60a5fa', '#f472b6', '#fb923c'];
const MEDAL = ['🥇', '🥈', '🥉'];

export interface RankRow {
  id: string;
  nickname: string;
  equity: number;
  ended: boolean;
  me: boolean;
}

/** 내 자산은 화면에서 계산한 최신값으로 덮어써서 순위 계산 */
export function rankRows(players: PublicPlayer[], meId: string, myEquity: number, day: number): RankRow[] {
  return players
    .map((p) => ({ id: p.id, nickname: p.nickname, equity: p.id === meId ? myEquity : p.equity, ended: p.endedDay >= day, me: p.id === meId }))
    .sort((a, b) => b.equity - a.equity);
}

/** PC 점수줄: 가로 순위 칩 */
export function RankStrip({ rows }: { rows: RankRow[] }) {
  return (
    <div className="rank-strip" role="list" aria-label="순위">
      {rows.map((r, i) => (
        <div key={r.id} role="listitem" className={'rank-chip' + (r.me ? ' me' : '') + (i === 0 ? ' lead' : '')}>
          <span className="rk">{MEDAL[i] ?? `${i + 1}위`}</span>
          <span className="rn">
            <b>{r.nickname}</b>
            <small className={tone(r.equity / START_CASH - 1)}>
              {wonShort(r.equity)} · {pct(r.equity / START_CASH - 1, 1)}
            </small>
          </span>
          <span className={'rs' + (r.ended ? ' ok' : '')} title={r.ended ? '장 마감 완료' : '고민 중'}>
            {r.ended ? '✓' : '…'}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 모바일 시트 / 어디서나 쓰는 세로 순위표 */
export function RankList({ rows }: { rows: RankRow[] }) {
  const top = rows[0]?.equity ?? START_CASH;
  return (
    <div className="rank-list">
      {rows.map((r, i) => (
        <div key={r.id} className={'rank-row' + (r.me ? ' me' : '')}>
          <span className="rk">{MEDAL[i] ?? i + 1}</span>
          <span className="rn">
            <b>
              {r.nickname}
              {r.me && <em> (나)</em>}
            </b>
            <small>{r.ended ? '✓ 장 마감' : '고민 중…'}</small>
          </span>
          <span className="rv">
            <b>{wonShort(r.equity)}</b>
            <small className={tone(r.equity / START_CASH - 1)}>{pct(r.equity / START_CASH - 1)}</small>
            {i > 0 && <small className="muted">1위와 {wonShort(top - r.equity)}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 방해·염탐 카드를 누구에게 쓸지 */
export function TargetPicker({ kind, rows, onPick, onCancel }: { kind: ItemKind; rows: RankRow[]; onPick: (id: string) => void; onCancel: () => void }) {
  const d = ITEM_MAP[kind];
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {d.emoji} {d.name} — 누구에게?
        </h3>
        <p className="muted small">{d.desc}</p>
        <div className="target-list">
          {rows
            .filter((r) => !r.me)
            .map((r) => (
              <button key={r.id} className="target-row" onClick={() => onPick(r.id)}>
                <b>{r.nickname}</b>
                <span>
                  {wonShort(r.equity)} <small className={tone(r.equity / START_CASH - 1)}>{pct(r.equity / START_CASH - 1, 1)}</small>
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
  const idxNow = closed ? idx.close : idx.open;
  const idxPrev = day === 0 ? KR_INDEX_BASE : m.index[day - 1].close;
  const us = m.usIndex[day];
  const usNow = closed ? us.close : us.open;
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

export function MarketGrid({ market, day, closed, compact = false }: { market: Market; day: number; closed: boolean; compact?: boolean }) {
  return (
    <div className={'mgrid' + (compact ? ' compact' : '')}>
      {marketTiles(market, day, closed).map((t) => (
        <div key={t.key} className="mtile">
          <small>
            <Term k={t.term}>{t.label}</Term>
          </small>
          <b>{t.value}</b>
          <span className={t.ch === null || Math.abs(t.ch) < 1e-9 ? 'flat' : tone(t.ch)}>{t.chText}</span>
          {!compact && <em>{t.hint}</em>}
        </div>
      ))}
    </div>
  );
}
