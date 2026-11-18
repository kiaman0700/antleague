// 정렬·크기 빠른 점검 (사람이 보는 도구). 실행: BASE=http://localhost:5173 node scripts/layout-audit.mjs [phone|pc] [화면들]
// 화면마다: 글자 크기 종류(단계 밖 크기), 1~4px 어긋난 왼쪽 정렬, 한 줄 버튼 높이 차이, 아이콘·글자 세로 중심 어긋남, 상자 밖으로 넘친 글
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const kind = process.argv[2] ?? 'phone';
const routes = (process.argv[3] ?? 'casual ranked learn custom more ranking records companies rooms create login signup notices').split(' ');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const opts = kind === 'phone' ? { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, userAgent: UA } : { viewport: { width: 1440, height: 900 } };

const audit = () => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  const name = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 18)}"`;
  const out = { sizes: {}, align: [], btnH: [], icon: [], overflow: [] };
  // 1) 글자 크기
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t; (t = walker.nextNode()); ) {
    const e = t.parentElement;
    if (!t.textContent.trim() || !e || seen.has(e) || !vis(e) || e.closest('svg')) continue;
    seen.add(e);
    const fs = parseFloat(getComputedStyle(e).fontSize);
    const k = Math.round(fs * 2) / 2;
    (out.sizes[k] ??= []).push(name(e));
  }
  // 2) 같은 부모 안에서 세로로 쌓인 형제들의 왼쪽 끝이 1~4px 어긋남
  for (const p of document.querySelectorAll('body *')) {
    if (!vis(p) || p.children.length < 2 || p.closest('svg')) continue;
    const kids = [...p.children].filter((k) => vis(k) && getComputedStyle(k).position === 'static');
    if (kids.length < 2) continue;
    const ps = getComputedStyle(p);
    if (ps.display.includes('flex') && !ps.flexDirection.startsWith('column')) continue;
    if (ps.display.includes('grid')) continue;
    const lefts = kids.map((k) => k.getBoundingClientRect().left);
    const base = Math.min(...lefts);
    kids.forEach((k, i) => {
      const d = lefts[i] - base;
      if (d >= 1 && d <= 4 && getComputedStyle(k).textAlign !== 'center') out.align.push(`${name(k)} +${d.toFixed(1)}px (${name(p)})`);
    });
  }
  // 3) 한 줄에 나란한 버튼 높이 차이 1~8px
  for (const p of document.querySelectorAll('body *')) {
    if (!vis(p)) continue;
    const bs = [...p.children].filter((k) => (k.tagName === 'BUTTON' || k.getAttribute('role') === 'button' || k.tagName === 'A') && vis(k));
    if (bs.length < 2) continue;
    const rows = {};
    for (const b of bs) {
      const r = b.getBoundingClientRect();
      (rows[Math.round(r.top / 6)] ??= []).push([b, r.height]);
    }
    for (const row of Object.values(rows)) {
      if (row.length < 2) continue;
      const hs = row.map((x) => x[1]);
      const d = Math.max(...hs) - Math.min(...hs);
      if (d >= 1 && d <= 8) out.btnH.push(`${row.map((x) => name(x[0]) + ' ' + Math.round(x[1])).join(' / ')}`);
    }
  }
  // 4) 아이콘 + 글자 한 줄: 세로 중심 차이 > 2px
  for (const svg of document.querySelectorAll('svg')) {
    const p = svg.parentElement;
    if (!p || !vis(svg) || !vis(p)) continue;
    const ps = getComputedStyle(p);
    if (!ps.display.includes('flex') || ps.flexDirection.startsWith('column')) continue;
    const sr = svg.getBoundingClientRect();
    if (sr.width > 40) continue;
    // 같은 부모 안의 글자(첫 번째 텍스트 줄)
    const range = document.createRange();
    let tn = null;
    for (const n of p.childNodes) if ((n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && n !== svg && n.tagName !== 'svg' && n.textContent.trim() && !n.querySelector('svg'))) { tn = n; break; }
    if (!tn) continue;
    if (tn.nodeType === 3) range.selectNodeContents(tn);
    else range.selectNodeContents(tn);
    const rects = range.getClientRects();
    if (!rects.length) continue;
    const tr = rects[0];
    const d = (sr.top + sr.height / 2) - (tr.top + tr.height / 2);
    if (Math.abs(d) > 2 && Math.abs(d) < 12 && p.getBoundingClientRect().height < 60) out.icon.push(`${name(p)} 아이콘 ${d > 0 ? '아래' : '위'}로 ${Math.abs(d).toFixed(1)}px`);
  }
  // 5) 넘친 글 (잘리지도 않고 상자 밖으로)
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || !e.textContent.trim()) continue;
    const s = getComputedStyle(e);
    if (s.overflowX !== 'visible' || s.whiteSpace === 'normal' && e.scrollWidth <= e.clientWidth + 1) continue;
    if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && !['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowX) && e.children.length === 0) out.overflow.push(`${name(e)} ${e.scrollWidth}>${e.clientWidth}`);
  }
  return out;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

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

