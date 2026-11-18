// 기기 흉내 시험 (design/device-layout.md): 진짜 휴대폰·태블릿처럼(터치·화면 크기·브라우저 정보) 열어서
// 기기에 맞는 화면이 나오는지, 가로로 넘치지 않는지, 아래 탭이 한 줄인지 확인. 이 컴퓨터의 크롬을 씀
// 실행: BASE=http://localhost:5173 node scripts/e2e/devices.mjs   (화면 사진: scripts/e2e/.shots/)
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { BASE, ok, done } from './lib.mjs';

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_FOLD = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
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
  ['갤럭시 폴드 접힘', touch(344, 882, UA_FOLD), 'phone', 'mobile', 0],
  ['갤럭시 폴드 펼침', touch(884, 1104, UA_FOLD), 'tablet', 'mobile', 0],
  ['터치 노트북(윈도우)', { viewport: { width: 1366, height: 768 }, screen: { width: 1366, height: 768 }, hasTouch: true, userAgent: UA_WIN }, 'pc', 'desk', 0],
  ['아이패드 + 마우스(Mac 처럼 보임)', { viewport: { width: 1024, height: 1366 }, screen: { width: 1024, height: 1366 }, hasTouch: true, userAgent: UA_MAC }, 'tablet', 'desk', 0],
];
const ROUTES = ['casual', 'ranked', 'learn', 'custom', 'more', 'ranking', 'records', 'companies', 'rooms', 'create'];

fs.mkdirSync('scripts/e2e/.shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shot = (p, name) => p.screenshot({ path: `scripts/e2e/.shots/${name.replace(/\s+/g, '_')}.png` });

// 로그인 전(둘러보기)이면 연습이 '시작 방법 고르기' 창으로 막히므로, 게스트를 한 번만 만들어 모든 기기 시험에서 같이 씀 (손님 계정 생성 제한)
const STATE = 'scripts/e2e/.shots/guest-state.json';
{
  const c0 = await browser.newContext();
  await c0.addInitScript(() => {
    try {
      localStorage.setItem('stockduel.welcomed', '1');
      localStorage.setItem('stockduel.tourSkipped', '1');
      localStorage.setItem('stockduel.tutorial', '1');
    } catch {}
  });
  const p0 = await c0.newPage();
  await p0.goto(BASE + '/more', { waitUntil: 'domcontentloaded' });
  await p0.waitForTimeout(1500);
  await p0.locator('button', { hasText: '시작하기' }).first().click();
  await p0.waitForTimeout(400);
  const d0 = p0.locator('[role=dialog]').last();
  await d0.locator('button', { hasText: '게스트로 시작' }).click();
  await p0.waitForTimeout(300);
  await d0.locator('input').fill('기기개미' + Math.floor(Math.random() * 900));
  await p0.waitForTimeout(1200);
  await d0.locator('button[type=submit]').click();
  await p0.waitForTimeout(2500);
  // 로그인 정보만 옮김 — 기기 종류 기억값(stockduel.ff)은 기기마다 달라야 함
  const st = await c0.storageState();
  for (const o of st.origins) o.localStorage = o.localStorage.filter((x) => x.name !== 'stockduel.ff');
  fs.writeFileSync(STATE, JSON.stringify(st));
  await c0.close();
}

for (const [name, opts, wantDevice, wantGame, allowW] of DEVICES) {
  const ctx = await browser.newContext({ ...opts, storageState: STATE });
  // 아이패드처럼 터치 지점 수를 실제 기기와 같게 (시험용 크롬은 1개로 흉내 냄)
  if (opts.hasTouch) await ctx.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  // 진짜 기기처럼 '기기 종류'도 흉내: 크롬 계열(안드로이드·윈도우)은 알려 주고, 사파리(아이폰·아이패드·Mac)는 안 알려 줌
  const ua = opts.userAgent ?? '';
  const ff = /iPhone|iPad|Macintosh/.test(ua) ? null : /Android/.test(ua) ? (/Mobile/.test(ua) ? ['Mobile'] : ['Tablet']) : ['Desktop'];
  await ctx.addInitScript((ffv) => {
    if (!ffv) return void Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    const data = { mobile: ffv.includes('Mobile'), platform: '', brands: [], getHighEntropyValues: async () => ({ formFactors: ffv, model: '' }) };
    Object.defineProperty(navigator, 'userAgentData', { get: () => data });
  }, ff);
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
  await ctx.close();
}
await browser.close();
done();
