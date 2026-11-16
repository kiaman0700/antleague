/**
 * 매칭 규칙 (서버가 씀, 순수 함수라 테스트 가능)
 * - 대기열: 랭킹전/일반전 × 1대1/다인전 × 신속/일반
 * - 실력: 처음엔 점수 ±100 안에서, 10초마다 ±50씩 넓힘 (사람이 적어도 결국 잡히게)
 * - 1대1: 2명 / 다인전: 4명이면 바로, 3명이 40초 넘게 기다렸으면 3명으로
 */
export type QueueKind = 'ranked' | 'casual';
export type QueueSize = 'duel' | 'multi';
export type QueueSpeed = 'quick' | 'normal';
export interface QueueId {
  kind: QueueKind;
  size: QueueSize;
  speed: QueueSpeed;
}

export const queueName = (q: QueueId) => `${q.kind}_${q.size}_${q.speed}`;
export function parseQueue(v: unknown): QueueId | null {
  if (typeof v !== 'string') return null;
  const m = /^(ranked|casual)_(duel|multi)_(quick|normal)$/.exec(v);
  return m ? { kind: m[1] as QueueKind, size: m[2] as QueueSize, speed: m[3] as QueueSpeed } : null;
}

/** 속도별 게임 길이: 신속 ≈ 10분, 일반 ≈ 20~30분 */
export const SPEED_PRESET: Record<QueueSpeed, { days: number; turnSeconds: number; label: string; minutes: string }> = {
  quick: { days: 10, turnSeconds: 60, label: '신속', minutes: '약 10분' },
  normal: { days: 20, turnSeconds: 90, label: '일반', minutes: '약 20~30분' },
};

export const MULTI_FULL = 4;
export const MULTI_MIN = 3;
export const MULTI_WAIT_FOR_3 = 40_000;

export interface Ticket {
  id: string;
  rating: number;
  createdAt: number;
  /** 같은 파티면 같은 값 (일반전 다인전만) */
  party?: string | null;
}

/** 랭킹전은 처음 2분 동안 점수 차 400까지만. 사람이 적어 2분 넘게 못 만나면 범위 제한을 풀어 줌
 *  (점수 차가 크면 Elo 가 알아서 이긴 쪽 점수를 조금만 올려 줌 + 같은 상대 하루 3판 제한) */
export const RANKED_MAX_WINDOW = 400;
export const CASUAL_MAX_WINDOW = 1000;
export const RANKED_RELAX_MS = 120_000;
export type WindowMax = number | ((t: Ticket, now: number) => number);
export const rankedMax: WindowMax = (t, now) => (now - t.createdAt < RANKED_RELAX_MS ? RANKED_MAX_WINDOW : CASUAL_MAX_WINDOW);
const maxOf = (m: WindowMax, t: Ticket, now: number) => (typeof m === 'number' ? m : m(t, now));

/** 이 사람이 받아들이는 점수 차 (기다릴수록 넓어짐) */
export function ratingWindow(t: Ticket, now: number, max: WindowMax = CASUAL_MAX_WINDOW) {
  return Math.min(maxOf(max, t, now), 100 + 50 * Math.floor(Math.max(0, now - t.createdAt) / 10_000));
}

/** 두 사람이 같이 할 수 있나: 둘의 범위 중 넓은 쪽 안 */
export const compatible = (a: Ticket, b: Ticket, now: number, max: WindowMax = CASUAL_MAX_WINDOW) =>
  Math.abs(a.rating - b.rating) <= Math.max(ratingWindow(a, now, max), ratingWindow(b, now, max));

/**
 * me 를 포함한 한 판 인원을 고름. 못 고르면 null
 * 다인전은 고른 사람끼리 '모두 서로' 범위 안이어야 함 (1000점과 1400점이 1200점을 사이에 두고 만나지 않게)
 */
/** 파티 최대 인원 (일반전 다인전만) — 3명 파티가 1명을 괴롭히는 판이 없게 2명까지 */
export const PARTY_MAX = 2;

/**
 * me 를 포함한 한 판 인원을 고름. 못 고르면 null
 * - 다인전은 고른 사람끼리 '모두 서로' 범위 안 (1000점과 1400점이 1200점을 사이에 두고 만나지 않게)
 * - 파티(party 가 같은 표들)는 한 덩어리로 같이 들어감. 파티가 낀 판은 4명일 때만 (2+2 또는 2+1+1)
 * - forbid(a, b) 가 true 인 두 사람은 같은 판에 넣지 않음 (랭킹전: 친구끼리·같은 인터넷)
 */
