/**
 * 기기 종류(PC·태블릿·휴대폰·폴더블)로 화면 고르기 (설계서 design/device-layout.md)
 * - 창 크기도, 지금 쓰는 입력 장치(마우스·터치)도 아니라 **기기 자체**를 단서 여러 개로 판단
 *   (태블릿에 마우스를 연결해도 태블릿, 터치 노트북은 PC)
 * - 정확한 기기 이름은 브라우저가 대부분 숨김 → 브라우저 정보·크롬의 기기 종류·터치 지점 수·기기 화면 크기를 합침
 * - 판단은 브라우저 안에서만 (서버로 보내지 않음)
 * - 결과는 <html data-device="pc|tablet|phone"> (+ 펼친 폴더블은 data-fold="open")
 * - 시험용으로만 주소 ?device=pc|tablet|phone (그 창에서만, 저장 안 함 · ?device=auto 로 되돌림)
 */
export type Device = 'pc' | 'tablet' | 'phone';

export interface DeviceClues {
  userAgent: string;
  maxTouchPoints: number;
  /** 창이 아니라 기기 화면 크기 */
  screenW: number;
  screenH: number;
  /** 크롬 계열이 알려 주는 기기 종류 (Mobile·Tablet·Desktop …) */
  formFactors?: string[];
  /** 크롬(안드로이드)이 알려 주는 모델명 (예: SM-F946N) */
  model?: string;
  /** 크롬 계열이 바로(동기로) 알려 주는 '휴대폰인가' */
  uaMobile?: boolean;
}

const SESSION_KEY = 'stockduel.deviceTry';
const DEVICES: Device[] = ['pc', 'tablet', 'phone'];
const isDevice = (v: unknown): v is Device => typeof v === 'string' && (DEVICES as string[]).includes(v);

const TV = /SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|AppleTV|CrKey|PlayStation|Xbox|Nintendo|AFT[A-Z]|BRAVIA/i;
const FOLD_MODEL = /^SM-F9\d\d|Pixel Fold|Pixel 9 Pro Fold|OPPO Find N|vivo X Fold|Honor Magic V|Mix Fold|Razr/i;

/** 펼친 폴더블인지: 휴대폰인데 지금 기기 화면이 거의 정사각형이고 짧은 쪽이 600 이상 (모델명이 있으면 폴더블일 때만) */
export function isFoldOpen(c: DeviceClues): boolean {
  const short = Math.min(c.screenW, c.screenH);
  const long = Math.max(c.screenW, c.screenH);
  const squareish = long > 0 && short / long >= 0.7 && short >= 600;
  if (c.model) return FOLD_MODEL.test(c.model) && squareish;
  return squareish && /Android/.test(c.userAgent) && /Mobile/.test(c.userAgent);
}

/**
 * 브라우저가 직접 알려 주는 '기기 종류'(크롬·엣지·삼성 인터넷·웨일 등 크롬 계열) → 우리 화면 종류
 * 값: Desktop·Mobile·Tablet·XR·EInk·Watch·Automotive (여러 개일 수 있음 — 터치 노트북·2in1 은 Desktop 이 함께 옴)
 */
export function fromFormFactors(ff: string[] | undefined): Device | null {
  if (!ff?.length) return null;
  if (ff.includes('Desktop') || ff.includes('XR') || ff.includes('Automotive')) return 'pc';
  if (ff.includes('Tablet') || ff.includes('EInk')) return 'tablet';
  if (ff.includes('Mobile') || ff.includes('Watch')) return 'phone';
  return null;
}

/**
 * 단서들로 기기 종류 (펼친 폴더블은 태블릿 화면)
 * 1) TV·게임기  2) 브라우저가 직접 알려 주는 기기 종류(크롬 계열)  3) 브라우저 정보(사파리·파이어폭스 등)  4) 터치 + 화면 크기
 */
