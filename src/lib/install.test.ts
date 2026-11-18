import { describe, expect, it } from 'vitest';
import { detectInstallEnv } from './install';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1',
  iphoneKakao: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.6.0',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  galaxySamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36',
  androidNaver: 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.6.1)',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36 Edg/138.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
};

describe('홈 화면에 추가: 기기·브라우저 알아보기', () => {
  it.each([
    ['iphoneSafari', 0, 'ios', 'safari'],
    ['iphoneChrome', 5, 'ios', 'chrome'],
    ['iphoneKakao', 5, 'ios', 'kakao'],
    ['ipad', 5, 'ipados', 'safari'],
    ['galaxySamsung', 5, 'android', 'samsung'],
    ['androidChrome', 5, 'android', 'chrome'],
    ['androidNaver', 5, 'android', 'naver'],
    ['winEdge', 0, 'windows', 'edge'],
    ['macSafari', 0, 'mac', 'safari'],
  ] as const)('%s', (k, touch, os, browser) => {
    const e = detectInstallEnv(UA[k], touch);
    expect([e.os, e.browser]).toEqual([os, browser]);
  });
});
