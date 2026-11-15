/**
 * 내 화면 설정 — 게임마다 다시 정하지 않도록 이 기기에 저장된다.
 * 초보/일반 모드는 '기본값'을 정하고, 내가 바꾼 항목은 그 위에 덮어쓴다 (= 내 커스텀)
 */
import { useSyncExternalStore } from 'react';
import { setMoneyUnit, type MoneyUnit } from './lib/format';
import type { UiMode } from './session';

export interface Prefs {
  /** 커스텀 모드 사용 중 (끄면 아래 설정은 저장만 되고 모드 기본값을 씀) */
  enabled: boolean;
  /** 금액 단위: auto = 모드 기본(초보 만원, 일반 원) */
  money: MoneyUnit | 'auto';
  /** 업종 칩: 자주 쓰는 업종을 내가 정한 순서로 (null = 기본 순서) */
  sectorPins: string[] | null;
  /** 차트 기본 보기 */
  chart: 'live' | 'daily';
  /** 일별 차트 모양: auto = 모드 기본(초보 라인, 일반 캔들) */
  chartType: 'auto' | 'line' | 'candle' | 'ohlc';
}

const KEY = 'stockduel.prefs';
const DEFAULT: Prefs = { enabled: false, money: 'auto', sectorPins: null, chart: 'live', chartType: 'auto' };
/** 커스텀을 끈 상태에서 쓰는 값 = 모드 기본 */
const BASE: Omit<Prefs, 'enabled'> = { money: 'auto', sectorPins: null, chart: 'live', chartType: 'auto' };

function read(): Prefs {
  try {
    const s = localStorage.getItem(KEY);
    return s ? { ...DEFAULT, ...(JSON.parse(s) as Partial<Prefs>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getPrefs() {
  return current;
}
export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* 저장 못 해도 이번 게임에는 적용 */
  }
  listeners.forEach((l) => l());
}
/** 설정 내용만 기본으로 (커스텀 모드 켜짐/꺼짐은 유지) */
export function resetPrefs() {
  setPrefs({ ...BASE });
}
/** 커스텀 모드 사용 중인지 */
export const isCustom = (p: Prefs) => p.enabled;
/** 실제로 화면에 적용되는 값: 커스텀 모드면 내 설정, 아니면 모드 기본 */
export const effective = (p: Prefs): Prefs => (p.enabled ? p : { ...p, ...BASE });
/** 지금 적용 중인 설정 (렌더 밖에서) */
export const getEffective = () => effective(current);

export function usePrefs() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** 지금 적용되는 금액 단위 */
export const moneyUnitOf = (p: Prefs, ui: UiMode): MoneyUnit => {
  const e = effective(p);
  return e.money === 'auto' ? (ui === 'easy' ? 'man' : 'won') : e.money;
};

/** 화면 모드·설정이 바뀔 때 금액 표기를 맞춘다 (렌더 전에 호출) */
export function applyMoneyUnit(p: Prefs, ui: UiMode) {
  setMoneyUnit(moneyUnitOf(p, ui));
}
