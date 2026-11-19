/**
 * 증강 (규칙 v27, design/augments-v27.md) — 판 끝까지 이어지는 나만의 효과를 정해진 날 3개 중 1개 골라 받음.
 * 이 파일은 목록과 '언제 무엇이 뜨나' 규칙만. 효과 계산은 엔진(서버)에서, 보기는 서버 비밀값(salt)으로만 뽑음.
 */
import { seeded } from '../lib/rng.js';

export type AugTier = 'silver' | 'gold' | 'prism';
export const TIERS: AugTier[] = ['silver', 'gold', 'prism'];
/** 고르기 차례: 초반(첫 번째) · 중반 · 후반(마지막) */
export type AugStage = 'early' | 'mid' | 'late';
/** 보기 3개가 모두 같은 종류가 되지 않게 묶는 종류 */
export type AugTag = 'money' | 'info' | 'trade' | 'sector' | 'hold' | 'catchup' | 'fun';
export type SectorCond = 'semi' | 'battery' | 'bio' | 'crypto' | 'us' | 'etf';

export interface AugDef {
  id: string;
  name: string;
  tier: AugTier;
  tag: AugTag;
  desc: string;
  /** 뜰 수 있는 차례 */
  when: AugStage[];
  /** 같은 집안(I·II·III)은 하나만 */
  family?: string;
  /** 효과가 나려면 남아 있어야 하는 날 수 (⏳) */
  needDays?: number;
  /** 여럿이 하는 판에서만 (👥) */
  multi?: true;
  /** 중반·후반엔 이 업종 종목을 들고 있을 때만 (🎯) */
  sector?: SectorCond;
  /** 함께 못 가지는 증강 id */
  excl?: string[];
  /** 한 방에서 한 사람만 */
  unique?: true;
}

const ALL: AugStage[] = ['early', 'mid', 'late'];
const EM: AugStage[] = ['early', 'mid'];
const ML: AugStage[] = ['mid', 'late'];
const E: AugStage[] = ['early'];

const sectorPair = (key: SectorCond, label: string): [AugDef, AugDef] => [
  { id: `${key}1`, name: `${label} I`, tier: 'silver', tag: 'sector', family: key, sector: key, when: ALL, desc: `${label} 종목 수수료 없음 + 바로 현금 +1만원` },
  { id: `${key}2`, name: `${label} II`, tier: 'gold', tag: 'sector', family: key, sector: key, when: ML, desc: `${label} 수수료 없음 + ${label}이(가) 오른 날 그 평가이익의 5% (최대 3만원)` },
];