export function pickGroup(me: Ticket, waiting: Ticket[], size: QueueSize, now: number, max: WindowMax = CASUAL_MAX_WINDOW, forbid?: (a: Ticket, b: Ticket) => boolean): Ticket[] | null {
  const all = [me, ...waiting.filter((t) => t.id !== me.id)];
  // 파티별로 묶기 (파티 없는 사람은 혼자 한 덩어리)
  const units = new Map<string, Ticket[]>();
  for (const t of all) {
    const k = t.party ? 'p:' + t.party : 's:' + t.id;
    units.set(k, [...(units.get(k) ?? []), t]);
  }
  type Unit = { members: Ticket[]; rating: number; createdAt: number; id: string };
  const asUnit = (ms: Ticket[]): Unit => ({ members: ms, rating: Math.round(ms.reduce((x, t) => x + t.rating, 0) / ms.length), createdAt: Math.min(...ms.map((t) => t.createdAt)), id: ms[0].id });
  const myKey = me.party ? 'p:' + me.party : 's:' + me.id;
  const mine = asUnit(units.get(myKey)!);
  if (mine.members.length > PARTY_MAX) return null;
  // 1대1 에는 파티가 없음 (친구와는 '1대1 신청')
  if (size === 'duel' && mine.members.length > 1) return null;
  const okPair = (a: Unit, b: Unit) => compatible(a, b, now, max) && !(forbid && a.members.some((x) => b.members.some((y) => forbid(x, y))));
  const cand = [...units.entries()]
    .filter(([k, ms]) => k !== myKey && ms.length <= PARTY_MAX && (size === 'multi' || ms.length === 1))
    .map(([, ms]) => asUnit(ms))
    .filter((u) => okPair(mine, u))
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating) || a.createdAt - b.createdAt);
  if (size === 'duel') return cand.length ? [me, cand[0].members[0]] : null;
  const group: Unit[] = [mine];
  let total = mine.members.length;
  for (const u of cand) {
    if (total >= MULTI_FULL) break;
    if (total + u.members.length > MULTI_FULL) continue;
    if (group.every((g) => okPair(g, u))) {
      group.push(u);
      total += u.members.length;
    }
  }
  const flat = group.flatMap((u) => u.members);
  if (total >= MULTI_FULL) return flat;
  // 3명 판은 파티 없이 혼자인 사람들끼리만, 40초 넘게 기다렸을 때
  if (total >= MULTI_MIN && group.every((u) => u.members.length === 1)) {
    const g3 = flat.slice(0, MULTI_MIN);
    const oldest = Math.min(...g3.map((t) => t.createdAt));
    if (now - oldest >= MULTI_WAIT_FOR_3) return g3;
  }
  return null;
}

/* ---------- 예상 대기 시간 ---------- */
export interface WaitInput {
  size: QueueSize;
  /** 같은 대기열에서 지금 나와 바로 만날 수 있는(점수 범위 안) 사람 수 (나 빼고) */
  similar: number;
  /** 같은 대기열이지만 아직 점수 범위 밖인 사람 중 가장 가까운 점수 차 (없으면 null) */
  nearestGap: number | null;
  /** 이 대기열에 새로 들어오는 사람 수 (분당, 최근 매칭 기록 + 접속 중인 사람으로 어림) */
  arrivalsPerMin: number;
  /** 지금까지 기다린 시간 */
  waitedMs: number;
  /** 랭킹전이면 범위 상한 함수 */
  max?: WindowMax;
  rating?: number;
}

/** 범위가 점수 차 gap 까지 넓어지려면 몇 초 더 기다려야 하나 (상한 때문에 못 넓어지면 null) */
function secsUntilWindow(gap: number, waitedMs: number, max: WindowMax = CASUAL_MAX_WINDOW): number | null {
  for (let s = Math.ceil(waitedMs / 1000); s <= Math.ceil(waitedMs / 1000) + 900; s += 5) {
    const t: Ticket = { id: 'x', rating: 0, createdAt: 0 };
    if (ratingWindow(t, s * 1000, max) >= gap) return Math.max(0, s - Math.ceil(waitedMs / 1000));
  }
  return null;
}

/**
 * 예상 대기(초). 모르겠으면 null (기다리는 사람도 최근 매칭도 없을 때)
 * - 1대1: 범위 안에 한 명이라도 있으면 곧 · 범위 밖이면 범위가 넓어질 때까지 · 아무도 없으면 새로 올 사람을 기다림
 * - 다인전: 3명(40초 기다림) 또는 4명이 모일 때까지
 */
export function estimateWaitSec(i: WaitInput): number | null {
  const lam = Math.max(0, i.arrivalsPerMin);
  const arrive = (n: number) => (n <= 0 ? 0 : lam > 0 ? (60 * n) / lam : null);
  const waited = i.waitedMs / 1000;
  const round = (s: number) => Math.min(900, Math.max(5, Math.round(s / 5) * 5));
  if (i.size === 'duel') {
    if (i.similar >= 1) return 5;
    const viaWindow = i.nearestGap !== null ? secsUntilWindow(i.nearestGap, i.waitedMs, i.max) : null;
    const viaArrive = arrive(1);
    const c = [viaWindow, viaArrive].filter((x): x is number => x !== null);
    return c.length ? round(Math.min(...c)) : null;
  }
  const have = 1 + i.similar;
  if (have >= MULTI_FULL) return 5;
  const need3 = Math.max(0, MULTI_MIN - have);
  const t3 = arrive(need3);
  if (t3 === null) return null;
  // 3명이 모여도 가장 오래 기다린 사람이 40초를 넘겨야 시작 (그 사이 4번째가 오면 바로)
  const wait40 = Math.max(0, MULTI_WAIT_FOR_3 / 1000 - (waited + t3));
  const t4 = arrive(MULTI_FULL - have);
  return round(t3 + (t4 !== null ? Math.min(wait40, Math.max(0, t4 - t3)) : wait40));
}

/** 화면 표시: 약 30초 · 약 2분 · 10분 넘게 */
export function waitLabel(sec: number | null): string {
  if (sec === null) return '예상하기 어려워요';
  if (sec <= 10) return '곧 잡혀요';
  if (sec < 60) return `약 ${sec}초`;
  if (sec >= 900) return '10분 넘게';
  return `약 ${Math.round(sec / 60)}분`;
}
