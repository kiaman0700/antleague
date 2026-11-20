import { loadMute, saveMute } from '../session';

/** 외부 파일 없이 WebAudio 로 합성하는 효과음 (배경 음악은 music.ts — 같은 소리 장치를 씀) */
type Sfx = 'buy' | 'sell' | 'news' | 'close' | 'item' | 'attack' | 'blocked' | 'win' | 'lose' | 'react' | 'tap' | 'error' | 'open' | 'tick';

let ctx: AudioContext | null = null;
/** 모든 소리가 거쳐 가는 전체 음량 — 여러 소리가 겹쳐도 한꺼번에 너무 커지지 않게 */
let master: GainNode | null = null;
/** 효과음·음악 음량을 따로 */
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = loadMute();

const VOL_KEY = 'stockduel.sfxVol';
function loadVol(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch {
    return fallback;
  }
}
export function saveVol(key: string, v: number) {
  try {
    localStorage.setItem(key, String(Math.round(v * 100) / 100));
  } catch {
    /* 저장소를 못 써도 소리는 남 */
  }
}
let sfxVol = loadVol(VOL_KEY, 0.8);

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  saveMute(m);
  window.dispatchEvent(new Event('soundprefs'));
}
export const getSfxVol = () => sfxVol;
export function setSfxVol(v: number) {
  sfxVol = Math.min(1, Math.max(0, v));
  saveVol(VOL_KEY, sfxVol);
  if (sfxBus) sfxBus.gain.value = sfxVol;
}

/** 이 페이지에서 화면을 한 번이라도 눌렀는지 (안 눌렀으면 브라우저가 소리를 막고 경고만 남김) */
export function userActivated() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return !ua || ua.hasBeenActive;
}

/** 소리 장치 (처음 부를 때 만듦) — 효과음 줄·음악 줄을 함께 돌려줌 */
export function audio(): { ctx: AudioContext; sfx: GainNode; music: GainNode } | null {
  if (!userActivated()) return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    // 아이폰: 무음 스위치를 따르고, 듣던 음악 앱을 끄지 않고 섞여 나오게 (사파리 16.4+)
    try {
      const sess = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (sess) sess.type = 'ambient';
    } catch {
      /* 지원 안 하면 그대로 */
    }
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.7;
    // 갑자기 큰 소리가 겹쳐도 찢어지지 않게 마지막에 살짝 눌러 줌
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
  }
  // 아이폰은 다른 앱을 다녀오면 'interrupted' 로 멈춰 있음
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return { ctx, sfx: sfxBus!, music: musicBus! };
}

function ac() {
  return audio()?.ctx ?? null;
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
  o.connect(g).connect(sfxBus ?? a.destination);
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

/** 같은 소리는 0.4초에 한 번, 다른 소리도 0.08초 안에 겹치면 건너뜀 (속보·알림이 한꺼번에 와도 한 번만) */
const lastAt = new Map<Sfx, number>();
let lastAny = 0;

export function play(s: Sfx) {
  if (muted) return;
  const now = performance.now();
  if (now - (lastAt.get(s) ?? -1e9) < 400 || now - lastAny < 80) return;
  lastAt.set(s, now);
  lastAny = now;
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
      case 'tick':
        // 장 마감 직전 똑딱 (아주 짧고 작게)
        tone(1760, 0, 0.035, 'sine', 0.035);
        break;
      case 'open':
        // 장이 열림: 맑은 종소리 두 번
        tone(1318, 0, 0.5, 'sine', 0.09);
        tone(1975, 0, 0.35, 'sine', 0.03);
        tone(1318, 0.22, 0.7, 'sine', 0.08);
        tone(2637, 0.22, 0.3, 'sine', 0.02);
        break;
    }
    // 큰 알림이 날 땐 배경 음악을 잠깐 줄여 소리가 묻히지 않게
    if (s === 'news' || s === 'win' || s === 'lose' || s === 'close' || s === 'open') window.dispatchEvent(new CustomEvent('sfxduck'));
    const v = VIBE[s];
    // 화면을 한 번도 누르지 않았으면 브라우저가 진동을 막고 오류를 남김 → 누른 뒤에만
    const touched = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
    if (v && touched && 'vibrate' in navigator) navigator.vibrate(v);
  } catch {
    /* 소리가 안 나도 게임은 계속 */
  }
}
