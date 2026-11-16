import { useEffect, useState } from 'react';
import { Loading } from './components/ui';
import { consumeMatched, useMatch } from './net/matchStore';
import { loadSolo, newSolo } from './engine/local';
import { api } from './net/api';
import { supabase } from './lib/supabase';
import { useRouter, type Route } from './router';
import { GameController } from './screens/GameController';
import { Lobby, type ResumeInfo } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { loadNick, loadUi, type UiMode } from './session';

/** 새로고침하거나 주소를 직접 열었을 때 서버/저장소 정보로 화면 복원 */
async function resolvePath(path: string): Promise<{ route: Route; url?: string }> {
  if (path.startsWith('/practice')) {
    const solo = loadSolo();
    return solo
      ? { route: { kind: 'game', session: { mode: 'solo', roomId: null, playerId: 'me', nickname: solo.nickname, ui: loadUi() } } }
      : { route: { kind: 'lobby' }, url: '/' };
  }
  const m = path.match(/^\/(room|game)\/([A-Z0-9]{6})$/i);
  if (!m) return { route: { kind: 'lobby' }, url: '/' };
  const code = m[2].toUpperCase();
  if (supabase) {
    const r = await api<ResumeInfo | null>('resume').catch(() => null);
    if (r && r.code === code) {
      if (r.status === 'waiting') return { route: { kind: 'waiting', roomId: r.roomId, playerId: r.playerId, nickname: r.nickname, code } };
      return { route: { kind: 'game', session: { mode: 'multi', roomId: r.roomId, code, playerId: r.playerId, nickname: r.nickname, ui: r.mode as UiMode } } };
    }
  }
  // 내 방이 아니면 초대 링크로 보고 로비에서 코드를 채워 줌
  return { route: { kind: 'lobby' }, url: `/?room=${code}` };
}

export default function App() {
  const { route, navigate } = useRouter();
  // 연습 '같은 설정으로 한 판 더' 때 게임 화면을 새로 그리기 위한 번호
  const [replay, setReplay] = useState(0);
  // 매칭이 잡히면 어느 화면(로비·튜토리얼·화면 편집·연습)에 있든 바로 그 게임으로
  const match = useMatch();
  useEffect(() => {
    if (!match.matched) return;
    const m = consumeMatched();
    if (m) navigate({ kind: 'game', session: { mode: 'multi', roomId: m.roomId, code: m.code, playerId: m.playerId, nickname: m.nickname, ui: loadUi() } });
  }, [match.matched, navigate]);

  useEffect(() => {
    if (route.kind !== 'resolve') return;
    let alive = true;
    resolvePath(route.path).then(({ route: r, url }) => {
      if (!alive) return;
      if (url) history.replaceState(r, '', url);
      navigate(r, { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [route, navigate]);

  switch (route.kind) {
    case 'resolve':
      return (
        <div className="center-msg">
          <Loading />
        </div>
      );
    case 'waiting':
      return (
        <WaitingRoom
          key={route.roomId}
          roomId={route.roomId}
          playerId={route.playerId}
          nickname={route.nickname}
          onLeave={() => navigate({ kind: 'lobby' }, { replace: true })}
          // 대기실 기록을 게임으로 바꿔서, 게임에서 뒤로 가면 로비로
          onStart={(session) => navigate({ kind: 'game', session }, { replace: true })}
        />
      );
    case 'game':
      return (
        <GameController
          key={`${route.session.mode}-${route.session.roomId}-${route.session.playerId}-${replay}`}
          session={route.session}
          onExit={() => navigate({ kind: 'lobby' })}
          onReplay={
            route.session.mode === 'solo'
              ? (days, sec) => {
                  // 연습: 같은 설정으로 새 판 (새 시장)
                  newSolo(route.session.nickname, days, sec);
                  setReplay((n) => n + 1);
                }
              : undefined
          }
          onWaiting={(roomId, playerId, nickname, code) => navigate({ kind: 'waiting', roomId, playerId, nickname, code }, { replace: true })}
        />
      );
    default:
      // 튜토리얼: 봇과 함께 단계별 안내 (저장 안 함)
      if (route.kind === 'lobby' && route.page === 'tutorial')
        return (
          <GameController
            key="tutorial"
            session={{ mode: 'solo', roomId: null, playerId: 'me', nickname: loadNick() || '나', ui: 'easy', tutorial: true }}
            onExit={() => navigate({ kind: 'lobby', page: 'home' }, { replace: true })}
          />
        );
      // 커스텀 모드 화면 편집: 실제 게임 화면(저장 안 되는 가상 게임)에서 바로 편집
      if (route.kind === 'lobby' && route.page === 'customize')
        return (
          <GameController
            key="customize"
            session={{ mode: 'solo', roomId: null, playerId: 'me', nickname: loadNick() || '나', ui: loadUi(), demo: true }}
            onExit={() => navigate({ kind: 'lobby', page: 'home' }, { replace: true })}
          />
        );
      return (
        <Lobby
          page={route.page ?? 'home'}
          go={(page) => navigate({ kind: 'lobby', page })}
          onWaiting={(roomId, playerId, nickname, code) => navigate({ kind: 'waiting', roomId, playerId, nickname, code })}
          onGame={(session) => navigate({ kind: 'game', session })}
        />
      );
  }
}
