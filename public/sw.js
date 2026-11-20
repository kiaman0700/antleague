// 설치형 웹앱용 서비스 워커: 인터넷이 끊겼을 때 빈 화면 대신 안내 화면만 보여 줌.
// 게임 데이터·화면 코드는 저장하지 않음 — 배포하면 바로 새 버전이 뜨고, 옛 코드가 남아 꼬이지 않게.
const CACHE = 'antleague-offline-v2';
const OFFLINE = '/offline.html';
const FILES = [OFFLINE, '/brand/mark.svg', '/brand/app-icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 화면 이동(주소 열기)만: 먼저 인터넷으로, 안 되면 안내 화면
  if (req.mode === 'navigate') {
    // 브라우저 보관본(HTTP 캐시)의 index.html 을 받으면 화면 코드를 못 불러와 로딩에서 멈추므로 늘 새로 받음
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(OFFLINE)));
    return;
  }
  // 안내 화면이 쓰는 그림만 저장본으로
  if (FILES.includes(url.pathname)) e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
