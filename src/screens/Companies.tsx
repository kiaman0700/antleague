/** 기업 도감: 게임에 나오는 회사·ETF 를 미리 공부하는 화면 (홈 → 기업 도감) */
import { useMemo, useState } from 'react';
import { companyInfo, type CompanyInfo } from '../game/companyInfo';
import { SECTOR_MAP, STOCK_SECTORS, STOCKS } from '../game/stocks';
import { Icon, SectorIcon } from '../components/Icon';
import { SlideChips } from '../components/SlideChips';
import { FitText } from '../components/FitText';

type Region = 'all' | '국내' | '미국' | 'ETF';

function Detail({ info, onJump }: { info: CompanyInfo; onJump: (sym: string) => void }) {
  const d = info.def;
  return (
    <div className="co-detail">
      <p className="co-desc">{d.desc}</p>
      <dl className="co-facts">
        {info.etf ? (
          <>
            <dt>따라가는 것</dt>
            <dd>
              {info.etf.what}
              {info.etf.lev !== 1 && <b className={info.etf.lev > 0 ? 'up' : 'down'}> · {info.etf.lev > 0 ? `${info.etf.lev}배로` : '반대로'} 움직여요</b>}
            </dd>
            {info.etf.members.length > 0 && info.etf.members.length <= 12 && (
              <>
                <dt>담고 있는 종목</dt>
                <dd className="co-chips">
                  {info.etf.members.map((m) => (
                    <span key={m} className="chip sm">
                      {m}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>거시 변수</dt>
            <dd>
              {info.macro.length ? (
                info.macro.map((m) => (
                  <span key={m.label} className={'co-macro ' + m.dir}>
                    {m.label} <b>{m.dir === 'up' ? '▲ 유리' : '▼ 불리'}</b>
                  </span>
                ))
              ) : (
                <span className="muted">금리·환율·유가 영향이 작아요</span>
              )}
            </dd>
            <dt>같이 움직이는 업종</dt>
            <dd className="co-chips">{info.together.length ? info.together.map((t) => <span key={t} className="chip sm">{t}</span>) : <span className="muted">-</span>}</dd>
            {info.opposite.length > 0 && (
              <>
                <dt>반대로 움직이는 업종</dt>
                <dd className="co-chips">
                  {info.opposite.map((t) => (
                    <span key={t} className="chip sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
            {(info.supply.length > 0 || info.affectedBy.length > 0) && (
              <>
                <dt>연결된 회사</dt>
                <dd className="co-chips">
                  {info.supply.map((x) => (
                    <button key={x.symbol} className="chip sm" onClick={() => onJump(x.symbol)} title="이 회사에 좋은 일이 생기면 같이 움직여요">
                      → {x.name}
                    </button>
                  ))}
                  {info.affectedBy.map((x) => (
                    <button key={x.symbol} className="chip sm" onClick={() => onJump(x.symbol)} title="이 회사의 소식에 영향을 받아요">
                      ← {x.name}
                    </button>
                  ))}
                </dd>
              </>
            )}
            {info.inEtfs.length > 0 && (
              <>
                <dt>이 종목을 담은 ETF</dt>
                <dd className="co-chips">
                  {info.inEtfs.map((t) => (
                    <span key={t} className="chip sm">
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </>
        )}
      </dl>
    </div>
  );
}

export function Companies({ onBack }: { onBack: () => void }) {
  const [region, setRegion] = useState<Region>('all');
  const [sector, setSector] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const infos = useMemo(() => STOCKS.map((s) => companyInfo(s.symbol)), []);
  const shown = infos.filter(
    (i) => (region === 'all' || i.region === region) && (!sector || i.def.sector === sector) && (!q.trim() || i.def.name.includes(q.trim()) || SECTOR_MAP[i.def.sector].name.includes(q.trim())),
  );
  const sectors = STOCK_SECTORS.filter((s) => region === 'all' || (region === '국내' ? s.region === 'KR' : region === '미국' ? s.region === 'US' : false));
  const jump = (sym: string) => {
    setRegion('all');
    setSector(null);
    setQ('');
    setOpen(sym);
    setTimeout(() => document.getElementById('co-' + sym)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="lobby page companies">
      <header className="page-head">
        <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2>기업 도감</h2>
        <div className="ph-right" />
      </header>
      <p className="muted small">게임에 나오는 회사와 ETF 예요. 어떤 일을 하는지, 금리·환율·유가에 어떻게 반응하는지, 누구와 같이 움직이는지 미리 알아 두면 뉴스를 읽기 쉬워져요.</p>
      <div className="search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사·업종 이름으로 찾기" maxLength={20} />
      </div>
      <SlideChips
        label="지역"
        items={(['all', '국내', '미국', 'ETF'] as Region[]).map((r) => ({
          id: r,
          fixed: r === 'all',
          active: region === r,
          node: (
            <button className={'chip' + (region === r ? ' on' : '')} onClick={() => (setRegion(r), setSector(null))}>
              {r === 'all' ? '전체' : r}
            </button>
          ),
        }))}
      />
      {region !== 'ETF' && (
        <SlideChips
          label="업종"
          items={[
            { id: '__all', fixed: true, active: !sector, node: <button className={'chip sm' + (!sector ? ' on-soft' : '')} onClick={() => setSector(null)}>모두</button> },
            ...sectors.map((s) => ({
              id: s.id,
              active: sector === s.id,
              node: (
                <button className={'chip sm' + (sector === s.id ? ' on-soft' : '')} onClick={() => setSector(s.id)}>
                  <SectorIcon id={s.id} /> {s.name}
                </button>
              ),
            })),
          ]}
        />
      )}
      <p className="muted small">{shown.length}개</p>
      <div className="co-list">
        {shown.map((i) => {
          const isOpen = open === i.def.symbol;
          return (
            <section key={i.def.symbol} id={'co-' + i.def.symbol} className={'co-card' + (isOpen ? ' open' : '')}>
              <button className="co-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.def.symbol)}>
                <span className="co-icon">{i.def.etf ? <Icon name="cards" size={18} /> : <SectorIcon id={i.def.sector} size={18} />}</span>
                <span className="co-name">
                  <b>
                    <FitText>{i.def.name}</FitText>
                  </b>
                  <small>
                    {i.region} · {i.def.etf ? i.def.etf.group : SECTOR_MAP[i.def.sector].name}
                    {i.size && ` · ${i.size}`}
                  </small>
                </span>
                <span className="co-tags">
                  <span className={'risk-tag r' + (i.risk === '안정형' ? 1 : i.risk === '보통' ? 2 : 3)}>{i.risk}</span>
                  {i.dividend && <span className="div-tag">배당</span>}
                </span>
                <Icon name={isOpen ? 'up' : 'down'} size={16} className="co-caret" />
              </button>
              {isOpen && <Detail info={i} onJump={jump} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
