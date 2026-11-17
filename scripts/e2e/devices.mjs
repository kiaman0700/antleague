// 기기 흉내 시험 (design/device-layout.md): 진짜 휴대폰·태블릿처럼(터치·화면 크기·브라우저 정보) 열어서
// 기기에 맞는 화면이 나오는지, 가로로 넘치지 않는지, 아래 탭이 한 줄인지 확인. 이 컴퓨터의 크롬을 씀
// 실행: BASE=http://localhost:5173 node scripts/e2e/devices.mjs   (화면 사진: scripts/e2e/.shots/)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { BASE, ok, done } from './lib.mjs';

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_TAB = 'Mozilla/5.0 (Linux; Android 14; SM-X710N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const touch = (w, h, ua) => ({ viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: ua });
const pc = (w, h) => ({ viewport: { width: w, height: h }, screen: { width: 1920, height: 1080 } });

// [이름, 설정, 기대 기기, 기대 게임 화면(mobile|desk), 가로 스크롤 허용 폭]
const DEVICES = [
  ['PC 1920', pc(1920, 1080), 'pc', 'desk', 0],
  ['PC 1440', pc(1440, 900), 'pc', 'desk', 0],
  ['PC 1280', pc(1280, 720), 'pc', 'desk', 0],
  ['PC 1024', pc(1024, 768), 'pc', 'desk', 0],
  ['PC 좁은 창 800', pc(800, 800), 'pc', 'desk', 900],
  ['아이폰 SE', touch(375, 667, UA_IPHONE), 'phone', 'mobile', 0],
  ['아이폰 15', touch(393, 852, UA_IPHONE), 'phone', 'mobile', 0],
  ['아이폰 15 가로', touch(852, 393, UA_IPHONE), 'phone', 'mobile', 0],
  ['아이폰 프로맥스 가로', touch(932, 430, UA_IPHONE), 'phone', 'mobile', 0],
  ['갤럭시', touch(360, 780, UA_ANDROID), 'phone', 'mobile', 0],
  ['아이패드 세로', touch(820, 1180, UA_IPAD), 'tablet', 'mobile', 0],
  ['아이패드 가로', touch(1180, 820, UA_IPAD), 'tablet', 'desk', 0],
  ['갤럭시 탭 세로', touch(800, 1280, UA_TAB), 'tablet', 'mobile', 0],
];
const ROUTES = ['casual', 'ranked', 'learn', 'custom', 'more', 'ranking', 'records', 'companies', 'rooms', 'create'];

fs.mkdirSync('scripts/e2e/.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shot = (p, name) => p.screenshot({ path: `scripts/e2e/.shots/${name.replace(/\s+/g, '_')}.png` });

for (const [name, opts, wantDevice, wantGame, allowW] of DEVICES) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // 로비 화면들
  const bad = [];
  for (const r of ROUTES) {
    await p.goto(BASE + '/' + r, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => ({ d: document.documentElement.dataset.device, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth }));
    if (m.d !== wantDevice) bad.push(`${r}: 기기 ${m.d}`);
    const limit = Math.max(m.w, allowW);
    if (m.sw > limit + 1) bad.push(`${r}: 가로 넘침 ${m.sw}>${limit}`);
    if (r === 'casual') await shot(p, `${name}-로비`);
  }
  ok(`${name}: 로비 ${ROUTES.length}화면 — 기기 ${wantDevice}, 가로 넘침 없음`, bad.length === 0, bad.slice(0, 3).join(' / '));
  // PC 메뉴바 / 휴대폰 아래 탭 (로비)
  await p.goto(BASE + '/casual');
  await p.waitForTimeout(1200);
  const chrome = await p.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
    return { pcTop: vis('.cl-top'), phoneNav: vis('.lobby-bottom') };
  });
  const wantPcTop = wantGame === 'desk';
  ok(`${name}: 로비 ${wantPcTop ? 'PC 메뉴바' : '휴대폰 아래 탭'}`, chrome.pcTop === wantPcTop && chrome.phoneNav === !wantPcTop, JSON.stringify(chrome));
  // 게임 화면 (혼자 연습)
  await p.goto(BASE + '/learn');
  await p.waitForTimeout(1200);
  await p.locator('button', { hasText: '혼자 연습' }).first().click();
  await p.waitForTimeout(500);
  await p.locator('[role=dialog] button', { hasText: '시작' }).last().click();
  await p.waitForTimeout(2500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const g = await p.evaluate(() => {
    const nav = document.querySelector('.m-game .bottom-nav');
    const rows = nav ? new Set([...nav.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top))).size : 0;
    return { game: document.querySelector('.m-game') ? 'mobile' : document.querySelector('.game.desk') ? 'desk' : '?', rows, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth };
  });
  ok(`${name}: 게임 ${wantGame === 'mobile' ? '휴대폰 화면(아래 탭)' : 'PC 화면'}`, g.game === wantGame, JSON.stringify(g));
  if (wantGame === 'mobile') ok(`${name}: 게임 아래 탭 한 줄`, g.rows === 1, String(g.rows));
  ok(`${name}: 게임 가로 넘침 없음`, g.sw <= Math.max(g.w, allowW) + 1, `${g.sw}>${g.w}`);
  await shot(p, `${name}-게임`);
  // 연습 정리 (저장 지우기)
  await p.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (k.includes('solo')) localStorage.removeItem(k); } catch {} });
  ok(`${name}: 화면 오류 없음`, errors.length === 0, errors.slice(0, 2).join(' / '));
  await ctx.close();
}

// 주소 강제(?device=) — PC 창에서 휴대폰 화면 보기 (시험용, 그 창에서만)
{
  const ctx = await browser.newContext(pc(1440, 900));
  const p = await ctx.newPage();
  await p.goto(BASE + '/casual?device=phone');
  await p.waitForTimeout(1200);
  ok('PC 창 + ?device=phone → 휴대폰 화면', (await p.evaluate(() => document.documentElement.dataset.device)) === 'phone');
  await p.goto(BASE + '/casual?device=auto');
  await p.waitForTimeout(1200);
  ok('?device=auto → 다시 자동(PC)', (await p.evaluate(() => document.documentElement.dataset.device)) === 'pc');
  // 설정 '화면 종류'로 고르면 새로고침해도 유지
  await p.goto(BASE + '/more');
  await p.waitForTimeout(1200);
  await p.locator('[aria-label="화면 종류"] button', { hasText: '태블릿' }).click();
  await p.waitForTimeout(400);
  await p.reload();
  await p.waitForTimeout(1200);
  ok('설정 화면 종류 = 태블릿 → 새로고침해도 태블릿', (await p.evaluate(() => document.documentElement.dataset.device)) === 'tablet');
  await p.locator('[aria-label="화면 종류"] button', { hasText: '자동' }).click();
  await p.waitForTimeout(400);
  ok('설정 자동 → PC 로 돌아옴', (await p.evaluate(() => document.documentElement.dataset.device)) === 'pc');
  await ctx.close();
}
await browser.close();
done();