export const AUGMENTS: AugDef[] = [
  // ── 실버 ──
  { id: 'cash1', name: '비상금', tier: 'silver', tag: 'money', when: ALL, desc: '바로 현금 +1.2만원' },
  { id: 'save1', name: '적금 I', tier: 'silver', tag: 'money', family: 'save', needDays: 3, when: EM, desc: '3일 뒤 현금 +1.5만원' },
  { id: 'int1', name: '짠테크 I', tier: 'silver', tag: 'money', family: 'int', when: EM, excl: ['king'], desc: '장 마감 때 현금의 0.12% 이자 (거래한 날만, 판당 최대 1.5만원)' },
  { id: 'cushion1', name: '손실 쿠션 I', tier: 'silver', tag: 'hold', family: 'cushion', when: ALL, desc: '하루 손실이 3% 넘으면 넘은 부분의 30% 환급 (판당 최대 1.5만원)' },
  { id: 'hodl1', name: '존버 I', tier: 'silver', tag: 'hold', family: 'hodl', needDays: 3, when: EM, excl: ['scalp'], desc: '3일 넘게 든 종목 평가이익의 30%를 판 끝에 (최대 1.5만원)' },
  { id: 'div', name: '배당 사냥꾼', tier: 'silver', tag: 'money', when: EM, desc: '받는 배당 ×2 (최대 2만원) + 배당 기준일 미리 알림' },
  { id: 'nofee', name: '수수료 면제권', tier: 'silver', tag: 'trade', family: 'fee', when: ALL, desc: '판 끝까지 수수료 없음 + 바로 현금 +1만원' },
  { id: 'orders', name: '예약 달인', tier: 'silver', tag: 'trade', when: ALL, desc: '예약 주문 하루 10개·범위 ±40% + 바로 현금 +1만원' },
  { id: 'lev', name: '레버리지 놀이', tier: 'silver', tag: 'trade', when: ML, excl: ['king'], desc: '레버리지·인버스 한도 30% → 60% + 바로 현금 +1만원' },
  { id: 'verdict1', name: '귀동냥', tier: 'silver', tag: 'info', family: 'verdict', when: ALL, desc: '소식 진위 판정 1번' },
  { id: 'scout1', name: '차트쟁이', tier: 'silver', tag: 'info', family: 'scout', when: ALL, desc: '오를지 내릴지 1번 (맞을 확률 70%)' },
  { id: 'memo', name: '메모광', tier: 'silver', tag: 'info', when: EM, desc: '저장한 커뮤니티 글은 진위가 공개되는 날 알림 + 소식 진위 판정 1번' },
  { id: 'review', name: '복기 노트', tier: 'silver', tag: 'info', when: E, desc: '장 마감 때 오늘 잘한·아쉬운 거래 하나씩 + 바로 현금 +1만원' },
  { id: 'calendar', name: '일정 수첩', tier: 'silver', tag: 'info', when: EM, desc: '다음 사건 발표 날을 일정에 모아 표시 + 바로 현금 +1만원' },
  { id: 'loan', name: '외상 투자', tier: 'silver', tag: 'fun', family: 'tierShift', when: EM, desc: '바로 현금 +2만원, 대신 내 다음 증강 등급이 한 단계 낮아짐' },
  { id: 'lotto', name: '복권 한 장', tier: 'silver', tag: 'fun', when: ALL, desc: '다음 날 공개 확률표에서 0~4만원 (기대 1.2만원)' },
  { id: 'attend', name: '출석 체크', tier: 'silver', tag: 'fun', when: EM, desc: '장 마감을 누를 때마다 2천원 (판당 최대 1.5만원)' },
  { id: 'sleepy', name: '늦잠 개미', tier: 'silver', tag: 'fun', when: ALL, desc: '다음 날 첫 1/3 동안 거래 못 함, 대신 바로 현금 +2만원' },
  { id: 'climb', name: '한 칸씩', tier: 'silver', tag: 'catchup', multi: true, when: ML, desc: '장 마감 때 순위가 어제보다 오르면 5천원 (판당 최대 1.5만원)' },
  { id: 'last1', name: '꼴찌 탈출', tier: 'silver', tag: 'catchup', family: 'last', multi: true, when: ML, desc: '장 마감 때 꼴찌면 3천원 (판당 최대 1.5만원)' },
  ...sectorPair('semi', '반도체 덕후'),
  ...sectorPair('battery', '배터리 충전'),
  ...sectorPair('bio', '바이오 연구원'),
  ...sectorPair('crypto', '코인 개미'),
  ...sectorPair('us', '미국 직구'),
  { id: 'etf1', name: 'ETF 적립', tier: 'silver', tag: 'sector', family: 'etf', sector: 'etf', when: ALL, desc: 'ETF 수수료 없음 + 바로 현금 +1만원' },
  // ── 골드 ──
  { id: 'cash2', name: '목돈', tier: 'gold', tag: 'money', when: ALL, desc: '바로 현금 +3만원' },
  { id: 'save2', name: '적금 II', tier: 'gold', tag: 'money', family: 'save', needDays: 3, when: EM, desc: '3일 뒤 현금 +3.8만원' },
  { id: 'int2', name: '짠테크 II', tier: 'gold', tag: 'money', family: 'int', when: EM, excl: ['king'], desc: '장 마감 현금의 0.3% 이자 (거래한 날만, 최대 3.5만원)' },
  { id: 'cushion2', name: '손실 쿠션 II', tier: 'gold', tag: 'hold', family: 'cushion', when: ALL, desc: '−3% 넘는 손실의 50% 환급 (최대 3만원)' },
  { id: 'hodl2', name: '존버 II', tier: 'gold', tag: 'hold', family: 'hodl', needDays: 3, when: EM, excl: ['scalp'], desc: '3일 넘게 든 종목 평가이익 70%를 판 끝에 (최대 3.5만원)' },
  { id: 'payday', name: '월급날', tier: 'gold', tag: 'money', needDays: 6, when: E, desc: '3일마다 현금 +1만원 (판당 최대 3만원)' },
  { id: 'paper1', name: '조간신문', tier: 'gold', tag: 'info', family: 'paper', when: ALL, desc: '내일 아침 뉴스 헤드라인 1번 (고른 날 바로)' },
  { id: 'analyst1', name: '증권사 리포트', tier: 'gold', tag: 'info', family: 'analyst', when: ALL, desc: '그날 가장 강할 업종 1번 (원하는 날 아침에)' },
  { id: 'verdict3', name: '뒷조사', tier: 'gold', tag: 'info', family: 'verdict', when: ALL, desc: '소식 진위 판정 3번' },
  { id: 'scout3', name: '차트쟁이 II', tier: 'gold', tag: 'info', family: 'scout', when: ALL, desc: '오를지 내릴지 3번 (맞을 확률 75%)' },
  { id: 'scalp', name: '단타 장인', tier: 'gold', tag: 'trade', family: 'fee', when: EM, excl: ['hodl1', 'hodl2', 'hodl3', 'allin'], desc: '같은 날 사고판 거래는 수수료 없음 + 그 수익의 10% (최대 3만원), 대신 하루 넘긴 종목 수수료 2배' },
  { id: 'average', name: '물타기 장인', tier: 'gold', tag: 'trade', when: ML, desc: '가진 종목을 더 살 때 수수료 없음 + 판 끝에 평가손실의 20% 환급 (최대 3만원)' },
  { id: 'spread', name: '분산 투자', tier: 'gold', tag: 'hold', when: EM, excl: ['allin'], desc: '장 마감 때 업종이 다른 종목 3개 이상이면 5천원 (최대 3만원)' },
  { id: 'steel', name: '강철 멘탈', tier: 'gold', tag: 'hold', when: EM, desc: '하루 손실 5% 넘은 다음 날 현금 +1만원 (최대 3만원)' },
  { id: 'last2', name: '역전의 개미', tier: 'gold', tag: 'catchup', family: 'last', multi: true, when: ML, desc: '장 마감 때 꼴찌면 8천원 (최대 3만원)' },
  { id: 'chaser', name: '추격자', tier: 'gold', tag: 'catchup', multi: true, when: ML, desc: '1위와 10% 넘게 차이 나는 날 마감 때 1만원 (최대 3만원)' },
  { id: 'slot', name: '슬롯머신', tier: 'gold', tag: 'fun', family: 'daily-gamble', needDays: 4, when: E, desc: '매일 아침 공개 확률표 −5천~+1.5만원 (기대 +4천, 판당 최대 4만원)' },
  { id: 'allin', name: '올인 개미', tier: 'gold', tag: 'fun', when: EM, excl: ['spread', 'scalp'], desc: '한 종목 비중 70% 넘는 날 그 종목 수익의 5% (최대 3.5만원), 대신 다른 종목 수수료 2배' },
  { id: 'king', name: '현금왕', tier: 'gold', tag: 'money', family: 'int', when: EM, excl: ['lev'], desc: '장 마감 현금의 0.4% 이자 (최대 4만원), 대신 레버리지·인버스 못 삼' },
  { id: 'eye', name: '투자의 안목', tier: 'gold', tag: 'fun', family: 'tierShift', when: EM, desc: '내 다음 증강 등급이 한 단계 높아짐' },
  { id: 'guru', name: '커뮤니티 고수', tier: 'gold', tag: 'info', when: EM, desc: "인증 계정 글에 '지난번에 맞혔는지' 표시 + 소식 진위 판정 2번" },
  // ── 프리즘 ──
  { id: 'cash3', name: '큰돈', tier: 'prism', tag: 'money', when: ALL, desc: '바로 현금 +6만원' },
  { id: 'save3', name: '적금 III', tier: 'prism', tag: 'money', family: 'save', needDays: 4, when: E, desc: '4일 뒤 현금 +7.5만원' },
  { id: 'compound', name: '복리의 마법', tier: 'prism', tag: 'money', needDays: 5, when: E, desc: '매일 마감 때 (현금+주식)의 0.1% (최대 7만원)' },
  { id: 'insure', name: '보험 가입', tier: 'prism', tag: 'hold', family: 'cushion', when: ALL, desc: '−3% 넘는 손실 100% 환급 (최대 7만원)' },
  { id: 'int3', name: '짠테크 III', tier: 'prism', tag: 'money', family: 'int', when: EM, excl: ['king'], desc: '장 마감 현금 0.3% 이자 + 수수료 없음 + 예약 10개 (최대 6만원)' },
  { id: 'paper2', name: '내부자 친구', tier: 'prism', tag: 'info', family: 'paper', unique: true, when: ALL, desc: '내일 아침 헤드라인 2번 (원하는 날)' },
  { id: 'analyst2', name: '애널리스트 팀', tier: 'prism', tag: 'info', family: 'analyst', when: ALL, desc: '강한 업종 2번' },
  { id: 'verdict6', name: '팩트 체커', tier: 'prism', tag: 'info', family: 'verdict', when: ALL, desc: '소식 진위 판정 6번' },
  { id: 'scout6', name: '차트 마스터', tier: 'prism', tag: 'info', family: 'scout', when: ALL, desc: '오를지 내릴지 6번 (맞을 확률 80%)' },
  { id: 'timing', name: '타이밍의 신', tier: 'prism', tag: 'trade', when: ALL, desc: '판 동안 한 번, 오늘 산 거래 하나를 그날 최저가로 다시 계산 (최대 7만원)' },
  { id: 'undo', name: '되돌리기', tier: 'prism', tag: 'trade', when: ALL, desc: '판 동안 한 번, 오늘 한 거래 하나를 장 마감 전 없던 일로' },
  { id: 'rule', name: '업종 장악', tier: 'prism', tag: 'sector', when: ML, desc: '고른 업종 하나: 수수료 없음 + 그 업종이 오른 날 평가이익 8% (최대 6만원)' },
  { id: 'us3', name: '미국 원정대', tier: 'prism', tag: 'sector', family: 'us', sector: 'us', when: ML, desc: '미국 종목 수수료 없음 + 미국 종목이 오른 날 평가이익 8% (최대 6만원)' },
  { id: 'army', name: '개미 군단', tier: 'prism', tag: 'catchup', family: 'last', multi: true, when: ML, desc: '꼴찌인 날 마감 때 1.5만원 (최대 6만원)' },
  { id: 'comeback', name: '대역전', tier: 'prism', tag: 'catchup', multi: true, when: ML, desc: '마지막 날 마감 때 꼴찌면 +6만원' },
  { id: 'jackpot', name: '잭팟', tier: 'prism', tag: 'fun', unique: true, when: ALL, desc: '다음 날 공개 확률표에서 0~20만원 (기대 6만원)' },
  { id: 'gambler', name: '도박사', tier: 'prism', tag: 'fun', family: 'daily-gamble', needDays: 4, when: E, desc: '매일 아침 공개 확률표 −2만~+4만원 (기대 +6천)' },
  { id: 'oneshot', name: '한 방', tier: 'prism', tag: 'fun', when: EM, desc: '마지막 날 수익률 +10% 넘으면 +10만원, 아니면 −2만원' },
  { id: 'artisan', name: '장인 정신', tier: 'prism', tag: 'trade', when: EM, desc: '하루 거래 3번 이하인 날 그날 수익의 10% (최대 6만원)' },
  { id: 'principal', name: '개미 학교 교장', tier: 'prism', tag: 'fun', when: EM, desc: '바로 현금 +3만원 + 다음 고르기부터 다시 뽑기 +2' },
];
export const AUG_MAP: Record<string, AugDef> = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

