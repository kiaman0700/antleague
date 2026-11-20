import { createHmac } from 'node:crypto';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { deviceCss } from './device-css';

/** 개발 중에도 /api/game 을 Vercel 함수처럼 쓰기 위한 미들웨어 (배포에서는 Vercel 이 api/game.ts 를 실행) */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      process.env.SUPABASE_URL ??= env.VITE_SUPABASE_URL;
      process.env.SUPABASE_SECRET_KEY ??= env.SUPABASE_SECRET_KEY;
      server.middlewares.use('/api/game', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        // 이 컴퓨터의 개발 서버로 한 판은 모두 시험 판으로 (점검·시험 판이 운영 통계·공개 랭킹에 섞이지 않게) — 배포된 사이트엔 이 단계가 없음 (이미 시험 표시를 붙여 온 요청은 그대로 — 가짜 표시 거절 시험용)
        if (process.env.SUPABASE_SECRET_KEY && !headers.has('x-stockduel-test')) headers.set('x-stockduel-test', createHmac('sha256', process.env.SUPABASE_SECRET_KEY).update('e2e-test').digest('hex').slice(0, 32));
        const request = new Request('http://' + (req.headers.host ?? 'localhost') + '/api/game', { method: 'POST', headers, body: Buffer.concat(chunks) });
        const mod = (await server.ssrLoadModule('/api/game.ts')) as { POST: (r: Request) => Promise<Response> };
        const out = await mod.POST(request);
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await out.text());
      });
    },
  };
}

/** 영어·숫자·가장 흔한 한글이 든 글꼴 조각 하나만 먼저 받음 (파일 이름에 해시가 붙어 빌드 뒤에 찾아 넣음) */
function preloadFont(): Plugin {
  return {
    name: 'preload-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const f = Object.keys(ctx.bundle ?? {}).find((k) => /PretendardVariable\.subset\.91-[^/]*\.woff2$/.test(k));
        return f ? [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: '/' + f, crossorigin: '' }, injectTo: 'head' }] : [];
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi(), preloadFont()],
  // 설정 맨 아래 버전 줄 (버그 제보 때 어느 판인지 알 수 있게) — 한국 날짜·시각
  define: { __BUILD__: JSON.stringify(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')) },
  // 화면 종류를 가르는 CSS 폭 규칙에 기기 조건 붙이기 (design/device-layout.md)
  css: { postcss: { plugins: [deviceCss()] } },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // 자주 안 바뀌는 라이브러리는 따로 묶어서, 게임을 고쳐 다시 배포해도 브라우저 캐시를 그대로 씀
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
