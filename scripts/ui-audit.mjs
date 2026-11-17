// 화면 자동 점검 (개발용): 여러 주소를 휴대폰·태블릿·PC 크기로 열어 문제를 찾는다
//   - 페이지 가로 넘침 · 화면 밖으로 나간 요소 · 잘린 글자(말줄임 포함) · 11px 미만 글자 · 휴대폰에서 32px 미만 버튼
// 사용: node scripts/ui-audit.mjs [BASE] (dev 서버 필요, 이 컴퓨터 크롬 사용)
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:5174';
const ROUTES = ['/casual', '/ranked', '/custom', '/learn', '/more', '/ranking', '/records', '/companies', '/rooms', '/create', '/login', '/signup', '/friends', '/customize', '/tutorial'];
const SIZES = [
  { name: 'phone', w: 375, h: 812, device: 'phone' },
  { name: 'tablet', w: 768, h: 1024, device: 'tablet' },
  { name: 'pc', w: 1440, h: 900, device: 'pc' },
];

const audit = () => {
  const out = [];
  const W = document.documentElement.clientWidth;
  const phone = document.documentElement.dataset.device === 'phone';
  if (document.documentElement.scrollWidth > W + 1) out.push(`가로 넘침 ${document.documentElement.scrollWidth}>${W}`);
  const name = (el) => {
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} "${t}"`;
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    // 화면 밖 (가로 스크롤 칸 안은 제외)
    let inScroller = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden') { inScroller = true; break; }
    }
    if (!inScroller && cs.position !== 'fixed' && (r.right > W + 2 || r.left < -2)) out.push(`화면 밖 ${Math.round(r.left)}~${Math.round(r.right)} ${name(el)}`);
    // 잘린 글자
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText && (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1) out.push(`잘린 글자 ${name(el)}`);
    // 작은 글자
    if (ownText && parseFloat(cs.fontSize) < 11) {
      const k = `작은 글자 ${cs.fontSize} ${name(el)}`;
      if (!seen.has(k)) (seen.add(k), out.push(k));
    }
    // 휴대폰: 누르기 어려운 버튼
    if (phone && (el.tagName === 'BUTTON' || (el.tagName === 'A' && el.getAttribute('href'))) && (r.height < 30 || r.width < 30)) {
      const k = `작은 버튼 ${Math.round(r.width)}x${Math.round(r.height)} ${name(el)}`;
      if (!seen.has(k)) (seen.add(k), out.push(k));
    }
    // 버튼에 이름이 없음
    if (el.tagName === 'BUTTON' && !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')) out.push(`이름 없는 버튼 ${name(el)}`);
  }
  return out;
};

const browser = await chromium.launch({ channel: 'chrome' });
let total = 0;
for (const s of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(`${BASE}${r}?device=${s.device}`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(800);
    const found = await page.evaluate(audit);
    if (found.length) {
      total += found.length;
      console.log(`\n[${s.name}] ${r}`);
      for (const f of found.slice(0, 25)) console.log('  ' + f);
      if (found.length > 25) console.log(`  … ${found.length - 25}개 더`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n합계 ${total}건`);
