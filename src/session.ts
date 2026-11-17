export type UiMode = 'easy' | 'pro';

export interface Session {
  mode: 'solo' | 'multi';
  /** 둘이서 할 때만 */
  roomId: string | null;
  code?: string;
  playerId: string;
  nickname: string;
  ui: UiMode;
  /** 화면 편집용 가상 게임 (저장 안 함, 편집 모드로 열림) */
  demo?: boolean;
  /** 튜토리얼 (봇과 함께, 단계별 안내) */
  tutorial?: boolean;
}

export const DAY_OPTIONS = [
  { days: 10, label: '10일', desc: '약 10~15분' },
  { days: 20, label: '20일', desc: '약 20~30분' },
  { days: 30, label: '30일', desc: '약 30~45분' },
] as const;

/** 하루 제한 시간 (최대 10분). 시간이 다 되면 마감 안 누른 사람도 자동으로 장 마감 */
export const TURN_OPTIONS = [
  { sec: 60, label: '1분', desc: '빠르게' },
  { sec: 180, label: '3분', desc: '추천' },
  { sec: 300, label: '5분', desc: '여유' },
  { sec: 600, label: '10분', desc: '느긋하게' },
] as const;
export const turnLabel = (sec: number) => TURN_OPTIONS.find((t) => t.sec === sec)?.label ?? (sec === 90 ? '1분 30초' : sec > 0 ? `${Math.round(sec / 60)}분` : '10분');

/** 카운트다운 규칙 안내 문구 (서버 graceRule 과 같은 규칙) */
export function graceText(players: number) {
  return players <= 2 ? '한 명이 마감하면 1분 30초' : `${Math.ceil((players * 2) / 3)}명 이상 마감하면 30초`;
}
/** 카운트다운 길이(초): 1대1 90초, 3인 이상 30초 (서버 graceRule 과 같음) */
export const graceSeconds = (players: number) => (players <= 2 ? 90 : 30);
/** 대기실·방 만들기 안내 한 문장: 하루가 카운트다운보다 짧으면 카운트다운 얘기는 빼고 (예: 1분 하루에 '1분 30초 뒤'는 말이 안 됨) */
export function graceSentence(players: number, turnSeconds: number) {
  // 사람이 1명뿐(나머지는 봇)이면 카운트다운이 없음 — 내가 마감하면 바로 다음 날
  return players >= 2 && turnSeconds > graceSeconds(players) ? `${graceText(players)} 카운트다운이 시작되고, 시간이 끝나면 자동으로 넘어가요.` : '아니면 하루 시간이 끝날 때 자동으로 넘어가요.';
}

/** 마감 후 결과 보여주는 시간 등 하루마다 드는 시간(초) */
const DAY_OVERHEAD = 8;
/**
 * 예상 게임 시간(분). 보통 = 다들 제한 시간의 절반쯤(최대 2분) 쓰고 마감 + 카운트다운,
 * 길게 = 매일 시간을 끝까지 씀
 */
export function estimateMinutes(days: number, turnSec: number) {
  const typical = Math.min(Math.min(turnSec * 0.5, 120) + 15, turnSec);
  // 둘째 날부터 장 전 시간(신속 20초·일반 30초·그 밖 ⅓)이 더해짐
  const pre = turnSec <= 60 ? 20 : turnSec <= 90 ? 30 : Math.max(15, Math.min(45, Math.round(turnSec / 3)));
  const toMin = (perDay: number) => Math.max(1, Math.round((days * (perDay + DAY_OVERHEAD) + (days - 1) * pre) / 60));
  return { typical: toMin(typical), max: toMin(turnSec) };
}

const NICK = 'stockduel.nick';
const UI = 'stockduel.ui';
const WATCH = 'stockduel.watch';
const MUTE = 'stockduel.mute';
const TUTORIAL = 'stockduel.tutorial';

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
