/**
 * 운영자 현황 (adminOverview) — 운영자만 (부르는 곳에서 확인). 숫자 모음만 보냄: 계정 id·닉네임·방 코드는 없음.
 * 판 기록(game_stats)은 시험 판을 뺀 실제 유저 판만. 테이블이 아직 없으면 0·빈 목록
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

async function count(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const r = await q;
  return r.error ? 0 : (r.count ?? 0);
}

/** 카드 표는 이 규칙 버전부터 (카드 값이 마지막으로 바뀐 버전) */
export const CARDS_SINCE = 16;

interface StatRow {
  room_id: string;
  kind: string | null;
  ranked: boolean;
  players: number;
  won: boolean;
  left_game: boolean;
  idle: boolean;
  bot_level: number | null;
  ret: number;
  trades: number;
  cards: Record<string, number> | null;
  rank?: number;
  aug_log?: { n: number; tier: string; offer: string[]; pick: string | null; auto: boolean; income: number }[] | null;
  created_at: string;
  version: number | null;
}

export async function adminOverview(sb: SupabaseClient) {
  const head = { count: 'exact' as const, head: true };
  // 진행 중 = 마감이 10분 안에 지났거나 아직 안 온 판 (오래 멈춘 판은 따로 — 정리 대상)
  const live = 'turn_deadline.is.null,turn_deadline.gt.' + ago(10 * 60_000);
  const [members, members7, online, playing, playingAll, waiting, queue, unread, errors24] = await Promise.all([
    count(sb.from('profiles').select('user_id', head).eq('is_test', false)),
    count(sb.from('profiles').select('user_id', head).eq('is_test', false).gt('created_at', ago(7 * DAY))),
    count(sb.from('profiles').select('user_id', head).gt('last_seen', ago(2 * 60_000))),
    count(sb.from('rooms').select('id', head).eq('status', 'playing').or(live)),
    count(sb.from('rooms').select('id', head).eq('status', 'playing')),
    count(sb.from('rooms').select('id', head).eq('status', 'waiting')),
    count(sb.from('match_tickets').select('user_id', head)),
    count(sb.from('feedback').select('id', head).is('read_at', null)),
    count(sb.from('server_errors').select('id', head).gt('created_at', ago(DAY))),
  ]);
  // 회원·종목·카드·오늘의 도전 등 큰 집계는 DB 함수 하나로 (049, 시험 계정·봇 제외). 없으면 빈 값
  const agg = await sb.rpc('admin_stats', { days: 14 });
  const errs = await sb.from('server_errors').select('action, message, created_at').order('created_at', { ascending: false }).limit(15);

  // 최근 14일 실제 유저 판 (시험 판 제외). 많아도 5000줄까지만
  const st = await sb
    .from('game_stats')
    .select('room_id, kind, ranked, players, rank, won, left_game, idle, bot_level, ret, trades, cards, aug_log, created_at, version')
    .eq('is_test', false)
    .gt('created_at', ago(14 * DAY))
    .order('created_at', { ascending: false })
    .limit(5000);
  const rows = (st.error ? [] : st.data) as StatRow[];
  const people = rows.filter((r) => r.bot_level == null);
  const kindOf = (r: StatRow) => (r.ranked ? 'ranked' : (r.kind ?? 'custom'));

  // 날마다 끝난 판 수 (한국 날짜, 최근 14일)
  const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const daily: Record<string, Set<string>> = {};
  for (const r of rows) (daily[kst(r.created_at)] ??= new Set()).add(r.room_id);
  const days: { date: string; games: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = kst(new Date(Date.now() - i * DAY).toISOString());
    days.push({ date, games: daily[date]?.size ?? 0 });
  }

  // 판 종류별
  const kinds = [...new Set(people.map(kindOf))].map((k) => {
    const g = people.filter((r) => kindOf(r) === k);
    return {
      kind: k,
      games: new Set(g.map((r) => r.room_id)).size,
      seats: g.length,
      avgRet: g.reduce((s, r) => s + r.ret, 0) / g.length,
      quit: g.filter((r) => r.left_game).length / g.length,
      idle: g.filter((r) => r.trades === 0).length / g.length,
    };
  });

  // 카드별 (대결: match·custom·friend) — 쓴 자리 1위 비율 vs 안 쓴 자리
  // 카드 값이 바뀐 규칙(v16 루머 감별기 10만 → 5만)부터만 — 예전 값으로 한 판이 섞이면 지금 값의 효과를 잘못 읽음
  const vs = people.filter((r) => ['match', 'custom', 'friend'].includes(r.kind ?? '') && (r.version ?? 0) >= CARDS_SINCE);
  const cardKinds = [...new Set(vs.flatMap((r) => Object.keys(r.cards ?? {})))].sort();
  const cards = cardKinds.map((k) => {
    const used = vs.filter((r) => (r.cards?.[k] ?? 0) > 0);
    const not = vs.filter((r) => !((r.cards?.[k] ?? 0) > 0));
    return { kind: k, seats: used.length, win: used.filter((r) => r.won).length / Math.max(1, used.length), winNot: not.filter((r) => r.won).length / Math.max(1, not.length) };
  });

  // 증강별 (사람 자리, 직접 고른 것만): 순위 점수 = (인원−순위)/(인원−1).
  // 고른 자리 vs '보기에 떴는데 다른 걸 고른' 자리를 비교 — 잘하는 사람이 많이 고르는 착시를 줄임. 판이 적으면 등급 평균 쪽으로 당겨 봄(k=20)
  const score = (r: StatRow) => (r.players > 1 && r.rank ? (r.players - r.rank) / (r.players - 1) : 0.5);
  const augAgg: Record<string, { tier: string; offered: number; picked: number; auto: number; sp: number; sn: number; nn: number; money: number }> = {};
  for (const r of people) {
    for (const x of r.aug_log ?? []) {
      for (const id of x.offer ?? []) {
        const a = (augAgg[id] ??= { tier: x.tier, offered: 0, picked: 0, auto: 0, sp: 0, sn: 0, nn: 0, money: 0 });
        if (x.auto) continue;
        a.offered++;
        if (x.pick === id) {
          a.picked++;
          a.sp += score(r);
          a.money += x.income ?? 0;
        } else {
          a.sn += score(r);
          a.nn++;
        }
      }
      if (x.auto && x.pick && augAgg[x.pick]) augAgg[x.pick].auto++;
    }
  }
  const tierMean: Record<string, number> = {};
  for (const t of ['silver', 'gold', 'prism']) {
    const xs = Object.values(augAgg).filter((a) => a.tier === t);
    const n = xs.reduce((s, a) => s + a.picked, 0);
    tierMean[t] = n ? xs.reduce((s, a) => s + a.sp, 0) / n : 0.5;
  }
  const K = 20;
  const augs = Object.entries(augAgg).map(([id, a]) => ({
    id,
    tier: a.tier,
    offered: a.offered,
    picked: a.picked,
    auto: a.auto,
    pickRate: a.offered ? a.picked / a.offered : 0,
    score: (a.sp + K * tierMean[a.tier]) / (a.picked + K),
    scoreNot: a.nn ? a.sn / a.nn : null,
    money: a.picked ? a.money / a.picked : 0,
  }));

  // 봇 난이도별 사람 1위 비율 (그 판 가장 센 봇 기준)
  const lv = new Map<string, number>();
  for (const r of rows) if (r.bot_level != null) lv.set(r.room_id, Math.max(lv.get(r.room_id) ?? 0, r.bot_level));
  const bots = [1, 2, 3].map((level) => {
    const g = people.filter((r) => r.kind === 'bot' && lv.get(r.room_id) === level);
    return { level, games: g.length, win: g.length ? g.filter((r) => r.won).length / g.length : 0 };
  });

  return {
    now: { online, playing, stale: Math.max(0, playingAll - playing), waiting, queue },
    members: { total: members, week: members7 },
    unread,
    errors: { day: errors24, recent: errs.error ? [] : errs.data },
    stats: agg.error ? null : agg.data,
    games: { total: new Set(people.map((r) => r.room_id)).size, days, kinds, cards, cardsSince: CARDS_SINCE, bots, augs },
  };
}
