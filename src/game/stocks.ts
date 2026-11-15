export type Region = 'KR' | 'US' | 'ETF';

/** 업종: 거시 변수 민감도 + 연관 업종 */
export interface SectorDef {
  id: string;
  name: string;
  emoji: string;
  region: Region;
  /** 시장 전체 흐름에 대한 민감도 */
  beta: number;
  /** 금리 1%p 변화당 수익률 (국내 업종은 한국 금리, 미국 업종은 미국 금리) */
  rate: number;
  /** 환율(원/달러) 1% 변화당 수익률 — 미국 주식은 별도로 원화 환산 효과가 붙음 */
  fx: number;
  /** 유가 1% 변화당 수익률 */
  oil: number;
  /** 업종 자체 일간 변동성 */
  vol: number;
  /** 이 업종에 뉴스가 나면 함께 움직이는 업종과 비율 (음수 = 반대로) */
  links: Record<string, number>;
}

export const SECTORS: SectorDef[] = [
  { id: 'semi', name: '반도체', emoji: '🔲', region: 'KR', beta: 1.2, rate: -0.06, fx: 0.5, oil: 0, vol: 0.012, links: { it: 0.4, auto: 0.2, battery: 0.15, us_semi: 0.2 } },
  { id: 'it', name: 'IT·플랫폼', emoji: '💻', region: 'KR', beta: 1.1, rate: -0.12, fx: 0.1, oil: 0, vol: 0.011, links: { ent: 0.25, semi: 0.2, crypto: 0.15 } },
  { id: 'battery', name: '2차전지', emoji: '🔋', region: 'KR', beta: 1.3, rate: -0.1, fx: 0.2, oil: 0.1, vol: 0.016, links: { auto: 0.4, semi: 0.1, us_ev: 0.2 } },
  { id: 'auto', name: '자동차', emoji: '🚗', region: 'KR', beta: 1.0, rate: -0.04, fx: 0.6, oil: -0.08, vol: 0.01, links: { battery: 0.35, semi: 0.1 } },
  { id: 'bio', name: '바이오', emoji: '🧬', region: 'KR', beta: 0.9, rate: -0.14, fx: 0, oil: 0, vol: 0.016, links: {} },
  { id: 'energy', name: '에너지·정유', emoji: '🛢️', region: 'KR', beta: 0.8, rate: 0, fx: 0.1, oil: 0.5, vol: 0.011, links: { air: -0.3 } },
  { id: 'air', name: '항공·여행', emoji: '✈️', region: 'KR', beta: 1.0, rate: -0.03, fx: -0.6, oil: -0.4, vol: 0.012, links: { food: 0.1 } },
  { id: 'ent', name: '게임·엔터', emoji: '🎮', region: 'KR', beta: 1.0, rate: -0.06, fx: 0.1, oil: 0, vol: 0.014, links: { it: 0.15 } },
  { id: 'food', name: '식품·유통', emoji: '🛒', region: 'KR', beta: 0.5, rate: -0.02, fx: -0.3, oil: -0.1, vol: 0.006, links: {} },
  { id: 'bank', name: '금융', emoji: '🏦', region: 'KR', beta: 0.8, rate: 0.1, fx: 0, oil: 0, vol: 0.008, links: { build: 0.2 } },
  { id: 'build', name: '건설·부동산', emoji: '🏗️', region: 'KR', beta: 0.9, rate: -0.1, fx: 0, oil: -0.05, vol: 0.011, links: { bank: 0.2 } },
  { id: 'crypto', name: '블록체인', emoji: '🪙', region: 'KR', beta: 1.6, rate: -0.2, fx: 0, oil: 0, vol: 0.03, links: { it: 0.1 } },

  { id: 'us_tech', name: '미국 빅테크', emoji: '🗽', region: 'US', beta: 1.1, rate: -0.12, fx: 0, oil: 0, vol: 0.011, links: { it: 0.3, us_semi: 0.3 } },
  { id: 'us_semi', name: '미국 반도체', emoji: '🧠', region: 'US', beta: 1.4, rate: -0.08, fx: 0, oil: 0, vol: 0.016, links: { semi: 0.45, us_tech: 0.2 } },
  { id: 'us_ev', name: '미국 전기차', emoji: '⚡', region: 'US', beta: 1.5, rate: -0.12, fx: 0, oil: 0.15, vol: 0.022, links: { battery: 0.4, auto: 0.1 } },
  { id: 'us_cons', name: '미국 소비재', emoji: '🥤', region: 'US', beta: 0.6, rate: -0.03, fx: 0, oil: -0.05, vol: 0.007, links: {} },

  { id: 'etf', name: 'ETF', emoji: '🧺', region: 'ETF', beta: 0, rate: 0, fx: 0, oil: 0, vol: 0, links: {} },
];
export const SECTOR_MAP: Record<string, SectorDef> = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
/** 실제 종목이 있는 업종 (ETF 제외) */
export const STOCK_SECTORS = SECTORS.filter((s) => s.region !== 'ETF');