/** 판 길이별 고르는 날(0부터 센 날) — 롤토체스 2-1·3-2·4-2 ≈ 판의 20%·45%·65% 를 옮김, 마지막 20% 구간엔 없음 */
export function augmentDays(totalDays: number): number[] {
  if (totalDays <= 5) return [0, 2];
  if (totalDays <= 12) return [0, Math.round(totalDays * 0.3), Math.round(totalDays * 0.6)];
  return [0, Math.round(totalDays * 0.25), Math.round(totalDays * 0.5), Math.round(totalDays * 0.7)];
}

/** 고르기 차례 → 초반·중반·후반 */
export function stageOf(n: number, picks: number): AugStage {
  return n === 0 ? 'early' : n === picks - 1 ? 'late' : 'mid';
}

/** 등급 묶음 (3번 고르는 판). 확률은 % 정수 — 합 100 */
export const TIER_PATTERNS: [AugTier[], number][] = [
  [['gold', 'gold', 'gold'], 22],
  [['gold', 'silver', 'gold'], 16],
  [['silver', 'gold', 'gold'], 12],
  [['gold', 'gold', 'prism'], 12],
  [['gold', 'prism', 'gold'], 9],
  [['silver', 'gold', 'prism'], 8],
  [['silver', 'silver', 'gold'], 7],
  [['gold', 'silver', 'prism'], 6],
  [['prism', 'gold', 'gold'], 4],
  [['silver', 'prism', 'gold'], 3],
  [['prism', 'prism', 'prism'], 1],
];

