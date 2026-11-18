import { prevClose, prevCloseUsd, priceAt, usdAt, type Market } from './market';

export interface Quote {
  /** 원화 가격 (거래·평가 기준) */
  krw: number;
  /** 미국 주식이면 달러 가격 */
  usd: number | null;
  /** 전일 대비 (미국 주식은 달러 기준) */
  ch: number;
}

export function quote(m: Market, symbol: string, day: number, closed: boolean): Quote {
  const krw = priceAt(m, symbol, day, closed);
  const usd = usdAt(m, symbol, day, closed);
  const prev = usd !== null ? prevCloseUsd(m, symbol, day)! : prevClose(m, symbol, day);
  return { krw, usd, ch: (usd ?? krw) / prev - 1 };
}

export { fmtUsd } from './fmtUsd';