export function guessDevice(c: DeviceClues): Device {
  const ua = c.userAgent;
  if (TV.test(ua)) return 'pc';
  let base: Device | null = fromFormFactors(c.formFactors);
  if (base === 'pc') return 'pc';
  // 크롬 계열이 바로 알려 주는 '휴대폰인가' (기기 종류가 아직 안 왔을 때 — 태블릿은 false)
  if (!base && c.uaMobile === true) base = 'phone';
  if (!base) {
    if (/iPhone|iPod/.test(ua)) base = 'phone';
    else if (/iPad/.test(ua)) base = 'tablet';
    else if (/Macintosh/.test(ua)) return c.maxTouchPoints > 1 ? 'tablet' : 'pc'; // 아이패드(데스크톱 사이트) / 진짜 Mac
    else if (/Android/.test(ua)) base = /Mobile/.test(ua) ? 'phone' : 'tablet';
    else if (/Windows|CrOS|X11|Linux x86_64/.test(ua)) return 'pc'; // 터치 노트북·2in1·DeX 도 PC
  }
  if (!base) {
    if (c.maxTouchPoints <= 0) return 'pc';
    base = Math.min(c.screenW, c.screenH) < 600 ? 'phone' : 'tablet';
  }
  if (base === 'phone' && isFoldOpen(c)) return 'tablet';
  return base;
}

const FF_KEY = 'stockduel.ff';
function cachedFF(): string[] | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(FF_KEY) ?? 'null');
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : undefined;
  } catch {
    return undefined;
  }
}
function clues(): DeviceClues {
  const uad = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return {
    uaMobile: typeof uad?.mobile === 'boolean' ? uad.mobile : undefined,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    screenW: window.screen?.width ?? window.innerWidth,
    screenH: window.screen?.height ?? window.innerHeight,
    formFactors: extra.formFactors ?? cachedFF(),
    model: extra.model,
  };
}
/** 크롬이 비동기로 알려 주는 추가 단서 (있으면 다시 판단) */
const extra: { formFactors?: string[]; model?: string } = {};

function forced(): Device | null {
  try {
    const q = new URLSearchParams(location.search).get('device');
    if (isDevice(q)) sessionStorage.setItem(SESSION_KEY, q);
    else if (q === 'auto') sessionStorage.removeItem(SESSION_KEY);
    const s = sessionStorage.getItem(SESSION_KEY);
    return isDevice(s) ? s : null;
  } catch {
    return null;
  }
}

export function currentDevice(): Device {
  return forced() ?? guessDevice(clues());
}

/** <html data-device / data-fold> 에 붙이고, 바뀌었으면 알림 */
export function applyDevice(): Device {
  const d = currentDevice();
  const root = document.documentElement;
  const fold = !forced() && isFoldOpen(clues()) ? 'open' : '';
  if (root.dataset.device !== d || (root.dataset.fold ?? '') !== fold) {
    root.dataset.device = d;
    if (fold) root.dataset.fold = fold;
    else delete root.dataset.fold;
    window.dispatchEvent(new Event('stockduel:device'));
  }
  return d;
}

/** 시작할 때: 판단 + 폴더블 접기/펼치기·화면 돌림에 따라 다시 판단 + 크롬의 추가 단서 */
export function startDeviceWatch() {
  applyDevice();
  let t: number | undefined;
  const again = () => {
    window.clearTimeout(t);
    t = window.setTimeout(applyDevice, 150);
  };
  window.addEventListener('resize', again);
  window.addEventListener('orientationchange', again);
  const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>> } }).userAgentData;
  uad?.getHighEntropyValues?.(['formFactors', 'model'])
    .then((v) => {
      if (Array.isArray(v.formFactors)) {
        extra.formFactors = v.formFactors as string[];
        try {
          localStorage.setItem(FF_KEY, JSON.stringify(extra.formFactors));
        } catch {
          /* 저장 못 해도 이번엔 적용 */
        }
      }
      if (typeof v.model === 'string' && v.model) extra.model = v.model;
      applyDevice();
    })
    .catch(() => {});
}

export const DEVICE_LABEL: Record<Device, string> = { pc: 'PC', tablet: '태블릿', phone: '휴대폰' };
