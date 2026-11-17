/**
 * 다른 창(탭)에서 지금 이 대결을 하고 있는지 (이 기기 안에서만, localStorage).
 * 게임 화면이 열려 있는 동안 3초마다 '살아 있음'을 적고, 로비의 재입장 팝업은
 * 다른 창이 8초 안에 적었으면 '연결이 끊겼어요' 팝업 대신 작은 띠만 보여 줌
 */
const KEY = 'stockduel.activeGame';

export function markActiveGame(roomId: string): () => void {
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ roomId, at: Date.now() }));
    } catch {
      /* 저장소 접근 불가 */
    }
  };
  write();
  const t = setInterval(write, 3000);
  return () => {
    clearInterval(t);
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (v?.roomId === roomId) localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
  };
}

export function gameOpenElsewhere(roomId: string): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v?.roomId === roomId && Date.now() - Number(v.at) < 8000;
  } catch {
    return false;
  }
}
