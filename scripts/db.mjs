// Supabase DB 도구 — .env.local 의 SUPABASE_DB_URL 로 Postgres 에 직접 연결 (키는 출력하지 않음)
//   npm run db -- check                      연결 확인 + 적용된 마이그레이션 상태 (읽기만)
//   npm run db -- show supabase/005_x.sql    적용할 SQL 내용만 보여 줌 (실행 안 함)
//   npm run db -- apply supabase/005_x.sql   SQL 을 한 트랜잭션으로 적용 (실패하면 전부 되돌림)
//   npm run db -- feedback                   이용자가 보낸 의견 보기 (읽기만)
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
  } else if (cmd === 'feedback') {
    // 이용자가 보낸 의견 최근 30개 (읽기만)
    const c = await connect();
    const r = await c.query('select id, kind, body, page, created_at from public.feedback order by created_at desc limit 30');
    for (const f of r.rows) console.log(`#${f.id} [${f.kind}] ${new Date(f.created_at).toLocaleString('ko-KR')} ${f.page ?? ''}\n  ${f.body.split('\n').join('\n  ')}`);
    if (!r.rows.length) console.log('아직 받은 의견이 없어요.');
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
