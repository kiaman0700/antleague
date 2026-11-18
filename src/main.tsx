import React from 'react';
import { ConfirmHost } from './components/ConfirmHost';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
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
import { startDeviceWatch } from './lib/device';
import { startInstallWatch } from './lib/install';

startInstallWatch();

// 새로 배포된 뒤 열려 있던 창에서 나중에 받는 화면(게임·공부·계정 등)의 옛 파일이 없어 못 받으면 한 번만 새로 고침
// (같은 창에서 1분 안에 또 실패하면 다시 고치지 않고 오류 화면 — 무한 새로 고침 방지)
window.addEventListener('vite:preloadError', (e) => {
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
      {/* Vercel 웹 분석: 주소 뒤 ?… (초대 방 코드 등)와 # 은 빼고 보냄 — 쿠키 없음 */}
      <Analytics beforeSend={(e) => ({ ...e, url: e.url.split(/[?#]/)[0] })} />
    </ErrorBoundary>
  </React.StrictMode>,
);
