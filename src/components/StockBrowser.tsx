import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, SectorIcon } from './Icon';
import type { Market } from '../game/market';
import { HaltTag } from './HaltTag';
import type { PortfolioState } from '../game/portfolio';
import { fmtUsd, quote } from '../game/quote';
import { regionOf, riskOf, SECTOR_MAP, STOCK_MAP, STOCK_SECTORS, STOCKS, type Region } from '../game/stocks';
import { num, pct, tone, wonShort } from '../lib/format';
import { Sparkline } from './Chart';
import { reorderSubset, SlideChips } from './SlideChips';
import { FitText } from './FitText';
import { Dropdown } from './Dropdown';
import { EmptyState } from './ui';
import { effective, setPrefs, usePrefs } from '../prefs';

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
  /** 커스텀 화면 편집 중: 칩을 끌어서 순서 바꾸기 */
  editing?: boolean;
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

/**
 * 칩 줄: 숨겨진 가로 스크롤 없이 화면 폭에 맞춰 줄바꿈.
 * rows 줄까지만 보이고, 넘치면 "+N" 버튼 → 누르면 전부 펼침(또는 onMore 가 있으면 그걸 실행)
 */
export function ScrollChips({ children, rows = 1, onMore, moreLabel }: { children: React.ReactNode; rows?: number; onMore?: () => void; moreLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(0);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const kids = [...el.children] as HTMLElement[];
      if (!kids.length) return setHidden(0);
      const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((x, y) => x - y);
      const lastTop = tops[Math.min(rows, tops.length) - 1];
      const lastRow = kids.filter((k) => k.offsetTop === lastTop);
      const bottom = Math.max(...lastRow.map((k) => k.offsetTop + k.offsetHeight)) - kids[0].offsetTop;
      const h = kids.filter((k) => k.offsetTop > lastTop).length;
      // 값이 바뀔 때만 갱신 (무한 렌더 방지)
      setHidden((p) => (p === h ? p : h));
      setMaxH((p) => (p === bottom ? p : bottom));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, rows]);
  const showBtn = open || hidden > 0;
  return (
    <div className={'fit-chips' + (open ? ' open' : '')}>
      <div className="fit-track" ref={ref} style={open || !maxH ? undefined : { maxHeight: maxH }}>
        {children}
      </div>
      {showBtn && (
        <button className="chip fit-more" onClick={() => (onMore && !open ? onMore() : setOpen((o) => !o))} aria-expanded={open} aria-label={open ? '접기' : `나머지 ${hidden}개 더 보기`}>
          {open ? '접기 ▴' : moreLabel ? `${moreLabel} +${hidden}` : `+${hidden} ▾`}
        </button>
      )}
    </div>
  );
}

