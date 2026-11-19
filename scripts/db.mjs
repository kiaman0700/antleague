// Supabase DB 도구 — .env.local 의 SUPABASE_DB_URL 로 Postgres 에 직접 연결 (키는 출력하지 않음)
//   npm run db -- check                      연결 확인 + 적용된 마이그레이션 상태 (읽기만)
//   npm run db -- show supabase/005_x.sql    적용할 SQL 내용만 보여 줌 (실행 안 함)
//   npm run db -- apply supabase/005_x.sql   SQL 을 한 트랜잭션으로 적용 (실패하면 전부 되돌림)
//   npm run db -- feedback                   이용자가 보낸 의견 보기 (읽기만)
//   npm run db -- balance [--all]            실제로 끝난 대결로 밸런스 보기 (읽기만, 기본은 테스트 계정 판 제외)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error('.env.local 에 SUPABASE_DB_URL 이 없어요. (Supabase → Project Settings → Database → Connection string)');
  process.exit(1);
}

const [cmd, file] = process.argv.slice(2);
const readSql = () => {
  if (!file) throw new Error('SQL 파일 경로를 주세요. 예: supabase/005_turn_times.sql');
  const p = path.resolve(ROOT, file);
  if (!p.startsWith(path.join(ROOT, 'supabase') + path.sep) || !p.endsWith('.sql')) throw new Error('supabase/ 폴더 안의 .sql 파일만 적용할 수 있어요.');
  return fs.readFileSync(p, 'utf8');
};

async function connect() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();
  return client;
}

