import { describe, expect, it } from 'vitest';
import { guessDevice } from './device';

const env = (o: Partial<Parameters<typeof guessDevice>[0]>) => ({ coarse: false, maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', screenW: 1920, screenH: 1080, ...o });

describe('기기 판단 (창 크기가 아니라 기기로)', () => {
  it('마우스 PC 는 화면이 작아도 PC', () => {
    expect(guessDevice(env({}))).toBe('pc');
    expect(guessDevice(env({ screenW: 1280, screenH: 720 }))).toBe('pc');
  });
  it('터치 휴대폰: 짧은 쪽이 600 미만 (세로·가로 모두)', () => {
    expect(guessDevice(env({ coarse: true, maxTouchPoints: 5, screenW: 390, screenH: 844 }))).toBe('phone');
    expect(guessDevice(env({ coarse: true, maxTouchPoints: 5, screenW: 932, screenH: 430 }))).toBe('phone');
    expect(guessDevice(env({ coarse: true, maxTouchPoints: 5, screenW: 360, screenH: 780 }))).toBe('phone');
  });
  it('터치 태블릿: 짧은 쪽이 600 이상', () => {
    expect(guessDevice(env({ coarse: true, maxTouchPoints: 5, screenW: 820, screenH: 1180 }))).toBe('tablet');
    expect(guessDevice(env({ coarse: true, maxTouchPoints: 5, screenW: 1280, screenH: 800 }))).toBe('tablet');
  });
  it('아이패드 데스크톱 사이트(Mac 으로 보임 + 터치 여러 개)는 태블릿', () => {
    expect(guessDevice(env({ coarse: false, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', screenW: 1024, screenH: 1366 }))).toBe('tablet');
  });
  it('터치되는 노트북이라도 마우스가 주된 입력이면 PC', () => {
    expect(guessDevice(env({ coarse: false, maxTouchPoints: 10 }))).toBe('pc');
  });
  it('진짜 Mac(터치 없음)은 PC', () => {
    expect(guessDevice(env({ maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }))).toBe('pc');
  });
});
