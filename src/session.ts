export type UiMode = 'easy' | 'pro';

export interface Session {
  mode: 'solo' | 'multi';
  /** 둘이서 할 때만 */
  roomId: string | null;
  code?: string;
  playerId: string;
  nickname: string;
  ui: UiMode;
}

export const DAY_OPTIONS = [
  { days: 10, label: '10일', desc: '약 10~15분' },
  { days: 20, label: '20일', desc: '약 20~30분' },
  { days: 30, label: '30일', desc: '약 30~45분' },
] as const;

export const TURN_OPTIONS = [
  { sec: 60, label: '60초' },
  { sec: 90, label: '90초' },
  { sec: 180, label: '3분' },
  { sec: 0, label: '무제한' },
] as const;

const SAVED = 'stockduel.saved';
const NICK = 'stockduel.nick';
const UI = 'stockduel.ui';
const WATCH = 'stockduel.watch';
const MUTE = 'stockduel.mute';
const TUTORIAL = 'stockduel.tutorial';

export interface SavedMulti {
  roomId: string;
  playerId: string;
  nickname: string;
}

function get(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* 저장소를 못 써도 게임은 동작 */
  }
}
function json<T>(key: string, fallback: T): T {
  try {
    const s = get(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const loadSaved = () => json<SavedMulti | null>(SAVED, null);
export const saveMulti = (s: SavedMulti | null) => set(SAVED, s ? JSON.stringify(s) : null);
export const loadNick = () => get(NICK) ?? '';
export const saveNick = (n: string) => set(NICK, n);
export const loadUi = (): UiMode => (get(UI) === 'pro' ? 'pro' : 'easy');
export const saveUi = (m: UiMode) => set(UI, m);
export const loadWatch = () => json<string[]>(WATCH, []);
export const saveWatch = (w: string[]) => set(WATCH, JSON.stringify(w));
export const loadMute = () => get(MUTE) === '1';
export const saveMute = (m: boolean) => set(MUTE, m ? '1' : '0');
export const tutorialSeen = () => get(TUTORIAL) === '1';
export const markTutorialSeen = () => set(TUTORIAL, '1');
