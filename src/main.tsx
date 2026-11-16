import React from 'react';
import ReactDOM from 'react-dom/client';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