/** 방 전체가 같이 쓰는 등급 묶음 — 판 시작 때 서버 비밀값으로 한 번 */
export function tierPattern(salt: string, picks: number): AugTier[] {
  const rng = seeded(`${salt}:augtier`);
  let x = rng() * 100;
  let base: AugTier[] = TIER_PATTERNS[0][0];
  for (const [p, w] of TIER_PATTERNS) {
    if (x < w) {
      base = p;
      break;
    }
    x -= w;
  }
  if (picks <= 2) return base.slice(0, 2);
  if (picks === 3) return [...base];
  return [...base, rng() < 0.6 ? 'gold' : 'prism'];
}

/** 내 다음 등급 (외상 투자·투자의 안목으로 한 칸 오르내림) */
export function shiftTier(t: AugTier, by: number): AugTier {
  return TIERS[Math.max(0, Math.min(2, TIERS.indexOf(t) + by))];
}

export interface OfferCtx {
  salt: string;
  /** 자리 id */
  seat: string;
  /** 몇 번째 고르기 (0부터) */
  n: number;
  /** 이 판에서 고르는 횟수 */
  picks: number;
  tier: AugTier;
  /** 고르는 날 다음부터 남은 날 수 (그날 포함) */
  daysLeft: number;
  multi: boolean;
  /** 내가 이미 가진 증강 */
  owned: string[];
  /** 방에서 다른 사람이 이미 가진 '한 명만' 증강 */
  takenUnique: string[];
  /** 고르기 창이 열린 순간 내가 들고 있는 업종 */
  heldSectors: SectorCond[];
}

