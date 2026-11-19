/** 연습 저장 읽기·쓰기 (가벼운 모듈 — 로비가 게임 엔진 전체를 처음부터 불러오지 않게) */
import type { GameData } from './engine.js';

const KEY = 'stockduel.solo2';
/** 혼자 연습 하루 길이 선택지(초) */
/** 연습 하루 길이(초) — 0 = 무제한 (가격은 3분 동안 움직이고, 시간이 끝나도 넘어가지 않아 종가로 계속 거래, 장 마감을 눌러야 다음 날) */
export const SOLO_DAY_OPTIONS = [60, 180, 300, 0] as const;
export const DEFAULT_SOLO_DAY = 180;

export interface SoloSave {
  data: GameData;
  nickname: string;
  /** 화면 편집용 가상 게임 — 저장하지 않음, 시간이 흐르지 않음 */
  demo?: boolean;
  /** 멈춘 장면의 시각 */
  frozenAt?: number;
  /** 튜토리얼 게임 (봇과 함께, 시간이 흐르지 않음, 저장하지 않음) */
  tutorial?: { symbol: string; headline: string };
  /** 무제한: 시간이 끝나도 자동으로 다음 날로 넘어가지 않음 */
  unlimited?: boolean;
}

export const freshDeadline = (daySec: number, now: number) => now + (daySec + 3) * 1000;

export const UNLIMITED_MS = 30 * 86_400_000;
/** 새 날의 마감 시각들 (무제한이면 거래 마감만 멀리) */
export const dayDeadlines = (daySec: number, now: number, unlimited?: boolean) => {
  const day = freshDeadline(daySec, now);
  return { deadline: unlimited ? now + UNLIMITED_MS : day, day_deadline: day };
};

/** 연습 저장이 쓸 수 있는 모양인지 */
export function validSave(v: unknown): v is SoloSave {
  const d = (v as SoloSave | null)?.data;
  const r = d?.room;
  return (
    !!r &&
    typeof r.seed === 'number' &&
    Number.isFinite(r.seed) &&
    Number.isInteger(r.day) &&
    Number.isInteger(r.total_days) &&
    r.total_days > 0 &&
    r.day >= 0 &&
    r.day <= r.total_days &&
    Array.isArray(d.players) &&
    d.players.length > 0 &&
    Array.isArray(d.trades) &&
    Array.isArray(d.items)
  );
}

export function loadSolo(): SoloSave | null {
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? (JSON.parse(s) as SoloSave) : null;
    // 모양이 깨진 저장은 버림 (계속 오류 화면이 뜨지 않게)
    if (v && !validSave(v)) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (v && !v.data.orders) v.data.orders = [];
    // 예전 연습 저장(시간 제한 없음)은 하루 3분 실시간으로 이어서
    if (v && v.data.room.status === 'playing' && v.data.room.turn_seconds <= 0) {
      v.data.room = { ...v.data.room, turn_seconds: v.data.room.turn_seconds > 0 ? v.data.room.turn_seconds : DEFAULT_SOLO_DAY, ...dayDeadlines(v.data.room.turn_seconds > 0 ? v.data.room.turn_seconds : DEFAULT_SOLO_DAY, Date.now(), v.unlimited) };
    }
    return v;
  } catch {
    return null;
  }
}
export function saveSolo(s: SoloSave | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* 저장 못 해도 진행 */
  }
}
