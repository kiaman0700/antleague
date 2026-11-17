/**
 * 기기 종류(PC·태블릿·휴대폰)로 화면 고르기 (설계서 design/device-layout.md)
 * - 창 크기가 아니라 기기로: PC 에서 창을 줄여도 PC 화면, 휴대폰을 가로로 눕혀 넓어져도 휴대폰 화면
 * - 판단은 브라우저 안에서만 (서버로 보내지 않음)
 * - 우선순위: 주소 ?device= (그 창에서만, 시험용) > 설정 '화면 종류' (이 기기에 저장) > 자동
 * - 결과는 <html data-device="pc|tablet|phone"> 로 → CSS(빌드 때 붙는 기기 조건)와 화면 코드가 함께 씀
 */
export type Device = 'pc' | 'tablet' | 'phone';
export type DevicePref = 'auto' | Device;

const PREF_KEY = 'stockduel.device';
const SESSION_KEY = 'stockduel.deviceTry';
const DEVICES: Device[] = ['pc', 'tablet', 'phone'];
const isDevice = (v: unknown): v is Device => typeof v === 'string' && (DEVICES as string[]).includes(v);

/** 브라우저가 알려 주는 정보만으로 판단 (시험하기 쉽게 값을 받아서) */
export function guessDevice(env: { coarse: boolean; maxTouchPoints: number; userAgent: string; screenW: number; screenH: number }): Device {
  // 아이패드는 '데스크톱 사이트'로 Mac 처럼 보임 → 터치 지점이 여러 개면 태블릿
  const touchMac = env.maxTouchPoints > 1 && /Macintosh/.test(env.userAgent);
  if (!env.coarse && !touchMac) return 'pc';
  const short = Math.min(env.screenW, env.screenH);
  return short < 600 ? 'phone' : 'tablet';
}

function autoDevice(): Device {
  if (typeof window === 'undefined') return 'pc';
  return guessDevice({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    userAgent: navigator.userAgent,
    screenW: window.screen?.width ?? window.innerWidth,
    screenH: window.screen?.height ?? window.innerHeight,
  });
}

export function loadDevicePref(): DevicePref {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return isDevice(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** 지금 쓸 기기 */
export function currentDevice(): Device {
  try {
    const q = new URLSearchParams(location.search).get('device');
    if (isDevice(q)) sessionStorage.setItem(SESSION_KEY, q);
    else if (q === 'auto') sessionStorage.removeItem(SESSION_KEY);
    const s = sessionStorage.getItem(SESSION_KEY);
    if (isDevice(s)) return s;
  } catch {
    /* 저장소 없음 */
  }
  const p = loadDevicePref();
  return p === 'auto' ? autoDevice() : p;
}
export const detectedDevice = autoDevice;

/** <html data-device> 에 붙이고, 바뀌었으면 알림 */
export function applyDevice(): Device {
  const d = currentDevice();
  if (typeof document !== 'undefined' && document.documentElement.dataset.device !== d) {
    document.documentElement.dataset.device = d;
    window.dispatchEvent(new Event('stockduel:device'));
  }
  return d;
}

/** 설정 '화면 종류' 바꾸기 */
export function setDevicePref(p: DevicePref) {
  try {
    if (p === 'auto') localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, p);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* 저장 못 해도 이번 창에는 적용 */
  }
  applyDevice();
}

export const DEVICE_LABEL: Record<Device, string> = { pc: 'PC', tablet: '태블릿', phone: '휴대폰' };
