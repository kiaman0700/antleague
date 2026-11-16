/**
 * (v12) 현실 같은 사건 흐름: 한 판에 2~4개, 며칠에 걸쳐 이어지는 종목 이야기.
 *   예) 바이오: "임상 3상 결과 ○일 발표 예정"(기대감) → 찌라시 → 발표 날 장중 속보로 성공(급등) / 실패(급락)
 * 결과는 판을 만들 때 서버가 정해 두지만, 발표 날 장중 속보 전에는 화면 데이터에 없음 (뉴스는 그날·공개 칸이 돼야 나감).
 * 난수는 가격과 다른 전용 흐름이라 예전 버전 방의 가격은 그대로.
 */
import { pick, range, type Rng } from '../lib/rng.js';
import { COMPANIES, type StockDef } from './stocks.js';

export interface StoryKind {
  id: string;
  /** 이 이야기가 생길 수 있는 업종 */
  sectors: string[];
  /** 결과 발표까지 걸리는 날 [최소, 최대] */
  wait: [number, number];
  /** 좋은 결과 확률 */
  pGood: number;
  /** 기대감(시작 날) 주가 반영 [최소, 최대] — 로그 수익률 */
  setup: [number, number];
  /** 결과 발표 날 반영 크기 [최소, 최대] (좋으면 +, 나쁘면 -) */
  result: [number, number];
  /** 시작 뉴스 */
  open: string[];
  /** 중간 찌라시 (진짜·가짜가 섞임) — good: 좋은 쪽 소문, bad: 나쁜 쪽 소문 */
  rumorGood: string[];
  rumorBad: string[];
  /** 결과 뉴스 */
  good: string[];
  bad: string[];
}

