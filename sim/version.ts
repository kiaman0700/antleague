/** 시뮬 규칙 버전: 기본은 지금 규칙, SIM_V=5 처럼 바꿔서 예전 규칙과 비교. SIM_PRICES='{"freeze":15000}' 로 카드 값 실험 */
import { CURRENT_RULES_VERSION } from '../src/engine/engine.js';
import { PRICE_V8, PRICE_V9 } from '../src/game/items.js';
export const SIM_V = Number(process.env.SIM_V ?? CURRENT_RULES_VERSION);
if (process.env.SIM_PRICES) for (const t of [PRICE_V8, PRICE_V9]) Object.assign(t, JSON.parse(process.env.SIM_PRICES));
