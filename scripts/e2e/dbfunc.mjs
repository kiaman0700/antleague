// DB 전용 함수(점수 감소 rank_decay)를 진짜 DB 에서 — 모두 한 트랜잭션 안에서 하고 끝에 되돌림(ROLLBACK), 실제 데이터는 안 바뀜
import fs from 'node:fs';
import pg from 'pg';
import { ok, done, env } from './lib.mjs';

const url = env.SUPABASE_DB_URL;
if (!url) {
  console.log('ℹ️ SUPABASE_DB_URL 이 없어 건너뜀');
  done();
} else {
  const members = JSON.parse(fs.readFileSync(new URL('./.members.json', import.meta.url), 'utf8'));
  const names = Object.values(members).map((m) => m.u).slice(0, 3);
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    await c.query('begin');
    const ids = (await c.query('select user_id, username from profiles where username = any($1)', [names])).rows;
    if (ids.length < 3) throw new Error('시험 회원 3명을 못 찾음');
    const [dia, master, floor] = ids.map((r) => r.user_id);
    const yesterday = "((now() at time zone 'Asia/Seoul')::date - 1)";
    // 다이아(2000, 쉴 날 0) · 마스터(2300, 쉴 날 0) · 다이아 바닥 근처(1920, 쉴 날 0)
    for (const [id, rating] of [[dia, 2000], [master, 2300], [floor, 1920]])
      await c.query(`update profiles set is_test = false, rating = $2, ranked_games = 5, decay_bank = 0, decay_last = ${yesterday} where user_id = $1`, [id, rating]);
    await c.query('select public.rank_decay()');
    const after1 = Object.fromEntries((await c.query('select user_id, rating, decay_bank from profiles where user_id = any($1)', [[dia, master, floor]])).rows.map((r) => [r.user_id, r]));
    ok('다이아는 쉴 날이 없으면 하루 50점 감소', after1[dia].rating === 1950, String(after1[dia].rating));
    ok('마스터는 하루 75점 감소', after1[master].rating === 2225, String(after1[master].rating));
    ok('다이아몬드 1(1900) 아래로는 안 떨어짐', after1[floor].rating === 1900, String(after1[floor].rating));
    await c.query('select public.rank_decay()');
    const after2 = (await c.query('select rating from profiles where user_id = $1', [dia])).rows[0];
    ok('같은 날 두 번 불러도 한 번만 감소', after2.rating === 1950, String(after2.rating));
    // 쉴 날이 남아 있으면 점수 대신 쉴 날이 줄어듦
    await c.query(`update profiles set rating = 2000, decay_bank = 3, decay_last = ${yesterday} where user_id = $1`, [dia]);
    await c.query('select public.rank_decay()');
    const r3 = (await c.query('select rating, decay_bank from profiles where user_id = $1', [dia])).rows[0];
    ok('쉴 날이 남아 있으면 점수는 그대로, 쉴 날만 하루 줄어듦', r3.rating === 2000 && r3.decay_bank === 2, JSON.stringify(r3));
    // 시험 회원은 감소 대상이 아님
    await c.query(`update profiles set is_test = true, rating = 2000, decay_bank = 0, decay_last = ${yesterday} where user_id = $1`, [dia]);
    await c.query('select public.rank_decay()');
    const r4 = (await c.query('select rating from profiles where user_id = $1', [dia])).rows[0];
    ok('시험 회원은 점수 감소에서 빠짐', r4.rating === 2000, String(r4.rating));
  } catch (e) {
    ok('DB 함수 시험 중 오류 없음', false, e instanceof Error ? e.message : String(e));
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
  done();
}