export const STORY_KINDS: StoryKind[] = [
  {
    id: 'trial',
    sectors: ['bio'],
    wait: [2, 4],
    pGood: 0.45,
    setup: [0.04, 0.09],
    result: [0.2, 0.3],
    open: ['{name}, 신약 임상 3상 결과 {d}일 뒤 발표 예정… 기대감 고조', '{name}, 항암 신약 임상 결과 발표 앞둬… "결과 따라 주가 요동 전망"', '{name}, 글로벌 학회서 임상 데이터 공개 예정'],
    rumorGood: ['"{name} 임상 결과 생각보다 좋다더라" 업계 소문 확산', '{name} 내부자 "임상 지표 모두 충족" 찌라시 돌아'],
    rumorBad: ['"{name} 임상 일부 지표 미달" 소문에 투자자 불안', '{name} 임상 부작용 보고됐다는 찌라시 확산'],
    good: ['{name}, 신약 임상 3상 성공… 1차 지표 모두 충족', '{name}, 임상 성공 발표에 매수 주문 폭주', '{name}, 글로벌 제약사와 기술수출 계약까지 성사'],
    bad: ['{name}, 신약 임상 3상 실패… 1차 지표 미달', '{name}, 임상 중단 결정… 투자자 충격', '{name}, 임상 결과 기대 못 미쳐… 매도 물량 쏟아져'],
  },
  {
    id: 'approval',
    sectors: ['bio'],
    wait: [2, 3],
    pGood: 0.55,
    setup: [0.03, 0.07],
    result: [0.15, 0.25],
    open: ['{name}, 신약 품목허가 심사 결과 이번 주 발표', '{name}, 해외 판매 허가 최종 단계 진입'],
    rumorGood: ['"{name} 허가 사실상 확정" 찌라시', '{name} 허가 앞두고 기관 매수 움직임 포착설'],
    rumorBad: ['"{name} 추가 자료 요청받았다" 소문', '{name} 허가 지연 가능성 제기'],
    good: ['{name}, 신약 품목허가 획득… 출시 확정', '{name}, 해외 판매 허가 받아… 매출 기대감 폭발'],
    bad: ['{name}, 품목허가 불발… 보완 요구 받아', '{name}, 허가 거절 통보… 주가 급락'],
  },
  {
    id: 'launch',
    sectors: ['ent'],
    wait: [2, 3],
    pGood: 0.5,
    setup: [0.03, 0.07],
    result: [0.1, 0.2],
    open: ['{name}, 기대작 신작 {d}일 뒤 정식 출시', '{name}, 대형 신작 사전예약 300만 돌파… 출시 임박', '{name} 소속 그룹, 컴백 앨범 발매 예정'],
    rumorGood: ['"{name} 신작 초반 반응 대박" 커뮤니티 소문', '{name} 신작 매출 순위 1위 확실시 찌라시'],
    rumorBad: ['"{name} 신작 서버 불안·과금 논란" 소문', '{name} 신작 초반 지표 기대 이하라는 찌라시'],
    good: ['{name} 신작, 출시 첫날 매출 1위… 흥행 돌풍', '{name}, 신작 대박에 실적 전망 상향'],
    bad: ['{name} 신작, 출시 초반 혹평 쏟아져', '{name}, 신작 부진에 실적 우려 확산'],
  },
  {
    id: 'deal',
    sectors: ['battery', 'auto', 'us_ev'],
    wait: [2, 4],
    pGood: 0.5,
    setup: [0.03, 0.06],
    result: [0.1, 0.18],
    open: ['{name}, 글로벌 완성차와 대형 공급 계약 막바지 협상', '{name}, 조 단위 수주 협상 중… 결과 곧 나올 듯'],
    rumorGood: ['"{name} 계약 서명만 남았다" 업계 소문', '{name} 수주 확정 임박 찌라시'],
    rumorBad: ['"{name} 단가 이견으로 협상 난항" 소문', '{name} 경쟁사에 수주 뺏겼다는 찌라시'],
    good: ['{name}, 조 단위 공급 계약 체결… 역대 최대', '{name}, 대형 수주 확정에 목표가 줄상향'],
    bad: ['{name}, 대형 수주 무산… 경쟁사에 밀려', '{name}, 공급 계약 협상 결렬'],
  },
  {
    id: 'bid',
    sectors: ['build', 'energy'],
    wait: [2, 3],
    pGood: 0.5,
    setup: [0.02, 0.05],
    result: [0.08, 0.15],
    open: ['{name}, 중동 대형 플랜트 수주전 최종 후보 올라', '{name}, 해외 대형 사업 입찰 결과 발표 앞둬'],
    rumorGood: ['"{name} 우선협상대상자 선정 유력" 소문', '{name} 수주 내정됐다는 찌라시'],
    rumorBad: ['"{name} 가격 경쟁에서 밀렸다" 소문', '{name} 입찰 탈락 가능성 찌라시'],
    good: ['{name}, 수조 원 해외 플랜트 수주 성공', '{name}, 대형 사업 최종 낙찰'],
    bad: ['{name}, 해외 수주전 탈락… 경쟁사 낙찰', '{name}, 대형 입찰서 고배'],
  },
  {
    id: 'listing',
    sectors: ['crypto'],
    wait: [1, 3],
    pGood: 0.45,
    setup: [0.06, 0.12],
    result: [0.2, 0.3],
    open: ['{name}, 해외 대형 거래소 상장 추진설… 투자자 관심 집중', '{name}, 신규 사업 인가 심사 결과 발표 앞둬'],
    rumorGood: ['"{name} 상장 확정 공지 곧 나온다" 찌라시', '{name} 거래소 측과 최종 합의설'],
    rumorBad: ['"{name} 상장 심사 보류" 소문', '{name} 규제 당국 조사설 돌아'],
    good: ['{name}, 해외 대형 거래소 상장 확정… 거래량 폭발', '{name}, 사업 인가 최종 승인'],
    bad: ['{name}, 거래소 상장 무산… 투자자 실망 매물', '{name}, 사업 인가 불허… 주가 급락'],
  },
  {
    id: 'product',
    sectors: ['semi', 'it', 'us_tech', 'us_semi'],
    wait: [2, 3],
    pGood: 0.55,
    setup: [0.02, 0.05],
    result: [0.06, 0.12],
    open: ['{name}, 차세대 신제품 {d}일 뒤 공개 예정', '{name}, 대형 행사서 신기술 발표 예고'],
    rumorGood: ['"{name} 신제품 성능 경쟁사 압도" 유출 소문', '{name} 대형 고객사 선주문 받았다는 찌라시'],
    rumorBad: ['"{name} 신제품 출시 연기" 소문', '{name} 신제품 수율 문제 찌라시'],
    good: ['{name}, 신제품 공개에 호평 쏟아져… 주문 폭주', '{name}, 신기술 발표에 "게임 체인저" 평가'],
    bad: ['{name}, 신제품 공개 후 "기대 이하" 혹평', '{name}, 신제품 결함 논란에 실망 매물'],
  },
  {
    id: 'merger',
    sectors: ['food', 'bank', 'us_cons', 'air'],
    wait: [2, 4],
    pGood: 0.5,
    setup: [0.03, 0.06],
    result: [0.08, 0.15],
    open: ['{name}, 대형 인수합병 추진설… 회사 측 "검토 중"', '{name}, 경영권 매각 협상 진행 중'],
    rumorGood: ['"{name} 인수 가격 프리미엄 크다" 소문', '{name} 인수 계약 서명 임박 찌라시'],
    rumorBad: ['"{name} 인수 협상 결렬 직전" 소문', '{name} 인수 측 자금 조달 난항 찌라시'],
    good: ['{name}, 인수합병 최종 확정… 프리미엄 붙어', '{name}, 경영권 매각 계약 체결'],
    bad: ['{name}, 인수합병 협상 결렬', '{name}, 매각 철회 발표에 실망 매물'],
  },
];

