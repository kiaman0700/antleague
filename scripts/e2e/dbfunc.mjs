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
    // ── 주간 리그 정산(league_settle): 5명 조, 지난주 점수대로 승급·강등·보상, 두 번 불러도 한 번만 ──
    const five = (await c.query('select user_id from profiles where username = any($1) order by username limit 5', [Object.values(members).map((m) => m.u)])).rows.map((r) => r.user_id);
    if (five.length === 5) {
      const W1 = '2020-01-06';
      const W2 = '2020-01-13';
      await c.query('delete from league_tiers where user_id = any($1)', [five]);
      await c.query('delete from xp_log where user_id = any($1) and key = $2', [five, 'league:' + W1]);
      const g = (await c.query('insert into league_groups (week, tier, size) values ($1, 1, 5) returning id', [W1])).rows[0].id;
      for (const [i, id] of five.entries()) {
        await c.query('insert into league_tiers (user_id, tier, updated_week) values ($1, 1, $2)', [id, W1]);
        await c.query("insert into league_members (week, user_id, group_id, tier, score, joined_at) values ($1, $2, $3, 1, $4, now() - ($5 || ' minutes')::interval)", [W1, id, g, 50 - i * 10, String(10 - i)]);
      }
      const xp0 = Object.fromEntries((await c.query('select user_id, coalesce(xp,0) xp from profiles where user_id = any($1)', [five])).rows.map((r) => [r.user_id, Number(r.xp)]));
      for (const id of five) await c.query('select public.league_settle($1, $2)', [id, W2]);
      for (const id of five) await c.query('select public.league_settle($1, $2)', [id, W2]);
      const t = Object.fromEntries((await c.query('select user_id, tier, last_rank, last_reward from league_tiers where user_id = any($1)', [five])).rows.map((r) => [r.user_id, r]));
      const xp1 = Object.fromEntries((await c.query('select user_id, coalesce(xp,0) xp from profiles where user_id = any($1)', [five])).rows.map((r) => [r.user_id, Number(r.xp)]));
      ok('리그: 1·2위는 승급(10명 미만 조)', t[five[0]].tier === 2 && t[five[1]].tier === 2, `${t[five[0]].tier} ${t[five[1]].tier}`);
      ok('리그: 3·4위는 그대로', t[five[2]].tier === 1 && t[five[3]].tier === 1);
      ok('리그: 꼴찌는 강등', t[five[4]].tier === 0, String(t[five[4]].tier));
      ok('리그: 1위 보상 (100+30)×1.2 = 156, 3위 50×1.2 = 60', t[five[0]].last_reward === 156 && t[five[2]].last_reward === 60, `${t[five[0]].last_reward} ${t[five[2]].last_reward}`);
      ok('리그: 두 번 정산해도 경험치는 한 번만', xp1[five[0]] - xp0[five[0]] === 156 && xp1[five[2]] - xp0[five[2]] === 60, `${xp1[five[0]] - xp0[five[0]]} ${xp1[five[2]] - xp0[five[2]]}`);
    } else ok('리그 시험용 회원 5명', false, String(five.length));
    // ── 게스트 자동 삭제(purge_inactive_guests): 4일 넘게 쉰 게스트만, 회원·최근 게스트는 절대 안 지움 ──
    const guests = (await c.query('select u.id from auth.users u where not exists (select 1 from profiles p where p.user_id = u.id) order by u.created_at desc limit 2')).rows.map((r) => r.id);
    if (guests.length === 2) {
      const [oldG, newG] = guests;
      const member = five[0];
      const old = "((now() at time zone 'Asia/Seoul')::date - 10)";
      await c.query(`insert into guest_activity (user_id, last_day) values ($1, ${old}) on conflict (user_id) do update set last_day = excluded.last_day`, [oldG]);
      await c.query("insert into guest_activity (user_id, last_day) values ($1, (now() at time zone 'Asia/Seoul')::date) on conflict (user_id) do update set last_day = excluded.last_day", [newG]);
      await c.query(`insert into guest_activity (user_id, last_day) values ($1, ${old}) on conflict (user_id) do update set last_day = excluded.last_day`, [member]);
      await c.query('select public.purge_inactive_guests()');
      const left = new Set((await c.query('select id from auth.users where id = any($1)', [[oldG, newG, member]])).rows.map((r) => r.id));
      ok('게스트 삭제: 4일 넘게 쉰 게스트는 지워짐', !left.has(oldG));
      ok('게스트 삭제: 오늘 활동한 게스트는 남음', left.has(newG));
      ok('게스트 삭제: 오래 쉰 회원은 절대 안 지워짐', left.has(member));
    } else ok('게스트 시험용 계정 2개', false, String(guests.length));
    // ── (v27) 증강 수수료(0·0.2%)가 DB 제한에 막히지 않음 (066) — 아무 거래 하나를 바꿔 보고 끝에 되돌림 ──
    const anyTrade = (await c.query('select id from trades limit 1')).rows[0];
    if (anyTrade) {
      for (const fee of [0, 0.002]) {
        await c.query('savepoint fee_try');
        let okFee = true;
        try {
          await c.query('update trades set fee = $2 where id = $1', [anyTrade.id, fee]);
        } catch {
          okFee = false;
        }
        await c.query('rollback to savepoint fee_try');
        ok(`거래 수수료 ${fee * 100}% 를 DB 가 받음 (증강 수수료)`, okFee);
      }
    }
  } catch (e) {
    ok('DB 함수 시험 중 오류 없음', false, e instanceof Error ? e.message : String(e));
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
  done();
}
