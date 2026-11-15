import { useMemo, useState } from 'react';
import type { Market } from '../game/market';
import { prevClose } from '../game/market';
import type { PortfolioState } from '../game/portfolio';
import { riskOf, SECTOR_MAP, SECTORS, STOCKS } from '../game/stocks';
import { num, pct, tone } from '../lib/format';
import { Sparkline } from './Chart';

interface Props {
  market: Market;
  day: number;
  prices: Record<string, number>;
  portfolio: PortfolioState;
  watch: string[];
  onToggleWatch: (sym: string) => void;
  selected: string;
  onSelect: (sym: string) => void;
  /** 오늘 뉴스에 나온 종목/업종 표시 */
  newsSymbols: Set<string>;
  initialCat?: string;
}

type Sort = 'default' | 'up' | 'down' | 'price';

const CHOSUNG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function chosung(s: string) {
  return [...s].map((c) => {
    const code = c.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHOSUNG[Math.floor(code / 588)] : c;
  }).join('');
}

export function StockBrowser({ market, day, prices, portfolio, watch, onToggleWatch, selected, onSelect, newsSymbols, initialCat }: Props) {
  const [cat, setCat] = useState<string>(initialCat ?? 'all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('default');

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = STOCKS.filter((s) => {
      if (cat === 'watch' && !watch.includes(s.symbol)) return false;
      if (cat === 'held' && !portfolio.holdings[s.symbol]) return false;
      if (cat === 'news' && !newsSymbols.has(s.symbol)) return false;
      if (!['all', 'watch', 'held', 'news'].includes(cat) && s.sector !== cat) return false;
      if (!query) return true;
      const sec = SECTOR_MAP[s.sector].name;
      return (
        s.name.toLowerCase().includes(query) ||
        s.symbol.toLowerCase().includes(query) ||
        sec.includes(query) ||
        chosung(s.name).includes(query)
      );
    }).map((s) => {
      const p = prices[s.symbol];
      const ch = p / prevClose(market, s.symbol, day) - 1;
      return { s, p, ch };
    });
    if (sort === 'up') list = list.sort((a, b) => b.ch - a.ch);
    if (sort === 'down') list = list.sort((a, b) => a.ch - b.ch);
    if (sort === 'price') list = list.sort((a, b) => b.p - a.p);
    return list;
  }, [q, cat, sort, watch, portfolio, prices, market, day, newsSymbols]);

  const cats = [
    { id: 'all', label: '전체' },
    { id: 'watch', label: `★ 관심 ${watch.length || ''}` },
    { id: 'held', label: `보유 ${Object.keys(portfolio.holdings).length || ''}` },
    { id: 'news', label: '오늘 뉴스' },
    ...SECTORS.map((s) => ({ id: s.id, label: `${s.emoji} ${s.name}` })),
  ];

  // 업종별 묶어서 보여주기 (전체 + 기본 정렬 + 검색 없음일 때)
  const grouped = cat === 'all' && sort === 'default' && !q.trim();

  return (
    <div className="browser">
      <div className="search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.3-1.4 1.4-4.3-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목·업종 검색 (초성 OK: ㅋㅇ)" />
        {q && (
          <button className="clear" onClick={() => setQ('')} aria-label="검색어 지우기">
            ✕
          </button>
        )}
      </div>
      <div className="chips" role="tablist">
        {cats.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="sortbar">
        <span className="muted">{rows.length}개 종목</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          <option value="default">업종순</option>
          <option value="up">많이 오른 순</option>
          <option value="down">많이 내린 순</option>
          <option value="price">가격 높은 순</option>
        </select>
      </div>
      <div className="stock-list">
        {rows.length === 0 && (
          <p className="empty">
            {cat === 'watch' ? '☆를 눌러 관심 종목을 추가해 보세요' : cat === 'held' ? '아직 가진 주식이 없어요' : '찾는 종목이 없어요'}
          </p>
        )}
        {rows.map(({ s, p, ch }, i) => {
          const showHeader = grouped && (i === 0 || rows[i - 1].s.sector !== s.sector);
          const sec = SECTOR_MAP[s.sector];
          const h = portfolio.holdings[s.symbol];
          const hist = market.bars[s.symbol].slice(Math.max(0, day - 9), day).map((b) => b.close);
          hist.push(p);
          const r = riskOf(s);
          return (
            <div key={s.symbol}>
              {showHeader && (
                <div className="group-head">
                  {sec.emoji} {sec.name}
                </div>
              )}
              <div className={'srow' + (s.symbol === selected ? ' sel' : '')} onClick={() => onSelect(s.symbol)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(s.symbol)}>
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
                    {!grouped && <>{sec.name} · </>}
                    <span className={'risk r' + r}>{['', '안정', '보통', '고위험'][r]}</span>
                    {h && <span className="held"> · {num(h.qty)}주</span>}
                  </small>
                </div>
                <Sparkline values={hist} up={p >= hist[0]} />
                <div className="sprice">
                  <b>{num(p)}</b>
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
