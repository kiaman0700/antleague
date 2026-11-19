// levers.ts 묶기 — SIM_CAP 환경변수로 레버리지 제한(LEVERAGE_CAP)을 바꿔 실험할 수 있게, 묶을 때만 엔진 글자를 바꿔 끼움(원본 파일은 그대로)
//   node sim/buildcap.mjs sim/levers.ts && LEV=1 SIM_CAP=0.6 node sim/.out/levers.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const entry = process.argv[2] ?? 'sim/levers.ts';
const out = `sim/.out/${path.basename(entry, '.ts')}.mjs`;
const target = path.resolve('src/engine/engine.ts').toLowerCase();
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
  plugins: [{
    name: 'cap',
    setup(b) {
      b.onLoad({ filter: /engine\.ts$/ }, (a) => {
        if (path.resolve(a.path).toLowerCase() !== target) return;
        const src = fs.readFileSync(a.path, 'utf8');
        const next = src.replace('export const LEVERAGE_CAP = 0.3;', 'export const LEVERAGE_CAP = Number(process.env.SIM_CAP ?? 0.3);');
        if (next === src) throw new Error('LEVERAGE_CAP 글자를 못 찾음');
        return { contents: next, loader: 'ts', resolveDir: path.dirname(a.path) };
      });
    },
  }],
});
console.log(out);
