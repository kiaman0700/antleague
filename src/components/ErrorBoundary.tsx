/**
 * 화면 오류 안전장치: 어떤 화면이 터져도 검은 화면 대신 안내와 복구 버튼을 보여 준다.
 * (게임 진행은 서버/저장소에 있으므로 새로고침하면 이어서 할 수 있음)
 */
import { Component, type ReactNode } from 'react';
import { resetLayout } from '../prefs';
import { FeedbackSheet } from './FeedbackSheet';

interface State {
  error: Error | null;
  report: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, report: false };
  static getDerivedStateFromError(error: Error): State {
    return { error, report: false };
  }
  componentDidCatch(error: Error) {
    console.error('화면 오류', error);
    // 같은 오류가 2분 안에 또 나면 내가 바꾼 화면 배치가 원인일 수 있어 자동으로 처음 배치로 (게임 기록은 그대로)
    try {
      const key = 'stockduel.crash';
      const prev = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { msg: string; at: number } | null;
      const msg = String(error?.message ?? '').slice(0, 120);
      if (prev && prev.msg === msg && Date.now() - prev.at < 120_000) {
        resetLayout();
        sessionStorage.removeItem(key);
      } else sessionStorage.setItem(key, JSON.stringify({ msg, at: Date.now() }));
    } catch {
      /* 저장소 없음 */
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-box">
          <h2>화면을 그리다 문제가 생겼어요</h2>
          <p className="muted">진행 중인 게임은 그대로 저장돼 있어요. 새로고침하면 이어서 할 수 있어요.</p>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => location.reload()}>
              새로고침
            </button>
            <button className="btn ghost" onClick={() => location.assign('/')}>
              홈으로
            </button>
            <button className="btn ghost" onClick={() => this.setState({ report: true })}>
              이 오류 알리기
            </button>
            {location.pathname.startsWith('/practice') && (
              <button
                className="btn ghost"
                onClick={() => {
                  if (!window.confirm('연습 게임 저장을 지울까요? 되돌릴 수 없어요.')) return;
                  try {
                    localStorage.removeItem('stockduel.solo2');
                  } catch {
                    /* 무시 */
                  }
                  location.assign('/');
                }}
              >
                연습 저장 지우기
              </button>
            )}
          </div>
        </div>
        {this.state.report && (
          <FeedbackSheet
            onClose={() => this.setState({ report: false })}
            initialKind="bug"
            initialText={`화면 오류가 났어요.
무엇을 하다가 났는지: 

(자동 기록) ${String(this.state.error?.message ?? '').slice(0, 300)}`}
            context="오류 화면"
          />
        )}
      </div>
    );
  }
}
