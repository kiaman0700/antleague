/**
 * 내 화면 설정 — 게임마다 다시 정하지 않도록 이 기기에 저장된다.
 * 초보/일반 모드는 '기본값'을 정하고, 내가 바꾼 항목은 그 위에 덮어쓴다 (= 내 커스텀)
 */
import { useSyncExternalStore } from 'react';
import { setMoneyUnit, type MoneyUnit } from './lib/format';
import type { UiMode } from './session';

/** 화면 배치 (커스텀 모드에서 '화면 편집'으로 바꿈) */
export type MTab = 'list' | 'detail' | 'news' | 'assets' | 'cards';
export type MHeaderRow = 'ticker' | 'schedule' | 'assets';
export type PcCol = 'list' | 'detail' | 'side';
export type PcSide = 'news' | 'cards';
/** PC 화면 조각: 끌어서 자리(영역)에 놓음 */
export type PcPanel = 'timeline' | 'list' | 'detail' | 'news' | 'cards';
/** PC 자리: 위 줄 + 세 칸 */
export type PcZone = 'top' | 'left' | 'center' | 'right';
export interface Layout {
  /** 모바일 아래 탭 순서 */
  mTabs: MTab[];
  /** 게임을 열면 처음 보이는 탭 */
  mStart: MTab;
  /** 모바일 위쪽 줄 순서와 보이기 */
  mHeader: { id: MHeaderRow; on: boolean }[];
  /** PC 세 칸 순서 */
  pcCols: PcCol[];
  /** PC 오른쪽 칸 안 순서와 보이기 */
  pcSide: { id: PcSide; on: boolean }[];
  /** PC 날짜 줄 보이기 */
  pcTimeline: boolean;
  /** 속보·알림이 뜨는 위치 */
  toastPos: 'top' | 'bottom';
  /** PC: 각 자리에 놓인 조각 (위에서 아래 순서) */
  pcZones: Record<PcZone, PcPanel[]>;
  /** PC: 숨긴 조각 */
  pcHidden: PcPanel[];
  /** PC: 좁은 칸 너비(px). 없으면 기본 */
  pcColW: Partial<Record<PcZone, number>>;
  /** PC: 한 칸 안 조각들의 높이 비율(그때의 px). 없으면 기본 */
  pcFlex: Partial<Record<PcPanel, number>>;
  /** 속보 알림 자유 위치 (화면 비율 0~1, 왼쪽 위 기준) — 없으면 toastPos */
  toastXY: { x: number; y: number } | null;
  /** 모바일 속보 알림 자유 위치 */
  mToastXY: { x: number; y: number } | null;
  /** 보통 알림(샀어요·오류 등) 자유 위치 — 속보와 따로 (사용자 요청 2026-11-17). 없으면 아래쪽 가운데 */
  alertXY: { x: number; y: number } | null;
  /** 모바일 보통 알림 자유 위치 */
  mAlertXY: { x: number; y: number } | null;
}
export const DEFAULT_LAYOUT: Layout = {
  mTabs: ['news', 'list', 'detail', 'assets', 'cards'], // 뉴스가 게임의 핵심이라 맨 앞
  mStart: 'news',
  mHeader: [
    { id: 'ticker', on: true },
    { id: 'schedule', on: true },
    { id: 'assets', on: true },
  ],
  pcCols: ['list', 'detail', 'side'],
  pcSide: [
    { id: 'news', on: true },
    { id: 'cards', on: true },
  ],
  pcTimeline: true,
  toastPos: 'top',
  pcZones: { top: ['timeline'], left: ['list'], center: ['detail'], right: ['news', 'cards'] },
  pcHidden: [],
  pcColW: {},
  pcFlex: {},
  toastXY: null,
  mToastXY: null,
  alertXY: null,
  mAlertXY: null,
};

