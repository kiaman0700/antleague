import { useState } from 'react';
import { Lobby } from './screens/Lobby';
import { WaitingRoom } from './screens/WaitingRoom';
import { GameController } from './screens/GameController';
import type { Session } from './session';
import { saveMulti } from './session';

type Screen =
  | { kind: 'lobby' }
  | { kind: 'waiting'; roomId: string; playerId: string; nickname: string }
  | { kind: 'game'; session: Session; offset: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'lobby' });

  const toLobby = () => setScreen({ kind: 'lobby' });

  if (screen.kind === 'waiting') {
    return (
      <WaitingRoom
        roomId={screen.roomId}
        playerId={screen.playerId}
        nickname={screen.nickname}
        onLeave={() => {
          saveMulti(null);
          toLobby();
        }}
        onStart={(session, offset) => setScreen({ kind: 'game', session, offset })}
      />
    );
  }

  if (screen.kind === 'game') {
    return <GameController key={screen.session.startedAt} session={screen.session} offset={screen.offset} onExit={toLobby} />;
  }

  return (
    <Lobby
      onWaiting={(roomId, playerId, nickname) => setScreen({ kind: 'waiting', roomId, playerId, nickname })}
      onGame={(session, offset) => setScreen({ kind: 'game', session, offset })}
    />
  );
}
