export interface Session {
  mode: 'solo' | 'multi';
  roomId: string | null;
  playerId: string;
  nickname: string;
  seed: number;
  dayMs: number;
  totalDays: number;
  /** 서버 시각 기준 시작 시각(ms) */
  startedAt: number;
}

export const GAME_LENGTHS = [
  { id: 'quick', label: '빠른 판', days: 20, dayMs: 10000, desc: '20일 · 하루 10초 · 약 3분' },
  { id: 'normal', label: '기본', days: 30, dayMs: 15000, desc: '30일 · 하루 15초 · 약 8분' },
  { id: 'long', label: '긴 판', days: 40, dayMs: 25000, desc: '40일 · 하루 25초 · 약 17분' },
] as const;

const SAVED = 'stockduel.saved';
const NICK = 'stockduel.nick';

export interface SavedMulti {
  roomId: string;
  playerId: string;
  nickname: string;
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* 무시 */
  }
}

export const loadSaved = (): SavedMulti | null => {
  const s = safeGet(SAVED);
  try {
    return s ? (JSON.parse(s) as SavedMulti) : null;
  } catch {
    return null;
  }
};
export const saveMulti = (s: SavedMulti | null) => safeSet(SAVED, s ? JSON.stringify(s) : null);
export const loadNick = () => safeGet(NICK) ?? '';
export const saveNick = (n: string) => safeSet(NICK, n);
