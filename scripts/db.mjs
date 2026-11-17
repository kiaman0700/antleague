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
  } else if (cmd === 'feedback') {
    // 이용자가 보낸 의견 최근 30개 (읽기만)
    const c = await connect();
    const r = await c.query('select id, kind, body, page, created_at from public.feedback order by created_at desc limit 30');
    for (const f of r.rows) console.log(`#${f.id} [${f.kind}] ${new Date(f.created_at).toLocaleString('ko-KR')} ${f.page ?? ''}\n  ${f.body.split('\n').join('\n  ')}`);
    if (!r.rows.length) console.log('아직 받은 의견이 없어요.');
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
