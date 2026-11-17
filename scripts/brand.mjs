// 개미리그 로고·아이콘 파일 만들기 (2026-11-18, 'V자 더듬이' 개미)
//   node scripts/brand.mjs            → public/brand/* 와 public/favicon.ico 를 다시 만듦
//   node scripts/brand.mjs --tile=violet → 앱 아이콘·파비콘 바탕을 보라로 (기본: 검정, 2026-11-18 사용자 결정)
// 그림: 개미 머리 + 두 더듬이가 이어진 V자 차트 — 왼쪽 파란 선이 머리까지 떨어지고, 오른쪽 빨간 선이 다시 오름.
// PNG 는 이 컴퓨터 크롬(playwright-core)으로 그림.
import { writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = new URL('../public/brand/', import.meta.url);
const tileArg = (process.argv.find((a) => a.startsWith('--tile=')) || '--tile=dark').slice(7);

const C = {
  violet: '#6B58EE', // 주 버튼 보라
  ink: '#1B1530', // 보라 위 개미 머리 (아주 진한 남보라)
  bg: '#1C1C1C', // 검정 타일 (사이트 바탕 #111 보다 한 단계 밝은 카드 색)
  head: '#8B7BFF', // 어두운 바탕 위 개미 머리 (--accent)
  upOnViolet: '#FF6B7D',
  downOnViolet: '#7CC0FF',
  up: '#F2495C', // --up
  down: '#3B82F6', // --down
  eye: '#F7F7F8',
  text: '#F2F2F2',
  textLight: '#161616',
};

// 글자 로고는 예전과 같은 Pretendard ExtraBold 글자 모양(도형)
const WORD = readFileSync(new URL('wordmark-dark.svg', OUT), 'utf8').match(/d="([^"]+)"/)[1];

