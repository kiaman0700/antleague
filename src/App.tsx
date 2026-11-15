import { useEffect } from 'react';
import { fetchPlayer, fetchRoom, measureClockOffset } from './net/room';
import { useRouter, type Route } from './router';
import { GameController } from './screens/GameController';
import { Lobby, roomToSession } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { loadSaved, loadSolo, saveMulti } from './session';

/** 새로고침하거나 주소를 직접 열었을 때 저장된 정보로 화면 복원 */
async function resolvePath(path: string): Promise<{ route: Route; url?: string }> {
  if (path.startsWith('/practice')) {
    const solo = loadSolo();
    return solo ? { route: { kind: 'game', session: solo.session, offset: 0 } } : { route: { kind: 'lobby' } };
  }
  const m = path.match(/^\/(room|game)\/([A-Z0-9]{4})/i);
  if (!m) return { route: { kind: 'lobby' }, url: '/' };
  const code = m[2].toUpperCase();
  const saved = loadSaved();
  if (saved) {
    const [room, player] = await Promise.all([fetchRoom(saved.roomId).catch(() => null), fetchPlayer(saved.playerId).catch(() => null)]);
    if (room && player && room.code === code) {
      if (room.status === 'waiting') return { route: { kind: 'waiting', roomId: room.id, playerId: player.id, nickname: player.nickname, code } };
      const offset = await measureClockOffset();
      return { route: { kind: 'game', session: roomToSession(room, player.id, player.nickname, player.mode), offset } };
    }
  }
  // 내 방이 아니면 초대 링크로 보고 로비에서 코드를 채워 줌
  return { route: { kind: 'lobby' }, url: `/?room=${code}` };
}

export default function App() {
  const { route, navigate } = useRouter();

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

  const toLobby = () => navigate({ kind: 'lobby' });

  switch (route.kind) {
    case 'resolve':
      return (
        <div className="center-msg">
          <div className="spinner" />
          <p className="muted">불러오는 중…</p>
        </div>
      );
    case 'waiting':
      return (
        <WaitingRoom
          key={route.roomId}
          roomId={route.roomId}
          playerId={route.playerId}
          nickname={route.nickname}
          onLeave={() => {
            saveMulti(null);
            navigate({ kind: 'lobby' }, { replace: true });
          }}
          // 대기실 기록을 게임으로 바꿔서, 게임에서 뒤로 가면 로비로
          onStart={(session, offset) => navigate({ kind: 'game', session, offset }, { replace: true })}
        />
      );
    case 'game':
      return <GameController key={`${route.session.seed}-${route.session.playerId}`} session={route.session} offset={route.offset} onExit={toLobby} />;
    default:
      return (
        <Lobby
          onWaiting={(roomId, playerId, nickname, code) => navigate({ kind: 'waiting', roomId, playerId, nickname, code })}
          onGame={(session, offset) => navigate({ kind: 'game', session, offset })}
        />
      );
  }
}
