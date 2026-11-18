/**
 * 단계별 튜토리얼 진행 (design/onboarding.md)
 * ① home 홈 둘러보기 → ② game 게임 기초(연습봇과 한 판) → ③ result 결과 보기 → ④ growth 미션·업적·성장
 * - 이어서 하는 중인 단계 목록은 이 탭(sessionStorage)에만 — 새로고침해도 이어짐
 * - 끝냄·건너뜀 기록은 계정(서버 tutorial_progress)에 + 이 기기에도 (서버에 못 물을 때)
 */
import { useSyncExternalStore } from 'react';
import { api } from '../net/api';

export type Chapter = 'home' | 'game' | 'result' | 'growth';
export const CHAPTERS: { id: Chapter; title: string; desc: string; time: string }[] = [
  { id: 'home', title: '홈 둘러보기', desc: '대결 고르기·빠른 메뉴·미션·친구·설정이 어디 있는지', time: '약 1분' },
  { id: 'game', title: '게임 기초', desc: '연습봇과 한 판: 뉴스·커뮤니티·차트·사기·카드·장 마감', time: '약 3분' },
  { id: 'result', title: '결과 보기', desc: '순위·수익률·이번 판 업적·리플레이·시장 성적', time: '약 30초' },
  { id: 'growth', title: '미션·업적·성장', desc: '미션과 경험치·레벨, 업적과 칭호, 랭킹', time: '약 40초' },
];
const ORDER: Chapter[] = ['home', 'game', 'result', 'growth'];

const QKEY = 'stockduel.tourQ';
const DKEY = 'stockduel.tourDone';
const SKEY = 'stockduel.tourSkipped';

const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
const read = (k: string, store: Storage | undefined) => {
  try {
    return store?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null, store: Storage | undefined) => {
  try {
    if (v === null) store?.removeItem(k);
    else store?.setItem(k, v);
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
};
const ss = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
const ls = () => (typeof localStorage === 'undefined' ? undefined : localStorage);

let queueCache: string | null = null;
function queue(): Chapter[] {
  const raw = read(QKEY, ss());
  if (raw !== queueCache) queueCache = raw;
  try {
    const q = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(q) ? q.filter((x): x is Chapter => ORDER.includes(x as Chapter)) : [];
  } catch {
    return [];
  }
}

/** 지금 진행 중인 단계 (없으면 null) */
export function currentChapter(): Chapter | null {
  return queue()[0] ?? null;
}
/** 지금 단계 다음에 할 단계 */
export function nextChapter(): Chapter | null {
  return queue()[1] ?? null;
}
export function useChapter(): Chapter | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    currentChapter,
  );
}

/** 튜토리얼 시작: 처음부터 전부(이어서) 또는 한 단계만 */
export function startTour(chs: Chapter[] = ORDER) {
  write(QKEY, JSON.stringify(chs), ss());
  ping();
}

export function doneChapters(): Chapter[] {
  try {
    return (JSON.parse(read(DKEY, ls()) ?? '[]') as Chapter[]).filter((x) => ORDER.includes(x));
  } catch {
    return [];
  }
}
export const tourSkipped = () => read(SKEY, ls()) === '1';

/** 이 단계를 끝냈거나(done) 건너뜀(skip) → 다음 단계로 */
export function finishChapter(ch: Chapter, how: 'done' | 'skip') {
  const q = queue();
  if (q[0] === ch) q.shift();
  write(QKEY, q.length ? JSON.stringify(q) : null, ss());
  if (how === 'done') {
    const d = new Set(doneChapters());
    d.add(ch);
    write(DKEY, JSON.stringify([...d]), ls());
  }
  void api('tutorialMark', how === 'done' ? { chapter: ch } : { chapter: ch, skipped: true }).catch(() => {});
  ping();
}

/** 튜토리얼 그만하기 (남은 단계 모두) — 다시 자동으로 권하지 않음 */
export function stopTour() {
  write(QKEY, null, ss());
  write(SKEY, '1', ls());
  void api('tutorialMark', { skipped: true }).catch(() => {});
  ping();
}

/**
 * 처음 하는 사람에게 튜토리얼을 권할지: 이 기기·계정에 튜토리얼 기록(끝냄·건너뜀)이 없고 끝낸 판이 없을 때만.
 * 서버에 물어보지 못하면 이 기기 기록으로만
 */
export async function shouldOfferTutorial(gamesPlayed: number | null): Promise<boolean> {
  if (tourSkipped() || doneChapters().length > 0 || currentChapter()) return false;
  if (gamesPlayed !== null && gamesPlayed > 0) return false;
  try {
    const r = await api<{ done: string[]; skipped: boolean; games?: number }>('tutorialState');
    if (r.skipped || r.done.length > 0 || (r.games ?? 0) > 0) {
      // 다른 기기에서 했던 기록을 이 기기에도
      if (r.skipped) write(SKEY, '1', ls());
      if (r.done.length) write(DKEY, JSON.stringify(r.done), ls());
      return false;
    }
  } catch {
    /* 서버에 못 물으면 이 기기 기록만 */
  }
  return true;
}
