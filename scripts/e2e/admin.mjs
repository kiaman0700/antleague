// 운영자 기능 보안: 일반 계정은 의견함을 볼 수 없고, 설정 코드 없이 운영자 계정을 만들 수 없음
import { user, ok, done, BASE } from './lib.mjs';

const U = await user();
const me = await U({ action: 'me' });
ok('일반 계정은 운영자가 아님', me.s === 200 && me.b.isAdmin === false, JSON.stringify(me.b));
const inbox = await U({ action: 'adminInbox' });
ok('일반 계정은 의견함을 못 봄 (403)', inbox.s === 403 && !inbox.b?.rows, JSON.stringify(inbox.b));
const mark = await U({ action: 'adminMarkRead', ids: [1] });
ok('일반 계정은 읽음 표시도 못 함 (403)', mark.s === 403);
const post = (body) => fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }));
const wrong = await post({ action: 'adminSignup', email: 'kiaman0700@naver.com', password: 'abcdefghijk', code: 'WRONGCODEWRONGCODE12' });
ok('설정 코드가 틀리면 운영자 계정을 만들 수 없음', wrong.s === 403, wrong.b?.error);
const other = await post({ action: 'adminSignup', email: 'someone@example.com', password: 'abcdefghijk', code: 'X' });
ok('운영자 이메일이 아니면 만들 수 없음', other.s === 403, other.b?.error);
const noAuth = await post({ action: 'adminInbox' });
ok('로그인 없이는 의견함 요청 불가 (401)', noAuth.s === 401);
done();
