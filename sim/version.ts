/** 시뮬 규칙 버전: 기본은 지금 규칙, SIM_V=5 처럼 바꿔서 예전 규칙과 비교 */
import { CURRENT_RULES_VERSION } from '../src/engine/engine.js';
export const SIM_V = Number(process.env.SIM_V ?? CURRENT_RULES_VERSION);
