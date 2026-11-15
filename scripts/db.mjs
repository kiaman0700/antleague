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
  } else {
    console.log('사용법: npm run db -- check | show <파일> | apply <파일> | feedback');
  }
} catch (e) {
  // 연결 주소(비밀번호 포함)가 오류 메시지에 섞이지 않게 메시지만
  console.error('❌ ' + (e instanceof Error ? e.message.replaceAll(url, '[DB_URL]') : String(e)));
  process.exit(1);
}
