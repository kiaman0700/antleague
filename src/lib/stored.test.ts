import { describe, it, expect } from 'vitest';
import { parseStored, allStrings } from './stored';

describe('저장값 읽기', () => {
  it('모양이 다르면 기본값', () => {
    expect(parseStored('{"a":1}', [] as string[])).toEqual([]);
    expect(parseStored('[1]', { type: 'line' })).toEqual({ type: 'line' });
    expect(parseStored('null', [] as string[])).toEqual([]);
    expect(parseStored('"x"', 3)).toBe(3);
    expect(parseStored('{bad', [] as string[])).toEqual([]);
  });
  it('맞는 모양은 그대로, 항목 거르기', () => {
    expect(parseStored('["A","B"]', [] as string[], allStrings)).toEqual(['A', 'B']);
    expect(parseStored('["A",1]', [] as string[], allStrings)).toEqual([]);
    expect(parseStored('{"type":"bar"}', { type: 'line' })).toEqual({ type: 'bar' });
  });
});
