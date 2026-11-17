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
import { applyDevice } from './lib/device';

// 기기 종류(PC·태블릿·휴대폰)로 화면 고르기 — 그리기 전에 (design/device-layout.md)
applyDevice();

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
