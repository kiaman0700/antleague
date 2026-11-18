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
import type { Market, NewsEvent } from './market.js';
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
}

/** 하루(0~1)를 장 시간 9:00~15:30 으로 */
export function clockOf(at: number) {
  const min = 9 * 60 + Math.round(Math.max(0, Math.min(1, at)) * 390);
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
/** (v22) 게임 안의 시간: 하루가 몇 초인지(daySec)에 맞춰 장이 열린 뒤 몇 초째인지 — '42초', '2분 31초' (사용자 요청 2026-11-18) */
export const GAME_TIME_VERSION = 22;
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
  const ck = `${key}:${m.totalDays}:${day}:${ds ?? ''}`;
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
  if ((m.version ?? 1) >= 21) {
    const r2 = seeded(`${key}:sns21:${day}`);
    for (const n of m.news.filter((x) => x.day === day && x.at != null && !x.rumor && !x.fake && x.symbol)) {
      if (r2() > 0.7) continue;
      const name = STOCK_MAP[n.symbol!].name;
      const good = (n.realTone ?? n.tone) === 'good';
      const pf: Platform = (['square', 'board', 'chirp', 'talk'] as Platform[])[Math.floor(r2() * 4)];
      const lines = good
        ? [`방금 속보 봤음? ${name} 바로 튀어 오름 ㄷㄷ`, `${name} 속보 떴다!! 늦은 건가…`, `와 ${name} 실화냐 속보 보자마자 들어갈걸`]
        : [`방금 속보 봤음? ${name} 바로 고꾸라짐 ㅠㅠ`, `${name} 속보 떴다… 물린 사람 손`, `${name} 악재 속보 실화냐 손절각`];
      out.push({ id: `${day}-r${out.length}`, day, at: Math.min(0.99, n.at! + 0.01 + r2() * 0.04), platform: pf, author: NICKS[Math.floor(r2() * NICKS.length)], verified: null, text: lines[Math.floor(r2() * lines.length)], symbol: n.symbol!, sector: STOCK_MAP[n.symbol!].sector, tone: good ? 'good' : 'bad', target: { day, at: n.at! }, likes: Math.floor(30 + r2() * 600), replies: Math.floor(r2() * 120), real: true, hype: 0 });
    }
  }
  out.sort((a, b) => a.at - b.at);
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
      const out: PublicPost = { id: p.id, day: p.day, at: p.at, platform: p.platform, author: p.author, verified: p.verified, text: p.text, symbol: p.symbol, sector: p.sector, tone: p.tone, likes: p.likes, replies: p.replies };
      const revealed = today > Math.max(p.day, p.target.day);
      if (revealed || (pick !== undefined && pick === p.text && p.day === today)) out.verdict = p.real ? 'true' : 'false';
      return out;
    });
}
