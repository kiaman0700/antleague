// Vercel 도구 — .env.local 의 VERCEL_TOKEN(팀 토큰)으로 Vercel API 를 직접 호출 (토큰은 출력하지 않음)
// Vercel CLI 는 이 컴퓨터(한글 컴퓨터 이름)·팀 토큰에서 동작하지 않아서 API 를 씀
//   npm run vercel -- status          최근 배포 10개 (상태·브랜치·커밋)
//   npm run vercel -- logs [배포ID]    빌드 로그 (없으면 가장 최근 배포)
//   npm run vercel -- env             환경변수 이름·대상만 (값은 안 보여 줌)
//   npm run vercel -- runtime [배포ID] 서버 함수(api/game) 실행 오류 로그 최근 것
// 배포 자체는 GitHub main 에 푸시하면 Vercel 이 자동으로 함
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const token = env.VERCEL_TOKEN;
if (!token) {
  console.error('.env.local 에 VERCEL_TOKEN 이 없어요. (vercel.com → Account Settings → Tokens)');
  process.exit(1);
}
let project;
try {
  project = JSON.parse(fs.readFileSync(path.join(ROOT, '.vercel/project.json'), 'utf8'));
} catch {
  console.error('.vercel/project.json 이 없어요. (Claude 에게 "Vercel 연결"을 부탁하세요)');
  process.exit(1);
}

async function api(p) {
  const sep = p.includes('?') ? '&' : '?';
  const r = await fetch(`https://api.vercel.com${p}${sep}teamId=${project.orgId}`, { headers: { authorization: 'Bearer ' + token } });
  const text = await r.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    // 로그 API 는 줄마다 JSON
    j = text
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  if (!r.ok) throw new Error(`${r.status} ${j?.error?.message ?? ''}`);
  return j;
}
const when = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATE = { READY: '✅ 성공', ERROR: '❌ 실패', BUILDING: '🔨 빌드 중', QUEUED: '⏳ 대기', CANCELED: '⛔ 취소', INITIALIZING: '⏳ 준비' };

async function latestId() {
  const j = await api(`/v6/deployments?projectId=${project.projectId}&limit=1`);
  if (!j.deployments?.length) throw new Error('배포가 없어요.');
  return j.deployments[0].uid;
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'status' || !cmd) {
    const j = await api(`/v6/deployments?projectId=${project.projectId}&limit=10`);
    for (const d of j.deployments) {
      const m = d.meta ?? {};
      console.log(`${when(d.created)}  ${STATE[d.state ?? d.readyState] ?? d.state}  ${d.target === 'production' ? '[운영]' : '[미리보기]'}  ${m.githubCommitRef ?? '-'}  ${(m.githubCommitMessage ?? '').split('\n')[0].slice(0, 50)}  (${d.uid})`);
    }
  } else if (cmd === 'logs') {
    const id = arg ?? (await latestId());
    const ev = await api(`/v3/deployments/${id}/events?limit=-1`);
    for (const e of ev) {
      const t = e.payload?.text ?? e.text;
      if (t) console.log(t);
    }
  } else if (cmd === 'env') {
    const j = await api(`/v9/projects/${project.projectId}/env`);
    for (const e of j.envs) console.log(`${e.key}  → ${e.target.join(', ')}  (${e.type})`);
  } else if (cmd === 'setpublic') {
    // 공개돼도 되는 화면용 값(VITE_ 로 시작)만 설정 — 비밀 키는 이 명령으로 넣지 않음
    const [key, ...rest] = process.argv.slice(3);
    const value = rest.join(' ');
    if (!/^VITE_[A-Z0-9_]+$/.test(key ?? '') || /KEY|SECRET|TOKEN|PASSWORD/.test(key) || !value) throw new Error('사용법: npm run vercel -- setpublic VITE_이름 값  (공개 값만)');
    const r = await fetch(`https://api.vercel.com/v10/projects/${project.projectId}/env?upsert=true&teamId=${project.orgId}`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ key, value, type: 'plain', target: ['production', 'preview', 'development'] }),
    });
    if (!r.ok) throw new Error(`설정 실패 (${r.status}) ${(await r.text()).slice(0, 200)}`);
    console.log(`✅ ${key} 설정 완료 — 다음 배포부터 적용돼요`);
  } else if (cmd === 'runtime') {
    const id = arg ?? (await latestId());
    const since = Date.now() - 24 * 3600_000;
    const ev = await api(`/v2/deployments/${id}/events?direction=backward&limit=200&since=${since}&builds=0`);
    const lines = ev.filter((e) => e.type === 'stderr' || /error/i.test(e.payload?.text ?? '')).slice(0, 40);
    if (!lines.length) console.log('최근 24시간 오류 로그 없음');
    for (const e of lines) console.log(`${when(e.created ?? e.payload?.date)}  ${(e.payload?.text ?? '').slice(0, 300)}`);
  } else {
    console.log('사용법: npm run vercel -- status | logs [배포ID] | env | runtime [배포ID]');
  }
} catch (e) {
  console.error('❌ ' + (e instanceof Error ? e.message.replaceAll(token, '[TOKEN]') : String(e)));
  process.exit(1);
}