export interface Prefs {
  /** 커스텀 모드 사용 중 (끄면 아래 설정은 저장만 되고 모드 기본값을 씀) */
  enabled: boolean;
  /** 금액 단위: auto = 모드 기본(초보 만원, 일반 원) */
  money: MoneyUnit | 'auto';
  /** 업종 칩 순서 (앞에 둔 업종부터, null = 기본 순서) */
  sectorPins: string[] | null;
  /** 카테고리(전체·국내·미국·ETF·관심·보유·오늘 뉴스) 순서 (null = 기본) */
  regionOrder: string[] | null;
  /** 차트 처음 봉 간격: live = 5초, '10'·'20'·'30' 초, daily = 일 */
  chart: 'live' | '10' | '20' | '30' | 'daily';
  /** 일별 차트 모양: auto = 모드 기본(초보 라인, 일반 캔들) */
  chartType: 'auto' | 'line' | 'candle' | 'ohlc';
  /** 장중 차트 모양: same = 일별과 똑같이(한쪽을 바꾸면 같이 바뀜), 아니면 따로 */
  liveChartType: 'same' | 'auto' | 'line' | 'candle' | 'ohlc';
  /** 화면 배치 */
  layout: Layout;
}

const KEY = 'stockduel.prefs';
/** 커스텀을 끈 상태에서 쓰는 값 = 모드 기본 */
const BASE: Omit<Prefs, 'enabled'> = { money: 'auto', sectorPins: null, regionOrder: null, chart: 'live', chartType: 'auto', liveChartType: 'same', layout: DEFAULT_LAYOUT };
const DEFAULT: Prefs = { enabled: false, ...BASE };

const PANELS: PcPanel[] = ['timeline', 'list', 'detail', 'news', 'cards'];
/** 배치가 온전한지: 모든 조각이 정확히 한 번, 날짜 줄은 위 줄에만 */
export function validZones(z: unknown): boolean {
  if (!z || typeof z !== 'object') return false;
  const zz = z as Record<string, unknown>;
  const keys: PcZone[] = ['top', 'left', 'center', 'right'];
  if (!keys.every((k) => Array.isArray(zz[k]))) return false;
  const flat = keys.flatMap((k) => zz[k] as string[]);
  if (flat.length !== PANELS.length || !PANELS.every((p) => flat.includes(p))) return false;
  return (zz.top as string[]).every((p) => p === 'timeline');
}

function read(): Prefs {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return DEFAULT;
    const v = { ...DEFAULT, ...(JSON.parse(s) as Partial<Prefs>) };
    // 저장된 배치가 예전 것이면 빠진 항목만 기본값으로 채움
    v.layout = { ...DEFAULT_LAYOUT, ...(v.layout ?? {}) };
    // 깨진 배치(조각이 빠지거나 두 번 들어감, 이상한 값)는 기본으로 복구
    if (!validZones(v.layout.pcZones)) v.layout.pcZones = DEFAULT_LAYOUT.pcZones;
    if (!v.layout.pcColW || typeof v.layout.pcColW !== 'object') v.layout.pcColW = {};
    if (!v.layout.pcFlex || typeof v.layout.pcFlex !== 'object') v.layout.pcFlex = {};
    if (!Array.isArray(v.layout.pcHidden)) v.layout.pcHidden = [];
    const okXY = (p: unknown) => !!p && typeof p === 'object' && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y);
    if (!okXY(v.layout.toastXY)) v.layout.toastXY = null;
    if (!okXY(v.layout.mToastXY)) v.layout.mToastXY = null;
    if (!okXY(v.layout.alertXY)) v.layout.alertXY = null;
    if (!okXY(v.layout.mAlertXY)) v.layout.mAlertXY = null;
    if (!Array.isArray(v.layout.mTabs) || [...DEFAULT_LAYOUT.mTabs].sort().join() !== [...v.layout.mTabs].sort().join()) v.layout.mTabs = DEFAULT_LAYOUT.mTabs;
    return v;
  } catch {
    return DEFAULT;
  }
}

let current = read();
const listeners = new Set<() => void>();

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
/** 배치만 바꾸기 */
export function setLayout(patch: Partial<Layout>) {
  setPrefs({ layout: { ...current.layout, ...patch } });
}
/** 배치만 처음으로 */
export function resetLayout() {
  setPrefs({ layout: DEFAULT_LAYOUT });
}
/** 배열에서 i 번째를 d 만큼 옮긴 새 배열 */
export function moved<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
/** 지금 적용 중인 설정 (렌더 밖에서) */
export const getEffective = () => effective(current);
/** 설정의 차트 봉 간격 → 초 (0 = 일) */
export function chartPrefSec(c: string): number {
  return c === 'daily' ? 0 : c === 'live' ? 5 : Number(c) || 5;
}

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
