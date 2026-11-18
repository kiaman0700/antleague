import fs from 'node:fs';
// 접근성·배치 빠른 점검 (사람이 보는 도구, e2e 묶음에는 안 들어감)
// 실행: BASE=http://localhost:5173 node scripts/a11y-audit.mjs [phone|pc|tablet]
// 화면마다: 이름 없는 버튼·링크, 설명 없는 그림, 이름표 없는 입력칸, 글자 대비 4.5:1 미만(큰 글자 3:1), 휴대폰에서 너무 작은 누를 곳(< 32px), 가로 넘침
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const only = process.argv[2];
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SIZES = [
  ['phone', { viewport: { width: 375, height: 740 }, screen: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA_IPHONE }],
  ['small', { viewport: { width: 320, height: 640 }, screen: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA_IPHONE }],
  ['tablet', { viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA_IPAD }],
  ['pc', { viewport: { width: 1440, height: 900 }, screen: { width: 1920, height: 1080 } }],
].filter(([n]) => !only || n === only);
const ROUTES = (process.env.ROUTES ?? 'casual ranked learn custom more ranking records companies rooms create login signup notices league install tutorial customize practice').split(' ');

const audit = () => {
  const out = [];
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const desc = (e) => {
    const t = (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}${t ? ` "${t}"` : ''}`;
  };
  const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title || e.innerText || e.querySelector('img[alt]')?.alt || '').trim();
  for (const e of document.querySelectorAll('button, a[href], [role=button], [role=tab]')) if (vis(e) && !name(e)) out.push(['이름 없음', desc(e)]);
  for (const e of document.querySelectorAll('img')) if (vis(e) && !e.hasAttribute('alt')) out.push(['그림 설명 없음', e.src.slice(-40)]);
  for (const e of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!vis(e)) continue;
    const lab = e.id && document.querySelector(`label[for="${e.id}"]`);
    if (!lab && !e.closest('label') && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.placeholder) out.push(['입력 이름표 없음', desc(e)]);
  }
  // 대비
  const rgb = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [r, g, b, a];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (e) => {
    let col = [17, 17, 17];
    const stack = [];
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; // 그림·그라데이션 위 글자는 건너뜀
      const c = rgb(s.backgroundColor);
      if (c && c[3] > 0) {
        stack.push(c);
        if (c[3] >= 1) break;
      }
    }
    for (const c of stack.reverse()) col = col.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    return col;
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = walker.nextNode()); ) {
    if (!t.textContent.trim()) continue;
    const e = t.parentElement;
    if (!e || seen.has(e) || !vis(e)) continue;
    seen.add(e);
    if (e.closest('svg, [aria-hidden=true], .sr-only, :disabled, [aria-disabled=true]')) continue;
    const s = getComputedStyle(e);
    const fg = rgb(s.color);
    const bg = bgOf(e);
    if (!fg || !bg) continue;
    let op = 1;
    for (let n = e; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const f = fg.slice(0, 3).map((v, i) => v * fg[3] * op + bg[i] * (1 - fg[3] * op));
    const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize);
    const big = size >= 24 || (size >= 18.6 && Number(s.fontWeight) >= 700);
    if (ratio < (big ? 3 : 4.5)) out.push(['대비 ' + ratio.toFixed(2), `${desc(e)} ${size}px`]);
  }
  // 작은 누를 곳 (휴대폰)
  if (document.documentElement.dataset.device === 'phone')
    for (const e of document.querySelectorAll('button, a[href], [role=button], input[type=checkbox], select')) {
      if (e.closest('label')) continue;
      if (!vis(e)) continue;
      const r = e.getBoundingClientRect();
      // 보이지 않게 넓힌 누르는 범위(::before/::after, position:absolute + 음수 inset)까지 셈
      let w = r.width, h = r.height;
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(e, pe);
        if (cs.position !== 'absolute' || cs.content === 'none') continue;
        const n = (v) => (v.endsWith('px') ? -Math.min(0, parseFloat(v)) : 0);
        w = Math.max(w, r.width + n(cs.left) + n(cs.right));
        h = Math.max(h, r.height + n(cs.top) + n(cs.bottom));
      }
      if (w < 24 || h < 24) {
        // 글 안의 링크는 제외
        if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') continue;
        out.push(['작은 누를 곳 ' + Math.round(r.width) + '×' + Math.round(r.height), desc(e)]);
      }
    }
  const sw = document.documentElement.scrollWidth, w = document.documentElement.clientWidth;
  if (sw > w + 1) out.push(['가로 넘침', `${sw}>${w}`]);
  return out;
};


/** 게스트로 시작 (고르기 전 '둘러보기'면 연습·화면 편집이 홈으로 돌아가서) — 환영 창·튜토리얼 권하기는 안 뜨게 */
async function startGuest(ctx, p, base) {
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('stockduel.welcomed', '1');
      localStorage.setItem('stockduel.tourSkipped', '1');
      localStorage.setItem('stockduel.tutorial', '1');
    } catch {}
  });
  await p.goto(base + '/more', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const go = p.locator('button', { hasText: '시작하기' }).first();
  if (!(await go.count())) return;
  await go.click();
  await p.waitForTimeout(400);
  const d = p.locator('[role=dialog]').last();
  await d.locator('button', { hasText: '게스트로 시작' }).click().catch(() => {});
  await p.waitForTimeout(300);
  await d.locator('input').fill('점검개미' + Math.floor(Math.random() * 900)).catch(() => {});
  await p.waitForTimeout(1200);
  await d.locator('button[type=submit]').click().catch(() => {});
  await p.waitForTimeout(2500);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [label, opts] of SIZES) {
  const ctx = await browser.newContext(opts);
  if (opts.hasTouch) await ctx.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  // 사파리처럼 '기기 종류' 정보 없음 (시험용 크롬이 데스크톱이라고 알려 주지 않게) — devices.mjs 와 같음
  if (opts.hasTouch) await ctx.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }));
  const p = await ctx.newPage();
  // 회원 화면 점검: A11Y_SESSION=세션 파일({key,val}) 이면 그 로그인으로 (비밀번호·토큰은 출력하지 않음)
  if (process.env.A11Y_SESSION) {
    const sess = JSON.parse(fs.readFileSync(process.env.A11Y_SESSION, 'utf8'));
    await ctx.addInitScript((x) => {
      try {
        localStorage.setItem(x.key, x.val);
        localStorage.setItem('stockduel.welcomed', '1');
        localStorage.setItem('stockduel.tourSkipped', '1');
        localStorage.setItem('stockduel.tutorial', '1');
      } catch {}
    }, sess);
  } else await startGuest(ctx, p, BASE);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  for (const r of ROUTES) {
    await p.goto(BASE + '/' + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    if (r === 'practice') {
      // 연습 메뉴에서 '혼자 연습' → 시작 (저장이 없으면 /practice 는 로비로 돌아감)
      await p.goto(BASE + '/learn', { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1200);
      await p.locator('button', { hasText: '혼자 연습' }).first().click().catch(() => {});
      await p.waitForTimeout(500);
      await p.locator('[role=dialog] button', { hasText: '시작' }).last().click().catch(() => {});
      await p.waitForTimeout(2500);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    }
    const found = await p.evaluate(audit);
    // 게임(연습)은 휴대폰 아래 탭을 하나씩 눌러 그 화면도 점검
    if (r === 'practice' || r === 'customize') {
      const tabs = await p.locator('.m-game .bottom-nav > button').count();
      for (let i = 0; i < tabs; i++) {
        await p.locator('.m-game .bottom-nav > button').nth(i).click().catch(() => {});
        await p.waitForTimeout(700);
        for (const f of await p.evaluate(audit)) found.push([f[0], '[탭' + (i + 1) + '] ' + f[1]]);
      }
    }
    const groups = {};
    for (const [k, v] of found) (groups[k.replace(/ [\d.×]+$/, '')] ??= []).push(`${k.match(/[\d.×]+$/)?.[0] ?? ''} ${v}`.trim());
    const lines = Object.entries(groups).map(([k, vs]) => `   ${k} ${vs.length}: ${[...new Set(vs)].slice(0, 6).join(' | ')}`);
    console.log(`[${label}] /${r}${lines.length ? '' : ' 문제 없음'}`);
    for (const l of lines) console.log(l);
  }
  if (errors.length) console.log(`[${label}] 화면 오류: ${errors.slice(0, 3).join(' / ')}`);
  await ctx.close();
}
await browser.close();
