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
}

/** 랭킹전은 아무리 오래 기다려도 점수 차 400까지만 (실력 차가 너무 큰 판으로 점수를 주고받지 않게) */
export const RANKED_MAX_WINDOW = 400;
export const CASUAL_MAX_WINDOW = 1000;

/** 이 사람이 받아들이는 점수 차 (기다릴수록 넓어짐) */
export function ratingWindow(t: Ticket, now: number, max = CASUAL_MAX_WINDOW) {
  return Math.min(max, 100 + 50 * Math.floor(Math.max(0, now - t.createdAt) / 10_000));
}

/** 두 사람이 같이 할 수 있나: 둘의 범위 중 넓은 쪽 안 */
export const compatible = (a: Ticket, b: Ticket, now: number, max = CASUAL_MAX_WINDOW) =>
  Math.abs(a.rating - b.rating) <= Math.max(ratingWindow(a, now, max), ratingWindow(b, now, max));

/**
 * me 를 포함한 한 판 인원을 고름. 못 고르면 null
 * 다인전은 고른 사람끼리 '모두 서로' 범위 안이어야 함 (1000점과 1400점이 1200점을 사이에 두고 만나지 않게)
 */
export function pickGroup(me: Ticket, waiting: Ticket[], size: QueueSize, now: number, max = CASUAL_MAX_WINDOW): Ticket[] | null {
  const cand = waiting
    .filter((t) => t.id !== me.id && compatible(me, t, now, max))
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating) || a.createdAt - b.createdAt);
  if (size === 'duel') return cand.length ? [me, cand[0]] : null;
  const group = [me];
  for (const t of cand) {
    if (group.length >= MULTI_FULL) break;
    if (group.every((g) => compatible(g, t, now, max))) group.push(t);
  }
  if (group.length >= MULTI_FULL) return group;
  if (group.length >= MULTI_MIN) {
    const g3 = group.slice(0, MULTI_MIN);
    const oldest = Math.min(...g3.map((t) => t.createdAt));
    if (now - oldest >= MULTI_WAIT_FOR_3) return g3;
  }
  return null;
}
