/**
 * 배경 음악: 파일 없이 그 자리에서 합성 (저작권·용량 걱정 없음).
 * 장면마다 분위기만 다르게 — 로비(잔잔한 로파이), 장 전(고요한 패드), 장중(박자 있는 긴장감), 카운트다운(조금 더 빠르게).
 * 화면이 뒤로 가면 멈추고(배터리), 효과음이 크게 날 땐 잠깐 작아짐.
 */
import { audio, saveVol, userActivated } from './sound';

export type Scene = 'off' | 'lobby' | 'pre' | 'market' | 'tense';

const ON_KEY = 'stockduel.music';
const VOL_KEY = 'stockduel.musicVol';

function readOn() {
  try {
    return localStorage.getItem(ON_KEY) !== '0';
  } catch {
    return true;
  }
}
function readVol() {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  } catch {
    return 0.5;
  }
}

let on = readOn();
let vol = readVol();
let scene: Scene = 'off';
let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;
let bar = 0;
let noise: AudioBuffer | null = null;
let duckUntil = 0;

export const musicOn = () => on;
export const musicVol = () => vol;
export function setMusicOn(v: boolean) {
  on = v;
  try {
    localStorage.setItem(ON_KEY, v ? '1' : '0');
  } catch {
    /* 무시 */
  }
  window.dispatchEvent(new Event('soundprefs'));
  refresh();
}
export function setMusicVol(v: number) {
  vol = Math.min(1, Math.max(0, v));
  saveVol(VOL_KEY, vol);
  applyGain(0.1);
}

/** 음악 줄 실제 음량 (켜짐·장면·잠깐 줄이기 반영) */
function target() {
  if (!on || scene === 'off' || document.hidden) return 0;
  const base = 0.32 * vol;
  return performance.now() < duckUntil ? base * 0.3 : base;
}
function applyGain(ramp = 0.6) {
  const a = audio();
  if (!a) return;
  const g = a.music.gain;
  g.cancelScheduledValues(a.ctx.currentTime);
  g.setValueAtTime(g.value, a.ctx.currentTime);
  g.linearRampToValueAtTime(target(), a.ctx.currentTime + ramp);
}

