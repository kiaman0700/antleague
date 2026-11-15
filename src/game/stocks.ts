/** 업종: 거시 변수 민감도 + 연관 업종 */
export interface SectorDef {
  id: string;
  name: string;
  emoji: string;
  /** 시장 전체 흐름에 대한 민감도 */
  beta: number;
  /** 금리 1%p 변화당 수익률 */
  rate: number;
  /** 환율(원/달러) 1% 변화당 수익률 */
  fx: number;
  /** 유가 1% 변화당 수익률 */
  oil: number;
  /** 업종 자체 일간 변동성 */
  vol: number;
  /** 이 업종에 뉴스가 나면 함께 움직이는 업종과 비율 */
  links: Record<string, number>;
}

export const SECTORS: SectorDef[] = [
  { id: 'semi', name: '반도체', emoji: '🔲', beta: 1.2, rate: -0.06, fx: 0.5, oil: 0, vol: 0.012, links: { it: 0.4, auto: 0.2, battery: 0.15 } },
  { id: 'it', name: 'IT·플랫폼', emoji: '💻', beta: 1.1, rate: -0.12, fx: 0.1, oil: 0, vol: 0.011, links: { ent: 0.25, semi: 0.2, crypto: 0.15 } },
  { id: 'battery', name: '2차전지', emoji: '🔋', beta: 1.3, rate: -0.1, fx: 0.2, oil: 0.1, vol: 0.016, links: { auto: 0.4, semi: 0.1 } },
  { id: 'auto', name: '자동차', emoji: '🚗', beta: 1.0, rate: -0.04, fx: 0.6, oil: -0.08, vol: 0.01, links: { battery: 0.35, semi: 0.1 } },
  { id: 'bio', name: '바이오', emoji: '🧬', beta: 0.9, rate: -0.14, fx: 0, oil: 0, vol: 0.016, links: {} },
  { id: 'energy', name: '에너지·정유', emoji: '🛢️', beta: 0.8, rate: 0, fx: 0.1, oil: 0.5, vol: 0.011, links: { air: -0.3 } },
  { id: 'air', name: '항공·여행', emoji: '✈️', beta: 1.0, rate: -0.03, fx: -0.6, oil: -0.4, vol: 0.012, links: { food: 0.1 } },
  { id: 'ent', name: '게임·엔터', emoji: '🎮', beta: 1.0, rate: -0.06, fx: 0.1, oil: 0, vol: 0.014, links: { it: 0.15 } },
  { id: 'food', name: '식품·유통', emoji: '🛒', beta: 0.5, rate: -0.02, fx: -0.3, oil: -0.1, vol: 0.006, links: {} },
  { id: 'bank', name: '금융', emoji: '🏦', beta: 0.8, rate: 0.1, fx: 0, oil: 0, vol: 0.008, links: { build: 0.2 } },
  { id: 'build', name: '건설·부동산', emoji: '🏗️', beta: 0.9, rate: -0.1, fx: 0, oil: -0.05, vol: 0.011, links: { bank: 0.2 } },
  { id: 'crypto', name: '블록체인', emoji: '🪙', beta: 1.6, rate: -0.2, fx: 0, oil: 0, vol: 0.03, links: { it: 0.1 } },
];
export const SECTOR_MAP: Record<string, SectorDef> = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

export type Risk = 1 | 2 | 3;

export interface StockDef {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
  /** 종목 고유 일간 변동성 */
  vol: number;
  /** 일간 기대수익(드리프트) */
  drift: number;
  /** 업종 대장주일수록 업종 흐름을 강하게 따름 */
  sectorBeta: number;
  desc: string;
}

