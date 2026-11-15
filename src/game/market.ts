import { gaussian, mulberry32, pick, range } from '../lib/rng';
import { MARKET_BAD, MARKET_GOOD, stockHeadlines } from './news';
import { STOCKS } from './stocks';

/** 하루를 몇 개 틱(가격 변동)으로 나눌지 */
export const TICKS_PER_DAY = 5;

export interface NewsEvent {
  day: number;
  /** 종목 심볼, 시장 전체면 null */
  symbol: string | null;
  headline: string;
  rumor: boolean;
  /** 화면 표시용 호재/악재 (루머는 실제와 다를 수 있음) */
  tone: 'good' | 'bad';
}

export interface Market {
  seed: number;
  totalDays: number;
  totalTicks: number;
  /** prices[symbol][tick], tick = 0..totalTicks */
  prices: Record<string, number[]>;
  news: NewsEvent[];
}

function roundPrice(p: number): number {
  const unit = p >= 50000 ? 100 : p >= 5000 ? 10 : 5;
  return Math.max(unit, Math.round(p / unit) * unit);
}

/** 순수 함수: 같은 (seed, totalDays)면 항상 같은 시장 */
export function generateMarket(seed: number, totalDays: number): Market {
  const rng = mulberry32(seed);
  const totalTicks = totalDays * TICKS_PER_DAY;

  // 1) 뉴스 이벤트와 그날의 실제 충격(로그수익률)
  const news: NewsEvent[] = [];
  const shock: Record<string, number>[] = Array.from({ length: totalDays }, () => ({}));
  const addShock = (day: number, sym: string, v: number) => {
    shock[day][sym] = (shock[day][sym] ?? 0) + v;
  };

  for (let day = 1; day < totalDays; day++) {
    const count = rng() < 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (rng() < 0.18) {
        const good = rng() < 0.5;
        const mag = range(rng, 0.02, 0.05) * (good ? 1 : -1);
        news.push({ day, symbol: null, headline: pick(rng, good ? MARKET_GOOD : MARKET_BAD), rumor: false, tone: good ? 'good' : 'bad' });
        for (const s of STOCKS) addShock(day, s.symbol, mag * (s.vol / 0.03) * range(rng, 0.6, 1.3));
      } else {
        const s = pick(rng, STOCKS);
        const good = rng() < 0.5;
        const rumor = rng() < 0.25;
        // 루머는 40% 확률로 반대로 움직인다
        const realGood = rumor ? (rng() < 0.6 ? good : !good) : good;
        const mag = range(rng, 0.04, 0.14) * (rumor ? 0.7 : 1) * Math.sqrt(s.vol / 0.03);
        const headline = pick(rng, stockHeadlines(s.sector, good)).replace('{name}', s.name);
        news.push({ day, symbol: s.symbol, headline: (rumor ? '[루머] ' : '') + headline, rumor, tone: good ? 'good' : 'bad' });
        addShock(day, s.symbol, realGood ? mag : -mag);
      }
    }
  }

  // 2) 가격 경로: 틱 단위 GBM + 그날 뉴스 충격(뉴스 직후에 크게 반영)
  const prices: Record<string, number[]> = {};
  const shockWeights = [0.4, 0.25, 0.15, 0.12, 0.08];
  for (const s of STOCKS) {
    const path = [roundPrice(s.basePrice * range(rng, 0.9, 1.1))];
    let p = path[0];
    const sigma = s.vol / Math.sqrt(TICKS_PER_DAY);
    for (let t = 0; t < totalTicks; t++) {
      const day = Math.floor(t / TICKS_PER_DAY);
      const k = t % TICKS_PER_DAY;
      let lr = s.drift / TICKS_PER_DAY + sigma * gaussian(rng);
      lr += (shock[day][s.symbol] ?? 0) * shockWeights[k];
      p = Math.max(s.basePrice * 0.05, p * Math.exp(lr));
      path.push(roundPrice(p));
    }
    prices[s.symbol] = path;
  }

  return { seed, totalDays, totalTicks, prices, news };
}
