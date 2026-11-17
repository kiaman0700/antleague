import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { deviceCss } from '../../device-css';

const run = (css: string) => postcss([deviceCss()]).process(css, { from: undefined }).css.replace(/\s+/g, ' ').trim();

describe('CSS 폭 규칙에 기기 조건 붙이기', () => {
  it('휴대폰 기준 폭(860): PC 에선 안 쓰고, 휴대폰이면 폭과 상관없이 씀', () => {
    const out = run('@media (max-width: 860px) { .cl-top { display: none; } }');
    expect(out).toContain('@media (max-width: 860px) { :where(html:not([data-device="pc"])) .cl-top { display: none; } }');
    expect(out).toContain(':where(html:is([data-device="phone"],[data-fold="open"])) .cl-top { display: none; }');
  });
  it('다른 조건(가로 방향)은 남기고 폭 조건만 뺀 휴대폰 복사본', () => {
    const out = run('@media (max-width: 960px) and (orientation: landscape) { .a { color: red; } }');
    expect(out).toContain('@media (orientation: landscape) { :where(html:is([data-device="phone"],[data-fold="open"])) .a { color: red; } }');
    expect(out).toContain(':where(html:not([data-device="pc"])) .a');
  });
  it('작은 휴대폰 미세 조정(420)은 PC 에서만 막고 복사본은 없음', () => {
    const out = run('@media (max-width: 420px) { .b { gap: 2px; } }');
    expect(out).toBe('@media (max-width: 420px) { :where(html:not([data-device="pc"])) .b { gap: 2px; } }');
  });
  it('넓은 화면 시작(861): 휴대폰에선 안 쓰고, PC 면 창이 좁아도 씀', () => {
    const out = run('@media (min-width: 861px) and (max-width: 1279px) { .s { position: fixed; } }');
    expect(out).toContain('@media (min-width: 861px) and (max-width: 1279px) { :where(html:not([data-device="phone"]):not([data-fold="open"])) .s');
    expect(out).toContain('@media (max-width: 1279px) { :where(html[data-device="pc"]) .s');
  });
  it('html·:root 로 시작하는 선택자는 그 자리에 조건을 붙임 (우선순위는 그대로)', () => {
    const out = run('@media (max-width: 860px) { html { font-size: 15px; } :root { --x: 1; } }');
    expect(out).toContain('html:where(:not([data-device="pc"])) { font-size: 15px; }');
    expect(out).toContain(':root:where(:not([data-device="pc"])) { --x: 1; }');
  });
  it('폭과 상관없는 규칙은 그대로', () => {
    expect(run('@media (prefers-reduced-motion: reduce) { .c { animation: none; } }')).toBe('@media (prefers-reduced-motion: reduce) { .c { animation: none; } }');
    expect(run('.d { color: blue; }')).toBe('.d { color: blue; }');
  });
});
