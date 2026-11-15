import { useEffect, useMemo, useRef, useState } from 'react';
import type { Market } from '../game/market';
import type { PortfolioState } from '../game/portfolio';
import { fmtUsd, quote } from '../game/quote';
import { regionOf, riskOf, SECTOR_MAP, STOCK_SECTORS, STOCKS, type Region } from '../game/stocks';
import { num, pct, tone, wonShort } from '../lib/format';
import { Sparkline } from './Chart';

export interface BrowserFilter {
  region: RegionTab;
  sub: string | null;
}
type RegionTab = 'all' | Region | 'watch' | 'held' | 'news';

interface Props {
  market: Market;
  day: number;
  closed: boolean;
  portfolio: PortfolioState;
  watch: string[];
  onToggleWatch: (sym: string) => void;
  selected: string;
  onSelect: (sym: string) => void;
  newsSymbols: Set<string>;
  filter: BrowserFilter;
  onFilter: (f: BrowserFilter) => void;
}

type Sort = 'default' | 'up' | 'down' | 'price';

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function chosung(s: string) {
  return [...s]
    .map((c) => {
      const code = c.charCodeAt(0) - 0xac00;
      return code >= 0 && code < 11172 ? CHOSUNG[Math.floor(code / 588)] : c;
    })
    .join('');
}

const ETF_GROUPS = ['지수', '레버리지·인버스', '테마', '원자재·환율'] as const;

/** 가로로 넘치는 칩 줄: 좌우 화살표 + 가장자리 흐림 + 드래그/휠 스크롤 */
export function ScrollChips({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    // 값이 바뀔 때만 갱신 (무한 렌더 방지)
    setEdge((p) => (p.l === l && p.r === r ? p : { l, r }));
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);
  const by = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: 'smooth' });
  return (
    <div className={'scroll-chips' + (edge.l ? ' fade-l' : '') + (edge.r ? ' fade-r' : '')}>
      {edge.l && (
        <button className="sc-arrow l" onClick={() => by(-160)} aria-label="왼쪽으로">
          ‹
        </button>
      )}
      <div className="sc-track" ref={ref} onScroll={update}>
        {children}
      </div>
      {edge.r && (
        <button className="sc-arrow r" onClick={() => by(160)} aria-label="오른쪽으로">
          ›
        </button>
      )}
    </div>
  );
}