const ctx = await browser.newContext(opts);
if (kind === 'phone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); });
const page = await ctx.newPage();
await startGuest(ctx, page, BASE);
const allSizes = {};
for (const r of routes) {
  await page.goto(BASE + '/' + (r === 'practice' ? 'learn' : r), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (r === 'practice') {
    // 혼자 연습을 시작해 게임 화면(휴대폰은 아래 탭마다)을 잼
    await page.evaluate(() => { try { localStorage.setItem('stockduel.tutorial', '1'); localStorage.setItem('stockduel.preSeen', '1'); } catch {} });
    await page.locator('button', { hasText: '혼자 연습' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('[role=dialog] button', { hasText: '시작' }).last().click();
    await page.waitForTimeout(1500);
    for (let i = 0; i < 2; i++) { const sk = page.locator('button', { hasText: '건너뛰기' }); if (await sk.count()) await sk.first().click().catch(() => {}); }
    await page.locator('button:not([disabled])', { hasText: /^장 시작/ }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  const a = await page.evaluate(audit);
  if (r === 'practice' && kind === 'phone') {
    const n = await page.locator('.m-game .bottom-nav > button').count();
    for (let i = 0; i < n; i++) {
      await page.locator('.m-game .bottom-nav > button').nth(i).click();
      await page.waitForTimeout(700);
      const b = await page.evaluate(audit);
      for (const k of ['align', 'btnH', 'icon', 'overflow']) a[k].push(...b[k].map((x) => '[탭' + (i + 1) + '] ' + x));
    }
  }
  for (const [k, v] of Object.entries(a.sizes)) (allSizes[k] ??= []).push(...v.map((x) => r + ': ' + x));
  const lines = [];
  if (a.align.length) lines.push(`  정렬 어긋남 ${a.align.length}: ${a.align.slice(0, 5).join(' | ')}`);
  if (a.btnH.length) lines.push(`  버튼 높이 차이 ${a.btnH.length}: ${a.btnH.slice(0, 4).join(' | ')}`);
  if (a.icon.length) lines.push(`  아이콘 어긋남 ${a.icon.length}: ${a.icon.slice(0, 5).join(' | ')}`);
  if (a.overflow.length) lines.push(`  넘친 글 ${a.overflow.length}: ${a.overflow.slice(0, 4).join(' | ')}`);
  console.log(`[${kind}] /${r}${lines.length ? '' : ' 문제 없음'}`);
  for (const l of lines) console.log(l);
}
console.log('\n글자 크기 (px: 쓰인 곳 수)');
for (const k of Object.keys(allSizes).sort((a, b) => a - b)) console.log(`  ${k}px: ${allSizes[k].length}  예) ${[...new Set(allSizes[k])].slice(0, 3).join(' | ')}`);
await browser.close();
