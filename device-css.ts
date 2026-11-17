/**
 * 빌드할 때 CSS 의 '화면 종류를 가르는 폭 규칙'에 기기 조건을 자동으로 붙임 (설계서 design/device-layout.md)
 *  - 좁은 화면 규칙(max-width ≤ 960px): PC 에서는 창이 좁아져도 안 씀 → html:not([data-device="pc"]) 아래로
 *    그중 휴대폰/PC 를 가르는 기준(860·960)은 휴대폰이면 폭과 상관없이 씀 → html[data-device="phone"] 복사본(폭 조건 뺌)
 *  - 넓은 화면 시작 규칙(min-width 861~961px): 휴대폰에서는 넓어져도 안 씀 → html:not([data-device="phone"]) 아래로
 *    PC 면 창이 좁아도 씀 → html[data-device="pc"] 복사본(그 폭 조건만 뺌)
 * 원본 CSS 는 그대로 읽기 쉽게 두고, 바뀐 결과만 빌드에 들어감
 */
import type { AtRule, ChildNode, Container, Plugin } from 'postcss';

const SPLIT = [860, 960]; // 휴대폰 화면 ↔ 넓은 화면을 가르는 폭
const WIDE_START = [861, 961];

const widths = (params: string, kind: 'max' | 'min') => [...params.matchAll(new RegExp(`${kind}-width:\\s*(\\d+)px`, 'g'))].map((m) => Number(m[1]));

/** media 조건에서 특정 폭 조건만 빼기 ("(max-width: 860px) and (orientation: landscape)" → "(orientation: landscape)") */
function dropWidth(params: string, test: (kind: string, v: number) => boolean): string | null {
  if (params.includes(',')) return null; // '또는' 조건은 복사하지 않음 (없음)
  const parts = params.split(/\s+and\s+/i).filter((p) => {
    const m = p.match(/(max|min)-width:\s*(\d+)px/);
    return !(m && test(m[1], Number(m[2])));
  });
  return parts.join(' and ').trim();
}

/** 안의 모든 규칙 선택자 앞에 기기 조건 붙이기 */
function gate(node: Container, cond: string) {
  // cond 예: ':not([data-device="pc"])' / '[data-device="phone"]'
  node.walkRules((rule) => {
    if (rule.parent && (rule.parent as AtRule).name?.endsWith('keyframes')) return;
    rule.selectors = rule.selectors.map((s) => {
      const t = s.trim();
      // :where() 로 감싸 우선순위(점수)는 그대로 — 원래 규칙끼리 이기고 지는 순서가 바뀌지 않게
      if (/^(html|:root)(?![\w-])/.test(t)) return t.replace(/^(html|:root)/, `$1:where(${cond})`);
      return `:where(html${cond}) ${t}`;
    });
  });
}

/** media 블록을 복사해 폭 조건을 빼고 기기 조건만 붙인 것 (조건이 다 빠지면 media 없이 규칙만) */
function cloneFor(at: AtRule, cond: string, drop: (kind: string, v: number) => boolean) {
  const params = dropWidth(at.params, drop);
  if (params === null) return;
  const copy = at.clone();
  gate(copy, cond);
  if (params) {
    copy.params = params;
    at.after(copy);
  } else {
    const nodes = copy.nodes ? [...copy.nodes] : [];
    let last: ChildNode = at;
    for (const n of nodes) {
      last.after(n);
      last = n;
    }
  }
}

export function deviceCss(): Plugin {
  return {
    postcssPlugin: 'device-gate',
    Once(root) {
      const ats: AtRule[] = [];
      root.walkAtRules('media', (at) => {
        ats.push(at);
      });
      for (const at of ats) {
        const max = widths(at.params, 'max');
        const min = widths(at.params, 'min');
        const narrow = max.some((v) => v <= 960);
        const wideStart = min.some((v) => WIDE_START.includes(v));
        if (narrow && max.some((v) => SPLIT.includes(v))) {
          // 휴대폰이면 폭과 상관없이 (가로로 눕혀 넓어져도 휴대폰 화면)
          cloneFor(at, '[data-device="phone"]', (k, v) => k === 'max' && SPLIT.includes(v));
        }
        if (wideStart) {
          // PC 면 창이 좁아도 넓은 화면 규칙
          cloneFor(at, '[data-device="pc"]', (k, v) => k === 'min' && WIDE_START.includes(v));
        }
        // 원본은 한 번만 감쌈 (둘 다면 태블릿만)
        const cond = (narrow ? ':not([data-device="pc"])' : '') + (wideStart ? ':not([data-device="phone"])' : '');
        if (cond) gate(at, cond);
      }
    },
  };
}