export function StockBrowser({ market, day, closed, portfolio, watch, onToggleWatch, selected, onSelect, newsSymbols, filter, onFilter, editing = false }: Props) {
  const prefs = effective(usePrefs());
  // 줄(StockRow)이 1초마다 다시 그려지지 않게, 부모가 매번 새로 만드는 함수 대신 늘 같은 함수를 넘김
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const watchRef = useRef(onToggleWatch);
  watchRef.current = onToggleWatch;
  const stableSelect = useCallback((sym: string) => selectRef.current(sym), []);
  const stableWatch = useCallback((sym: string) => watchRef.current(sym), []);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  // 화면 높이가 낮으면(작은 노트북) 처음엔 접어서 종목 목록이 더 보이게
  const [holdOpen, setHoldOpen] = useState(() => typeof window === 'undefined' || window.innerHeight >= 820 || window.innerWidth < 960);
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
    { id: 'KR', label: '국내' },
    { id: 'US', label: '미국' },
    { id: 'ETF', label: 'ETF' },
    { id: 'watch', label: `관심${watch.length ? ' ' + watch.length : ''}` },
    { id: 'held', label: `보유${Object.keys(portfolio.holdings).length ? ' ' + Object.keys(portfolio.holdings).length : ''}` },
    { id: 'news', label: '오늘 뉴스' },
  ];
  const isSectorRow = region === 'KR' || region === 'US' || region === 'all';
  const allSubs: { id: string; label: string }[] =
    region === 'ETF'
      ? ETF_GROUPS.map((g) => ({ id: g, label: g }))
      : isSectorRow
        ? STOCK_SECTORS.filter((s) => region === 'all' || s.region === region).map((s) => ({ id: s.id, label: s.name }))
        : [];
  // 순서: 내가 정한 순서(커스텀) → 나머지는 기본 순서. 고른 칩은 줄이 저절로 넘겨서 보여 줌
  const pins = isSectorRow ? (prefs.sectorPins ?? []) : [];
  const sectorOrder = [...pins.filter((id) => STOCK_SECTORS.some((x) => x.id === id)), ...STOCK_SECTORS.map((x) => x.id).filter((id) => !pins.includes(id))];
  const subs = isSectorRow ? [...allSubs].sort((a, b) => sectorOrder.indexOf(a.id) - sectorOrder.indexOf(b.id)) : allSubs;
  const regionOrder = prefs.regionOrder ?? regions.map((r) => r.id);
  // '전체'는 늘 맨 앞에 고정 (순서 바꾸기 대상 아님), 나머지만 내가 정한 순서로
  const regionsSorted = [regions[0], ...regions.slice(1).sort((a, b) => (regionOrder.indexOf(a.id) + 99) % 99 - (regionOrder.indexOf(b.id) + 99) % 99)];

  const grouped = region !== 'watch' && region !== 'held' && region !== 'news' && sort === 'default' && !q.trim() && !sub;
  const groupKey = (s: (typeof STOCKS)[number]) => (s.etf ? 'etf:' + s.etf.group : s.sector);
  const groupLabel = (s: (typeof STOCKS)[number]) =>
    s.etf ? (
      <>
        <Icon name="cards" size={13} /> ETF · {s.etf.group}
      </>
    ) : (
      <>
        <SectorIcon id={s.sector} /> {SECTOR_MAP[s.sector].name}
      </>
    );

  const holdings = Object.entries(portfolio.holdings).map(([sym, h]) => {
    const qd = quote(market, sym, day, closed);
    const value = h.qty * qd.krw;
    const pl = value - h.qty * h.avgCost;
    return { sym, h, value, pl, r: qd.krw / h.avgCost - 1, s: STOCKS.find((x) => x.symbol === sym)! };
  });
  const totalPl = holdings.reduce((a, x) => a + x.pl, 0);
  const totalCost = holdings.reduce((a, x) => a + x.h.qty * x.h.avgCost, 0);
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const arrow = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '');

  return (
    <div className="browser">
      {/* 보유 종목: 항상 보이는 고정 영역 */}
      <div className={'pinned' + (holdOpen ? '' : ' closed')}>
        <button className="pinned-head" onClick={() => setHoldOpen((o) => !o)}>
          <span>
            <Icon name="briefcase" /> 내 보유 <b>{holdings.length}</b>
          </span>
          {holdings.length === 0 ? (
            <span className="muted">아직 가진 종목이 없어요</span>
          ) : (
            <span className="ph-right">
              <span className={'pl-pill ' + tone(totalPl)}>
                <FitText>
                  {arrow(totalPl)} {sign(totalPl)}
                  {wonShort(Math.abs(totalPl))} ({pct(totalCost ? totalPl / totalCost : 0)})
                </FitText>
              </span>
              <Icon name={holdOpen ? 'up' : 'down'} size={14} className="muted" />
            </span>
          )}
        </button>
        {holdOpen && holdings.length > 0 && (
          <div className="pinned-list">
            {holdings.map(({ sym, h, value, pl, r, s }) => (
              <button key={sym} className={'pin-row ' + tone(pl) + (sym === selected ? ' sel' : '')} onClick={() => onSelect(sym)}>
                <span className="pin-name">
                  <b>
                    <FitText>{s.name}</FitText>
                  </b>
                  <small>
                    <FitText>
                      {num(h.qty)}주 · 평균 {s.currency === 'USD' ? '≈' : ''}
                      {num(Math.round(h.avgCost))}원
                    </FitText>
                  </small>
                </span>
                <span className="pin-val">
                  <b>{wonShort(value)}</b>
                  <span className={'pl-pill ' + tone(pl)}>
                    {arrow(pl)} {sign(pl)}
                    {wonShort(Math.abs(pl))} · {pct(r)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.3-1.4 1.4-4.3-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="종목 검색" placeholder="종목·업종·ETF 검색 (초성 OK)" maxLength={30} />
        {q && (
          <button className="clear" onClick={() => setQ('')} aria-label="검색어 지우기">
            <Icon name="x" />
          </button>
        )}
      </div>

      <SlideChips
        className="regions"
        label="카테고리"
        onReorder={editing ? (ids) => setPrefs({ regionOrder: ids }) : undefined}
        items={regionsSorted.map((c) => ({
          id: c.id,
          fixed: c.id === 'all',
          active: region === c.id,
          node: (
            <button role="tab" aria-selected={region === c.id} className={'chip' + (region === c.id ? ' on' : '')} onClick={() => onFilter({ region: c.id, sub: null })}>
              {c.id === 'ETF' && <Icon name="cards" size={13} />}
              {c.id === 'watch' && <Icon name="star" size={13} />}
              {c.id === 'held' && <Icon name="briefcase" size={13} />}
              {c.id === 'news' && <Icon name="news" size={13} />} {c.label}
            </button>
          ),
        }))}
      />
      {subs.length > 0 && (
        <SlideChips
          label={isSectorRow ? '업종' : '분류'}
          onReorder={editing && isSectorRow ? (ids) => setPrefs({ sectorPins: reorderSubset(sectorOrder, ids) }) : undefined}
          items={[
            {
              id: '__all',
              fixed: true,
              active: !sub,
              node: (
                <button className={'chip sm' + (!sub ? ' on-soft' : '')} onClick={() => onFilter({ region, sub: null })}>
                  모두
                </button>
              ),
            },
            ...subs.map((c) => ({
              id: c.id,
              active: sub === c.id,
              node: (
                <button className={'chip sm' + (sub === c.id ? ' on-soft' : '')} onClick={() => onFilter({ region, sub: c.id })}>
                  {isSectorRow && <SectorIcon id={c.id} />} {c.label}
                </button>
              ),
            })),
          ]}
        />
      )}
      {editing && <p className="slide-hint">칩을 끌어서 순서를 바꿀 수 있어요</p>}

      <div className="sortbar">
        <span className="muted">
          {rows.length}개{newsSymbols.size > 0 && <span className="news-legend"> · <i /> 오늘 뉴스</span>}
        </span>
        <Dropdown
          label="정렬"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'default', label: '기본순', icon: 'list' },
            { value: 'up', label: '많이 오른 순', icon: 'trend' },
            { value: 'down', label: '많이 내린 순', icon: 'activity' },
            { value: 'price', label: '가격 높은 순', icon: 'coins' },
          ]}
        />
      </div>

      <div className="stock-list">
        {rows.length === 0 && (
          <EmptyState
            compact
            icon={region === 'watch' ? 'star' : region === 'held' ? 'briefcase' : 'search'}
            title={region === 'watch' ? '관심 종목이 없어요' : region === 'held' ? '아직 가진 종목이 없어요' : '찾는 종목이 없어요'}
            desc={region === 'watch' ? '종목 옆 별을 누르면 여기에 모여요.' : region === 'held' ? undefined : '이름이나 업종을 다르게 써 보세요.'}
          />
        )}
        {rows.map(({ s, krw, usd, ch }, i) => {
          const showHeader = grouped && (i === 0 || groupKey(rows[i - 1].s) !== groupKey(s));
          const series = (usd !== null ? market.usd[s.symbol] : market.bars[s.symbol]).slice(Math.max(0, day - 9), day).map((b) => b.close);
          series.push(usd ?? krw);
          return (
            <div key={s.symbol}>
              {showHeader && <div className="group-head">{groupLabel(s)}</div>}
              <StockRow
                symbol={s.symbol}
                krw={krw}
                usd={usd}
                ch={ch}
                series={series}
                sel={s.symbol === selected}
                news={newsSymbols.has(s.symbol)}
                watched={watch.includes(s.symbol)}
                heldQty={portfolio.holdings[s.symbol]?.qty ?? 0}
                grouped={grouped}
                halt={market.halts?.find((h) => h.symbol === s.symbol && h.day === day)?.kind}
                onSelect={stableSelect}
                onToggleWatch={stableWatch}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RowProps {
  symbol: string;
  krw: number;
  usd: number | null;
  ch: number;
  series: number[];
  sel: boolean;
  news: boolean;
  watched: boolean;
  heldQty: number;
  grouped: boolean;
  onSelect: (s: string) => void;
  onToggleWatch: (s: string) => void;
  /** (v24) 거래정지·정리매매·상장폐지 */
  halt?: 'halt' | 'clear' | 'delisted';
}
/**
 * 종목 한 줄 — 장이 열려 있으면 1초마다 목록 전체가 새로 그려져서(47줄), 느린 휴대폰에서 목록 탭이 끊겼음.
 * 이 줄의 값(가격·등락·작은 차트·선택·관심·보유)이 바뀔 때만 다시 그림
 */
const StockRow = memo(function StockRow({ symbol, krw, usd, ch, series, sel, news, watched, heldQty, grouped, onSelect, onToggleWatch, halt }: RowProps) {
  const s = STOCK_MAP[symbol];
  const r = riskOf(s);
  // 가격이 바뀌면 잠깐 반짝임 (오르면 빨강 · 내리면 파랑, 증권 앱처럼) — key 를 바꿔 매번 다시 시작
  const price = usd ?? krw;
  const prev = useRef(price);
  const dir = price > prev.current ? ' tick-up' : price < prev.current ? ' tick-down' : '';
  useEffect(() => {
    prev.current = price;
  }, [price]);
  return (
    <div
      className={'srow' + (sel ? ' sel' : '') + (news ? ' has-news' : '')}
      // 오늘 이 종목 관련 뉴스가 있으면 줄 왼쪽에 노란 세로 줄 (글자 공간을 쓰지 않음)
      title={news ? '오늘 이 종목 관련 뉴스가 있어요' : undefined}
      onClick={() => onSelect(symbol)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(symbol)}
    >
      <button
        className={'star' + (watched ? ' on' : '')}
        onClick={(e) => {
          e.stopPropagation();
          onToggleWatch(symbol);
        }}
        aria-label="관심 종목"
      >
        <Icon name="star" size={15} className={watched ? 'filled' : ''} />
      </button>
      <div className="sname">
        <b>
          {/* 길면 옆으로 지나가며 끝까지 보여 줌 */}
          <FitText>{s.name}</FitText>
        </b>
        <small>
          {usd !== null && <span className="flag">US · </span>}
          {!grouped && <>{s.etf ? s.etf.group : SECTOR_MAP[s.sector].name} · </>}
          {halt ? <HaltTag kind={halt} /> : <span className={'risk r' + r}>{['', '안정', '보통', '고위험'][r]}</span>}
          {heldQty > 0 && <span className="held"> · {num(heldQty)}주</span>}
        </small>
      </div>
      <Sparkline values={series} up={(usd ?? krw) >= series[0]} width={44} />
      <div className="sprice">
        <b key={price} className={dir.trim() || undefined}>{usd !== null ? fmtUsd(usd) : num(krw)}</b>
        <small className={tone(ch)}>{pct(ch)}</small>
      </div>
    </div>
  );
}, (a, b) =>
  a.symbol === b.symbol && a.krw === b.krw && a.usd === b.usd && a.ch === b.ch && a.sel === b.sel && a.news === b.news && a.watched === b.watched && a.heldQty === b.heldQty && a.grouped === b.grouped &&
  a.onSelect === b.onSelect && a.onToggleWatch === b.onToggleWatch &&
  a.series.length === b.series.length && a.series.every((v, i) => v === b.series[i]));
