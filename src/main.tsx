import { RenameNotice } from './components/RenameNotice';
import { ConcurrentHost } from './components/ConcurrentHost';
import React from 'react';
import { ConfirmHost } from './components/ConfirmHost';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
// 글꼴은 우리 서버에서 (바깥 주소에 새로 연결하느라 첫 화면이 늦던 것). 라이선스: SIL OFL 1.1
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import './styles-extra.css';
import './styles-v4.css';
import './styles-desk.css';
import './styles-multi.css';
import './styles-chart.css';
import './styles-lobby.css';
import './styles-ui.css';
import './styles-nav.css';
import './styles-client.css';
import './styles-kit.css';
import './styles-v2.css';
import './styles-aug.css';
import './styles-premium.css';
import { startDeviceWatch } from './lib/device';
import { startInstallWatch } from './lib/install';
import { startRadioKeys } from './lib/radioKeys';

// UI 2판 미리 보기: 주소에 ?ui=v2 를 붙이면 이 창에서만 새 디자인 (?ui=v1 로 되돌림). 기본 화면은 그대로
try {
  const want = new URLSearchParams(location.search).get('ui');
  if (want === 'v2' || want === 'v1') sessionStorage.setItem('stockduel.ui', want);
  if (sessionStorage.getItem('stockduel.ui') === 'v2') document.documentElement.dataset.ui = 'v2';
} catch {
  /* 저장소가 막힌 창은 기본 화면 */
}

startInstallWatch();
startRadioKeys();
// 아이폰 사파리는 문서에 touchstart 가 있어야 버튼의 :active(누름 효과)가 보임
document.addEventListener('touchstart', () => {}, { passive: true });

// 새로 배포된 뒤 열려 있던 창에서 나중에 받는 화면(게임·공부·계정 등)의 옛 파일이 없어 못 받으면 한 번만 새로 고침
// (같은 창에서 1분 안에 또 실패하면 다시 고치지 않고 오류 화면 — 무한 새로 고침 방지)
window.addEventListener('vite:preloadError', (e) => {
  // 인터넷이 끊긴 거면 새로 고쳐도 브라우저 '오프라인' 화면만 나옴 → 오류 화면(연결되면 저절로 다시)에 맡김
  if (navigator.onLine === false) return;
  try {
    const last = Number(sessionStorage.getItem('stockduel.reloadAt') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('stockduel.reloadAt', String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

// 기기 종류(PC·태블릿·휴대폰)로 화면 고르기 — 그리기 전에 (design/device-layout.md)
startDeviceWatch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <ConfirmHost />
      <ConcurrentHost />
      <RenameNotice />
      {/* Vercel 웹 분석: 주소 뒤 ?… (초대 방 코드 등)와 # 은 빼고 보냄 — 쿠키 없음 */}
      <Analytics beforeSend={(e) => ({ ...e, url: e.url.split(/[?#]/)[0] })} />
    </ErrorBoundary>
  </React.StrictMode>,
);
