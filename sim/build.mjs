// 시뮬레이션 묶기. PATCH=1 이면 엔진이 sim/patched/market.ts(제안 규칙, SIM_PATCH 환경변수로 조절)를 쓰게 바꿔 끼움
//   node sim/build.mjs sim/run.ts [PATCH=1]
import { build } from 'esbuild';
import path from 'node:path';
const entry = process.argv[2] ?? 'sim/run.ts';
const patch = process.env.PATCH === '1';
const out = `sim/.out/${path.basename(entry, '.ts')}${patch ? '-patched' : ''}.mjs`;
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'warning',
  plugins: patch
    ? [{
        name: 'patch-market',
        setup(b) {
          b.onResolve({ filter: /(^|\/)market\.js$/ }, (a) => {
            if (a.importer.includes(`${path.sep}patched${path.sep}`)) return;
            if (!a.importer.includes(`${path.sep}src${path.sep}`) && !a.importer.includes(`${path.sep}sim${path.sep}`)) return;
            return { path: path.resolve('sim/patched/market.ts') };
          });
        },
      }]
    : [],
});
console.log(out);
