/**
 * (v20) 커뮤니티·SNS — 예전 '찌라시'를 실제 커뮤니티·SNS 피드처럼 (설계서 design/community-news-v20.md)
 * - 장중에 하루 8~14개 글이 무작위 시각에 올라옴 (화면에는 이미 올라온 글까지만)
 * - 글마다 플랫폼(가상 이름)·올라온 시각·짚는 때(오늘 몇 시쯤·내일 아침·n일차)
 * - 진짜 약 40%: 진짜 글은 그날 장중 속보(아직 공개 전)나 내일 아침 기업 뉴스를 미리 말함. 나머지는 헛소문
 * - 검증 계정(✔ 대표·임원·애널리스트…)은 진위가 정해진 '뒤에' 진위에 따라 다른 확률로 붙임 → 검증 글은 약 75% 진짜
 * - 모든 글은 올라온 뒤 그 종목을 소문 방향으로 잠깐 들썩이게 했다가(0.5~2%) 짚은 때 뒤에 되돌아감 (intraday.ts)
 *   진짜·가짜 모두 똑같이 들썩여서 들썩임으로는 진위를 알 수 없음. 진짜면 그 뒤 실제 속보·뉴스로 움직임
 * 난수는 가격과 다른 전용 흐름(방 비밀값 + ':sns20:' + 날짜) → 일별 가격은 그대로. 진위·들썩임 크기는 서버에만
 */
import { seeded } from '../lib/rng.js';
import type { MacroType, Market, NewsEvent } from './market.js';
import { SECTOR_NEWS_MULT } from './stories.js';
import { COMPANIES, SECTOR_MAP, STOCK_MAP, STOCK_SECTORS } from './stocks.js';

export const COMMUNITY_VERSION = 20;

export type Platform = 'square' | 'board' | 'chirp' | 'feedgram' | 'talk' | 'live';
/** 모두 이 게임에서 만든 가상의 이름 (실제 서비스 이름·로고 아님) */
export const PLATFORMS: Record<Platform, { name: string; kind: string; color: string }> = {
  square: { name: '개미광장', kind: '커뮤니티', color: '#4f8cff' },
  board: { name: '종목토론방', kind: '커뮤니티', color: '#2fb380' },
  chirp: { name: '짹짹', kind: 'SNS', color: '#16a394' },
  feedgram: { name: '피드그램', kind: 'SNS', color: '#8b5cf6' },
  talk: { name: '개미톡 오픈채팅', kind: '메신저', color: '#db2777' },
  live: { name: '개미TV 라이브', kind: '방송', color: '#f97316' },
};
const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

export interface Verified {
  role: 'ceo' | 'exec' | 'ir' | 'analyst' | 'fund' | 'reporter';
  /** 화면에 보일 이름 ('코어반도체 임원') */
  label: string;
}
export interface Post {
  id: string;
  /** 서버 안에서만: 어떤 반응 글인지 (r 속보 반응 · e 사건 반응 · n 소식 반응) — 화면에 안 보냄 */
  src?: 'r' | 'e' | 'n';
  day: number;
  /** 올라온 시각 (하루 중 0~1) */
  at: number;
  platform: Platform;
  author: string;
  verified: Verified | null;
  text: string;
  symbol?: string;
  sector: string;
  tone: 'good' | 'bad';
  /** 짚은 때 */
  target: { day: number; at: number };
  likes: number;
  replies: number;
  /** 이미 나온 소식에 대한 반응 글 */
  re?: true;
  /** 서버만 */
  real: boolean;
  /** 서버만: 들썩임 크기(로그 수익률, 부호 포함) */
  hype: number;
}
export interface PublicPost {
  id: string;
  day: number;
  at: number;
  platform: Platform;
  author: string;
  verified: Verified | null;
  text: string;
  symbol?: string;
  sector: string;
  tone: 'good' | 'bad';
  likes: number;
  replies: number;
  verdict?: 'true' | 'false';
  /** 이미 나온 소식에 대한 반응 글 (단서가 아님 — 공개된 소식 얘기) */
  re?: true;
}