/** 이 사람이 이번 차례에 받을 수 있는 증강인지 (뜨는 규칙 1~7) */
export function eligible(a: AugDef, c: OfferCtx): boolean {
  const stage = stageOf(c.n, c.picks);
  if (a.tier !== c.tier) return false;
  if (!a.when.includes(stage)) return false;
  if (a.needDays && c.daysLeft < a.needDays) return false;
  if (a.multi && !c.multi) return false;
  if (a.sector && stage !== 'early' && !c.heldSectors.includes(a.sector)) return false;
  if (c.owned.includes(a.id)) return false;
  const fams = new Set(c.owned.map((id) => AUG_MAP[id]?.family).filter(Boolean));
  if (a.family && fams.has(a.family)) return false;
  if (a.excl?.some((x) => c.owned.includes(x))) return false;
  if (c.owned.some((x) => AUG_MAP[x]?.excl?.includes(a.id))) return false;
  if (a.unique && c.takenUnique.includes(a.id)) return false;
  // 다음 고르기가 없으면 등급을 바꾸는 증강은 쓸모가 없음
  if (a.family === 'tierShift' && c.n >= c.picks - 1) return false;
  return true;
}

/**
 * 보기 3개. 칸마다 다시 뽑은 횟수(rerolls[i])가 있으면 그 칸만 새로 — 같은 입력이면 늘 같은 보기(새로고침해도 같음).
 * 3개가 모두 같은 종류가 되지 않게, 같은 집안이 두 칸에 나오지 않게.
 */
