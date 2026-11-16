// 운영자 기능 보안: 일반 계정은 의견함을 볼 수 없고, 화면·API 로는 운영자 계정을 만들 방법이 아예 없음
import { user, ok, done, BASE } from './lib.mjs';

const U = await user();
const me = await U({ action: 'me' });
ok('일반 계정은 운영자가 아님', me.s === 200 && me.b.isAdmin === false, JSON.stringify(me.b));
const inbox = await U({ action: 'adminInbox' });
ok('일반 계정은 의견함을 못 봄 (403)', inbox.s === 403 && !inbox.b?.rows, JSON.stringify(inbox.b));
const mark = await U({ action: 'adminMarkRead', ids: [1] });
ok('일반 계정은 읽음 표시도 못 함 (403)', mark.s === 403);
const post = (body) => fetch(BASE + '/api/game', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) }));
const old1 = await post({ action: 'adminSignup', email: 'admin@example.com', password: 'abcdefghijk', code: 'WRONGCODEWRONGCODE12' });
ok('운영자 계정 만들기 요청은 없어짐 (로그인 없이 401)', old1.s === 401, String(old1.s));
const old2 = await U({ action: 'adminSignup', email: 'someone@example.com', password: 'abcdefghijk', code: 'X' });
ok('로그인한 일반 계정이 보내도 안 됨 (운영자 아님 403)', old2.s === 403, String(old2.s));
const meta = await U({ action: 'updateProfile', title: null, role: 'admin', app_metadata: { role: 'admin' } });
ok('프로필 바꾸기에 운영자 값을 끼워 넣어도 운영자가 안 됨', (await U({ action: 'me' })).b.isAdmin === false, String(meta.s));
const noAuth = await post({ action: 'adminInbox' });
ok('로그인 없이는 의견함 요청 불가 (401)', noAuth.s === 401);
done();
