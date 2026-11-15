export interface StockDef {
  symbol: string;
  name: string;
  sector: string;
  emoji: string;
  basePrice: number;
  /** 일간 로그수익률 변동성 */
  vol: number;
  /** 일간 기대 수익률(드리프트) */
  drift: number;
}

export const STOCKS: StockDef[] = [
  { symbol: 'NEOT', name: '네오테크', sector: 'IT', emoji: '💻', basePrice: 52000, vol: 0.025, drift: 0.002 },
  { symbol: 'HBIO', name: '한빛바이오', sector: '바이오', emoji: '🧬', basePrice: 38000, vol: 0.045, drift: 0.0 },
  { symbol: 'SUNE', name: '썬에너지', sector: '에너지', emoji: '☀️', basePrice: 21000, vol: 0.03, drift: 0.001 },
  { symbol: 'PIXL', name: '픽셀게임즈', sector: '게임', emoji: '🎮', basePrice: 64000, vol: 0.035, drift: 0.001 },
  { symbol: 'MLKY', name: '밀키푸드', sector: '식품', emoji: '🥛', basePrice: 15000, vol: 0.012, drift: 0.001 },
  { symbol: 'CORE', name: '코어반도체', sector: '반도체', emoji: '🔲', basePrice: 88000, vol: 0.028, drift: 0.002 },
  { symbol: 'STAR', name: '스타엔터', sector: '엔터', emoji: '🎤', basePrice: 27000, vol: 0.04, drift: 0.0 },
  { symbol: 'BLOK', name: '블록체인랩', sector: '블록체인', emoji: '🪙', basePrice: 9000, vol: 0.07, drift: -0.001 },
];

export const STOCK_MAP: Record<string, StockDef> = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));
