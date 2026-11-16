// Supabase 서버를 다른 지역(서울)으로 옮기기 — 이 컴퓨터에서만 씀. 비밀번호·키는 절대 출력하지 않음
//   .env.local 에 새 프로젝트 값을 NEW_ 를 붙여 넣어 둠:
//     NEW_SUPABASE_DB_URL (새 프로젝트 Session pooler 주소)
//   node scripts/move-region.mjs schema   → 새 DB에 표·규칙·함수 만들기 (schema.sql + 002~ 순서대로)
//   node scripts/move-region.mjs compare  → 예전/새 DB 의 표·칸·보안 규칙·함수가 같은지 비교 (읽기만)
//   node scripts/move-region.mjs copy     → 예전 DB 의 계정·데이터를 새 DB 로 복사 (새 DB 의 같은 데이터는 지우고 다시)
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
const OLD = env.SUPABASE_DB_URL;
const NEW = env.NEW_SUPABASE_DB_URL;
if (!OLD || !NEW) {
  console.error('.env.local 에 SUPABASE_DB_URL(예전)과 NEW_SUPABASE_DB_URL(새 서울 프로젝트)이 모두 있어야 해요.');
  process.exit(1);
}
if (OLD === NEW) {
  console.error('예전 주소와 새 주소가 같아요. 새 프로젝트 주소를 넣어 주세요.');
  process.exit(1);
}
const connect = async (url) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  return c;
};

// 복사 순서 (참조하는 표가 먼저)
const AUTH_TABLES = ['auth.users', 'auth.identities'];
const PUBLIC_TABLES = ['profiles', 'friendships', 'blocks', 'rooms', 'room_secrets', 'players', 'trades', 'items', 'orders', 'parties', 'party_members', 'invites', 'match_history', 'match_players', 'match_tickets', 'feedback', 'guest_log'];

async function cols(c, full) {
  const [schema, table] = full.split('.');
  const r = await c.query(
    `select column_name from information_schema.columns where table_schema=$1 and table_name=$2 and is_generated='NEVER' and coalesce(identity_generation,'') <> 'ALWAYS' order by ordinal_position`,
    [schema, table],
  );
  return r.rows.map((x) => x.column_name);
}

