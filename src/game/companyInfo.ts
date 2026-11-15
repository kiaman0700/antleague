/** 기업 도감·종목 상세에서 함께 쓰는 회사 설명 (쉬운 말) */
import { DIVIDEND_PAYERS } from './market';
import { CAP_WEIGHT, COMPANY_LINKS, etfMembers, riskOf, RISK_LABEL, SECTOR_MAP, STOCK_MAP, STOCKS, type StockDef } from './stocks';

export interface CompanyInfo {
  def: StockDef;
  region: '국내' | '미국' | 'ETF';
  risk: string;
  /** 금리·환율·유가가 움직일 때 */
  macro: { label: string; dir: 'up' | 'down' }[];
  /** 같이 오르내리는 업종 / 반대로 움직이는 업종 */
  together: string[];
  opposite: string[];
  /** 회사끼리 연결 (공급망·고객사, 새 방부터) */
  supply: { name: string; symbol: string; w: number }[];
  /** 이 회사에 영향을 주는 회사 */
  affectedBy: { name: string; symbol: string }[];
  /** 지수에서 차지하는 크기 */
  size: '대형주' | '중형주' | '소형주' | null;
  dividend: boolean;
  /** 이 종목을 담은 ETF */
  inEtfs: string[];
  /** ETF 라면 무엇을 따라가는지 */
  etf: { what: string; lev: number; members: string[] } | null;
}

export function companyInfo(symbol: string): CompanyInfo {
  const def = STOCK_MAP[symbol];
  const sec = SECTOR_MAP[def.sector];
  const isUS = def.currency === 'USD';
  const macro: CompanyInfo['macro'] = [];
  if (!def.etf) {
    if (sec.rate <= -0.08) macro.push({ label: `${isUS ? '미국 ' : ''}금리가 내리면`, dir: 'up' });
    else if (sec.rate >= 0.08) macro.push({ label: '금리가 오르면', dir: 'up' });
    if (isUS) macro.push({ label: '환율(원·달러)이 오르면 원화 기준 가격', dir: 'up' });
    else if (sec.fx >= 0.4) macro.push({ label: '환율이 오르면 (수출에 유리)', dir: 'up' });
    else if (sec.fx <= -0.3) macro.push({ label: '환율이 오르면', dir: 'down' });
    if (sec.oil >= 0.3) macro.push({ label: '유가가 오르면', dir: 'up' });
    else if (sec.oil <= -0.3) macro.push({ label: '유가가 오르면 (비용 증가)', dir: 'down' });
  }
  const together = Object.entries(sec.links).filter(([, w]) => w > 0).map(([id]) => SECTOR_MAP[id].name);
  const opposite = Object.entries(sec.links).filter(([, w]) => w < 0).map(([id]) => SECTOR_MAP[id].name);
  const supply = Object.entries(COMPANY_LINKS[symbol] ?? {}).map(([sym, w]) => ({ name: STOCK_MAP[sym].name, symbol: sym, w }));
  const affectedBy = Object.entries(COMPANY_LINKS)
    .filter(([, links]) => symbol in links)
    .map(([sym]) => ({ name: STOCK_MAP[sym].name, symbol: sym }));
  const cap = CAP_WEIGHT[symbol];
  const size = def.etf ? null : cap >= 3 ? '대형주' : cap >= 1.5 ? '중형주' : '소형주';
  const inEtfs = STOCKS.filter((s) => s.etf && etfMembers(s.etf).includes(symbol)).map((s) => s.name);
  let etf: CompanyInfo['etf'] = null;
  if (def.etf) {
    const t = def.etf.track;
    const what = t.type === 'oil' ? '국제 유가' : t.type === 'fx' ? '원·달러 환율' : t.type === 'index' ? (t.region === 'KR' ? '국내 종합지수' : '미국 대형주 지수') : '여러 종목 묶음';
    etf = { what, lev: def.etf.lev, members: etfMembers(def.etf).map((m) => STOCK_MAP[m].name) };
  }
  return {
    def,
    region: def.etf ? 'ETF' : isUS ? '미국' : '국내',
    risk: RISK_LABEL[riskOf(def)],
    macro,
    together,
    opposite,
    supply,
    affectedBy,
    size,
    dividend: DIVIDEND_PAYERS.includes(symbol),
    inEtfs,
    etf,
  };
}
