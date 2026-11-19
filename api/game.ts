import { createHmac, timingSafeEqual } from 'node:crypto';
import { handle } from './_lib/server.js';

/** e2e 도구 표시 값 = HMAC(서버 비밀 키, 'e2e-test') 앞 32자 — 비밀 키를 가진 이 컴퓨터의 시험 도구만 만들 수 있음 */
function isTestKey(v: string | null): boolean {
  const key = process.env.SUPABASE_SECRET_KEY;
  // 16진수 32자만 (다른 글자가 섞이면 바이트 길이가 달라져 비교 함수가 오류를 던졌음)
  if (!v || !key || !/^[0-9a-f]{32}$/.test(v)) return false;
  const want = createHmac('sha256', key).update('e2e-test').digest('hex').slice(0, 32);
  return timingSafeEqual(Buffer.from(v), Buffer.from(want));
}

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
  // 자동 시험 도구(e2e) 표시 — 밸런스 통계에서 빼는 용도로만. 서버 비밀 키로 만든 값이어야 인정
  // (고정값이면 누구나 붙일 수 있어 자기 판을 운영 통계에서 일부러 빼거나 섞을 수 있으므로)
  const testRun = isTestKey(request.headers.get('x-stockduel-test'));
  // (060) 화면이 보이는 상태의 요청인지 — 뒤에 숨은 창의 요청은 '접속 중'으로 치지 않음 (자기 계정에만 영향)
  const active = request.headers.get('x-stockduel-vis') !== '0';
  const res = await handle(body, token, ip, testRun, active);
  return json(res.status, res.body);
}