try {
  if (cmd === 'show') {
    console.log(readSql());
  } else if (cmd === 'check') {
    const c = await connect();
    const v = await c.query('select current_database() as db, current_user as usr, version() as v');
    console.log(`✅ 연결됨: ${v.rows[0].db} (${v.rows[0].usr}) · ${v.rows[0].v.split(' ').slice(0, 2).join(' ')}`);
    const cols = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='rooms'");
    const names = cols.rows.map((r) => r.column_name);
    const chk = await c.query("select pg_get_constraintdef(oid) as def from pg_constraint where conname='rooms_turn_seconds_check'");
    console.log('rooms 컬럼:', names.join(', '));
    console.log('002 orders 테이블:', (await c.query("select to_regclass('public.orders') as t")).rows[0].t ? '있음' : '없음');
    console.log('003 title/max_players/is_private:', ['title', 'max_players', 'is_private'].every((n) => names.includes(n)) ? '있음' : '없음');
    console.log('005 day_deadline:', names.includes('day_deadline') ? '있음' : '없음 (005 적용 전)');
    console.log('제한 시간 규칙:', chk.rows[0]?.def ?? '없음');
    await c.end();
  } else if (cmd === 'apply') {
    const sql = readSql();
    const c = await connect();
    try {
      await c.query('begin');
      await c.query(sql);
      await c.query('commit');
      console.log(`✅ 적용 완료: ${file}`);
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      await c.end();
    }
  } else if (cmd === 'errors') {
    // 예상 못 한 서버 오류 최근 40개 (036, 읽기만)
    const c = await connect();
    const r = await c.query('select action, message, created_at from public.server_errors order by created_at desc limit 40');
    for (const x of r.rows) console.log(`${new Date(x.created_at).toLocaleString('ko-KR')}  [${x.action}] ${x.message}`);
    if (!r.rows.length) console.log('기록된 서버 오류가 없어요.');
    await c.end();
  } else if (cmd === 'tutorial') {
    // 튜토리얼 단계별 이탈 (069, 읽기만): 최근 N일 동안 단계마다 본 수·그만둔 수·끝낸 수 (숫자만)
    const days = Number(process.argv[3]) || 14;
    const c = await connect();
    const r = await c.query(`select step, ev, sum(n)::int as n from public.tutorial_steps where day >= (now() at time zone 'Asia/Seoul')::date - $1::int group by step, ev order by step`, [days]);
    const by = new Map();
    for (const x of r.rows) by.set(x.step, { ...(by.get(x.step) ?? {}), [x.ev]: x.n });
    if (!by.size) console.log(`최근 ${days}일 튜토리얼 기록이 없어요.`);
    const first = by.get(0)?.show ?? 0;
    for (const [step, v] of [...by].sort((a, b) => a[0] - b[0])) {
      const show = v.show ?? 0;
      console.log(`${String(step + 1).padStart(2)}단계  본 사람 ${String(show).padStart(4)}${first ? ` (${Math.round((show / first) * 100)}%)` : ''}  그만둠 ${v.quit ?? 0}${v.done ? `  끝냄 ${v.done}` : ''}`);
    }
    await c.end();
  } else if (cmd === 'feedback') {
    // 이용자가 보낸 의견 최근 30개 (읽기만). 기본은 안 읽은 것만(자동 시험 글은 읽음으로 저장됨), --all 이면 전부
    // 글 안의 제어문자(터미널 색·커서 조작)는 보여 주기 전에 지움
    const all = process.argv.includes('--all');
    const c = await connect();
    const r = await c.query(`select id, kind, body, page, created_at from public.feedback ${all ? '' : 'where read_at is null'} order by created_at desc limit 30`);
    const clean = (t) => String(t ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
    for (const f of r.rows) console.log(`#${f.id} [${f.kind}] ${new Date(f.created_at).toLocaleString('ko-KR')} ${clean(f.page)}\n  ${clean(f.body).split('\n').join('\n  ')}`);
    if (!r.rows.length) console.log(all ? '아직 받은 의견이 없어요.' : '안 읽은 의견이 없어요. (전부 보기: --all)');
    await c.end();
  } else if (cmd === 'balance') {
    // 실제로 끝난 대결로 밸런스 확인 (읽기만). 사람 이름·아이디는 출력하지 않음
    const all = process.argv.includes('--all');
    const c = await connect();
    const games = (await c.query(`
      select r.id, r.created_at, coalesce(s.rules_version, 1) as v, h.results,
             (select count(*) from public.players p where p.room_id = r.id) as n
        from public.rooms r join public.match_history h on h.room_id = r.id
        left join public.room_secrets s on s.room_id = r.id
       where r.status = 'finished'`)).rows;
    const items = (await c.query(`select i.room_id, p.nickname, i.kind, i.action from public.items i join public.players p on p.id = i.player_id`)).rows;
    const trades = (await c.query(`select t.room_id, p.nickname, t.symbol, t.side from public.trades t join public.players p on p.id = t.player_id`)).rows;
    // 자동 점검(e2e)·시험용 판 거르기: 한 글자 이름·봇 이름 등
    const TEST = /^(?:[A-Z]|[A-Z][a-z0-9]{3,8}|봇|기권봇|테스트봇|매칭[A-D]|x|b\d|화면확인|아무거나)$/;
    // 아무도 한 번도 거래하지 않은 판(자동 점검·바로 기권)은 밸런스에 의미가 없어 뺌
    const traded = new Set(trades.map((t) => t.room_id));
    const real = games.filter((g) => all || (traded.has(g.id) && !(g.results ?? []).some((r) => TEST.test(r.nickname))));
    const ATK = new Set(['freeze', 'blackout', 'fake', 'fee']);
    const INFO = new Set(['paper', 'analyst', 'scout', 'detector', 'spy']);
    const LEV = new Set(['KLEV', 'KINV', 'USLEV', 'USINV', 'UTQQ', 'SQQQ']);
    const stat = () => ({ n: 0, win: 0, ret: 0 });
    const by = {};
    const add = (key, won, ret) => { const s = (by[key] ??= stat()); s.n++; s.win += won; s.ret += ret; };
    for (const g of real) {
      const res = g.results ?? [];
      const size = Number(g.n) === 2 ? '1대1' : '3인+';
      const top = res.filter((r) => !r.left).sort((a, b) => b.equity - a.equity);
      const winners = top.length && (top.length === 1 || top[0].equity !== top[1].equity) ? new Set([top[0].nickname]) : new Set();
      for (const r of res) {
        const mine = items.filter((i) => i.room_id === g.id && i.nickname === r.nickname);
        const usedAtk = mine.some((i) => i.action === 'use' && ATK.has(i.kind));
        const usedInfo = mine.some((i) => i.action === 'use' && INFO.has(i.kind));
        const bought = mine.some((i) => i.action === 'buy');
        const lev = trades.some((t) => t.room_id === g.id && t.nickname === r.nickname && t.side === 'buy' && LEV.has(t.symbol));
        const nTr = trades.filter((t) => t.room_id === g.id && t.nickname === r.nickname).length;
        const won = winners.has(r.nickname) ? 1 : 0;
        const ret = Number(r.ret ?? 0);
        add(`${size} 전체`, won, ret);
        add(`${size} 방해 카드 씀`, won, ret);
        if (!usedAtk) by[`${size} 방해 카드 씀`].n--, (by[`${size} 방해 카드 씀`].win -= won), (by[`${size} 방해 카드 씀`].ret -= ret);
        if (usedInfo) add(`${size} 정보 카드 씀`, won, ret);
        if (bought) add(`${size} 카드 산 사람`, won, ret);
        if (lev) add(`${size} 레버리지·인버스 삼`, won, ret);
        if (nTr === 0) add(`${size} 한 번도 안 삼`, won, ret);
        if (r.left) add(`${size} 기권`, won, ret);
      }
    }
    console.log(`끝난 대결 ${real.length}판 (전체 ${games.length}판${all ? '' : ', 시험용 판 제외'})`);
    if (!real.length) console.log('아직 실제 대결 기록이 없어요. 사람들이 대결을 하면 여기서 승률·수익률을 볼 수 있어요.');
    for (const [k, s] of Object.entries(by).sort()) if (s.n > 0) console.log(`- ${k}: ${s.n}명 · 승률 ${((s.win / s.n) * 100).toFixed(1)}% · 평균 수익률 ${((s.ret / s.n) * 100).toFixed(1)}%`);
    console.log('※ 1대1 기대 승률 50%, 3인+ 는 인원에 따라 25~33%. 한쪽이 크게 높으면 그 전략·카드가 너무 셈');
    await c.end();
  } else if (cmd === 'stats') {
    // 밸런스용 판 기록(044 game_stats) 요약 — 실제 유저 판만(시험 계정 판 제외), 사람 자리만. 읽기만
    const days = Number(process.argv[3]) || 14;
    // --test: 시험 판까지 넣어 표가 제대로 나오는지만 확인할 때
    const T = process.argv.includes('--test') ? '' : 'not is_test and ';
    const c = await connect();
    const rows = (await c.query(`select * from public.game_stats where ${T}bot_level is null and created_at > now() - ($1 || ' days')::interval`, [days])).rows;
    if (!rows.length) {
      console.log(`최근 ${days}일 실제 유저 판 기록이 아직 없어요.`);
    } else {
      const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
      const avg = (xs) => (xs.length ? ((xs.reduce((s, x) => s + x, 0) / xs.length) * 100).toFixed(2) + '%' : '-');
      const games = new Set(rows.map((r) => r.room_id)).size;
      console.log(`최근 ${days}일 · 판 ${games}개 · 사람 자리 ${rows.length}개 (회원 ${rows.filter((r) => r.member).length})\n`);
      console.log('== 판 종류별');
      for (const k of [...new Set(rows.map((r) => (r.ranked ? 'ranked' : r.kind)))]) {
        const g = rows.filter((r) => (r.ranked ? 'ranked' : r.kind) === k);
        console.log(`  ${String(k).padEnd(8)} 자리 ${String(g.length).padStart(4)} · 1위 ${pct(g.filter((r) => r.won).length, g.length)} · 평균 수익률 ${avg(g.map((r) => r.ret))} · 기권 ${pct(g.filter((r) => r.left_game).length, g.length)} · 거래 0회 ${pct(g.filter((r) => r.trades === 0).length, g.length)}`);
      }
      const vs = rows.filter((r) => ['match', 'custom', 'friend'].includes(r.kind));
      console.log('\n== 규칙 버전별 (대결: match·custom·friend)');
      for (const v of [...new Set(vs.map((r) => r.version))].sort((a, b) => a - b)) {
        const g = vs.filter((r) => r.version === v);
        console.log(`  v${v} 자리 ${g.length} · 평균 수익률 ${avg(g.map((r) => r.ret))}`);
      }
      console.log('\n== 카드를 쓴 사람의 1위 비율 (대결 · 인원 보정 전: 1대1 기대 50% · 4인 25%)');
      const kinds = [...new Set(vs.flatMap((r) => Object.keys(r.cards || {})))].sort();
      for (const k of kinds) {
        const used = vs.filter((r) => (r.cards || {})[k] > 0);
        const not = vs.filter((r) => !((r.cards || {})[k] > 0));
        console.log(`  ${k.padEnd(9)} 쓴 자리 ${String(used.length).padStart(4)} · 1위 ${pct(used.filter((r) => r.won).length, used.length)} (안 쓴 자리 ${pct(not.filter((r) => r.won).length, not.length)}) · 평균 수익률 ${avg(used.map((r) => r.ret))}`);
      }
      // ---- 카드 자세히 (048): 언제·누구에게·막힘·그 뒤 하루 결과 ----
      const logs = vs.flatMap((r) => (r.card_log || []).map((u) => ({ ...u, days: r.days, players: r.players })));
      if (logs.length) {
        const mean = (xs) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length) * 100 : null);
        const pp = (v) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%p`);
        console.log('\n== 카드 자세히 (대결 · 결과 = 그날/다음 날 내 하루 수익률 − 다른 사람 평균)');
        for (const k of [...new Set(logs.map((u) => u.k))].sort()) {
          const g = logs.filter((u) => u.k === k);
          const phase = (u) => (u.day <= Math.ceil(u.days / 3) ? 0 : u.day <= Math.ceil((u.days * 2) / 3) ? 1 : 2);
          const ph = [0, 1, 2].map((i) => pct(g.filter((u) => phase(u) === i).length, g.length)).join('/');
          const parts = [`${k.padEnd(9)} ${String(g.length).padStart(4)}번 · 초/중/후반 ${ph}`];
          const att = g.filter((u) => u.tgtEnd != null);
          if (att.length) {
            parts.push(`그때 1위를 노림 ${pct(att.filter((u) => u.tgt === 1).length, att.filter((u) => u.tgt != null).length)}`);
            if (g.some((u) => u.res !== 'ok' || u.tgt1 != null)) {
              parts.push(`막힘 ${pct(g.filter((u) => u.res === 'blocked').length, g.length)} · 튕김 ${pct(g.filter((u) => u.res === 'reflected').length, g.length)} · 겹침 ${pct(g.filter((u) => u.res === 'crowded').length, g.length)}`);
              parts.push(`맞은 사람 그날 ${pp(mean(g.filter((u) => u.tgt1 != null).map((u) => u.tgt1)))}`);
            }
          }
          parts.push(`나 그날 ${pp(mean(g.filter((u) => u.me0 != null).map((u) => u.me0)))} · 다음 날 ${pp(mean(g.filter((u) => u.me1 != null).map((u) => u.me1)))}`);
          if (k === 'bonus') parts.push(`봉투 평균 ${Math.round(g.reduce((s, u) => s + (u.amt || 0), 0) / g.length).toLocaleString()}원`);
          console.log('  ' + parts.join(' · '));
        }
        // 쓸 때 내 순위별: 앞선 사람이 더 쓰는지, 뒤처진 사람이 뒤집으려고 쓰는지
        const byMy = [1, 2, 3, 4, 5, 6].map((n) => [n, logs.filter((u) => u.my === n).length]).filter(([, c]) => c);
        if (byMy.length) console.log(`  쓸 때 내 순위: ${byMy.map(([n, c]) => `${n}위 ${pct(c, logs.filter((u) => u.my != null).length)}`).join(' · ')}`);
        const hitRows = vs.filter((r) => r.cards_hit && Object.keys(r.cards_hit).length);
        console.log(`  방해를 한 번이라도 맞은 자리 ${pct(hitRows.length, vs.length)} · 그 자리 1위 ${pct(hitRows.filter((r) => r.won).length, hitRows.length)} (안 맞은 자리 ${pct(vs.filter((r) => !hitRows.includes(r) && r.won).length, vs.length - hitRows.length)}) · 방패로 막음 ${vs.reduce((s, r) => s + (r.shield_blocks || 0), 0)}번 · 거울로 튕김 ${vs.reduce((s, r) => s + (r.mirror_hits || 0), 0)}번`);
      }
      const lev = vs.filter((r) => r.lev);
      console.log(`\n== 레버리지·인버스를 산 자리 ${lev.length} · 1위 ${pct(lev.filter((r) => r.won).length, lev.length)} (안 산 자리 ${pct(vs.filter((r) => !r.lev && r.won).length, vs.filter((r) => !r.lev).length)})`);
      const bots = rows.filter((r) => r.kind === 'bot');
      // ---- 실력별 (045): 티어 · 경험(그 판 전까지 판 수) · 상대와의 점수 차 ----
      const TIERS = ['guest', 'unplaced', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
      const TIER_KO = { guest: '손님', unplaced: '배치 중', bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플래티넘', diamond: '다이아', master: '마스터' };
      const expOf = (n) => (n == null ? '모름' : n < 5 ? '0~4판' : n < 20 ? '5~19판' : n < 50 ? '20~49판' : '50판+');
      const line = (label, g) =>
        `  ${label.padEnd(8)} 자리 ${String(g.length).padStart(4)} · 1위 ${pct(g.filter((r) => r.won).length, g.length)} · 평균 수익률 ${avg(g.map((r) => r.ret))} · 카드 사용 ${pct(g.filter((r) => Object.keys(r.cards || {}).length).length, g.length)} · 레버리지 ${pct(g.filter((r) => r.lev).length, g.length)} · 거래 0회 ${pct(g.filter((r) => r.trades === 0).length, g.length)}`;
      console.log('\n== 티어별 (대결)');
      for (const t of TIERS) {
        const g = vs.filter((r) => r.tier === t);
        if (g.length) console.log(line(TIER_KO[t], g));
      }
      console.log('\n== 경험별 (대결, 그 판 전까지 끝낸 판 수)');
      for (const e of ['0~4판', '5~19판', '20~49판', '50판+', '모름']) {
        const g = vs.filter((r) => expOf(r.games_before) === e);
        if (g.length) console.log(line(e, g));
      }
      console.log('\n== 티어별 카드 효과 (그 티어에서 카드를 쓴 자리의 1위 비율 − 안 쓴 자리)');
      for (const t of TIERS) {
        const g = vs.filter((r) => r.tier === t);
        if (g.length < 10) continue;
        const parts = kinds
          .map((k) => {
            const u = g.filter((r) => (r.cards || {})[k] > 0);
            const n = g.filter((r) => !((r.cards || {})[k] > 0));
            if (u.length < 5 || !n.length) return null;
            const d = (u.filter((r) => r.won).length / u.length - n.filter((r) => r.won).length / n.length) * 100;
            return `${k} ${d >= 0 ? '+' : ''}${d.toFixed(0)}%p(${u.length})`;
          })
          .filter(Boolean);
        console.log(`  ${TIER_KO[t].padEnd(6)} ${parts.join(' · ') || '(표본 부족)'}`);
      }
      const rated = vs.filter((r) => r.ranked && r.opp_diff != null);
      if (rated.length) {
        console.log('\n== 랭킹전: 상대와 점수 차별 1위 비율 (Elo 가 잘 맞는지 — 차가 클수록 강한 쪽이 더 이겨야 함)');
        for (const [lo, hi, label] of [[-9999, -150, '150점 넘게 약함'], [-150, -50, '50~150 약함'], [-50, 50, '비슷함'], [50, 150, '50~150 강함'], [150, 9999, '150점 넘게 강함']]) {
          const g = rated.filter((r) => r.opp_diff >= lo && r.opp_diff < hi);
          if (g.length) console.log(`  ${label.padEnd(12)} 자리 ${String(g.length).padStart(4)} · 1위 ${pct(g.filter((r) => r.won).length, g.length)}`);
        }
      }
      // ---- 매칭(랭킹·일반)과 커스텀·친구는 따로 (커스텀은 인원·날 수·시간이 제각각) ----
      console.log('\n== 매칭 vs 커스텀·친구 (규칙이 달라 따로 봄)');
      const mt = vs.filter((r) => r.kind === 'match');
      const cu = vs.filter((r) => r.kind !== 'match');
      if (mt.length) console.log(line('매칭', mt));
      if (cu.length) console.log(line('커스텀·친구', cu));
      // ---- 봇 밸런스: 그 판의 가장 센 봇 난이도별 사람 1위 비율 · 사람 티어·경험별 ----
      const botSeats = (await c.query(`select room_id, max(bot_level) as lv, count(*) as n from public.game_stats where ${T}bot_level is not null and created_at > now() - ($1 || ' days')::interval group by room_id`, [days])).rows;
      const lvOf = new Map(botSeats.map((b) => [b.room_id, Number(b.lv)]));
      const humansInBot = rows.filter((r) => r.kind === 'bot' && lvOf.has(r.room_id));
      if (humansInBot.length) {
        const LV = { 1: '쉬움(새내기봇)', 2: '보통(개미봇)', 3: '어려움(고수봇)' };
        const GOAL = { 1: '목표: 초보도 거의 다 이김', 2: '목표: 몇 판 해 본 사람이면 이김', 3: '목표: 상위 랭커 아니면 어려움' };
        console.log('\n== 봇 밸런스 (가장 센 봇 난이도별 사람 1위 비율)');
        for (const lv of [1, 2, 3]) {
          const g = humansInBot.filter((r) => lvOf.get(r.room_id) === lv);
          if (!g.length) continue;
          console.log(`  ${LV[lv]} 판 ${g.length} · 사람 1위 ${pct(g.filter((r) => r.won).length, g.length)} · 평균 수익률 ${avg(g.map((r) => r.ret))}  (${GOAL[lv]})`);
          const byExp = ['0~4판', '5~19판', '20~49판', '50판+']
            .map((e) => {
              const h = g.filter((r) => expOf(r.games_before) === e);
              return h.length ? `${e} ${pct(h.filter((r) => r.won).length, h.length)}(${h.length})` : null;
            })
            .filter(Boolean);
          if (byExp.length) console.log(`      경험별: ${byExp.join(' · ')}`);
          const byTier = TIERS.map((t) => {
            const h = g.filter((r) => r.tier === t);
            return h.length ? `${TIER_KO[t]} ${pct(h.filter((r) => r.won).length, h.length)}(${h.length})` : null;
          }).filter(Boolean);
          if (byTier.length) console.log(`      티어별: ${byTier.join(' · ')}`);
        }
      }
      // ---- 오늘의 도전: 모두 같은 시장 → 수익률 분포 ----
      const daily = rows.filter((r) => r.kind === 'daily');
      if (daily.length) {
        const sorted = daily.map((r) => r.ret).sort((a, b) => a - b);
        const q = (p) => ((sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0) * 100).toFixed(1) + '%';
        console.log(`\n== 오늘의 도전 ${daily.length}판 · 플러스 마감 ${pct(daily.filter((r) => r.ret > 0).length, daily.length)} · 수익률 하위 25% ${q(0.25)} · 가운데 ${q(0.5)} · 상위 25% ${q(0.75)}`);
        const byTier = TIERS.map((t) => {
          const h = daily.filter((r) => r.tier === t);
          return h.length ? `${TIER_KO[t]} ${avg(h.map((r) => r.ret))}(${h.length})` : null;
        }).filter(Boolean);
        if (byTier.length) console.log(`  티어별 평균 수익률: ${byTier.join(' · ')}`);
      }
      if (bots.length) console.log(`== 봇전 사람 1위 비율 ${pct(bots.filter((r) => r.won).length, bots.length)} (${bots.length}판)`);
    }
    await c.end();
  } else if (cmd === 'admins') {
    // 운영자 계정 목록 (읽기만). 이메일은 앞 2글자만
    const c = await connect();
    const r = await c.query("select u.id, u.email, u.created_at, p.username, p.nickname from auth.users u left join public.profiles p on p.user_id = u.id where u.raw_app_meta_data->>'role' = 'admin' order by u.created_at");
    for (const a of r.rows) console.log(`- ${a.username ? '아이디 ' + a.username + ' · 닉네임 ' + a.nickname : '(회원 프로필 없음) ' + String(a.email ?? '').slice(0, 2) + '…'} · 만든 날 ${new Date(a.created_at).toLocaleString('ko-KR')}`);
    if (!r.rows.length) console.log('운영자 계정이 없어요.');
    await c.end();
  } else if (cmd === 'set-admin' || cmd === 'unset-admin') {
    // 운영자 지정/해제 — 이 컴퓨터(DB 비밀 주소)에서만 가능. 화면·API 로는 운영자를 만들 수 없음
    const username = String(file ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{4,16}$/.test(username)) throw new Error('사용법: npm run db -- set-admin <아이디>');
    const c = await connect();
    try {
      await c.query('begin');
      const p = await c.query('select user_id, nickname from public.profiles where username = $1', [username]);
      if (p.rows.length !== 1) throw new Error('그 아이디의 회원이 없어요.');
      const uid = p.rows[0].user_id;
      if (cmd === 'set-admin') await c.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where id = $1`, [uid]);
      else await c.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role' where id = $1`, [uid]);
      await c.query('commit');
      console.log(`✅ ${username} (${p.rows[0].nickname}) ${cmd === 'set-admin' ? '운영자로 지정' : '운영자 해제'}`);
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      await c.end();
    }
  } else {
    console.log('사용법: npm run db -- check | show <파일> | apply <파일> | feedback | admins | set-admin <아이디> | unset-admin <아이디>');
  }
} catch (e) {
  // 연결 주소(비밀번호 포함)가 오류 메시지에 섞이지 않게 메시지만
  console.error('❌ ' + (e instanceof Error ? e.message.replaceAll(url, '[DB_URL]') : String(e)));
  process.exit(1);
}