export function StockBrowser({ market, day, closed, portfolio, watch, onToggleWatch, selected, onSelect, newsSymbols, filter, onFilter }: Props) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [holdOpen, setHoldOpen] = useState(true);
  const { region, sub } = filter;

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = STOCKS.filter((s) => {
      const reg = regionOf(s);
      if (region === 'KR' || region === 'US' || region === 'ETF') {
        if (reg !== region) return false;
        if (sub && (region === 'ETF' ? s.etf?.group !== sub : s.sector !== sub)) return false;
      }
      if (region === 'all' && sub && s.sector !== sub) return false;
      if (region === 'watch' && !watch.includes(s.symbol)) return false;
      if (region === 'held' && !portfolio.holdings[s.symbol]) return false;
      if (region === 'news' && !newsSymbols.has(s.symbol)) return false;
      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        s.symbol.toLowerCase().includes(query) ||
        SECTOR_MAP[s.sector].name.toLowerCase().includes(query) ||
        chosung(s.name).includes(query) ||
        (s.etf?.group ?? '').includes(query)
      );
    }).map((s) => ({ s, ...quote(market, s.symbol, day, closed) }));
    if (sort === 'up') list = list.sort((a, b) => b.ch - a.ch);
    if (sort === 'down') list = list.sort((a, b) => a.ch - b.ch);
    if (sort === 'price') list = list.sort((a, b) => b.krw - a.krw);
    return list;
  }, [q, region, sub, sort, watch, portfolio, market, day, closed, newsSymbols]);

  const regions: { id: RegionTab; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'KR', label: '🇰🇷 국내' },
    { id: 'US', label: '🇺🇸 미국' },
    { id: 'ETF', label: '🧺 ETF' },
    { id: 'watch', label: `★ 관심${watch.length ? ' ' + watch.length : ''}` },
    { id: 'held', label: `보유${Object.keys(portfolio.holdings).length ? ' ' + Object.keys(portfolio.holdings).length : ''}` },
    { id: 'news', label: '📰 오늘 뉴스' },
  ];
  const subs: { id: string; label: string }[] =
    region === 'ETF'
      ? ETF_GROUPS.map((g) => ({ id: g, label: g }))
      : region === 'KR' || region === 'US' || region === 'all'
        ? STOCK_SECTORS.filter((s) => region === 'all' || s.region === region).map((s) => ({ id: s.id, label: `${s.emoji} ${s.name}` }))
        : [];

  const grouped = region !== 'watch' && region !== 'held' && region !== 'news' && sort === 'default' && !q.trim() && !sub;
  const groupKey = (s: (typeof STOCKS)[number]) => (s.etf ? 'etf:' + s.etf.group : s.sector);
  const groupLabel = (s: (typeof STOCKS)[number]) => (s.etf ? `🧺 ETF · ${s.etf.group}` : `${SECTOR_MAP[s.sector].emoji} ${SECTOR_MAP[s.sector].name}`);

  const holdings = Object.entries(portfolio.holdings);

  return (
    <div className="browser">
      {/* 보유 종목: 항상 보이는 고정 영역 */}
      <div className={'pinned' + (holdOpen ? '' : ' closed')}>
        <button className="pinned-head" onClick={() => setHoldOpen((o) => !o)}>
          <span>
            💼 내 보유 <b>{holdings.length}</b>
          </span>
          <span className="muted">{holdOpen ? '접기 ▴' : '펼치기 ▾'}</span>
        </button>
        {holdOpen && (
          <div className="pinned-list">
            {holdings.length === 0 && <p className="pinned-empty">아직 가진 종목이 없어요</p>}
            {holdings.map(([sym, h]) => {
              const qd = quote(market, sym, day, closed);
              const r = qd.krw / h.avgCost - 1;
              const s = STOCKS.find((x) => x.symbol === sym)!;
              return (
                <button key={sym} className={'pin-row' + (sym === selected ? ' sel' : '')} onClick={() => onSelect(sym)}>
                  <span className="pin-name">
                    <b>{s.name}</b>
                    <small>{num(h.qty)}주</small>
                  </span>
                  <span className="pin-val">
                    <b>{wonShort(h.qty * qd.krw)}</b>
                    <small className={tone(r)}>{pct(r)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.3-1.4 1.4-4.3-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목·업종·ETF 검색 (초성 OK)" maxLength={30} />
        {q && (
          <button className="clear" onClick={() => setQ('')} aria-label="검색어 지우기">
            ✕
          </button>
        )}
      </div>

      <div className="regions" role="tablist">
        {regions.map((c) => (
          <button key={c.id} role="tab" aria-selected={region === c.id} className={'chip' + (region === c.id ? ' on' : '')} onClick={() => onFilter({ region: c.id, sub: null })}>
            {c.label}
          </button>
        ))}
      </div>
      {subs.length > 0 && (
        <ScrollChips>
          <button className={'chip sm' + (!sub ? ' on-soft' : '')} onClick={() => onFilter({ region, sub: null })}>
            모두
          </button>
          {subs.map((c) => (
            <button key={c.id} className={'chip sm' + (sub === c.id ? ' on-soft' : '')} onClick={() => onFilter({ region, sub: c.id })}>
              {c.label}
            </button>
          ))}
        </ScrollChips>
      )}

      <div className="sortbar">
        <span className="muted">{rows.length}개</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          <option value="default">기본순</option>
          <option value="up">많이 오른 순</option>
          <option value="down">많이 내린 순</option>
          <option value="price">가격 높은 순</option>
        </select>
      </div>

      <div className="stock-list">
        {rows.length === 0 && (
          <p className="empty">{region === 'watch' ? '☆를 눌러 관심 종목을 추가해 보세요' : region === 'held' ? '아직 가진 종목이 없어요' : '찾는 종목이 없어요'}</p>
        )}
        {rows.map(({ s, krw, usd, ch }, i) => {
          const showHeader = grouped && (i === 0 || groupKey(rows[i - 1].s) !== groupKey(s));
          const h = portfolio.holdings[s.symbol];
          const series = (usd !== null ? market.usd[s.symbol] : market.bars[s.symbol]).slice(Math.max(0, day - 9), day).map((b) => b.close);
          series.push(usd ?? krw);
          const r = riskOf(s);
          return (
            <div key={s.symbol}>
              {showHeader && <div className="group-head">{groupLabel(s)}</div>}
              <div
                className={'srow' + (s.symbol === selected ? ' sel' : '')}
                onClick={() => onSelect(s.symbol)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(s.symbol)}
              >
                <button
                  className={'star' + (watch.includes(s.symbol) ? ' on' : '')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatch(s.symbol);
                  }}
                  aria-label="관심 종목"
                >
                  {watch.includes(s.symbol) ? '★' : '☆'}
                </button>
                <div className="sname">
                  <b>
                    {s.name}
                    {newsSymbols.has(s.symbol) && <i className="dot-news" title="오늘 뉴스" />}
                  </b>
                  <small>
                    {usd !== null && <span className="flag">US · </span>}
                    {!grouped && <>{s.etf ? s.etf.group : SECTOR_MAP[s.sector].name} · </>}
                    <span className={'risk r' + r}>{['', '안정', '보통', '고위험'][r]}</span>
                    {h && <span className="held"> · {num(h.qty)}주</span>}
                  </small>
                </div>
                <Sparkline values={series} up={(usd ?? krw) >= series[0]} />
                <div className="sprice">
                  <b>{usd !== null ? fmtUsd(usd) : num(krw)}</b>
                  <small className={tone(ch)}>{pct(ch)}</small>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
