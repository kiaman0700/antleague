import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 소스 파일에 보이지 않는 제어 문자가 섞이지 않게 (정규식의 \1 이 제어 문자로 바뀌면
 * '같은 글자 반복' 비밀번호 검사가 몰래 꺼짐)
 */
const ROOTS = ['src', 'api', 'scripts', 'supabase'];
const EXT = /\.(ts|tsx|mjs|js|css|sql|html)$/;
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

describe('소스 파일 위생', () => {
  it('탭·줄바꿈 말고 다른 제어 문자가 없음', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      for (const f of walk(root)) {
        const s = readFileSync(f, 'utf8');
        const i = s.search(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
        if (i >= 0) bad.push(`${f} @${i}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