const st = (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const HEAD = 'M32 27C44 27 51 32 51 40.5C51 49 43 56.5 32 56.5C21 56.5 13 49 13 40.5C13 32 20 27 32 27Z';
const EYES = '<ellipse cx="20.5" cy="39" rx="3.3" ry="4.6" transform="rotate(-18 20.5 39)"/><ellipse cx="43.5" cy="39" rx="3.3" ry="4.6" transform="rotate(18 43.5 39)"/>';
const JAW = 'M27 52C28.5 55 30 56.5 32 57.5C34 56.5 35.5 55 37 52';

/** 64×64 마크. 눈·큰턱은 머리에서 뚫어 바탕이 비치게(마스크) — 어떤 바탕에서도 같은 모양 */
function mark({ id, tile, head, up, down, eyes = null, jaw = true }) {
  return (
    (tile ? `<rect width="64" height="64" rx="16" fill="${tile}"/>` : '') +
    st('M12 11L18.5 24L22.5 21L26 28.5', down, 3.4) +
    `<circle cx="12" cy="11" r="3.4" fill="${down}"/>` +
    st('M38 28.5L41.5 21L45.5 24L52 11', up, 3.4) +
    st('M46.5 11H52.5V17', up, 3.4) +
    `<mask id="${id}"><rect width="64" height="64" fill="#fff"/><g fill="#000">${EYES}</g>${jaw ? st(JAW, '#000', 2.2) : ''}</mask>` +
    `<path d="${HEAD}" fill="${head}" mask="url(#${id})"/>` +
    (eyes ? `<g fill="${eyes}">${EYES}</g>` : '')
  );
}
const svg = (vb, w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">${inner}</svg>\n`;

const violetMark = (id) => mark({ id, tile: C.violet, head: C.ink, up: C.upOnViolet, down: C.downOnViolet, eyes: C.eye });
const darkMark = (id) => mark({ id, tile: C.bg, head: C.head, up: C.up, down: C.down });
const tiled = tileArg === 'dark' ? darkMark : violetMark;
const word = (c) => `<path d="${WORD}" fill="${c}"/>`;

const files = {
  'mark.svg': svg('0 0 64 64', 64, 64, tiled('m')),
  'mark-violet.svg': svg('0 0 64 64', 64, 64, violetMark('m')),
  'mark-dark.svg': svg('0 0 64 64', 64, 64, darkMark('m')),
  'symbol.svg': svg('0 0 64 64', 64, 64, mark({ id: 'm', head: C.head, up: C.up, down: C.down })),
  'mark-mono-white.svg': svg('0 0 64 64', 64, 64, mark({ id: 'm', head: '#fff', up: '#fff', down: '#fff', jaw: false })),
  'mark-mono-black.svg': svg('0 0 64 64', 64, 64, mark({ id: 'm', head: C.textLight, up: C.textLight, down: C.textLight, jaw: false })),
};
for (const [n, c] of [['dark', C.text], ['light', C.textLight]]) {
  files[`logo-${n}.svg`] = svg('0 0 218 64', 218, 64, tiled('m') + `<g transform="translate(82 46)">${word(c)}</g>`);
  files[`logo-stacked-${n}.svg`] = svg('0 0 120 132', 120, 132, `<g transform="translate(20 0) scale(1.25)">${tiled('m')}</g><g transform="translate(2.76 124) scale(0.85)">${word(c)}</g>`);
}
for (const [n, body] of Object.entries(files)) writeFileSync(new URL(n, OUT), body);

// ---- PNG ----
const tileColor = tileArg === 'dark' ? C.bg : C.violet;
const inner = (id) => tiled(id).replace(/^<rect[^>]*\/>/, ''); // 타일 없이 그림만
const page = (w, h, body) => `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`;
const fullBleed = (size, scale) => // 꽉 찬 정사각형(OS 가 모서리를 깎음). scale = 그림 크기 비율
  page(size, size, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" fill="${tileColor}"/><g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${inner('p')}</g></svg>`);
const rounded = (size) => page(size, size, files['mark.svg'].replace('width="64" height="64"', `width="${size}" height="${size}"`));
const og = page(1200, 630, `
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
  <div style="width:1200px;height:630px;background:#111;display:flex;align-items:center;gap:64px;padding:0 112px;box-sizing:border-box;font-family:'Pretendard Variable',sans-serif;letter-spacing:-0.01em">
    <svg viewBox="0 0 64 64" width="280" height="280">${tiled('o')}</svg>
    <div style="display:flex;flex-direction:column;gap:22px">
      <svg viewBox="0 -33 135 37.5" width="360" height="100">${word(C.text)}</svg>
      <div style="font-size:42px;font-weight:800;color:#b9b0ff;letter-spacing:-0.02em">친구와 겨루는 모의 주식 대결</div>
      <div style="font-size:30px;font-weight:500;color:#9a9a9a">같은 시장, 같은 뉴스로 10분이면 한 판</div>
    </div>
  </div>`);

const browser = await chromium.launch({ channel: 'chrome' });
const shot = async (html, w, h, name) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const buf = await p.screenshot({ omitBackground: true, type: 'png' });
  await p.close();
  if (name) writeFileSync(new URL(name, OUT), buf);
  return buf;
};
await shot(rounded(32), 32, 32, 'favicon-32.png');
const ico16 = await shot(rounded(16), 16, 16, null);
const ico32 = readFileSync(new URL('favicon-32.png', OUT));
const ico48 = await shot(rounded(48), 48, 48, null);
await shot(rounded(192), 192, 192, 'app-icon-192.png');
await shot(rounded(512), 512, 512, 'app-icon-512.png');
await shot(fullBleed(512, 0.8), 512, 512, 'app-icon-maskable-512.png'); // 안드로이드: 가운데 80% 안전 영역
await shot(fullBleed(180, 0.92), 180, 180, 'apple-touch-icon.png'); // 아이폰 홈 화면
await shot(og, 1200, 630, 'og-1200x630.png');
await browser.close();

// favicon.ico (PNG 를 그대로 담는 ICO — 모든 요즘 브라우저가 읽음)
const imgs = [[16, ico16], [32, ico32], [48, ico48]];
const head = Buffer.alloc(6 + 16 * imgs.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach(([s, b], i) => {
  const o = 6 + 16 * i;
  head.writeUInt8(s, o); head.writeUInt8(s, o + 1); head.writeUInt8(0, o + 2); head.writeUInt8(0, o + 3);
  head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12);
  off += b.length;
});
writeFileSync(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([head, ...imgs.map(([, b]) => b)]));
console.log(`로고 파일을 만들었어요 (바탕: ${tileArg === 'dark' ? '검정' : '보라'})`);
