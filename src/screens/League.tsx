/**
 * 주간 개미리그 화면 (설계서 design/weekly-league.md): 내 단계 · 내 조 순위표(승급·강등 줄) · 남은 시간 · 지난주 결과.
 * 계산은 모두 서버 — 화면은 받은 것만 그림 (계정 id 없음)
 */
import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { useAccount } from '../net/account';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, Loading } from '../components/ui';
import type { LobbyPage } from './Lobby';

export interface LeagueInfo {
  ready: boolean;
  member?: boolean;
  names?: string[];
  tier?: number;
  endsAt?: number;
  group?: { nickname: string; avatar: string; score: number; me: boolean }[];
  promote?: number;
  demote?: number;
  last?: { rank: number | null; size: number | null; change: number | null; reward?: number } | null;
}

export const LEAGUE_COLORS = ['#a8805e', '#c9a26b', '#e0566b', '#3fb8a8', '#8b6bff', '#f5b83d'];
export const DEFAULT_NAMES = ['알개미', '일개미', '병정개미', '정찰개미', '여왕개미', '황금개미'];

function left(ms: number) {
  if (ms <= 0) return '곧 끝나요';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}일 ${h}시간 남음` : `${h}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분 남음`;
}

/** 단계 표시: 개미 단계 색 고리 + 이름 */
export function LeagueBadge({ tier, names = DEFAULT_NAMES, size = 44 }: { tier: number; names?: string[]; size?: number }) {
  const c = LEAGUE_COLORS[tier] ?? LEAGUE_COLORS[0];
  return (
    <span className="lg-badge" style={{ ['--lc' as string]: c }}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r="17" fill="none" stroke={c} strokeWidth="3" />
        <circle cx="20" cy="20" r="13" fill={c} fillOpacity="0.18" />
        {/* 단계만큼 점 (0~5) */}
        {Array.from({ length: tier + 1 }, (_, i) => {
          const a = -Math.PI / 2 + ((i - tier / 2) * Math.PI) / 7;
          return <circle key={i} cx={20 + 17 * Math.cos(a)} cy={20 + 17 * Math.sin(a)} r="2.6" fill="#fff" stroke={c} strokeWidth="1.2" />;
        })}
        <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="900" fill={c}>
          {tier + 1}
        </text>
      </svg>
      <b>{names[tier] ?? names[0]}</b>
    </span>
  );
}

export function League({ go }: { go: (p: LobbyPage) => void }) {
  const acc = useAccount();
  const [info, setInfo] = useState<LeagueInfo | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showLast, setShowLast] = useState(true);
  const load = () => {
    setErr(false);
    api<LeagueInfo>('league')
      .then(setInfo)
      .catch(() => setErr(true));
  };
  useEffect(load, [acc.status]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const names = info?.names ?? DEFAULT_NAMES;
  return (
    <>
      {err ? (
        <ErrorState what="리그" onRetry={load} />
      ) : !info ? (
        <Loading />
      ) : !info.ready ? (
        <EmptyState icon="trophy" title="리그를 준비하고 있어요" desc="조금 뒤에 다시 와 주세요." />
      ) : !info.member ? (
        <section className="lg-guest">
          <EmptyState icon="trophy" title="주간 리그는 회원만 들어가요" desc="회원가입하면 매주 30명과 경험치로 겨뤄요. 순위에 따라 경험치·칭호·프로필 사진을 받고, 위로 올라갈수록 여왕개미·황금개미가 돼요." />
          <div className="row center">
            <button className="btn primary" onClick={() => go('signup')}>
              회원가입
            </button>
            <button className="btn" onClick={() => go('login')}>
              로그인
            </button>
          </div>
        </section>
      ) : (
        <>
          {info.last && showLast && (
            <section className={'panel pad lg-last ' + (info.last.change === 1 ? 'lg-up' : info.last.change === -1 ? 'lg-down' : '')} role="status">
              <b>지난주 결과: {info.last.size}명 중 {info.last.rank}위</b>
              <span>{info.last.change === 1 ? `승급! 이제 ${names[info.tier ?? 0]}예요` : info.last.change === -1 ? `강등돼서 ${names[info.tier ?? 0]}예요. 이번 주에 다시 올라가요` : `${names[info.tier ?? 0]} 그대로예요`}</span>
              {!!info.last.reward && <em className="lg-reward">보상 +{info.last.reward} 경험치</em>}
              <button className="btn sm ghost" onClick={() => setShowLast(false)}>
                닫기
              </button>
            </section>
          )}
          <section className="panel pad lg-head">
            <LeagueBadge tier={info.tier ?? 0} names={names} size={56} />
            <div className="lg-meta">
              <small className="muted">이번 주 끝까지</small>
              <b>{left((info.endsAt ?? now) - now)}</b>
            </div>
          </section>
          <section className="panel pad">
            <h3>
              <Icon name="users" /> 이번 주 우리 조
            </h3>
            {!info.group?.length ? (
              <EmptyState compact icon="trophy" title="이번 주에 아직 경험치를 안 얻었어요" desc="대결·봇전·오늘의 도전을 끝내거나 미션을 하면 조에 들어가요." />
            ) : (
              <ol className="lg-list">
                {info.group.map((r, i) => {
                  const n = info.group!.length;
                  const up = i < (info.promote ?? 0);
                  const down = (info.demote ?? 0) > 0 && i >= n - (info.demote ?? 0);
                  return (
                    <li key={i} className={(r.me ? 'me ' : '') + (up ? 'lg-up' : down ? 'lg-down' : '')}>
                      <span className="lg-rank">{i + 1}</span>
                      <Avatar id={r.avatar} name={r.nickname} size={28} />
                      <span className="lg-name">
                        {r.nickname}
                        {r.me && <em> (나)</em>}
                      </span>
                      <b className="lg-score">{r.score.toLocaleString('ko-KR')} XP</b>
                      {(i === (info.promote ?? 0) - 1 || ((info.demote ?? 0) > 0 && i === n - (info.demote ?? 0) - 1)) && <i className="lg-line" aria-hidden />}
                    </li>
                  );
                })}
              </ol>
            )}
            {!!info.group?.length && <p className="muted small lg-legend">
              <span className="lg-dot lg-up" /> 승급 자리 · <span className="lg-dot lg-down" /> 강등 자리 · 경험치는 하루 한도가 있어서 꾸준히 하는 사람이 유리해요
            </p>}
          </section>
          <section className="panel pad">
            <h3>
              <Icon name="medal" /> 주간 보상
            </h3>
            <p className="muted small">한 주가 끝나면 다음 주에 처음 들어올 때 받아요. 높은 단계일수록 경험치가 많아요(단계마다 +20%).</p>
            <ul className="lg-rewards">
              <li>
                <b>1위</b>
                <span>경험치 {Math.round(100 * (1 + 0.2 * (info.tier ?? 0)))}</span>
              </li>
              <li>
                <b>2위</b>
                <span>경험치 {Math.round(70 * (1 + 0.2 * (info.tier ?? 0)))}</span>
              </li>
              <li>
                <b>3위</b>
                <span>경험치 {Math.round(50 * (1 + 0.2 * (info.tier ?? 0)))}</span>
              </li>
              <li>
                <b>승급</b>
                <span>경험치 +{Math.round(30 * (1 + 0.2 * (info.tier ?? 0)))}</span>
              </li>
            </ul>
            <p className="muted small">순위 경험치는 5명 이상인 조만 · 업적: 조 1위 '리그 우승'(칭호) · 여왕개미 도달(프로필 사진) · 황금개미 도달(칭호 + 프로필 사진)</p>
          </section>
          <section className="panel pad">
            <h3>단계</h3>
            <div className="lg-tiers">
              {names.map((_, t) => (
                <span key={t} className={t === info.tier ? 'on' : ''}>
                  <LeagueBadge tier={t} names={names} size={32} />
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

