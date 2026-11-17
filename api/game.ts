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
  if (origin && host) {
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false; // 'null' 같은 이상한 Origin
    }
    if (!ok) return json(403, { error: '허용되지 않은 요청이에요.' });
  }
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
  // 손님 계정 만들기 제한용 접속 IP (Vercel 이 붙여 주는 값)
  const ip = (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim().slice(0, 64);
  // 자동 시험 도구(e2e) 표시 — 밸런스 통계에서 빼는 용도로만 (붙여도 자기 판이 통계에서 빠질 뿐)
  const testRun = request.headers.get('x-stockduel-test') === '1';
  const res = await handle(body, token, ip, testRun);
  return json(res.status, res.body);
}
