import { useCallback, useEffect, useState } from 'react';
import type { LobbyPage } from './screens/Lobby';
import type { Session } from './session';

/** 화면 = URL. 브라우저 뒤로/앞으로 가기로 이동할 수 있게 History API 사용 */
export type Route =
  | { kind: 'lobby'; page?: LobbyPage }
  | { kind: 'waiting'; roomId: string; playerId: string; nickname: string; code: string }
  | { kind: 'game'; session: Session }
  | { kind: 'resolve'; path: string };

export function pathOf(r: Route): string {
  switch (r.kind) {
    case 'lobby':
      return !r.page || r.page === 'home' ? '/' : '/' + r.page;
    case 'waiting':
      return `/room/${r.code}`;
    case 'game':
      return r.session.mode === 'solo' ? '/practice' : `/game/${r.session.code ?? ''}`;
    case 'resolve':
      return r.path;
  }
}

const TITLES: Record<Route['kind'], string> = {
  lobby: '주식 대결',
  waiting: '대기실 · 주식 대결',
  game: '게임 중 · 주식 대결',
  resolve: '주식 대결',
};

const LOBBY_PAGES: Record<string, LobbyPage> = { '/': 'home', '': 'home', '/rooms': 'rooms', '/create': 'create', '/records': 'records', '/customize': 'customize', '/companies': 'companies' };
/** 주소만으로 열 수 있는 화면(로비 페이지)인지 */
function routeFromPath(path: string): Route {
  const page = LOBBY_PAGES[path.replace(/\/+$/, '') || '/'];
  return page ? { kind: 'lobby', page } : { kind: 'resolve', path };
}

function initial(): Route {
  const st = history.state as Route | null;
  if (st && st.kind && st.kind !== 'resolve') return st;
  // 새로고침/직접 입력한 주소: 로비 페이지가 아니면 저장된 정보로 화면을 복원
  return routeFromPath(location.pathname);
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(initial);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as Route | null;
      setRoute(st && st.kind ? st : routeFromPath(location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = TITLES[route.kind];
  }, [route.kind]);

  const navigate = useCallback((r: Route, opts: { replace?: boolean } = {}) => {
    const path = pathOf(r);
    // 로비로 갈 때 초대 코드(?room=)는 유지
    const url = r.kind === 'lobby' && (!r.page || r.page === 'home') && location.search.includes('room=') ? path + location.search : path;
    if (opts.replace) history.replaceState(r, '', url);
    else history.pushState(r, '', url);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