export type Risk = 1 | 2 | 3;

export interface EtfDef {
  /** 따라가는 대상: 종목 바스켓, 지수, 유가, 환율 */
  track: { type: 'basket'; symbols: string[] } | { type: 'index'; region: 'KR' | 'US' } | { type: 'oil' } | { type: 'fx' };
  /** 배율: 2 = 하루 수익률 2배, -1 = 반대로 */
  lev: number;
  group: '지수' | '레버리지·인버스' | '테마' | '원자재·환율';
}

export interface StockDef {
  symbol: string;
  name: string;
  sector: string;
  /** KRW 종목은 원, USD 종목은 달러 */
  currency: 'KRW' | 'USD';
  basePrice: number;
  /** 종목 고유 일간 변동성 */
  vol: number;
  drift: number;
  /** 업종 흐름을 얼마나 강하게 따르는지 */
  sectorBeta: number;
  desc: string;
  etf?: EtfDef;
}

const KR = (symbol: string, name: string, sector: string, basePrice: number, vol: number, drift: number, sectorBeta: number, desc: string): StockDef => ({
  symbol,
  name,
  sector,
  currency: 'KRW',
  basePrice,
  vol,
  drift,
  sectorBeta,
  desc,
});
const US = (symbol: string, name: string, sector: string, basePrice: number, vol: number, drift: number, sectorBeta: number, desc: string): StockDef => ({
  ...KR(symbol, name, sector, basePrice, vol, drift, sectorBeta, desc),
  currency: 'USD',
});
const ETF = (symbol: string, name: string, etf: EtfDef, desc: string): StockDef => ({
  symbol,
  name,
  sector: 'etf',
  currency: 'KRW',
  basePrice: 10000,
  vol: 0,
  drift: 0,
  sectorBeta: 0,
  desc,
  etf,
});

