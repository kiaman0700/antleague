/**
 * 시뮬 전용: 증강 보기(augmentOffer)를 바꿔 끼움. globalThis.__AUGFORCE 가 있으면 그 자리·차례에 정해 둔 증강 하나만 보기로 줌.
 * 등급·'한 명만' 조건은 무시하고, 나머지 뜨는 규칙(차례·남은 날·업종·집안·함께 못 가짐)은 지킴. 못 받으면 효과 없는 정보 증강으로.
 */
export * from '../../src/game/augments.js';
import { AUG_MAP, eligible, augmentOffer as realOffer, type OfferCtx } from '../../src/game/augments.js';

/** 봇은 정보 증강을 안 쓰므로 돈·행동에 영향 없음 */
export const NEUTRAL = ['verdict1', 'scout1', 'analyst1', 'paper1', 'verdict3', 'scout3'];

type Force = (c: OfferCtx) => string | null | undefined;

export function looseOk(id: string, c: OfferCtx) {
  const a = AUG_MAP[id];
  return !!a && eligible(a, { ...c, tier: a.tier, takenUnique: [] });
}

export function augmentOffer(c: OfferCtx, rerolls: number[] = []): string[] {
  const f = (globalThis as { __AUGFORCE?: Force }).__AUGFORCE;
  if (!f) return realOffer(c, rerolls);
  const want = f(c);
  if (want && looseOk(want, c)) return [want];
  const n = NEUTRAL.find((id) => looseOk(id, c));
  return n ? [n] : realOffer(c, rerolls);
}
