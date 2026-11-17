import { describe, expect, it } from 'vitest';
import { guessDevice, isFoldOpen, type DeviceClues } from './device';

const UA = {
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  androidTab: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  tv: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
  ps5: 'Mozilla/5.0 (PlayStation; PlayStation 5/6.50) AppleWebKit/605.1.15 (KHTML, like Gecko)',
};
const c = (o: Partial<DeviceClues>): DeviceClues => ({ userAgent: UA.win, maxTouchPoints: 0, screenW: 1920, screenH: 1080, ...o });

describe('기기 판단: 입력 장치보다 기기 자체를 먼저 봄', () => {
  it('PC: 윈도우·맥·크롬북·리눅스 — 화면이 작아도 PC', () => {
    for (const ua of [UA.win, UA.mac, UA.cros, UA.linux]) expect(guessDevice(c({ userAgent: ua, screenW: 1280, screenH: 720 }))).toBe('pc');
  });
  it('터치되는 노트북(윈도우 + 터치 10개)은 PC', () => {
    expect(guessDevice(c({ userAgent: UA.win, maxTouchPoints: 10, screenW: 1366, screenH: 768 }))).toBe('pc');
  });
  it('휴대폰: 아이폰·안드로이드 휴대폰 (세로·가로 모두)', () => {
    expect(guessDevice(c({ userAgent: UA.iphone, maxTouchPoints: 5, screenW: 393, screenH: 852 }))).toBe('phone');
    expect(guessDevice(c({ userAgent: UA.iphone, maxTouchPoints: 5, screenW: 932, screenH: 430 }))).toBe('phone');
    expect(guessDevice(c({ userAgent: UA.androidPhone, maxTouchPoints: 5, screenW: 360, screenH: 780 }))).toBe('phone');
  });
  it('태블릿: 아이패드·안드로이드 태블릿', () => {
    expect(guessDevice(c({ userAgent: UA.ipad, maxTouchPoints: 5, screenW: 820, screenH: 1180 }))).toBe('tablet');
    expect(guessDevice(c({ userAgent: UA.androidTab, maxTouchPoints: 5, screenW: 800, screenH: 1280 }))).toBe('tablet');
  });
  it('아이패드에 마우스를 연결해도(데스크톱 사이트: Mac 처럼 보임 + 터치) 태블릿', () => {
    expect(guessDevice(c({ userAgent: UA.mac, maxTouchPoints: 5, screenW: 1024, screenH: 1366 }))).toBe('tablet');
  });
  it('진짜 Mac(터치 없음)은 PC', () => {
    expect(guessDevice(c({ userAgent: UA.mac, maxTouchPoints: 0 }))).toBe('pc');
  });
  it('안드로이드는 크롬이 알려 주는 기기 종류로 휴대폰·태블릿·DeX 를 가름', () => {
    expect(guessDevice(c({ userAgent: UA.androidTab, formFactors: ['Mobile'], maxTouchPoints: 5, screenW: 400, screenH: 900 }))).toBe('phone');
    expect(guessDevice(c({ userAgent: UA.androidPhone, formFactors: ['Tablet'], maxTouchPoints: 5, screenW: 800, screenH: 1280 }))).toBe('tablet');
    // 삼성 DeX·데스크톱 사이트는 브라우저 정보가 리눅스 PC 로 바뀜 → PC
    expect(guessDevice(c({ userAgent: UA.linux, formFactors: ['Desktop'], maxTouchPoints: 5 }))).toBe('pc');
    // 시험용 크롬처럼 안드로이드인데 Desktop 이라고 해도 안드로이드 글자를 따름
    expect(guessDevice(c({ userAgent: UA.androidPhone, formFactors: ['Desktop'], maxTouchPoints: 5, screenW: 360, screenH: 780 }))).toBe('phone');
  });
  it('브라우저 정보가 확실하면 크롬의 기기 종류보다 먼저 (아이폰인데 Desktop 이라고 해도 휴대폰)', () => {
    expect(guessDevice(c({ userAgent: UA.iphone, formFactors: ['Desktop'], maxTouchPoints: 5, screenW: 375, screenH: 667 }))).toBe('phone');
    expect(guessDevice(c({ userAgent: UA.win, formFactors: ['Tablet'], maxTouchPoints: 10 }))).toBe('pc');
  });
  it('TV·게임기 브라우저는 PC 화면', () => {
    expect(guessDevice(c({ userAgent: UA.tv }))).toBe('pc');
    expect(guessDevice(c({ userAgent: UA.ps5 }))).toBe('pc');
  });
  it('단서가 없으면 터치 + 화면 크기로', () => {
    const odd = 'SomeBrowser/1.0';
    expect(guessDevice(c({ userAgent: odd, maxTouchPoints: 5, screenW: 390, screenH: 844 }))).toBe('phone');
    expect(guessDevice(c({ userAgent: odd, maxTouchPoints: 5, screenW: 800, screenH: 1280 }))).toBe('tablet');
    expect(guessDevice(c({ userAgent: odd, maxTouchPoints: 0 }))).toBe('pc');
  });
});

describe('폴더블: 접힘은 휴대폰, 펼침은 태블릿 화면', () => {
  it('갤럭시 폴드 접힘(좁고 긴 화면) → 휴대폰', () => {
    const cl = c({ userAgent: UA.androidPhone, maxTouchPoints: 5, screenW: 344, screenH: 882 });
    expect(isFoldOpen(cl)).toBe(false);
    expect(guessDevice(cl)).toBe('phone');
  });
  it('갤럭시 폴드 펼침(거의 정사각형, 짧은 쪽 600 이상) → 펼친 폴더블 = 태블릿 화면', () => {
    const cl = c({ userAgent: UA.androidPhone, maxTouchPoints: 5, screenW: 884, screenH: 1104 });
    expect(isFoldOpen(cl)).toBe(true);
    expect(guessDevice(cl)).toBe('tablet');
    // 펼친 채 가로로
    expect(guessDevice(c({ userAgent: UA.androidPhone, maxTouchPoints: 5, screenW: 1104, screenH: 884 }))).toBe('tablet');
  });
  it('모델명이 폴드면 확정 (크롬이 알려 줄 때)', () => {
    expect(isFoldOpen(c({ userAgent: UA.androidPhone, model: 'SM-F946N', maxTouchPoints: 5, screenW: 884, screenH: 1104 }))).toBe(true);
    expect(isFoldOpen(c({ userAgent: UA.androidPhone, model: 'SM-F946N', maxTouchPoints: 5, screenW: 344, screenH: 882 }))).toBe(false);
  });
  it('보통 큰 휴대폰(가로로 눕혀도 짧은 쪽이 작음)은 폴더블로 안 봄', () => {
    expect(isFoldOpen(c({ userAgent: UA.iphone, maxTouchPoints: 5, screenW: 932, screenH: 430 }))).toBe(false);
  });
});
