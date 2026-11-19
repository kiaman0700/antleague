// augvalue.ts 묶기 — 엔진의 증강 보기(augs.ts 가 부르는 augmentOffer)만 sim/patched/augforce.ts 로 바꿔 끼움 (원본 파일은 그대로)
//   node sim/buildaug.mjs && node sim/.out/augvalue.mjs [판 수=240]
import { build } from 'esbuild';
import path from 'node:path';
const entry = process.argv[2] ?? 'sim/augvalue.ts';
const out = `sim/.out/${path.basename(entry, '.ts')}.mjs`;
const augsTs = path.resolve('src/engine/augs.ts').toLowerCase();
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
  plugins: [{
    name: 'augforce',
    setup(b) {
      b.onResolve({ filter: /augments\.js$/ }, (a) => {
        if (path.resolve(a.importer).toLowerCase() !== augsTs) return;
        return { path: path.resolve('sim/patched/augforce.ts') };
      });
    },
  }],
});
console.log(out);