/** 하루(0~1)를 장 시간 9:00~15:30 으로 */
export function clockOf(at: number) {
  const min = 9 * 60 + Math.round(Math.max(0, Math.min(1, at)) * 390);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
/** (v22) 게임 안의 시간: 하루가 몇 초인지(daySec)에 맞춰 장이 열린 뒤 몇 초째인지 — '42초', '2분 31초' */
export const GAME_TIME_VERSION = 22;
/** (v25) 모든 공개 소식에 커뮤니티가 반응 (소식과 커뮤니티가 서로 이어지게) */
export const REACT_VERSION = 25;
/** (v29) 가짜 글의 때·올라온 시각을 진짜 글과 같은 모양으로 — 문구·시각만으로 진위가 드러나던 것 막기 */
export const FAIR_WHEN_VERSION = 29;
export function gameTime(at: number, daySec: number): string {
  const t = Math.round(Math.max(0, Math.min(1, at)) * daySec);
  if (t <= 0) return '장 시작';
  if (daySec <= 60 || t < 60) return `${t}초`;
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return sec ? `${m}분 ${sec}초` : `${m}분`;
}
/** 남은 시간을 말로 ('20초 안에', '1분 30초 안에') — 5초·10초 단위로 둥글게 */
function soonText(sec: number) {
  if (sec < 60) return `${Math.max(5, Math.ceil(sec / 5) * 5)}초 안에`;
  const t = Math.ceil(sec / 10) * 10;
  const m = Math.floor(t / 60);
  return t % 60 ? `${m}분 ${t % 60}초 안에` : `${m}분 안에`;
}
/** 말로 하는 때 ('오후 2시 반쯤') */
function speakTime(at: number) {
  const min = 9 * 60 + Math.round((Math.max(0, Math.min(1, at)) * 390) / 30) * 30;
  const h = Math.floor(min / 60);
  const half = min % 60 === 30;
  const ampm = h < 12 ? '오전' : h === 12 ? '낮' : '오후';
  const hh = h > 12 ? h - 12 : h;
  return `${ampm} ${hh}시${half ? ' 반' : ''}쯤`;
}

/** 익명 닉네임 (개미 커뮤니티 말투 — 실제 사람·회사 이름 아님). 고르는 난수 횟수는 목록 길이와 상관없음 */
export const NICKS = [
  '존버는승리한다', '물린개미3년차', '손절못하는곰돌이', '익절요정', '상한가꿈나무', '하한가체험단', '떡상기원', '떡락방지위원회',
  '단타의신(자칭)', '장기투자(강제)', '평단가수호자', '물타기장인', '불타기초보', '차트보는척', '뉴스만믿는개미', '소문수집가',
  '배당먹는다람쥐', '레버리지후회중', '인버스외길', '반도체에진심', '바이오롤러코스터', '코인갔다온개미', '월급털이개미', '점심값투자',
  '출근전호가창', '장마감3초전', '시초가추격자', '매수버튼중독', '수수료기부천사', '오늘도파란불', '빨간불만보고싶다', '개미중의개미',
  '졸업못한개미', '본전만오면판다', '야수의심장', '새가슴개미', '눈팅만10년', '퇴근후주식', '한강뷰예약', '라면값벌기',
  '익절은언제나옳다', '천원이라도벌자', '오르면산다', '사면내린다', '팔면오른다', '가즈아전문', '존버3회차', '개미핥기조심',
];
const ROLES: Record<Verified['role'], string> = { ceo: '대표', exec: '임원', ir: 'IR 담당', analyst: '애널리스트', fund: '펀드매니저', reporter: '경제부 기자' };

type When = { kind: 'today' | 'soon' | 'close' | 'tomorrow' | 'tday' | 'day'; target: { day: number; at: number } };
function whenText(w: When, now: number, daySec?: number) {
  if (daySec) {
    // (v22) 게임 시간으로: '오늘 장 42초쯤', '내일 2분 31초쯤', '3일차 40초쯤'
    if (w.kind === 'soon') return soonText(Math.max(1, (w.target.at - now) * daySec));
    if (w.kind === 'today') return `오늘 장 ${gameTime(w.target.at, daySec)}쯤`;
    if (w.kind === 'close') return '오늘 장 마감 전에';
    if (w.kind === 'tomorrow') return '내일 장 시작 전에';
    if (w.kind === 'tday') return `내일 ${gameTime(w.target.at, daySec)}쯤`;
    return w.target.at > 0 ? `${w.target.day + 1}일차 ${gameTime(w.target.at, daySec)}쯤` : `${w.target.day + 1}일차 장 시작 전에`;
  }
  if (w.kind === 'soon') return `${Math.max(1, Math.round(((w.target.at - now) * 390) / 30) * 30) >= 60 ? `${Math.round(((w.target.at - now) * 390) / 60)}시간 안에` : '30분 안에'}`;
  if (w.kind === 'today') return `오늘 ${speakTime(w.target.at)}`;
  if (w.kind === 'close') return '오늘 장 마감 전에';
  if (w.kind === 'tomorrow') return '내일 아침';
  if (w.kind === 'tday') return `내일 ${speakTime(w.target.at)}`;
  return `${w.target.day + 1}일차에`;
}

/** 플랫폼 말투별 문구 (good/bad) — {w}=대상(종목·업종), {t}=때 */
const TPL: Record<Platform, { good: string[]; bad: string[] }> = {
  square: {
    good: ['[정보] {w} {t} 대형 호재 뜬다는 얘기 돌던데 ㄹㅇ임?', '{w} {t} 터진다고 지인한테 들음… 일단 탑승', '[속보아님] {w} 쪽 분위기 심상치 않음 {t} 뭔가 나온대'],
    bad: ['[정보] {w} {t} 악재 나온다는 얘기 있음 조심하셈', '{w} {t} 던진다는 소문… 물린 사람 손 ㅠ', '{w} 쪽 {t} 안 좋은 발표 있다던데 아는 사람?'],
  },
  board: {
    good: ['{w} {t} 상한가 각. 무조건 간다', '{w} 개미들 버텨라 {t} 날아간다', '{w} 지금이 바닥. {t} 발표 나오면 늦음'],
    bad: ['{w} {t} 폭탄 터짐. 탈출은 지능순', '{w} {t} 하한가 갈 수도… 빠질 사람 빠져라', '{w} 세력 {t} 털고 나간다는 말 있음'],
  },
  chirp: {
    good: ['#{h} {t} 깜짝 발표설 🚀 다들 알고 있었음?', '들은 얘기: {w} {t} 좋은 소식 나온다고 #{h}', '#{h} 내 촉으로는 {t} 간다 📈'],
    bad: ['#{h} {t} 악재설 돌아요 ⚠️ 확인된 건 아님', '들은 얘기: {w} {t} 안 좋은 소식 있대요 #{h}', '#{h} {t} 조심… 큰손들 빠진다는 말 📉'],
  },
  feedgram: {
    good: ['오늘 {w} 쪽 다녀왔는데 분위기 너무 좋더라 ✨ {t} 뭔가 있을 듯', '{w} 직원 지인 표정이 밝음… {t} 좋은 일 있대요 😎', '여의도 점심 자리에서 들은 거: {w} {t} 호재 💸'],
    bad: ['오늘 {w} 쪽 분위기 싸늘했음 🥶 {t} 뭔가 터질 듯', '{w} 직원 지인 표정이 어두움… {t} 안 좋은 소식 있대요', '여의도 점심 자리에서 들은 거: {w} {t} 악재 😱'],
  },
  talk: {
    good: ['[받은 글] {w} {t} 대형 계약 발표 예정 (공유 금지)', '[긴급] {w} {t} 호재 뜬다고 함. 퍼가지 마세요', '[찌라시] {w} {t} 좋은 소식 확정이라는데…'],
    bad: ['[받은 글] {w} {t} 악재 발표 예정 (공유 금지)', '[긴급] {w} {t} 안 좋은 소식 뜬다고 함', '[찌라시] {w} {t} 매도 폭탄 나온다는데…'],
  },
  live: {
    good: ['방장: "{w}, {t} 터집니다. 제 말 기억하세요"', '라이브 채팅 요약: "{w} {t} 터진다"는 얘기로 시끌시끌', '방장: "{w}, {t} 간다고 봅니다. 미리 담아 두는 사람이 이깁니다"'],
    bad: ['방장: "{w}, {t} 빠집니다. 지금 정리하세요"', '라이브 채팅 요약: "{w} {t} 빠진다"는 얘기로 시끌시끌', '방장: "{w}, {t} 무너진다고 봅니다. 미리 안 팔면 후회합니다"'],
  },
};
/** 검증된 사람은 말투가 조심스러움 */
const TPL_VERIFIED = {
  good: ['{w}, {t} 좋은 소식이 나올 거라는 얘기가 업계에서 들립니다.', '{t} {w} 쪽에서 의미 있는 발표가 예상됩니다. 지켜보시죠.', '{w}, {t} 시장 기대를 웃도는 내용이 나올 가능성이 높다고 봅니다.'],
  bad: ['{w} 관련해 {t} 아쉬운 소식이 있을 수 있습니다. 신중하세요.', '{t} {w} 쪽에서 부담스러운 발표가 예상됩니다.', '{w}, {t} 시장 기대에 못 미치는 내용이 나올 가능성이 있습니다.'],
};
/** 회사 사람(대표·임원·IR)은 자기 회사 얘기라 '저희' 말투 — 바깥 사람 틀과 개수를 같게 (난수 쓰는 횟수 그대로) */
const TPL_INSIDER = {
  good: ['저희 {w}, {t} 좋은 소식 전해 드릴 수 있을 것 같습니다.', '{t} 저희 쪽에서 의미 있는 발표가 있을 예정입니다. 지켜봐 주세요.', '{t} 발표를 준비하고 있습니다. 기대하셔도 좋습니다.'],
  bad: ['{t} 저희 {w} 관련해 아쉬운 소식이 있을 수 있습니다. 미리 양해 부탁드립니다.', '솔직히 말씀드리면 {t} 쉽지 않은 소식이 나올 수 있습니다.', '{t} 나올 발표가 기대에 못 미칠 수 있습니다. 신중하게 봐 주세요.'],
};

const cache = new Map<string, Post[]>();

/** 그날의 커뮤니티 글 전부 (서버·혼자 연습만 — 화면에는 publicPosts 로 잘라서) */
export function communityPosts(m: Market, day: number, key: string, daySec?: number): Post[] {
  // (v22) 글 속 때를 게임 시간으로 — 하루 길이를 알 때만 (가격·진위·시각은 하루 길이와 상관없음)
  const ds = (m.version ?? 1) >= GAME_TIME_VERSION && daySec && daySec > 0 ? daySec : undefined;
  const ck = `${key}:${m.version ?? 1}:${m.totalDays}:${day}:${ds ?? ''}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const rng = seeded(`${key}:sns20:${day}`);
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  const count = 8 + Math.floor(rng() * 7);
  // 진짜 글이 될 수 있는 것: 오늘 장중 속보(공개 전) · 내일 아침 기업 뉴스
  const isReal = (n: NewsEvent) => !n.rumor && !n.fake;
  const breaking = m.news.filter((n) => n.day === day && n.at != null && n.at > 0.14 && isReal(n) && (n.symbol || n.sector));
  // 내일·모레 뉴스(아침·장중 속보, 기업·업종)도 진짜 글의 재료 — '내일 아침', '내일 오후 2시쯤', 'n일차에'
  const ahead = m.news.filter((n) => (n.day === day + 1 || n.day === day + 2) && n.day < m.totalDays && n.kind !== 'macro' && (n.symbol || n.sector) && isReal(n));
  const tomorrow = ahead;
  const out: Post[] = [];
  // (v29) 가짜 글 때 고르기 전용 난수 — 예전 판 글은 그대로
  const fair = (m.version ?? 1) >= FAIR_WHEN_VERSION;
  const r29 = seeded(`${key}:sns29:${day}`);
  // 진짜 글이 짚는 장중 시각은 실제 속보 시각이라, 가짜도 같은 시각들 중에서 고름
  const breakAts = m.news.filter((n) => n.at != null && n.at > 0.14 && !n.rumor).map((n) => n.at!);
  const morningShare = (() => {
    const f = m.news.filter((n) => n.kind !== 'macro' && !n.rumor && (n.symbol || n.sector));
    return f.length ? f.filter((n) => n.at == null).length / f.length : 0.7;
  })();
  const fakeWhen = (): { at: number; when: When } => {
    const pickAt = () => (breakAts.length ? breakAts[Math.floor(r29() * breakAts.length)] : 0.15 + r29() * 0.8);
    const days = [day + 1, day + 2].filter((x) => x < m.totalDays);
    if (!days.length || r29() < 0.6) {
      // 오늘 장중: 진짜 속보 글과 같은 식 (짚은 시각보다 앞에서, 짚은 시각까지 남은 때로 '곧'·'오늘 n초쯤')
      const t = pickAt();
      const at = 0.03 + r29() * Math.max(0.02, t - 0.1);
      return { at, when: t - at < 0.18 ? { kind: 'soon', target: { day, at: t } } : { kind: 'today', target: { day, at: t } } };
    }
    const at = 0.3 + r29() * 0.65;
    const td = days[Math.floor(r29() * days.length)];
    const ta = r29() < morningShare ? 0 : pickAt();
    if (td === day + 1) return { at, when: ta > 0 ? { kind: 'tday', target: { day: td, at: ta } } : { kind: 'tomorrow', target: { day: td, at: 0 } } };
    return { at, when: { kind: 'day', target: { day: td, at: ta } } };
  };
  for (let i = 0; i < count; i++) {
    let real = rng() < 0.4;
    let at = 0.03 + rng() * 0.9;
    let symbol: string | undefined;
    let sector: string;
    let tone: 'good' | 'bad';
    let when: When;
    const src = real ? (breaking.length && (rng() < 0.6 || !tomorrow.length) ? breaking.splice(Math.floor(rng() * breaking.length), 1)[0] : tomorrow.length ? tomorrow.splice(Math.floor(rng() * tomorrow.length), 1)[0] : null) : null;
    if (real && src) {
      symbol = src.symbol ?? undefined;
      sector = src.sector ?? (symbol ? STOCK_MAP[symbol].sector : STOCK_SECTORS[0].id);
      tone = src.realTone ?? src.tone;
      if (src.day === day) {
        at = 0.03 + rng() * Math.max(0.02, src.at! - 0.1);
        when = src.at! - at < 0.18 ? { kind: 'soon', target: { day, at: src.at! } } : { kind: 'today', target: { day, at: src.at! } };
      } else {
        at = 0.3 + rng() * 0.65;
        when = src.day === day + 1 ? (src.at != null ? { kind: 'tday', target: { day: src.day, at: src.at } } : { kind: 'tomorrow', target: { day: day + 1, at: 0 } }) : { kind: 'day', target: { day: src.day, at: src.at ?? 0 } };
      }
    } else {
      real = false;
      if (rng() < 0.65) {
        const c = pick(COMPANIES);
        symbol = c.symbol;
        sector = c.sector;
      } else sector = pick(STOCK_SECTORS).id;
      tone = rng() < 0.5 ? 'good' : 'bad';
      const r = rng();
      if (r < 0.55 && at < 0.85) {
        const t = Math.min(0.97, at + 0.08 + rng() * 0.35);
        when = t - at < 0.18 ? { kind: 'soon', target: { day, at: t } } : rng() < 0.3 ? { kind: 'close', target: { day, at: 0.97 } } : { kind: 'today', target: { day, at: t } };
      } else if (r < 0.72 && day + 1 < m.totalDays) when = { kind: 'tomorrow', target: { day: day + 1, at: 0 } };
      else if (r < 0.85 && day + 1 < m.totalDays) when = { kind: 'tday', target: { day: day + 1, at: 0.15 + rng() * 0.75 } };
      else if (day + 2 < m.totalDays) when = { kind: 'day', target: { day: day + 2 + Math.floor(rng() * Math.max(1, Math.min(4, m.totalDays - day - 2))), at: 0.5 } };
      else when = { kind: 'close', target: { day, at: 0.97 } };
    }
    if (fair && !real) ({ at, when } = fakeWhen());
    // 검증 계정: 진위가 정해진 뒤 진위에 따라 (진짜 40% · 가짜 8%) → 검증 글은 약 75% 진짜
    const verifiedRoll = rng();
    const isVerified = verifiedRoll < (real ? 0.4 : 0.08);
    const name = symbol ? STOCK_MAP[symbol].name : SECTOR_MAP[sector]?.name ?? '시장';
    let verified: Verified | null = null;
    if (isVerified) {
      const role = symbol ? pick<Verified['role']>(['ceo', 'exec', 'ir', 'analyst', 'fund', 'reporter']) : pick<Verified['role']>(['analyst', 'fund', 'reporter']);
      const org = role === 'ceo' || role === 'exec' || role === 'ir' ? name : role === 'analyst' ? pick(['개미증권', '한빛투자증권', '마켓리서치', '여의도증권']) : role === 'fund' ? pick(['개미자산운용', '한강운용']) : pick(['개미경제', '증권일보']);
      // ETF 는 회사가 아니라 대표·임원·IR 이 없음 → 그 ETF 를 굴리는 운용역 (난수를 더 쓰지 않음)
      verified = symbol && STOCK_MAP[symbol].etf && org === name ? { role: 'fund', label: `${name} 운용역` } : { role, label: `${org} ${ROLES[role]}` };
    }
    const platform = verified ? pick<Platform>(['chirp', 'feedgram', 'live']) : pick(PLATFORM_IDS);
    const w = symbol ? name : `${name} 업종`;
    const insider = verified && (verified.role === 'ceo' || verified.role === 'exec' || verified.role === 'ir');
    const tpl = verified ? pick((insider ? TPL_INSIDER : TPL_VERIFIED)[tone]) : pick(TPL[platform][tone]);
    const text = tpl
      .replace(/\{w\}/g, w)
      .replace(/\{t\}/g, whenText(when, at, ds))
      .replace(/\{h\}/g, name.replace(/[\s·]/g, ''));
    const mult = SECTOR_NEWS_MULT[sector] ?? 1;
    out.push({
      id: `${day}-${i}`,
      day,
      at,
      platform,
      author: verified ? verified.label : pick(NICKS) + (rng() < 0.5 ? String(Math.floor(rng() * 90) + 10) : ''),
      verified,
      text,
      symbol,
      sector,
      tone,
      target: when.target,
      // 반응 수는 진위와 상관없이 (검증 글만 조금 많게)
      likes: Math.floor((verified ? 120 : 8) + rng() * (verified ? 900 : 400)),
      replies: Math.floor(rng() * (verified ? 160 : 90)),
      real,
      hype: (tone === 'good' ? 1 : -1) * (0.005 + rng() * 0.015) * mult,
    });
  }
  // (v21) 속보 직후 반응 글 — 이미 공개된 속보 얘기라 단서가 아님(분위기). 진짜·들썩임 없음. 전용 난수라 v20 글은 그대로
  if ((m.version ?? 1) >= 21 && (m.version ?? 1) < REACT_VERSION) {
    const r2 = seeded(`${key}:sns21:${day}`);
    for (const n of m.news.filter((x) => x.day === day && x.at != null && !x.rumor && !x.fake && x.symbol)) {
      if (r2() > 0.7) continue;
      const name = STOCK_MAP[n.symbol!].name;
      const good = (n.realTone ?? n.tone) === 'good';
      const pf: Platform = (['square', 'board', 'chirp', 'talk'] as Platform[])[Math.floor(r2() * 4)];
      const lines = good
        ? [`방금 속보 봤음? ${name} 바로 튀어 오름 ㄷㄷ`, `${name} 속보 떴다!! 늦은 건가…`, `와 ${name} 실화냐 속보 보자마자 들어갈걸`]
        : [`방금 속보 봤음? ${name} 바로 고꾸라짐 ㅠㅠ`, `${name} 속보 떴다… 물린 사람 손`, `${name} 악재 속보 실화냐 손절각`];
      out.push({ id: `${day}-r${out.length}`, src: 'r', day, at: Math.min(0.99, n.at! + 0.01 + r2() * 0.04), platform: pf, author: NICKS[Math.floor(r2() * NICKS.length)], verified: null, text: lines[Math.floor(r2() * lines.length)], symbol: n.symbol!, sector: STOCK_MAP[n.symbol!].sector, tone: good ? 'good' : 'bad', target: { day, at: n.at! }, likes: Math.floor(30 + r2() * 600), replies: Math.floor(r2() * 120), real: true, hype: 0, re: true });
    }
  }
  // (v24) 그날 나온 큰 사건 뉴스에 반응하는 글 — 사건의 원인·결과를 짚음(전쟁 → 유가·정유·항공, 테마 과열, 상장 폐지, 유상증자, 공매도 보고서).
  //   이미 공개된 뉴스를 두고 하는 말이라 진짜(real)·들썩임 없음, 뉴스가 나온 뒤에만 올라옴 (아침 뉴스면 장 초반)
  if ((m.version ?? 1) >= 24) {
    const r4 = seeded(`${key}:sns24:${day}`);
    const nick = () => NICKS[Math.floor(r4() * NICKS.length)];
    const plat = (): Platform => PLATFORM_IDS[Math.floor(r4() * PLATFORM_IDS.length)];
    const add = (afterAt: number, text: string, sector: string, tone: 'good' | 'bad', symbol?: string) =>
      out.push({ id: `${day}-e${out.length}`, src: 'e', day, at: Math.min(0.97, afterAt + 0.01 + r4() * 0.12), platform: plat(), author: nick(), verified: null, text, symbol, sector, tone, target: { day, at: afterAt }, likes: Math.floor(80 + r4() * 900), replies: Math.floor(10 + r4() * 200), real: true, hype: 0, re: true });
    for (const n of m.news.filter((x) => x.day === day && !x.rumor)) {
      const at0 = n.at ?? 0.02;
      const h = n.headline;
      const nm = n.symbol ? STOCK_MAP[n.symbol]?.name ?? '' : '';
      if (/무력 충돌/.test(h)) {
        add(at0, '전쟁 났다고? 기름값 또 뛰겠네… 정유주는 웃고 항공주는 우는 날 ㅠ', 'energy', 'good');
        add(at0, '항공주 들고 있는 사람 손… 유가 오르면 비행기 연료비 감당 안 됨', 'air', 'bad');
        add(at0, '전쟁 소식에 지수 빠질 때 패닉셀 금지. 보통 며칠 뒤 일부 돌아온다', 'energy', 'good');
      } else if (/긴장 고조/.test(h)) {
        add(at0, '뉴스 보니까 분위기 심상치 않다… 혹시 모르니 항공주 줄여 둠', 'air', 'bad');
      } else if (/투자경고/.test(h) && n.symbol) {
        add(at0, `${nm} 투자경고 떴다… 근거 뉴스는 없는데 오르기만 함. 꼭지 조심`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
        add(at0, `${nm} 아직 안 늦음 가즈아!! 상한가 한 번 더`, STOCK_MAP[n.symbol].sector, 'good', n.symbol);
      } else if (/일째 급등/.test(h) && n.symbol) {
        add(at0, `${nm} 또 상한가ㅋㅋ 이거 무슨 재료인지 아는 사람?`, STOCK_MAP[n.symbol].sector, 'good', n.symbol);
      } else if (/무관.*공시|사실무근/.test(h) && n.symbol) {
        add(at0, `${nm} 공시 보고 다 같이 던지는 중… 소문만 믿고 탄 사람들 어떡함`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/감사보고서 제출 지연|횡령/.test(h) && n.symbol) {
        add(at0, `${nm} 감사 지연에 횡령 의혹까지… 이거 거래정지 각 아님?`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/거래정지/.test(h) && n.symbol) {
        add(at0, `${nm} 거래정지 걸렸다… 물린 사람 팔지도 못함 ㅠㅠ`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/정리매매/.test(h) && n.symbol) {
        add(at0, `${nm} 정리매매 시작… 한 푼이라도 건지려면 지금이 마지막`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/유상증자/.test(h) && n.symbol) {
        add(at0, `${nm} 유상증자… 주식 수 늘어나면 내 주식 가치는 희석됨. 그래서 빠지는 거`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/공매도 업체/.test(h) && n.symbol) {
        add(at0, `${nm} 공매도 보고서 떴다. 진짜인지는 회사 해명 봐야 앎`, STOCK_MAP[n.symbol].sector, 'bad', n.symbol);
      } else if (/승인 통과|승인 거절/.test(h) && n.symbol) {
        const ok = /통과/.test(h);
        add(at0, ok ? `${nm} 승인 통과!! 하루에 두 배 실화냐` : `${nm} 승인 거절… 하루 만에 반토막`, STOCK_MAP[n.symbol].sector, ok ? 'good' : 'bad', n.symbol);
      }
    }
  }
  if ((m.version ?? 1) >= REACT_VERSION) reactAll(m, day, key, out);
  out.sort((a, b) => a.at - b.at);
  // 번호는 올라온 차례로 새로 매김: 만든 차례 번호를 쓰면 아직 안 보이는 속보의 반응 글 자리가 번호 틈으로 드러남
  out.forEach((p, i) => (p.id = `${day}-${i}`));
  if (cache.size > 2000) cache.clear();
  cache.set(ck, out);
  return out;
}

/**
 * 들썩임 (로그 수익률): 글이 올라온 칸에서 바로 튀고 → 짚은 때(오늘이면) 또는 0.25 뒤부터 0.08 동안 되돌아감.
 * 하루 끝(1)에는 늘 0 — 일별 종가는 그대로
 */
export function hypeAt(posts: Post[], symbol: string, sector: string, f: number) {
  let sum = 0;
  for (const p of posts) {
    const w = p.symbol ? (p.symbol === symbol ? 1 : 0) : p.sector === sector ? 0.5 : 0;
    // 글이 보이는 그 칸에서 이미 튀어 있음 (실제 시장처럼 — 보고 따라 사면 늦음). 짚은 때 뒤 천천히 되돌아감
    if (!w || f < p.at) continue;
    const end = Math.min(0.9, p.target.day === p.day ? Math.max(p.at + 0.04, p.target.at) : p.at + 0.25);
    const fall = f <= end ? 1 : Math.max(0, 1 - (f - end) / 0.08);
    sum += p.hype * w * fall;
  }
  return sum;
}

/** 화면에 보낼 글: 지금(nowAt)까지 올라온 것만, 진위는 짚은 때가 지난 다음 날부터·감별기로 고른 글만 */
export function publicPosts(posts: Post[], today: number, nowAt: number, pick?: string): PublicPost[] {
  return posts
    .filter((p) => p.day < today || (p.day === today && p.at <= nowAt))
    .map((p) => {
      const out: PublicPost = { id: p.id, day: p.day, at: p.at, platform: p.platform, author: p.author, verified: p.verified, text: p.text, symbol: p.symbol, sector: p.sector, tone: p.tone, likes: p.likes, replies: p.replies, ...(p.re ? { re: true as const } : {}) };
      const revealed = today > Math.max(p.day, p.target.day);
      if (revealed || (pick !== undefined && pick === p.text && p.day === today)) out.verdict = p.real ? 'true' : 'false';
      return out;
    });
}

/** v24 사건 뉴스는 위에서 사건에 맞는 반응을 따로 붙임 */
const EVENT_RE = /무력 충돌|긴장 고조|투자경고|일째 급등|무관.*공시|사실무근|감사보고서 제출 지연|횡령|거래정지|정리매매|유상증자|공매도 업체|승인 통과|승인 거절/;
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
/** 거시 소식 반응: 무엇이 무엇에 영향을 주는지 (원인 → 결과) */
const MACRO_REACT: Record<MacroType, { good: string[]; bad: string[] }> = {
  rate: {
    good: ['금리 내려가면 대출 이자 줄고 성장주 숨통 트이겠다', '금리 뉴스 떴다! 이자 부담 줄면 소비도 살아나겠지?', '은행은 좀 아쉽겠지만 나머지는 웃는 날'],
    bad: ['금리 오르면 은행만 웃고 나머지는 다 울상…', '이자 부담 커지면 소비 줄 텐데 유통·여행주 괜찮을까', '빚내서 산 사람들 오늘 잠 못 잘 듯'],
  },
  fed: {
    good: ['미국 금리 소식 좋다! 밤사이 미국 오르면 우리도 따라가겠지', '연준 발표 나왔다. 달러 약해지면 외국인 돈 들어온다', '미국 쪽 숨통 트이면 반도체부터 간다'],
    bad: ['미국 금리 소식에 다들 쫄았다… 외국인 빠질 듯', '연준 매파 발언 나오면 성장주부터 맞는다', '미국 기침하면 우리는 감기… 오늘 조심'],
  },
  oil: {
    good: ['기름값 내려간다! 항공·운송주 숨 좀 쉬겠다', '유가 떨어지면 정유주는 아쉽고 항공주는 웃음', '기름값 내리면 물가도 좀 잡히겠네'],
    bad: ['유가 또 오른다… 정유주는 웃고 항공주는 울고', '기름값 오르면 비행기 연료비 감당 안 됨, 항공주 손', '유가 뛰면 물가 오르고 금리도 못 내림… 연쇄 반응 무섭다'],
  },
  fx: {
    good: ['환율 소식 떴다. 수출 많이 하는 회사들 영향 크겠네', '원화 움직임 좋다는데 외국인 돌아올까', '환율 안정되면 수입하는 회사들 원가 부담 줄어듦'],
    bad: ['환율 크게 움직인다… 수입 많은 회사 원가 부담 커짐', '원화 약하면 외국인 돈 빠져나간다던데', '환율 뉴스에 여행 가려던 거 접음 ㅠ 항공주도 아프겠다'],
  },
  kr: {
    good: ['오늘 장 분위기 좋다는 뉴스! 다 같이 빨간불 가자', '국내 증시 소식 좋네. 지수 따라가는 ETF도 같이 가겠다', '이런 날은 대형주부터 움직임'],
    bad: ['국내 증시 분위기 안 좋다는 뉴스… 오늘은 쉬어 갈까', '지수 빠지는 날은 다 같이 빠짐. 버티자', '인버스 들고 있는 사람만 웃는 날'],
  },
  us: {
    good: ['미국 증시 올랐다! 미국 주식 들고 있는 사람 부럽', '밤사이 미국 좋았으니 오늘 우리 장도 기대', '미국 기술주 오르면 우리 반도체도 따라감'],
    bad: ['밤사이 미국 빠졌네… 오늘 우리 장도 영향 받을 듯', '미국 주식 들고 있는 사람 손… 환율까지 보면 더 아픔', '미국 기술주 빠지면 우리 반도체도 같이 맞는다'],
  },
};
/** 시험용: 거시 반응 문구 전부 */
export const MACRO_REACT_TEXTS: string[] = [];
const MACRO_SECTOR: Record<MacroType, string> = { rate: 'build', fed: 'us_tech', oil: 'air', fx: 'air', kr: 'etf', us: 'us_tech' };
for (const v of Object.values(MACRO_REACT)) MACRO_REACT_TEXTS.push(...v.good, ...v.bad);
const COMPANY_REACT = {
  good: ['{n} 뉴스 봤음? 오늘 {n} 토론방 난리남 ㅋㅋ', '{n} 호재 떴다!! 근데 이미 오른 거 아님?', '{n} 들고 있던 사람 축하합니다 🎉', '{n} 이 정도면 {sec} 업종 전체 분위기도 좋아지겠다'],
  bad: ['{n} 악재… 물린 사람 손 ✋', '{n} 뉴스 보고 바로 던졌다 ㅠㅠ', '{n} 토론방 분위기 초상집…', '{n} 이러면 {sec} 업종 다른 회사들도 같이 눈치 보겠다'],
};
const REL_REACT = {
  link: { good: '{n} 잘되면 거래처 {r}도 같이 웃겠네', bad: '{n} 흔들리면 거래처 {r}도 걱정된다' },
  peer: { good: '{n} 소식에 같은 업종 {r}도 같이 들썩', bad: '{n} 악재에 같은 업종 {r}까지 같이 빠지는 거 아님?' },
  rival: { good: '{n} 잘나가면 경쟁사 {r}는 오늘 좀 아프겠다', bad: '{n} 삐끗하면 경쟁사 {r}가 반사이익 보겠네' },
  chain: { good: '{n} 소식이면 연관된 {r}도 같이 볼 만함', bad: '{n} 소식에 연관된 {r}도 영향 있을 듯' },
  etf: { good: '{n} 담긴 ETF {r}도 덩달아 오르겠다', bad: '{n} 담긴 ETF {r}도 같이 끌려 내려가겠네' },
} as const;
const SECTOR_REACT = {
  good: ['{s} 업종 다 같이 가는 날인가? 대장주부터 보자', '{s} 뉴스 나왔다 관련주 전부 들썩', '{s} 업종 ETF 하나 사 두면 편하겠다'],
  bad: ['{s} 업종 분위기 안 좋다… 다 같이 빠질 듯', '{s} 쪽 들고 있는 사람 오늘 힘내라', '{s} 업종 한동안 쉬어 가겠네'],
};
const RUMOR_REACT = ['{w} 소문 기사 떴는데 이거 진짜임? 출처가 커뮤니티라던데', '{w} 기사 봤는데 확인된 건 아니래. 믿어도 됨?', '{w} 얘기 돌던 게 기사로 나왔네… 감별기 써 볼까'];
const DOUBT = ['뉴스 나왔을 땐 이미 늦었다. 다 반영된 가격임', '다들 흥분하지 마요. 내일 되면 반대로 갈 수도', '이런 날 따라 사는 사람이 꼭지 잡더라'];

/**
 * (v25) 그날 공개된 모든 소식(아침 뉴스·장중 속보·소문 기사)에 커뮤니티 반응 — 원인 → 결과를 짚고, 관련 회사(거래처·경쟁사·ETF)까지 번짐.
 * 이미 공개된 소식을 두고 하는 말이라 진짜(real)·들썩임 0 — 가격과 무관. 글 수·반응 수는 기사의 진위와 상관없이 공개된 것(머리말·종류·관계)만으로 정함.
 * 전용 난수 sns25 라 v24 이하 글은 그대로
 */
function reactAll(m: Market, day: number, key: string, out: Post[]) {
  const r = seeded(`${key}:sns25:${day}`);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const plats: Platform[] = PLATFORM_IDS;
  const used = new Set<string>();
  for (const n of m.news.filter((x) => x.day === day && !EVENT_RE.test(x.headline))) {
    const at0 = n.at ?? 0;
    const big = n.label === '속보' || n.label === '단독' || n.kind === 'macro' || n.at != null;
    const count = 1 + (big ? 1 : 0) + (r() < 0.55 ? 1 : 0);
    const tone = n.tone;
    const sym = n.symbol ?? undefined;
    // 거시 소식은 가장 크게 영향받는 업종 꼬리표 (금리 → 건설·부동산, 연준·미국 → 미국 빅테크, 유가·환율 → 항공·여행, 국내 증시 → ETF)
    const sec = n.sector ?? (sym ? STOCK_MAP[sym]?.sector : undefined) ?? (n.macro ? MACRO_SECTOR[n.macro] : 'etf');
    const nm = sym ? STOCK_MAP[sym]?.name ?? '' : '';
    const secName = SECTOR_MAP[sec]?.name ?? '';
    const rels = Object.entries(n.rel ?? {}).filter(([s]) => STOCK_MAP[s]);
    for (let k = 0; k < count; k++) {
      let text: string;
      let tTone: 'good' | 'bad' = tone;
      let tSym = sym;
      let tSec = sec;
      const roll = r();
      if (n.rumor) text = fill(pick(RUMOR_REACT), { w: nm || secName + ' 업종' });
      else if (k > 0 && roll < 0.2) text = pick(DOUBT);
      else if (n.kind === 'macro' && n.macro) text = pick(MACRO_REACT[n.macro][tone]);
      else if (sym && rels.length && k > 0 && roll < 0.75) {
        const [rs, rel] = rels[Math.floor(r() * rels.length)];
        text = fill(REL_REACT[rel][tone], { n: nm, r: STOCK_MAP[rs].name });
        tSym = rs;
        tSec = STOCK_MAP[rs].sector;
        if (rel === 'rival') tTone = tone === 'good' ? 'bad' : 'good';
      } else if (sym) text = fill(pick(COMPANY_REACT[tone]), { n: nm, sec: secName });
      else text = fill(pick(SECTOR_REACT[tone]), { s: secName });
      // 같은 날 같은 글은 한 번만 (난수는 그대로 써서 뒤 글이 바뀌지 않게 — 건너뛰기만)
      const dup = used.has(text);
      used.add(text);
      // 아침 뉴스는 장 초반에, 속보는 뜬 바로 뒤에 (뉴스가 먼저 — 앞서 새지 않게)
      const at = Math.min(0.97, n.at != null ? at0 + 0.004 + r() * 0.07 : 0.01 + r() * 0.18);
      const hot = big ? 2 : 1;
      const post: Post = {
        id: `${day}-n${out.length}`,
        src: 'n',
        day,
        at,
        platform: pick(plats),
        author: NICKS[Math.floor(r() * NICKS.length)] + (r() < 0.4 ? String(Math.floor(r() * 90) + 10) : ''),
        verified: null,
        text,
        symbol: tSym,
        sector: tSec,
        tone: tTone,
        target: { day, at: n.at ?? 0 },
        likes: Math.floor((40 + r() * 500) * hot),
        replies: Math.floor((5 + r() * 90) * hot),
        real: true,
        hype: 0,
        re: true,
      };
      if (!dup) out.push(post);
    }
  }
}