export const STOCKS: StockDef[] = [
  KR('CORE', '코어반도체', 'semi', 88000, 0.016, 0.0015, 1.1, '메모리 반도체 세계 2위. 업황에 따라 크게 움직이는 대장주'),
  KR('NANO', '나노칩스', 'semi', 34000, 0.024, 0.001, 1.0, 'AI 서버용 칩 설계 전문. 성장성이 높지만 변동이 큼'),
  KR('WAFR', '한결소재', 'semi', 12500, 0.02, 0.0005, 0.8, '반도체 웨이퍼·소재 공급사. 대형 고객사 주문에 좌우됨'),
  KR('NEOT', '네오테크', 'it', 52000, 0.016, 0.0012, 1.0, '국내 1위 검색·메신저 플랫폼. 광고와 커머스로 돈을 벎'),
  KR('CLOD', '구름클라우드', 'it', 27000, 0.022, 0.0015, 1.1, '기업용 클라우드·AI 서비스. 금리에 민감한 성장주'),
  KR('PAYS', '페이링크', 'it', 18000, 0.022, 0.0005, 0.9, '간편결제·핀테크 서비스. 규제 뉴스에 출렁임'),
  KR('VOLT', '볼트에너지솔루션', 'battery', 61000, 0.022, 0.001, 1.1, '전기차 배터리 셀 제조사. 완성차 판매량과 함께 움직임'),
  KR('LITH', '리튬코리아', 'battery', 23000, 0.03, 0.0, 1.2, '배터리 원료(리튬) 가공. 원자재 가격 따라 급등락'),
  KR('HDMR', '한빛모터스', 'auto', 74000, 0.014, 0.001, 1.0, '국내 최대 완성차. 수출 비중이 커서 환율이 오르면 유리'),
  KR('PART', '대성부품', 'auto', 15500, 0.018, 0.0005, 0.9, '자동차 부품 납품사. 완성차 실적을 따라감'),
  KR('HBIO', '한빛바이오', 'bio', 38000, 0.03, 0.0, 0.9, '항암 신약 개발사. 임상 결과 하나로 급등·급락'),
  KR('GENE', '진메디', 'bio', 21000, 0.034, 0.0, 0.8, '유전자 치료제 벤처. 고위험 고수익'),
  KR('CARE', '케어제약', 'bio', 47000, 0.012, 0.0008, 0.6, '감기약·영양제로 꾸준히 버는 전통 제약사'),
  KR('SUNE', '썬에너지', 'energy', 21000, 0.018, 0.0008, 0.9, '태양광·풍력 발전. 정부 정책 수혜주'),
  KR('OILK', 'K정유', 'energy', 56000, 0.014, 0.0006, 1.1, '정유사. 국제 유가가 오르면 이익도 늘어남'),
  KR('SKYA', '스카이항공', 'air', 19000, 0.018, 0.0004, 1.1, '대형 항공사. 유가·환율이 오르면 비용 부담'),
  KR('TRVL', '여행가자', 'air', 9500, 0.022, 0.0004, 1.0, '여행 플랫폼. 해외여행 수요와 환율에 민감'),
  KR('PIXL', '픽셀게임즈', 'ent', 64000, 0.022, 0.0008, 1.0, '모바일 RPG 개발사. 신작 흥행 여부가 관건'),
  KR('STAR', '스타엔터', 'ent', 27000, 0.024, 0.0004, 1.0, 'K팝 기획사. 소속 그룹의 컴백·논란에 따라 출렁임'),
  KR('MOVI', '시네마월드', 'ent', 11000, 0.018, 0.0003, 0.8, '영화 제작·극장 체인'),
  KR('MLKY', '밀키푸드', 'food', 15000, 0.009, 0.0006, 1.0, '우유·과자 제조. 경기와 상관없이 안정적'),
  KR('MART', '한빛마트', 'food', 33000, 0.011, 0.0005, 1.0, '대형마트·편의점 체인. 소비 경기에 영향'),
  KR('RAMN', '보글라면', 'food', 41000, 0.012, 0.0008, 0.9, '라면 수출 1위. K-푸드 인기 수혜'),
  KR('KBNK', '국민든든은행', 'bank', 58000, 0.01, 0.0006, 1.0, '시중 은행. 금리가 오르면 이자 이익 증가'),
  KR('SECU', '미래증권', 'bank', 9800, 0.016, 0.0005, 1.2, '증권사. 주식시장이 뜨거우면 수수료 수입 증가'),
  KR('BILD', '대한건설', 'build', 31000, 0.015, 0.0003, 1.0, '아파트·인프라 건설. 금리 인하와 부동산 정책 수혜'),
  KR('HOME', '스마트홈리츠', 'build', 5200, 0.01, 0.0004, 0.8, '임대 부동산 투자회사. 금리에 민감'),
  KR('BLOK', '블록체인랩', 'crypto', 9000, 0.04, -0.0005, 1.0, '코인 거래소 운영사. 코인 가격 따라 롤러코스터'),
  KR('MINE', '코인마이닝', 'crypto', 4300, 0.05, -0.001, 1.2, '가상화폐 채굴 기업. 최고 위험 종목'),

  US('NXRA', '넥소라', 'us_tech', 185, 0.014, 0.0012, 1.0, '세계 최대 스마트폰·앱 생태계 기업. 미국 대표 우량주'),
  US('QNTX', '퀀틱스', 'us_tech', 410, 0.018, 0.0015, 1.1, '클라우드·AI 소프트웨어 공룡. 미국 금리에 민감'),
  US('STRM', '스트림리', 'us_tech', 95, 0.022, 0.0008, 1.0, '글로벌 동영상 스트리밍. 구독자 수 발표에 출렁임'),
  US('HYPR', '하이페리온칩스', 'us_semi', 120, 0.026, 0.002, 1.1, 'AI용 GPU 1위. 한국 반도체 업종과 함께 움직임'),
  US('ORBT', '오르빗세미', 'us_semi', 68, 0.022, 0.001, 0.9, '모바일·자동차용 칩 설계'),
  US('VOLA', '볼타라모터스', 'us_ev', 240, 0.032, 0.0005, 1.0, '미국 전기차 1위. 한국 2차전지와 연관이 큼'),
  US('MEGA', '메가마트US', 'us_cons', 150, 0.01, 0.0006, 1.0, '미국 최대 유통 체인. 경기 방어주'),
  US('FIZZ', '피즈콜라', 'us_cons', 62, 0.008, 0.0005, 0.9, '세계적인 음료 회사. 꾸준한 배당'),

  ETF('KIDX', 'K종합지수 ETF', { track: { type: 'index', region: 'KR' }, lev: 1, group: '지수' }, '국내 종합지수를 그대로 따라가요. 국내 시장 전체에 나눠 투자하는 효과'),
  ETF('U500', '미국대형주 ETF', { track: { type: 'index', region: 'US' }, lev: 1, group: '지수' }, '미국 대표 종목 지수를 따라가요. 달러로 투자해서 환율이 오르면 추가 이익'),
  ETF('KLEV', 'K레버리지 2X', { track: { type: 'index', region: 'KR' }, lev: 2, group: '레버리지·인버스' }, '국내 종합지수 하루 수익률의 2배. 오르면 2배로 벌고, 내리면 2배로 잃어요'),
  ETF('KINV', 'K인버스', { track: { type: 'index', region: 'KR' }, lev: -1, group: '레버리지·인버스' }, '국내 종합지수와 반대로 움직여요. 시장이 떨어질 것 같을 때'),
  ETF('UTEC', '미국테크 2X', { track: { type: 'basket', symbols: ['NXRA', 'QNTX', 'STRM', 'HYPR', 'ORBT'] }, lev: 2, group: '레버리지·인버스' }, '미국 빅테크·반도체 하루 수익률의 2배'),
  ETF('SEMI', '글로벌반도체 ETF', { track: { type: 'basket', symbols: ['CORE', 'NANO', 'WAFR', 'HYPR', 'ORBT'] }, lev: 1, group: '테마' }, '한국·미국 반도체 회사에 한 번에 투자'),
  ETF('BATT', '2차전지 ETF', { track: { type: 'basket', symbols: ['VOLT', 'LITH', 'VOLA'] }, lev: 1, group: '테마' }, '배터리·전기차 회사 묶음'),
  ETF('DIVK', '고배당 ETF', { track: { type: 'basket', symbols: ['KBNK', 'MLKY', 'RAMN', 'OILK', 'FIZZ', 'MEGA'] }, lev: 1, group: '테마' }, '은행·식품·정유 같은 꾸준한 회사 묶음. 잘 안 흔들려요'),
  ETF('OILX', '원유선물 ETF', { track: { type: 'oil' }, lev: 1, group: '원자재·환율' }, '국제 유가를 따라가요. 중동 뉴스에 민감'),
  ETF('USDX', '달러 ETF', { track: { type: 'fx' }, lev: 1, group: '원자재·환율' }, '원/달러 환율을 따라가요. 환율이 오르면 이익'),
];

