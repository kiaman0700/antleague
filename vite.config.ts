import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

export default defineConfig({
  plugins: [react(), devApi()],
  server: { port: 5173 },
});