/** 같은 뉴스에도 업종마다 반응 크기가 다름 (바이오·코인은 크게, 식품·금융은 작게) */
export const SECTOR_NEWS_MULT: Record<string, number> = {
  bio: 2.0,
  crypto: 1.8,
  ent: 1.35,
  battery: 1.3,
  us_ev: 1.35,
  us_semi: 1.1,
  semi: 1.0,
  it: 1.0,
  us_tech: 0.9,
  build: 0.9,
  energy: 0.9,
  air: 0.95,
  auto: 0.85,
  food: 0.6,
  bank: 0.6,
  us_cons: 0.6,
};

export interface Story {
  kind: StoryKind;
  symbol: string;
  start: number;
  resolve: number;
  good: boolean;
  setupMag: number;
  resultMag: number;
}

/** 판을 만들 때 사건 흐름을 미리 정함 (서버 전용) */
export function planStories(rng: Rng, totalDays: number): Story[] {
  const n = totalDays >= 15 ? 3 + (rng() < 0.5 ? 1 : 0) : 2 + (rng() < 0.4 ? 1 : 0);
  const out: Story[] = [];
  const used = new Set<string>();
  for (let tries = 0; out.length < n && tries < 40; tries++) {
    const kind = pick(rng, STORY_KINDS);
    const pool = COMPANIES.filter((c: StockDef) => kind.sectors.includes(c.sector) && !used.has(c.symbol));
    if (!pool.length) continue;
    const s = pick(rng, pool);
    const wait = kind.wait[0] + Math.floor(rng() * (kind.wait[1] - kind.wait[0] + 1));
    // 마지막 날까지 결과가 나오도록, 첫날은 피함
    const maxStart = totalDays - 1 - wait;
    if (maxStart < 1) continue;
    const start = 1 + Math.floor(rng() * maxStart);
    // 같은 날 결과가 겹치지 않게
    if (out.some((o) => o.resolve === start + wait)) continue;
    used.add(s.symbol);
    out.push({ kind, symbol: s.symbol, start, resolve: start + wait, good: rng() < kind.pGood, setupMag: range(rng, kind.setup[0], kind.setup[1]), resultMag: range(rng, kind.result[0], kind.result[1]) });
  }
  return out;
}
