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

/** 이 사람이 받아들이는 점수 차 (기다릴수록 넓어짐) */
export function ratingWindow(t: Ticket, now: number) {
  return Math.min(1000, 100 + 50 * Math.floor(Math.max(0, now - t.createdAt) / 10_000));
}

/**
 * me 를 포함한 한 판 인원을 고름. 못 고르면 null
 * 두 사람 모두의 범위 중 넓은 쪽 안에 들면 같이 할 수 있음
 */
export function pickGroup(me: Ticket, waiting: Ticket[], size: QueueSize, now: number): Ticket[] | null {
  const cand = waiting
    .filter((t) => t.id !== me.id && Math.abs(t.rating - me.rating) <= Math.max(ratingWindow(me, now), ratingWindow(t, now)))
    .sort((a, b) => Math.abs(a.rating - me.rating) - Math.abs(b.rating - me.rating) || a.createdAt - b.createdAt);
  if (size === 'duel') return cand.length ? [me, cand[0]] : null;
  if (cand.length >= MULTI_FULL - 1) return [me, ...cand.slice(0, MULTI_FULL - 1)];
  if (cand.length >= MULTI_MIN - 1) {
    const group = [me, ...cand.slice(0, MULTI_MIN - 1)];
    const oldest = Math.min(...group.map((t) => t.createdAt));
    if (now - oldest >= MULTI_WAIT_FOR_3) return group;
  }
  return null;
}
