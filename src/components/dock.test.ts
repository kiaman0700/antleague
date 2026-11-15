import { describe, expect, it } from 'vitest';
import { columnTemplate, moveTo, COL_MAX, COL_MIN } from './Dock';
import type { PcPanel, PcZone } from '../prefs';

const base: Record<PcZone, PcPanel[]> = { top: ['timeline'], left: ['list'], center: ['detail'], right: ['news', 'cards'] };
const all = () => true;

describe('PC 배치', () => {
  it('조각을 옮기면 원래 자리에서 빠지고 새 자리 순서에 들어감', () => {
    const n = moveTo(base, 'list', 'right', 1);
    expect(n.left).toEqual([]);
    expect(n.right).toEqual(['news', 'list', 'cards']);
    // 원본은 그대로
    expect(base.left).toEqual(['list']);
  });
  it('순서 범위를 벗어나도 끝에 붙음', () => {
    expect(moveTo(base, 'cards', 'left', 99).left).toEqual(['list', 'cards']);
    expect(moveTo(base, 'cards', 'left', -3).left).toEqual(['cards', 'list']);
  });
  it('차트가 있는 칸만 넓고, 좁은 칸 너비는 최소·최대 안으로', () => {
    const t = columnTemplate(['left', 'center', 'right'], base, all, { left: 9999, right: 10 });
    expect(t[1]).toBe('minmax(0, 1fr)');
    expect(t[0]).toContain(`${COL_MAX}px`);
    expect(t[2]).toContain(`${COL_MIN}px`);
  });
  it('차트를 숨겨도 한 칸은 넓게', () => {
    const t = columnTemplate(['left', 'center', 'right'], base, (p) => p !== 'detail', {});
    expect(t.filter((x) => x === 'minmax(0, 1fr)')).toHaveLength(1);
  });
  it('차트를 오른쪽으로 옮기면 오른쪽 칸이 넓어짐 (가운데는 좁게)', () => {
    const n = moveTo(base, 'detail', 'right', 0);
    const t = columnTemplate(['left', 'center', 'right'], n, all, {});
    expect(t[2]).toBe('minmax(0, 1fr)');
    expect(t.filter((x) => x === 'minmax(0, 1fr)')).toHaveLength(1);
  });
});
