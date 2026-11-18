/**
 * 랭킹 티어: 점수(레이팅) → 티어·단계. 랭킹전 2판은 배치(점수를 숨기고 빨리 움직임)
 * 2판(2026-11-18 사용자 '딱 맞아떨어지게'): 단계 100점 · 티어 300점(발로란트·롤처럼 단계 100점) — 실버 1000 · 골드 1300 · 플래티넘 1600 · 다이아몬드 1900 · 마스터 2200 · 챌린저 2500+.
 * 단계는 1 → 2 → 3 (3이 가장 높음). 예전(50점 단계)보다 점수 폭을 두 배로 — Elo 도 K 64·400→800 으로 같이 넓혀 오르는 속도는 같음
 */
export const PLACEMENT_GAMES = 2;
/** 배치 중에는 점수가 이만큼 크게 움직임 (빨리 제 실력 자리로) */
export const PLACEMENT_MULT = 2.5;
/** 단계 하나의 점수 */
export const DIV_POINTS = 100;
/** 마스터 시작 점수 */
export const MASTER_MIN = 2200;
/** 챌린저가 될 수 있는 최소 점수 (마스터 + 300) — 그 위에 정원·최근 활동 조건 (api/_lib/challenger.ts) */
export const CHALLENGER_MIN = 2500;
/** 점수 감소(054·056)가 시작되는 다이아몬드 */
export const DIAMOND_MIN = 1900;
/** Elo: 점수 폭(예전 400의 두 배)과 한 판 최대 변화 */
export const ELO_SCALE = 800;
export const ELO_K = 64;

export const TIERS = [
  { id: 'bronze', name: '브론즈', min: -Infinity, color: '#c58a5c' },
  { id: 'silver', name: '실버', min: 1000, color: '#b9c3d1' },
  { id: 'gold', name: '골드', min: 1300, color: '#f5b83d' },
  { id: 'platinum', name: '플래티넘', min: 1600, color: '#5fd3c6' },
  { id: 'diamond', name: '다이아몬드', min: 1900, color: '#7aa8ff' },
  { id: 'master', name: '마스터', min: 2200, color: '#c88bff' },
] as const;
export type TierId = (typeof TIERS)[number]['id'];

export interface TierInfo {
  id: TierId;
  name: string;
  color: string;
  /** 1·2·3 단계, 3이 가장 높음 (마스터는 없음) */
  division: '1' | '2' | '3' | null;
  /** 지금 단계 안에서 쌓은 점수 (0~99), 마스터는 2200 넘은 만큼 */
  points: number;
  /** "골드 2" */
  label: string;
}

export function tierOf(rating: number): TierInfo {
  const t = [...TIERS].reverse().find((x) => rating >= x.min) ?? TIERS[0];
  if (t.id === 'master') return { id: t.id, name: t.name, color: t.color, division: null, points: Math.max(0, Math.round(rating - MASTER_MIN)), label: t.name };
  // 브론즈는 700 부터 1단계 (그 아래는 브론즈 1 0점)
  const base = t.id === 'bronze' ? 700 : t.min;
  const into = Math.max(0, rating - base);
  const step = Math.min(2, Math.floor(into / DIV_POINTS));
  const division = (['1', '2', '3'] as const)[step];
  return { id: t.id, name: t.name, color: t.color, division, points: Math.min(DIV_POINTS - 1, Math.max(0, Math.round(into - step * DIV_POINTS))), label: `${t.name} ${division}` };
}

export const isPlaced = (rankedGames: number | null | undefined) => (rankedGames ?? 0) >= PLACEMENT_GAMES;
