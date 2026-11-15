import { loadMute, saveMute } from '../session';

/** 외부 파일 없이 WebAudio 로 합성하는 효과음 */
type Sfx = 'buy' | 'sell' | 'news' | 'close' | 'item' | 'attack' | 'blocked' | 'win' | 'lose' | 'react' | 'tap' | 'error';

let ctx: AudioContext | null = null;
let muted = loadMute();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  saveMute(m);
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const VIBE: Partial<Record<Sfx, number | number[]>> = {
  buy: 20,
  sell: 20,
  news: [30, 40, 30],
  attack: [80, 50, 80],
  win: [50, 50, 50, 50, 150],
  error: 60,
  react: 15,
};

export function play(s: Sfx) {
  if (muted) return;
  try {
    switch (s) {
      case 'buy':
        tone(660, 0, 0.09, 'triangle');
        tone(990, 0.07, 0.14, 'triangle');
        break;
      case 'sell':
        tone(880, 0, 0.09, 'triangle');
        tone(587, 0.07, 0.14, 'triangle');
        break;
      case 'news':
        tone(1046, 0, 0.12, 'sine', 0.1);
        tone(1318, 0.12, 0.12, 'sine', 0.1);
        tone(1568, 0.24, 0.2, 'sine', 0.1);
        break;
      case 'close':
        tone(523, 0, 0.25, 'sine', 0.12);
        tone(392, 0.2, 0.4, 'sine', 0.1);
        break;
      case 'item':
        tone(784, 0, 0.08, 'square', 0.05);
        tone(1175, 0.06, 0.08, 'square', 0.05);
        tone(1568, 0.12, 0.16, 'square', 0.05);
        break;
      case 'attack':
        tone(220, 0, 0.35, 'sawtooth', 0.08, 110);
        break;
      case 'blocked':
        tone(1200, 0, 0.05, 'square', 0.06);
        tone(1600, 0.05, 0.12, 'square', 0.06);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.12));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sine', 0.1));
        break;
      case 'react':
        tone(1400, 0, 0.06, 'sine', 0.08, 1800);
        break;
      case 'tap':
        tone(1000, 0, 0.03, 'sine', 0.04);
        break;
      case 'error':
        tone(200, 0, 0.15, 'square', 0.05);
        break;
    }
    const v = VIBE[s];
    if (v && 'vibrate' in navigator) navigator.vibrate(v);
  } catch {
    /* 소리가 안 나도 게임은 계속 */
  }
}
