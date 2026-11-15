import { describe, expect, it } from 'vitest';
import { manExact, setMoneyUnit, won } from './format.js';

describe('금액 표시', () => {
  it('만원 단위도 끝자리까지 정확하게', () => {
    expect(manExact(50_100)).toBe('5만 100원');
    expect(manExact(1_080_000)).toBe('108만원');
    expect(manExact(9_500)).toBe('9,500원');
    expect(manExact(123_456_700)).toBe('1억 2,345만 6,700원');
    expect(manExact(100_000_000)).toBe('1억원');
    expect(manExact(-2_350_400)).toBe('-235만 400원');
    expect(manExact(0)).toBe('0원');
    expect(manExact(10_000_000)).toBe('1,000만원');
  });
  it('원 단위는 쉼표', () => {
    setMoneyUnit('won');
    expect(won(50_100)).toBe('50,100원');
    setMoneyUnit('man');
    expect(won(50_100)).toBe('5만 100원');
    setMoneyUnit('won');
  });
});