export const STOCK_MAP: Record<string, StockDef> = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));
/** 개별 기업 (ETF 제외) */
export const COMPANIES = STOCKS.filter((s) => !s.etf);
export const regionOf = (s: StockDef): Region => SECTOR_MAP[s.sector].region;

/** 종목 위험도 1(안정)~3(고위험) */
export function riskOf(s: StockDef): Risk {
  if (s.etf) {
    const e = s.etf;
    if (Math.abs(e.lev) >= 2 || e.track.type === 'oil') return 3;
    if (e.track.type === 'basket' && e.group === '테마' && s.symbol !== 'DIVK') return 2;
    return 1;
  }
  const sec = SECTOR_MAP[s.sector];
  const total = Math.sqrt(s.vol ** 2 + (sec.vol * s.sectorBeta) ** 2);
  return total < 0.016 ? 1 : total < 0.026 ? 2 : 3;
}
export const RISK_LABEL: Record<Risk, string> = { 1: '안정형', 2: '보통', 3: '고위험' };

/** ETF 가 담고 있는 기업들 (뉴스 연관 표시용) */
export function etfMembers(e: EtfDef): string[] {
  if (e.track.type === 'basket') return e.track.symbols;
  if (e.track.type === 'index') {
    const region = e.track.region;
    return COMPANIES.filter((c) => SECTOR_MAP[c.sector].region === region).map((c) => c.symbol);
  }
  return [];
}
