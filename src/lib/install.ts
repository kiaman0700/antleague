/**
 * '앱처럼 쓰기'(홈 화면에 추가) — 이 기기·브라우저가 무엇인지 보고 맞는 방법을 고름.
 * 크롬·엣지·삼성 인터넷은 브라우저가 주는 설치 창(beforeinstallprompt)을 바로 띄울 수 있고, 아이폰·아이패드는 직접 메뉴를 눌러야 함.
 * 서버로 보내는 것 없음 (이 기기 안에서만)
 */
export type InstallOs = 'ios' | 'ipados' | 'android' | 'mac' | 'windows' | 'other';
export type InstallBrowser = 'safari' | 'chrome' | 'samsung' | 'edge' | 'firefox' | 'kakao' | 'naver' | 'inapp' | 'other';
export interface InstallEnv {
  os: InstallOs;
  browser: InstallBrowser;
  /** 이미 홈 화면 앱으로 열려 있음 */
  standalone: boolean;
}

export function detectInstallEnv(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touch = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): InstallEnv {
  const iPadOs = /Macintosh/.test(ua) && touch > 1; // 아이패드 사파리는 맥처럼 보임
  const os: InstallOs = /iPhone|iPod/.test(ua) ? 'ios' : /iPad/.test(ua) || iPadOs ? 'ipados' : /Android/.test(ua) ? 'android' : /Macintosh|Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : 'other';
  const browser: InstallBrowser = /KAKAOTALK/i.test(ua)
    ? 'kakao'
    : /NAVER\(inapp|NAVER/i.test(ua) && /inapp|NAVER\(/i.test(ua)
      ? 'naver'
      : /Instagram|FBAN|FBAV|Line\/|DaumApps|; wv\)/i.test(ua)
        ? 'inapp'
        : /SamsungBrowser/i.test(ua)
          ? 'samsung'
          : /EdgA|EdgiOS|Edg\//.test(ua)
            ? 'edge'
            : /FxiOS|Firefox/.test(ua)
              ? 'firefox'
              : /CriOS|Chrome/.test(ua)
                ? 'chrome'
                : /Safari/.test(ua)
                  ? 'safari'
                  : 'other';
  let standalone = false;
  try {
    standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    /* 무시 */
  }
  return { os, browser, standalone };
}

/** 브라우저가 주는 설치 창 (크롬·엣지·삼성 인터넷) — 페이지가 뜨자마자 오므로 일찍 받아 둠 */
interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
export function startInstallWatch() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 띠 대신 우리 안내에서 버튼으로
    deferred = e as PromptEvent;
    subs.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try {
      localStorage.setItem('stockduel.installed', '1');
    } catch {
      /* 무시 */
    }
    subs.forEach((f) => f());
  });
}
export const canPromptInstall = () => !!deferred;
export function onInstallChange(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
/** 설치 창 띄우기 — 설치했으면 true */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  // 설치 창은 한 번만 띄울 수 있음 — 닫아도 버리고, 아직 설치할 수 있으면 브라우저가 새로 알려 줌
  deferred = null;
  await e.prompt().catch(() => {});
  const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  subs.forEach((f) => f());
  return r.outcome === 'accepted';
}

/** 카카오톡 안 브라우저 → 기기 기본 브라우저로 열기 (카카오톡이 제공하는 주소) */
export const kakaoExternalUrl = (url: string) => 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