export const STOCKS: StockDef[] = [
  { symbol: 'CORE', name: '코어반도체', sector: 'semi', basePrice: 88000, vol: 0.016, drift: 0.0015, sectorBeta: 1.1, desc: '메모리 반도체 세계 2위. 업황에 따라 크게 움직이는 대장주' },
  { symbol: 'NANO', name: '나노칩스', sector: 'semi', basePrice: 34000, vol: 0.024, drift: 0.001, sectorBeta: 1.0, desc: 'AI 서버용 칩 설계 전문. 성장성이 높지만 변동이 큼' },
  { symbol: 'WAFR', name: '한결소재', sector: 'semi', basePrice: 12500, vol: 0.02, drift: 0.0005, sectorBeta: 0.8, desc: '반도체 웨이퍼·소재 공급사. 대형 고객사 주문에 좌우됨' },

  { symbol: 'NEOT', name: '네오테크', sector: 'it', basePrice: 52000, vol: 0.016, drift: 0.0012, sectorBeta: 1.0, desc: '국내 1위 검색·메신저 플랫폼. 광고와 커머스로 돈을 벎' },
  { symbol: 'CLOD', name: '구름클라우드', sector: 'it', basePrice: 27000, vol: 0.022, drift: 0.0015, sectorBeta: 1.1, desc: '기업용 클라우드·AI 서비스. 금리에 민감한 성장주' },
  { symbol: 'PAYS', name: '페이링크', sector: 'it', basePrice: 18000, vol: 0.022, drift: 0.0005, sectorBeta: 0.9, desc: '간편결제·핀테크 서비스. 규제 뉴스에 출렁임' },

  { symbol: 'VOLT', name: '볼트에너지솔루션', sector: 'battery', basePrice: 61000, vol: 0.022, drift: 0.001, sectorBeta: 1.1, desc: '전기차 배터리 셀 제조사. 완성차 판매량과 함께 움직임' },
  { symbol: 'LITH', name: '리튬코리아', sector: 'battery', basePrice: 23000, vol: 0.03, drift: 0.0, sectorBeta: 1.2, desc: '배터리 원료(리튬) 가공. 원자재 가격 따라 급등락' },

  { symbol: 'HDMR', name: '한빛모터스', sector: 'auto', basePrice: 74000, vol: 0.014, drift: 0.001, sectorBeta: 1.0, desc: '국내 최대 완성차. 수출 비중이 커서 환율이 오르면 유리' },
  { symbol: 'PART', name: '대성부품', sector: 'auto', basePrice: 15500, vol: 0.018, drift: 0.0005, sectorBeta: 0.9, desc: '자동차 부품 납품사. 완성차 실적을 따라감' },

  { symbol: 'HBIO', name: '한빛바이오', sector: 'bio', basePrice: 38000, vol: 0.03, drift: 0.0, sectorBeta: 0.9, desc: '항암 신약 개발사. 임상 결과 하나로 급등·급락' },
  { symbol: 'GENE', name: '진메디', sector: 'bio', basePrice: 21000, vol: 0.034, drift: 0.0, sectorBeta: 0.8, desc: '유전자 치료제 벤처. 고위험 고수익' },
  { symbol: 'CARE', name: '케어제약', sector: 'bio', basePrice: 47000, vol: 0.012, drift: 0.0008, sectorBeta: 0.6, desc: '감기약·영양제로 꾸준히 버는 전통 제약사' },

  { symbol: 'SUNE', name: '썬에너지', sector: 'energy', basePrice: 21000, vol: 0.018, drift: 0.0008, sectorBeta: 0.9, desc: '태양광·풍력 발전. 정부 정책 수혜주' },
  { symbol: 'OILK', name: 'K정유', sector: 'energy', basePrice: 56000, vol: 0.014, drift: 0.0006, sectorBeta: 1.1, desc: '정유사. 국제 유가가 오르면 이익도 늘어남' },

  { symbol: 'SKYA', name: '스카이항공', sector: 'air', basePrice: 19000, vol: 0.018, drift: 0.0004, sectorBeta: 1.1, desc: '대형 항공사. 유가·환율이 오르면 비용 부담' },
  { symbol: 'TRVL', name: '여행가자', sector: 'air', basePrice: 9500, vol: 0.022, drift: 0.0004, sectorBeta: 1.0, desc: '여행 플랫폼. 해외여행 수요와 환율에 민감' },

  { symbol: 'PIXL', name: '픽셀게임즈', sector: 'ent', basePrice: 64000, vol: 0.022, drift: 0.0008, sectorBeta: 1.0, desc: '모바일 RPG 개발사. 신작 흥행 여부가 관건' },
  { symbol: 'STAR', name: '스타엔터', sector: 'ent', basePrice: 27000, vol: 0.024, drift: 0.0004, sectorBeta: 1.0, desc: 'K팝 기획사. 소속 그룹의 컴백·논란에 따라 출렁임' },
  { symbol: 'MOVI', name: '시네마월드', sector: 'ent', basePrice: 11000, vol: 0.018, drift: 0.0003, sectorBeta: 0.8, desc: '영화 제작·극장 체인' },

  { symbol: 'MLKY', name: '밀키푸드', sector: 'food', basePrice: 15000, vol: 0.009, drift: 0.0006, sectorBeta: 1.0, desc: '우유·과자 제조. 경기와 상관없이 안정적' },
  { symbol: 'MART', name: '한빛마트', sector: 'food', basePrice: 33000, vol: 0.011, drift: 0.0005, sectorBeta: 1.0, desc: '대형마트·편의점 체인. 소비 경기에 영향' },
  { symbol: 'RAMN', name: '보글라면', sector: 'food', basePrice: 41000, vol: 0.012, drift: 0.0008, sectorBeta: 0.9, desc: '라면 수출 1위. K-푸드 인기 수혜' },

  { symbol: 'KBNK', name: '국민든든은행', sector: 'bank', basePrice: 58000, vol: 0.01, drift: 0.0006, sectorBeta: 1.0, desc: '시중 은행. 금리가 오르면 이자 이익 증가' },
  { symbol: 'SECU', name: '미래증권', sector: 'bank', basePrice: 9800, vol: 0.016, drift: 0.0005, sectorBeta: 1.2, desc: '증권사. 주식시장이 뜨거우면 수수료 수입 증가' },

  { symbol: 'BILD', name: '대한건설', sector: 'build', basePrice: 31000, vol: 0.015, drift: 0.0003, sectorBeta: 1.0, desc: '아파트·인프라 건설. 금리 인하와 부동산 정책 수혜' },
  { symbol: 'HOME', name: '스마트홈리츠', sector: 'build', basePrice: 5200, vol: 0.01, drift: 0.0004, sectorBeta: 0.8, desc: '임대 부동산 투자회사. 금리에 민감' },

  { symbol: 'BLOK', name: '블록체인랩', sector: 'crypto', basePrice: 9000, vol: 0.04, drift: -0.0005, sectorBeta: 1.0, desc: '코인 거래소 운영사. 코인 가격 따라 롤러코스터' },
  { symbol: 'MINE', name: '코인마이닝', sector: 'crypto', basePrice: 4300, vol: 0.05, drift: -0.001, sectorBeta: 1.2, desc: '가상화폐 채굴 기업. 최고 위험 종목' },
];

export const STOCK_MAP: Record<string, StockDef> = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));

/** 종목 위험도 1(안정)~3(고위험) */
export function riskOf(s: StockDef): Risk {
  const sec = SECTOR_MAP[s.sector];
  const total = Math.sqrt(s.vol ** 2 + (sec.vol * s.sectorBeta) ** 2);
  return total < 0.016 ? 1 : total < 0.026 ? 2 : 3;
}
export const RISK_LABEL: Record<Risk, string> = { 1: '안정형', 2: '보통', 3: '고위험' };
