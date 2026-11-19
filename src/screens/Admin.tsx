/**
 * 운영자 화면 (/admin): 현황 · 의견함 · 공지사항. 운영자는 일반 회원 로그인으로 들어온 '운영자로 지정된' 계정만.
 * 운영자 계정을 만들거나 지정하는 방법은 화면·API 에 없음 (운영자 컴퓨터에서 `npm run db -- set-admin <아이디>` 만).
 * 내용은 서버가 운영자 계정인지 확인한 뒤에만 보내 줌 — 화면을 열어도 다른 사람은 아무것도 볼 수 없음
 */
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import { matchKindName, useAccount } from '../net/account';
import { supabase } from '../lib/supabase';
import { api } from '../net/api';
import { Icon } from '../components/Icon';
import { ITEM_MAP, type ItemKind } from '../game/items';
import { STOCK_MAP } from '../game/stocks';
import { AUG_MAP } from '../game/augments';

interface Row {
  id: number;
  kind: 'bug' | 'idea' | 'privacy' | 'etc';
  body: string;
  page: string | null;
  created_at: string;
  read_at: string | null;
}
const KIND: Record<Row['kind'], string> = { bug: '버그·오류', idea: '아이디어', privacy: '개인정보', etc: '무엇이든' };

interface Stats {
  users: { members: number; membersToday: number; members7: number; guests: number; active1: number; active7: number; activeMembers7: number; prevWeek: number; returned: number };
  tiers: Record<'unplaced' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master', number>;
  started: Record<string, number>;
  startedToday: number;
  trades: {
    total: number;
    buyAmount: number;
    topBought: { s: string; n: number; amt: number; people: number }[];
    topAmount: { s: string; amt: number }[];
    topSold: { s: string; n: number }[];
    byDay: { d: string; n: number }[];
  };
  cards: { bought: Record<string, number>; used: Record<string, number>; spent: number };
  daily: { today: number; week: number; avgRetToday: number | null };
  missions: { doneToday: number };
  feedback: Record<string, number>;
}
interface Overview {
  now: { online: number; playing: number; stale: number; waiting: number; queue: number };
  members: { total: number; week: number };
  unread: number;
  errors: { day: number; recent: { action: string; message: string; created_at: string }[] };
  stats: Stats | null;
  games: {
    total: number;
    days: { date: string; games: number }[];
    kinds: { kind: string; games: number; seats: number; avgRet: number; quit: number; idle: number }[];
    cards: { kind: string; seats: number; win: number; winNot: number }[];
    /** 1위 차이는 이 규칙 버전부터의 판만 */
    cardsSince?: number;
    bots: { level: number; games: number; win: number }[];
    augs?: { id: string; tier: string; offered: number; picked: number; auto: number; pickRate: number; score: number; scoreNot: number | null; money: number }[];
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const num = (x: number) => x.toLocaleString('ko-KR');
/** 큰 금액은 억·만 단위로 짧게 */
const money = (x: number) => (x >= 1e8 ? `${(x / 1e8).toFixed(1)}억` : x >= 1e4 ? `${Math.round(x / 1e4).toLocaleString('ko-KR')}만` : `${x}`) + '원';
const BOT_NAME = ['', '쉬움', '보통', '어려움'];
const BOT_GOAL = ['', '초보도 거의 다 이김', '몇 판 해 본 사람이면 이김', '상위권만 이김'];
const kindName = (k: string) => (k === 'ranked' ? '랭킹전' : matchKindName(k, false, 0));
const stockName = (s: string) => STOCK_MAP[s]?.name ?? s;
const cardName = (k: string) => ITEM_MAP[k as ItemKind]?.name ?? k;
const time = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const TIER_ROWS: [keyof Stats['tiers'], string][] = [
  ['master', '마스터'],
  ['diamond', '다이아몬드'],
  ['platinum', '플래티넘'],
  ['gold', '골드'],
  ['silver', '실버'],
  ['bronze', '브론즈'],
  ['unplaced', '언랭크'],
];
const FEEDBACK_NAME: Record<string, string> = { bug: '버그·오류', idea: '아이디어', privacy: '개인정보', etc: '무엇이든' };

function Num({ label, value, sub, tone, onClick }: { label: string; value: string | number; sub?: string; tone?: 'warn' | 'has'; onClick?: () => void }) {
  const body = (
    <>
      <small>{label}</small>
      <b>{typeof value === 'number' ? num(value) : value}</b>
      {sub && <span>{sub}</span>}
    </>
  );
  return onClick ? (
    <button className={'aov-link' + (tone ? ' ' + tone : '')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={tone ?? ''}>{body}</div>
  );
}

/** 가로 막대 목록 (값이 큰 순) */
function BarList({ rows, fmt }: { rows: { label: string; value: number; sub?: string }[]; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted small">아직 기록이 없어요.</p>;
  return (
    <ul className="aov-blist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="aov-bl-name">{r.label}</span>
          <span className="aov-meter">
            <i style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="num">{fmt ? fmt(r.value) : num(r.value)}</span>
          {r.sub && <small className="muted aov-bl-sub">{r.sub}</small>}
        </li>
      ))}
    </ul>
  );
}

function OverviewTab({ onInbox }: { onInbox: () => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(() => {
    setErr(false);
    api<Overview>('adminOverview')
      .then(setO)
      .catch(() => setErr(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (err) return <ErrorState what="운영 현황" onRetry={load} />;
  if (!o) return <Loading label="현황을 모으는 중…" />;
  const s = o.stats;
  const maxDay = Math.max(1, ...o.games.days.map((d) => d.games));
  // 카드: 산·쓴 횟수 + (대결) 쓴 자리 1위 비율 − 안 쓴 자리, 차이가 큰 순
  const winOf = new Map(o.games.cards.map((c) => [c.kind, c]));
  const cardKinds = [...new Set([...Object.keys(s?.cards.bought ?? {}), ...Object.keys(s?.cards.used ?? {}), ...o.games.cards.map((c) => c.kind)])];
  const cardRows = cardKinds
    .map((k) => {
      const w = winOf.get(k);
      return { k, bought: s?.cards.bought[k] ?? 0, used: s?.cards.used[k] ?? 0, w, diff: w && w.seats >= 5 ? w.win - w.winNot : null };
    })
    .sort((a, b) => (b.diff ?? -9) - (a.diff ?? -9) || b.used - a.used);
  const tierTotal = s ? Object.values(s.tiers).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="aov">
      <div className="aov-nums">
        <Num label="지금 접속" value={o.now.online} sub="회원 · 2분 안" />
        <Num label="진행 중 판" value={o.now.playing} sub={`대기실 ${o.now.waiting}${o.now.stale ? ` · 멈춘 판 ${o.now.stale}` : ''}`} />
        <Num label="매칭 대기" value={o.now.queue} sub="명" />
        <Num label="오늘 시작한 판" value={s?.startedToday ?? '-'} sub="한국 시간 0시부터" />
        <Num label="총 회원" value={s?.users.members ?? o.members.total} sub={s ? `오늘 +${s.users.membersToday} · 이번 주 +${s.users.members7}` : `이번 주 +${o.members.week}`} />
        <Num label="손님 계정" value={s?.users.guests ?? '-'} sub="가입 안 한 계정" />
        <Num label="안 읽은 의견" value={o.unread} sub="의견함 열기" tone={o.unread ? 'has' : undefined} onClick={onInbox} />
        <Num label="서버 오류" value={o.errors.day} sub="최근 24시간" tone={o.errors.day ? 'warn' : undefined} />
      </div>

      {s && (
        <section className="aov-card">
          <h3>이용자</h3>
          <p className="muted small">한 판이라도 한 사람 (손님 포함, 시험 계정 제외)</p>
          <div className="aov-mini">
            <div>
              <small>24시간</small>
              <b>{num(s.users.active1)}명</b>
            </div>
            <div>
              <small>7일</small>
              <b>{num(s.users.active7)}명</b>
            </div>
            <div>
              <small>7일 · 회원만</small>
              <b>{num(s.users.activeMembers7)}명</b>
            </div>
            <div>
              <small>재방문</small>
              <b>{s.users.prevWeek ? pct(s.users.returned / s.users.prevWeek) : '-'}</b>
              <span className="muted">지난주 한 사람 중 이번 주에도</span>
            </div>
          </div>
        </section>
      )}

      <section className="aov-card">
        <h3>끝난 판 · 최근 14일 {o.games.total}판</h3>
        <p className="muted small">시험 판은 빼고 실제 유저 판만 세요.</p>
        <div className="aov-bars" role="img" aria-label="날마다 끝난 판 수">
          {o.games.days.map((d) => (
            <div key={d.date} className="aov-bar" title={`${d.date} · ${d.games}판`}>
              <i style={{ height: `${(d.games / maxDay) * 100}%` }} />
              <small>{Number(d.date.slice(8))}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="aov-grid">
        <section className="aov-card">
          <h3>판 종류별 · 14일</h3>
          {o.games.kinds.length === 0 && !s ? (
            <p className="muted small">아직 끝난 판이 없어요.</p>
          ) : (
            <div className="aov-scroll">
              <table className="aov-table">
                <thead>
                  <tr>
                    <th>종류</th>
                    <th>시작</th>
                    <th>끝남</th>
                    <th>평균 수익률</th>
                    <th>기권</th>
                    <th>거래 0회</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set([...Object.keys(s?.started ?? {}), ...o.games.kinds.map((k) => k.kind)])].map((kind) => {
                    const k = o.games.kinds.find((x) => x.kind === kind);
                    return (
                      <tr key={kind}>
                        <td>{kindName(kind)}</td>
                        <td>{num(s?.started[kind] ?? 0)}</td>
                        <td>{k ? num(k.games) : 0}</td>
                        <td className={k && k.avgRet > 0.0005 ? 'up' : k && k.avgRet < -0.0005 ? 'down' : ''}>{k ? `${(k.avgRet * 100).toFixed(1)}%` : '-'}</td>
                        <td>{k ? pct(k.quit) : '-'}</td>
                        <td>{k ? pct(k.idle) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="aov-card">
          <h3>티어 분포</h3>
          <p className="muted small">회원 {s ? num(tierTotal) : '-'}명 · 랭킹전 2판 전은 언랭크</p>
          {s ? <BarList rows={TIER_ROWS.map(([k, label]) => ({ label, value: s.tiers[k] }))} /> : <p className="muted small">-</p>}
        </section>
      </div>

      <section className="aov-card">
        <h3>증강 · 14일</h3>
        <p className="muted small">사람 자리에서 직접 고른 것만. 순위 점수 = (인원−순위)/(인원−1), 1이 1위. '안 고른 자리'는 보기에 떴는데 다른 걸 고른 자리라 실력 차이가 덜 섞여요. 판이 적은 증강은 등급 평균 쪽으로 당겨 보여요.</p>
        {!(o.games.augs ?? []).length ? (
          <p className="muted small">아직 증강 기록이 없어요.</p>
        ) : (
          <div className="aov-scroll">
            <table className="aov-table">
              <thead>
                <tr>
                  <th>증강</th>
                  <th>뜬 횟수</th>
                  <th>고른 비율</th>
                  <th>점수 (고름)</th>
                  <th>점수 (안 고름)</th>
                  <th>평균 받은 돈</th>
                  <th>자동</th>
                </tr>
              </thead>
              <tbody>
                {[...(o.games.augs ?? [])]
                  .sort((a, b) => b.score - a.score)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>
                        {AUG_MAP[a.id]?.name ?? a.id} <span className="muted small">{a.tier}</span>
                      </td>
                      <td>{num(a.offered)}</td>
                      <td>{pct(a.pickRate)}</td>
                      <td>{a.score.toFixed(2)}</td>
                      <td>{a.scoreNot == null ? '-' : a.scoreNot.toFixed(2)}</td>
                      <td>{a.money ? money(Math.round(a.money)) : '-'}</td>
                      <td>{num(a.auto)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="aov-card">
        <h3>찬스 카드 · 14일</h3>
        <p className="muted small">
          1위 차이 = 카드를 쓴 자리의 1위 비율 − 안 쓴 자리 (대결, 쓴 자리 5개 이상{o.games.cardsSince ? `, 지금 카드 값이 된 규칙 v${o.games.cardsSince}부터` : ''}). 크게 +면 너무 센 카드, −면 값만큼 이득이 없는 카드.
          {s ? ` 카드에 쓴 돈 ${money(s.cards.spent)}` : ''}
        </p>
        {cardRows.length === 0 ? (
          <p className="muted small">아직 카드 기록이 없어요.</p>
        ) : (
          <div className="aov-scroll">
            <table className="aov-table">
              <thead>
                <tr>
                  <th>카드</th>
                  <th>산 횟수</th>
                  <th>쓴 횟수</th>
                  <th>1위 (쓴 자리)</th>
                  <th>1위 (안 쓴 자리)</th>
                  <th>1위 차이</th>
                </tr>
              </thead>
              <tbody>
                {cardRows.map((c) => (
                  <tr key={c.k}>
                    <td>{cardName(c.k)}</td>
                    <td>{num(c.bought)}</td>
                    <td>{num(c.used)}</td>
                    <td>{c.w ? `${pct(c.w.win)} (${c.w.seats})` : '-'}</td>
                    <td>{c.w ? pct(c.w.winNot) : '-'}</td>
                    <td className={c.diff == null ? '' : c.diff > 0.1 ? 'up' : c.diff < -0.1 ? 'down' : ''}>{c.diff == null ? '표본 적음' : `${c.diff >= 0 ? '+' : ''}${Math.round(c.diff * 100)}%p`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {s && (
        <div className="aov-grid even">
          <section className="aov-card">
            <h3>가장 많이 산 종목 · 14일</h3>
            <p className="muted small">
              거래 {num(s.trades.total)}번 · 산 금액 {money(s.trades.buyAmount)}
            </p>
            <BarList rows={s.trades.topBought.map((t) => ({ label: stockName(t.s), value: t.n, sub: `${num(t.people)}명 · ${money(t.amt)}` }))} fmt={(v) => `${num(v)}번`} />
          </section>
          <section className="aov-card">
            <h3>산 금액이 큰 종목</h3>
            <BarList rows={s.trades.topAmount.map((t) => ({ label: stockName(t.s), value: t.amt }))} fmt={money} />
            <h3 className="aov-h3-gap">가장 많이 판 종목</h3>
            <BarList rows={s.trades.topSold.map((t) => ({ label: stockName(t.s), value: t.n }))} fmt={(v) => `${num(v)}번`} />
          </section>
        </div>
      )}

      <div className="aov-grid even">
        <section className="aov-card">
          <h3>봇 밸런스</h3>
          <p className="muted small">그 판에서 가장 센 봇 기준, 사람이 1위 한 비율</p>
          <ul className="aov-bots">
            {o.games.bots.map((b) => (
              <li key={b.level}>
                <b>{BOT_NAME[b.level]}</b>
                <span className="aov-meter">
                  <i style={{ width: b.games ? pct(b.win) : '0%' }} />
                </span>
                <span className="num">{b.games ? pct(b.win) : '-'}</span>
                <small className="muted">
                  {b.games}판 · 목표: {BOT_GOAL[b.level]}
                </small>
              </li>
            ))}
          </ul>
        </section>
        {s && (
          <section className="aov-card">
            <h3>오늘의 도전 · 미션 · 의견</h3>
            <div className="aov-mini">
              <div>
                <small>오늘의 도전 오늘</small>
                <b>{num(s.daily.today)}명</b>
                <span className="muted">7일 {num(s.daily.week)}명</span>
              </div>
              <div>
                <small>오늘 평균 수익률</small>
                <b>{s.daily.avgRetToday == null ? '-' : `${(s.daily.avgRetToday * 100).toFixed(1)}%`}</b>
              </div>
              <div>
                <small>오늘 끝낸 미션</small>
                <b>{num(s.missions.doneToday)}개</b>
              </div>
            </div>
            <p className="muted small aov-fb">
              14일 의견:{' '}
              {Object.keys(s.feedback).length
                ? Object.entries(s.feedback)
                    .map(([k, n]) => `${FEEDBACK_NAME[k] ?? k} ${n}`)
                    .join(' · ')
                : '없음'}
            </p>
          </section>
        )}
      </div>

      <section className="aov-card">
        <h3>최근 서버 오류</h3>
        {o.errors.recent.length === 0 ? (
          <p className="muted small">최근 7일 동안 예상 못 한 오류가 없어요.</p>
        ) : (
          <ul className="aov-errs">
            {o.errors.recent.map((e, i) => (
              <li key={i}>
                <small className="muted">{time(e.created_at)}</small>
                <b>{e.action}</b>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <button className="btn sm ghost aov-refresh" onClick={load}>
        <Icon name="refresh" size={14} /> 새로 고침
      </button>
    </div>
  );
}

export function Admin({ onBack, onLogin, onNotices }: { onBack: () => void; onLogin: () => void; onNotices: () => void }) {
  const member = useAccount().status === 'member';
  const [state, setState] = useState<'checking' | 'login' | 'inbox'>('checking');
  const [tab, setTab] = useState<'overview' | 'inbox'>('overview');
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | Row['kind']>('unread');

  const check = useCallback(async () => {
    try {
      const me = await api<{ isAdmin: boolean }>('me');
      setState(me.isAdmin ? 'inbox' : 'login');
    } catch {
      setState('login');
    }
  }, []);
  useEffect(() => {
    check();
  }, [check]);

  const load = useCallback(async () => {
    const r = await api<{ rows: Row[]; unread: number }>('adminInbox', filter === 'unread' ? { unread: true } : filter === 'all' ? {} : { kind: filter });
    setRows(r.rows);
    setUnread(r.unread);
  }, [filter]);
  useEffect(() => {
    if (state === 'inbox' && tab === 'inbox') load().catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, [state, tab, load]);

  const logout = async () => {
    await supabase?.auth.signOut();
    location.assign('/');
  };
  const mark = async (ids: number[], read: boolean) => {
    await api('adminMarkRead', { ids, read });
    await load();
  };

  return (
    <div className="lobby page admin">
      <header className="page-head top">
        <button className="icon-btn" aria-label="홈으로" onClick={onBack}>
          <Icon name="back" size={18} />
        </button>
        <h2>운영자</h2>
        <p className="ph-desc muted small">현황·의견함·공지사항</p>
        <div className="ph-right">
          {state === 'inbox' && (
            <button className="btn sm ghost" onClick={logout}>
              로그아웃
            </button>
          )}
        </div>
      </header>

      {state === 'checking' && <Loading label="확인하는 중…" />}

      {state === 'login' && (
        <section className="panel pad admin-login">
          <h3>운영자만 볼 수 있어요</h3>
          <p className="muted small">{member ? '지금 로그인한 계정은 운영자가 아니에요.' : '운영자로 지정된 회원 계정으로 로그인하면 이 화면을 볼 수 있어요.'}</p>
          <div className="modal-actions">
            <button className={'btn ' + (member ? 'primary' : 'ghost')} onClick={onBack}>
              홈으로
            </button>
            {!member && (
              <button className="btn primary" onClick={onLogin}>
                로그인하러 가기
              </button>
            )}
          </div>
        </section>
      )}

      {state === 'inbox' && (
        <>
          <div className="admin-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
              <Icon name="activity" size={16} /> 현황
            </button>
            <button role="tab" aria-selected={tab === 'inbox'} className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>
              <Icon name="bell" size={16} /> 의견함
            </button>
            <button className="admin-tab-link" onClick={onNotices}>
              <Icon name="megaphone" size={16} /> 공지사항
            </button>
          </div>

          {tab === 'overview' && <OverviewTab onInbox={() => setTab('inbox')} />}

          {tab === 'inbox' && (
            <>
              <div className="seg admin-filter" role="tablist">
                {(
                  [
                    ['unread', `안 읽음 ${unread}`],
                    ['all', '전체'],
                    ['bug', KIND.bug],
                    ['idea', KIND.idea],
                    ['privacy', KIND.privacy],
                    ['etc', KIND.etc],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {msg && <p className="error">{msg}</p>}
              {rows.length === 0 ? (
                <EmptyState icon="check" title={filter === 'unread' ? '새 의견이 없어요' : '아직 받은 의견이 없어요'} />
              ) : (
                <>
                  {filter === 'unread' && (
                    <button className="btn sm ghost" onClick={() => mark(rows.map((r) => r.id), true)}>
                      <Icon name="check" size={14} /> 모두 읽음으로
                    </button>
                  )}
                  <ul className="inbox">
                    {rows.map((r) => (
                      <li key={r.id} className={'inbox-item k-' + r.kind + (r.read_at ? '' : ' unread')}>
                        <div className="ib-head">
                          <span className={'ib-kind k-' + r.kind}>{KIND[r.kind]}</span>
                          <small className="muted">{new Date(r.created_at).toLocaleString('ko-KR')}</small>
                          <button className="btn sm ghost" onClick={() => mark([r.id], !r.read_at)}>
                            {r.read_at ? '안 읽음으로' : '읽음'}
                          </button>
                        </div>
                        <p className="ib-body">{r.body}</p>
                        {r.page && <small className="muted ib-page">{r.page}</small>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