// ---------- 곡 (장면별 박자·화음) ----------
type Song = { bpm: number; chords: number[][]; bass: number[]; drums: 'none' | 'soft' | 'beat' | 'drive'; arp: number; keys: boolean; pad: boolean; bell: number };
// 화음은 MIDI 번호 (60 = 가운데 도)
const SONGS: Record<Exclude<Scene, 'off'>, Song> = {
  // Fmaj7 → Em7 → Dm7 → Cmaj7 : 잔잔하게 내려가는 로파이
  lobby: { bpm: 76, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36], drums: 'soft', arp: 0, keys: true, pad: false, bell: 0.22 },
  // Am9 ↔ Fmaj7 : 아직 장이 안 열린 고요함
  pre: { bpm: 66, chords: [[57, 60, 64, 71], [53, 57, 60, 64]], bass: [45, 41], drums: 'none', arp: 0, keys: false, pad: true, bell: 0.12 },
  // Am → F → C → G : 장중, 박자 있는 긴장
  market: { bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 48, 43], drums: 'beat', arp: 0.45, keys: false, pad: true, bell: 0 },
  // 카운트다운: 같은 화음을 조금 빠르고 촘촘하게
  tense: { bpm: 116, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 48, 43], drums: 'drive', arp: 0.7, keys: false, pad: true, bell: 0 },
};
const PENTA = [0, 2, 4, 7, 9];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- 악기 ----------
function voice(a: { ctx: AudioContext; music: GainNode }, t: number, f: number, dur: number, type: OscillatorType, gain: number, attack = 0.01, cutoff = 4000) {
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  const lp = a.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(a.music);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hat(a: { ctx: AudioContext; music: GainNode }, t: number, gain: number) {
  if (!noise) {
    noise = a.ctx.createBuffer(1, a.ctx.sampleRate * 0.2, a.ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.ctx.createBufferSource();
  s.buffer = noise;
  const hp = a.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(hp).connect(g).connect(a.music);
  s.start(t);
  s.stop(t + 0.06);
}
function kick(a: { ctx: AudioContext; music: GainNode }, t: number, gain: number) {
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(a.music);
  o.start(t);
  o.stop(t + 0.2);
}

/** 16분음표 한 칸 */
function playStep(a: { ctx: AudioContext; music: GainNode }, song: Song, t: number) {
  const sixteenth = 60 / song.bpm / 4;
  const ci = bar % song.chords.length;
  const chord = song.chords[ci];
  const s = step % 16;
  if (s === 0) seed = (bar * 7919 + ci * 31) | 1;
  // 패드: 마디 처음에 길게
  if (song.pad && s === 0) for (const n of chord) voice(a, t, hz(n), sixteenth * 16, 'triangle', 0.035, 0.6, 1400);
  // 건반: 1·3박에 부드러운 화음
  if (song.keys && (s === 0 || s === 8)) chord.forEach((n, i) => voice(a, t + i * 0.012, hz(n), sixteenth * 7, 'sine', 0.05, 0.02, 2600));
  // 베이스
  const root = hz(song.bass[ci]);
  if (song.drums === 'beat' || song.drums === 'drive') {
    if (s % 2 === 0) voice(a, t, root, sixteenth * 1.8, 'triangle', s % 8 === 0 ? 0.11 : 0.07, 0.005, 700);
  } else if (s === 0 || s === 10) voice(a, t, root, sixteenth * 6, 'sine', 0.09, 0.02, 600);
  // 북
  if (song.drums === 'soft' && s % 4 === 2) hat(a, t, 0.012);
  if (song.drums === 'beat') {
    if (s % 8 === 0) kick(a, t, 0.16);
    if (s % 2 === 1) hat(a, t, s % 4 === 3 ? 0.02 : 0.01);
  }
  if (song.drums === 'drive') {
    if (s % 4 === 0) kick(a, t, 0.17);
    hat(a, t, s % 2 ? 0.012 : 0.024);
  }
  // 분산 화음(장중): 화음 음을 위로 굴림
  if (song.arp > 0 && s % 2 === 0 && rnd() < song.arp) {
    const n = chord[(s / 2) % chord.length] + 12;
    voice(a, t, hz(n), sixteenth * 1.6, 'square', 0.012, 0.004, 2200);
  }
  // 종소리 선율: 5음 음계에서 가끔
  if (song.bell > 0 && s % 2 === 0 && rnd() < song.bell) {
    const n = 72 + PENTA[Math.floor(rnd() * PENTA.length)] + (rnd() < 0.3 ? 12 : 0);
    voice(a, t, hz(n), sixteenth * 5, 'sine', 0.03, 0.01, 5000);
  }
}

function tick() {
  if (!on || scene === 'off' || document.hidden) return stop();
  const a = audio();
  if (!a) return;
  const song = SONGS[scene];
  const sixteenth = 60 / song.bpm / 4;
  if (nextAt < a.ctx.currentTime) nextAt = a.ctx.currentTime + 0.05;
  while (nextAt < a.ctx.currentTime + 0.25) {
    playStep(a, song, nextAt);
    nextAt += sixteenth;
    step++;
    if (step % 16 === 0) bar++;
  }
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  applyGain(0.4);
}
function refresh() {
  applyGain(0.8);
  if (on && scene !== 'off' && !document.hidden && userActivated()) {
    if (!timer) {
      nextAt = 0;
      timer = setInterval(tick, 60);
      tick();
    }
  } else if (timer) stop();
}

/** 지금 화면에 맞는 음악 — 같은 장면이면 그대로 이어 감 */
export function setScene(s: Scene) {
  if (s === scene) return;
  const wasOff = scene === 'off';
  scene = s;
  if (wasOff) {
    step = 0;
    bar = 0;
  }
  refresh();
}

let started = false;
/** 앱이 시작할 때 한 번: 화면을 처음 누른 순간·창이 다시 보일 때 음악을 이어 줌 */
export function startMusicWatch() {
  if (started) return;
  started = true;
  const kickoff = () => refresh();
  window.addEventListener('pointerdown', kickoff, { passive: true });
  window.addEventListener('keydown', kickoff);
  document.addEventListener('visibilitychange', () => refresh());
  window.addEventListener('sfxduck', () => {
    duckUntil = performance.now() + 1800;
    applyGain(0.08);
    setTimeout(() => applyGain(0.9), 1850);
  });
}