const [cmd] = process.argv.slice(2);
try {
  if (cmd === 'schema') {
    const c = await connect(NEW);
    const files = ['supabase/schema.sql', ...fs.readdirSync(path.join(ROOT, 'supabase')).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort().map((f) => 'supabase/' + f)];
    for (const f of files) {
      try {
        await c.query('begin');
        await c.query(fs.readFileSync(path.join(ROOT, f), 'utf8'));
        await c.query('commit');
        console.log('✅', f);
      } catch (e) {
        await c.query('rollback').catch(() => {});
        console.log('❌', f, '—', e.message.split('\n')[0]);
        throw new Error('중단: ' + f);
      }
    }
    await c.end();
  } else if (cmd === 'compare') {
    const a = await connect(OLD);
    const b = await connect(NEW);
    const qs = {
      '표·칸': `select table_name||'.'||column_name||':'||data_type v from information_schema.columns where table_schema='public' order by 1`,
      '보안 규칙(RLS 켜짐)': `select relname||':'||relrowsecurity v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' order by 1`,
      '보안 정책': `select tablename||':'||policyname v from pg_policies where schemaname in ('public','realtime') order by 1`,
      '함수': `select p.proname v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`,
      '함수 실행 권한': `select routine_name||':'||grantee v from information_schema.routine_privileges where routine_schema='public' and grantee in ('anon','authenticated','PUBLIC','service_role') order by 1`,
      '표 권한': `select table_name||':'||grantee||':'||privilege_type v from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 1`,
      '칸 권한': `select table_name||'.'||column_name||':'||grantee||':'||privilege_type v from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') order by 1`,
      '실시간 알림 표': `select tablename v from pg_publication_tables where pubname='supabase_realtime' order by 1`,
    };
    let diff = 0;
    for (const [name, q] of Object.entries(qs)) {
      const x = new Set((await a.query(q)).rows.map((r) => r.v));
      const y = new Set((await b.query(q).catch(() => ({ rows: [] }))).rows.map((r) => r.v));
      const onlyOld = [...x].filter((v) => !y.has(v));
      const onlyNew = [...y].filter((v) => !x.has(v));
      if (onlyOld.length || onlyNew.length) {
        diff++;
        console.log(`❌ ${name}: 예전에만 ${onlyOld.length}개, 새 곳에만 ${onlyNew.length}개`);
        for (const v of onlyOld.slice(0, 15)) console.log('   예전에만:', v);
        for (const v of onlyNew.slice(0, 15)) console.log('   새 곳에만:', v);
      } else console.log(`✅ ${name}: 같음 (${x.size}개)`);
    }
    const cron = await b.query(`select jobname from cron.job`).catch(() => ({ rows: [] }));
    console.log(cron.rows.length ? `✅ 자동 정리 예약: ${cron.rows.map((r) => r.jobname).join(', ')}` : '❌ 자동 정리 예약 없음');
    console.log(diff ? `❌ 다른 곳 ${diff}군데` : '✅ 모두 같음');
    await a.end();
    await b.end();
  } else if (cmd === 'copy') {
    const a = await connect(OLD);
    const b = await connect(NEW);
    await a.query('begin isolation level repeatable read read only'); // 복사하는 동안 예전 DB 는 한 시점 그대로
    await b.query('begin');
    await b.query(`set local session_replication_role = replica`); // 복사 중엔 참조 확인·트리거 끔
    // 새 DB 의 데이터는 지우고 다시 (뒤에서부터)
    for (const t of [...PUBLIC_TABLES].reverse()) await b.query(`delete from public.${t}`);
    await b.query(`delete from auth.identities`);
    await b.query(`delete from auth.sessions`);
    await b.query(`delete from auth.refresh_tokens`);
    await b.query(`delete from auth.users`);
    for (const full of [...AUTH_TABLES, ...PUBLIC_TABLES.map((t) => 'public.' + t)]) {
      const ca = await cols(a, full);
      const cb = new Set(await cols(b, full));
      const use = ca.filter((x) => cb.has(x));
      const rows = (await a.query(`select ${use.map((x) => `"${x}"`).join(',')} from ${full}`)).rows;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const vals = [];
        const ph = chunk.map((r, ri) => '(' + use.map((x, ci) => (vals.push(r[x]), `$${ri * use.length + ci + 1}`)).join(',') + ')');
        await b.query(`insert into ${full} (${use.map((x) => `"${x}"`).join(',')}) values ${ph.join(',')}`, vals);
      }
      console.log(`✅ ${full}: ${rows.length}줄`);
    }
    // 번호 자동 증가 칸 맞추기
    const seqs = await b.query(`select pg_get_serial_sequence(table_schema||'.'||table_name, column_name) s, table_schema||'.'||table_name t, column_name c from information_schema.columns where table_schema='public' and column_default like 'nextval%'`);
    for (const s of seqs.rows) if (s.s) await b.query(`select setval($1, coalesce((select max("${s.c}") from ${s.t}), 0) + 1, false)`, [s.s]);
    await b.query('commit');
    await a.query('commit');
    // 줄 수 확인
    let bad = 0;
    for (const full of [...AUTH_TABLES, ...PUBLIC_TABLES.map((t) => 'public.' + t)]) {
      const x = (await a.query(`select count(*)::int n from ${full}`)).rows[0].n;
      const y = (await b.query(`select count(*)::int n from ${full}`)).rows[0].n;
      if (x !== y) {
        bad++;
        console.log(`❌ ${full}: 예전 ${x} / 새 ${y}`);
      }
    }
    console.log(bad ? '❌ 줄 수가 다른 표가 있어요' : '✅ 모든 표 줄 수 같음');
    await a.end();
    await b.end();
  } else {
    console.log('사용법: node scripts/move-region.mjs schema | compare | copy');
  }
} catch (e) {
  console.error('❌ 실패:', e.message.split('\n')[0]);
  process.exit(1);
}
