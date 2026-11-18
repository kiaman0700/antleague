/**
 * 랭킹 티어: 점수(레이팅) → 티어·단계. 랭킹전 2판은 배치(점수를 숨기고 빨리 움직임)
 * 브론즈 · 실버 · 골드 · 플래티넘 · 다이아몬드: 150점씩, 단계는 1 → 2 → 3 (50점씩, 3이 가장 높음 — 2026-11-18 사용자 결정: III·II·I 는 높낮이가 헷갈림). 1600점부터 마스터
 */
export const PLACEMENT_GAMES = 2;
/** 배치 중에는 점수가 이만큼 크게 움직임 (빨리 제 실력 자리로) */
export const PLACEMENT_MULT = 2.5;

export const TIERS = [
  { id: 'bronze', name: '브론즈', min: -Infinity, color: '#c58a5c' },
  { id: 'silver', name: '실버', min: 1000, color: '#b9c3d1' },
  { id: 'gold', name: '골드', min: 1150, color: '#f5b83d' },
  { id: 'platinum', name: '플래티넘', min: 1300, color: '#5fd3c6' },
  { id: 'diamond', name: '다이아몬드', min: 1450, color: '#7aa8ff' },
  { id: 'master', name: '마스터', min: 1600, color: '#c88bff' },
] as const;
export type TierId = (typeof TIERS)[number]['id'];

export interface TierInfo {
  id: TierId;
  name: string;
  color: string;
  /** 1·2·3 단계, 3이 가장 높음 (마스터는 없음) */
  division: '1' | '2' | '3' | null;
  /** 지금 단계 안에서 쌓은 점수 (0~49), 마스터는 1600 넘은 만큼 */
  points: number;
  /** "골드 2" */
  label: string;
}

export function tierOf(rating: number): TierInfo {
  const t = [...TIERS].reverse().find((x) => rating >= x.min) ?? TIERS[0];
  if (t.id === 'master') return { id: t.id, name: t.name, color: t.color, division: null, points: Math.max(0, Math.round(rating - 1600)), label: t.name };
  // 브론즈는 850 부터 1단계 (그 아래는 브론즈 1 0점)
  const base = t.id === 'bronze' ? 850 : t.min;
  const into = Math.max(0, rating - base);
  const step = Math.min(2, Math.floor(into / 50));
  const division = (['1', '2', '3'] as const)[step];
  return { id: t.id, name: t.name, color: t.color, division, points: Math.min(49, Math.max(0, Math.round(into - step * 50))), label: `${t.name} ${division}` };
}

export const isPlaced = (rankedGames: number | null | undefined) => (rankedGames ?? 0) >= PLACEMENT_GAMES;
