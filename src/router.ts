import { useCallback, useEffect, useState } from 'react';
import type { Session } from './session';

/** 화면 = URL. 브라우저 뒤로/앞으로 가기로 이동할 수 있게 History API 사용 */
export type Route =
  | { kind: 'lobby' }
  | { kind: 'waiting'; roomId: string; playerId: string; nickname: string; code: string }
  | { kind: 'game'; session: Session; offset: number }
  | { kind: 'resolve'; path: string };

export function pathOf(r: Route): string {
  switch (r.kind) {
    case 'lobby':
      return '/';
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

function initial(): Route {
  const st = history.state as Route | null;
  if (st && st.kind && st.kind !== 'resolve') return st;
  const path = location.pathname;
  if (path === '/' || path === '') return { kind: 'lobby' };
  // 새로고침/직접 입력한 주소: 저장된 정보로 화면을 복원해야 함
  return { kind: 'resolve', path };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(initial);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as Route | null;
      setRoute(st && st.kind ? st : location.pathname === '/' ? { kind: 'lobby' } : { kind: 'resolve', path: location.pathname });
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
    const url = r.kind === 'lobby' && location.search.includes('room=') ? path + location.search : path;
    if (opts.replace) history.replaceState(r, '', url);
    else history.pushState(r, '', url);
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
