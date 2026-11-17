import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryingFetch } from '../../api/_lib/server.js';

/** 서버 → Supabase 요청 재시도: 읽기만 다시, 쓰기는 두 번 들어가지 않게 한 번만 */
describe('Supabase 요청 재시도', () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });
  it('읽기(GET)는 연결 실패 뒤 다시 시도해서 성공', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      if (n < 3) throw new TypeError('fetch failed');
      return new Response('ok', { status: 200 });
    }) as typeof fetch;
    const r = await retryingFetch('https://x.test/rest/v1/rooms', { method: 'GET' });
    expect(r.status).toBe(200);
    expect(n).toBe(3);
  });
  it('읽기도 3번까지만', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(retryingFetch('https://x.test/rest/v1/rooms')).rejects.toThrow();
    expect(n).toBe(3);
  });
  it('쓰기(POST·PATCH)는 실패해도 다시 보내지 않음', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      let n = 0;
      globalThis.fetch = vi.fn(async () => {
        n++;
        throw new TypeError('fetch failed');
      }) as typeof fetch;
      await expect(retryingFetch('https://x.test/rest/v1/trades', { method })).rejects.toThrow();
      expect(n).toBe(1);
    }
  });
  it('읽기에서 503 이면 다시, 400 은 그대로', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => new Response('', { status: ++n === 1 ? 503 : 200 })) as typeof fetch;
    expect((await retryingFetch('https://x.test/auth/v1/user')).status).toBe(200);
    n = 0;
    globalThis.fetch = vi.fn(async () => {
      n++;
      return new Response('', { status: 400 });
    }) as typeof fetch;
    expect((await retryingFetch('https://x.test/auth/v1/user')).status).toBe(400);
    expect(n).toBe(1);
  });
});
