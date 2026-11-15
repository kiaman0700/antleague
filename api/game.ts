import { handle } from './_lib/server.js';

const MAX_BODY = 8 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

/** Vercel 함수: POST /api/game */
export async function POST(request: Request): Promise<Response> {
  // 다른 사이트에서 사용자 브라우저를 이용해 요청하는 것(CSRF) 차단
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return json(403, { error: '허용되지 않은 요청이에요.' });
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: '잘못된 요청 형식이에요.' });

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: '요청이 너무 커요.' });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: '잘못된 요청이에요.' });
  }
  const auth = request.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const res = await handle(body, token);
  return json(res.status, res.body);
}