export function augmentOffer(c: OfferCtx, rerolls: number[] = [0, 0, 0]): string[] {
  let pool = AUGMENTS.filter((a) => eligible(a, c));
  // 후보가 모자라면 한 등급 아래에서 채움 (드문 경우)
  if (pool.length < 3) {
    const lower = c.tier === 'prism' ? 'gold' : c.tier === 'gold' ? 'silver' : null;
    if (lower) pool = pool.concat(AUGMENTS.filter((a) => eligible(a, { ...c, tier: lower })));
  }
  /** slot 칸에 넣을 후보: 다른 두 칸과 겹치지 않고, 같은 집안이 아니고, 세 칸이 모두 같은 종류가 되지 않게 */
  const candFor = (out: (string | null)[], slot: number, seen: Set<string>) => {
    const others = out.filter((x, i): x is string => i !== slot && !!x);
    const fams = new Set(others.map((id) => AUG_MAP[id].family).filter(Boolean));
    let cand = pool.filter((a) => !others.includes(a.id) && !seen.has(a.id) && !(a.family && fams.has(a.family)));
    if (others.length === 2 && AUG_MAP[others[0]].tag === AUG_MAP[others[1]].tag) {
      const other = cand.filter((a) => a.tag !== AUG_MAP[others[0]].tag);
      if (other.length) cand = other;
    }
    return cand;
  };
  const out: (string | null)[] = [null, null, null];
  const seen = [new Set<string>(), new Set<string>(), new Set<string>()];
  for (let slot = 0; slot < 3; slot++) {
    const cand = candFor(out, slot, seen[slot]);
    if (!cand.length) continue;
    out[slot] = cand[Math.floor(seeded(`${c.salt}:aug:${c.seat}:${c.n}:${slot}:0`)() * cand.length)].id;
    seen[slot].add(out[slot]!);
  }
  // 다시 뽑기: 그 칸만 새로 (다른 두 칸은 그대로) — 이미 나왔던 것은 다시 안 나옴
  for (let slot = 0; slot < 3; slot++) {
    for (let k = 1; k <= (rerolls[slot] ?? 0); k++) {
      const cand = candFor(out, slot, seen[slot]);
      if (!cand.length) break;
      out[slot] = cand[Math.floor(seeded(`${c.salt}:aug:${c.seat}:${c.n}:${slot}:${k}`)() * cand.length)].id;
      seen[slot].add(out[slot]!);
    }
  }
  return out.filter((x): x is string => !!x);
}
