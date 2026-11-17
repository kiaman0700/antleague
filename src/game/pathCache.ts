/**
 * 지난 날 장중 흐름 (화면 전용). 화면 데이터에는 지난 날의 시가·고가·저가·종가만 있고 장중 가격은 없음.
 * - 이 기기에서 직접 본 날은 받은 장중 가격을 기억해 두었다가 그대로 씀 (판마다 따로, localStorage)
 * - 못 본 날은 그날 시가 → (고가/저가) → 종가를 지나는 흐름을 만들어 채움 — 이미 공개된 지난 값으로만 만들어서
 *   앞으로의 가격과는 아무 상관 없음
 */
const PREFIX = 'stockduel.ipath.';
let scope = '';
let mem: { paths: Record<string, number[]>; meta: { n: number; tickMs: number } | null } = { paths: {}, meta: null };
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function pickScope(sc: string) {
  if (sc === scope) return;
  scope = sc;
  mem = { paths: {}, meta: null };
  try {
    const raw = localStorage.getItem(PREFIX + sc);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') mem = { paths: v.paths ?? {}, meta: v.meta ?? null };
    }
    // 다른 판 것은 지움 (저장 공간이 계속 쌓이지 않게)
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) && k !== PREFIX + sc) localStorage.removeItem(k);
  } catch {
    /* 저장소 못 씀 — 이 화면 동안만 기억 */
  }
}

function flushSoon() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(PREFIX + scope, JSON.stringify(mem));
    } catch {
      /* 가득 참 등 — 무시 */
    }
  }, 4000);
}

/** 오늘 받은 장중 가격을 기억 (더 길어졌을 때만) */
export function rememberDay(sc: string, day: number, paths: Record<string, number[] | undefined>, meta: { n: number; tickMs: number }) {
  pickScope(sc);
  mem.meta = meta;
  for (const [sym, p] of Object.entries(paths)) {
    if (!p || !p.length) continue;
    const key = `${sym}:${day}`;
    if ((mem.paths[key]?.length ?? 0) < p.length) {
      mem.paths[key] = p.slice();
      dirty = true;
    }
  }
  if (dirty) flushSoon();
}

export function dayMeta(sc: string) {
  pickScope(sc);
  return mem.meta;
}

/** 이 기기가 본 그날 장중 가격 (거의 끝까지 본 것만) */
export function seenPath(sc: string, sym: string, day: number, n: number): number[] | null {
  pickScope(sc);
  const p = mem.paths[`${sym}:${day}`];
  return p && p.length >= n - 1 ? p : null;
}

function h01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

/** 시가·고가·저가·종가를 지나는 n칸 흐름 (양 끝·고가·저가는 정확히 지남) */
export function synthPath(bar: { open: number; high: number; low: number; close: number }, n: number, seed: string, round: (v: number) => number): number[] {
  const { open, high, low, close } = bar;
  if (n <= 1) return [close];
  const upDay = close >= open;
  // 먼저 닿는 끝(오르는 날은 저가 먼저, 내리는 날은 고가 먼저)과 두 번째 끝의 시각
  const a = Math.max(1, Math.round(n * (0.12 + 0.3 * h01(seed + ':a'))));
  const b = Math.min(n - 2, Math.max(a + 1, Math.round(n * (0.55 + 0.3 * h01(seed + ':b')))));
  const first = upDay ? low : high;
  const second = upDay ? high : low;
  const pts: [number, number][] = [
    [-1, open],
    [a, first],
    [b, second],
    [n - 1, close],
  ];
  const span = Math.max(high - low, open * 0.002);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let j = 0;
    while (j < pts.length - 2 && i > pts[j + 1][0]) j++;
    const [x0, y0] = pts[j];
    const [x1, y1] = pts[j + 1];
    const t = (i - x0) / (x1 - x0);
    let v = y0 + (y1 - y0) * t;
    // 꺾이는 점이 아니면 작은 흔들림 (범위 안에서만)
    if (i !== a && i !== b && i !== n - 1) v += (h01(`${seed}:${i}`) - 0.5) * span * 0.18;
    out.push(round(Math.min(high, Math.max(low, v))));
  }
  out[a] = round(first);
  out[b] = round(second);
  out[n - 1] = round(close);
  return out;
}
