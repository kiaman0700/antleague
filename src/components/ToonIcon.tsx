/**
 * 토스식 '내용' 아이콘 (48 격자): 여러 색 + 옅은 그라데이션 + 빛 반사 + 작은 그림자, 뒤 바탕 칸 없음.
 * 메뉴 칸·바로가기·연속 기록 불꽃·오늘의 시장 테마에 씀. 탭바·메뉴 줄 같은 작은 기능 아이콘은 Icon.tsx(한 색) 그대로.
 * 그라데이션 id 는 아이콘마다 useId 로 따로 — 한 화면에 여러 개 있어도 섞이지 않게.
 */
import { useId, type ReactNode } from 'react';

type G = (k: GradKey) => string;
type GradKey = 'w' | 'r' | 'b' | 'v' | 'g' | 'n' | 'd' | 'o' | 'y' | 't' | 'p' | 'k';

const GRADS: Record<GradKey, [string, string]> = {
  w: ['#ffffff', '#dfe3ea'], // 흰 종이
  r: ['#ff7a7a', '#e5484d'], // 빨강
  b: ['#5aa1ff', '#2f6fe0'], // 파랑
  v: ['#b6aaff', '#7a69f0'], // 보라(브랜드)
  g: ['#ffd76a', '#f0a92e'], // 금
  n: ['#5fe0a0', '#22b36d'], // 초록
  d: ['#3a3d4f', '#25273a'], // 짙은 남색
  o: ['#ffb547', '#ff5a2b'], // 불꽃 바깥
  y: ['#fff4a3', '#ffc93d'], // 불꽃 안쪽
  t: ['#6ee8e1', '#16b3c0'], // 청록
  p: ['#ffb3c8', '#ff7aa2'], // 분홍
  k: ['#6b7090', '#3a3e55'], // 석유 (어두운 바탕에서도 보이게 밝힌 남색)
};

const shadow = <ellipse cx="24" cy="44.6" rx="14" ry="2" fill="#000" opacity=".32" />;
const shine = (d: string) => <path d={d} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" />;

const ART: Record<string, (c: G) => ReactNode> = {
  // 오늘의 도전: 달력 + 오르는 차트
  daily: (c) => (
    <>
      {shadow}
      <rect x="6" y="9" width="36" height="33" rx="8" fill={c('w')} />
      <path d="M6 18v-1a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v1z" fill={c('r')} />
      <rect x="14" y="5" width="4" height="9" rx="2" fill={c('d')} />
      <rect x="30" y="5" width="4" height="9" rx="2" fill={c('d')} />
      <path d="M13 34l7-7 5 4 9-10" fill="none" stroke={c('b')} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="34" cy="21" r="3.2" fill={c('b')} />
      {shine('M11 13.2h9')}
    </>
  ),
  // 봇전: 개미 더듬이 로봇
  bot: (c) => (
    <>
      {shadow}
      <path d="M19 15L14 6M29 15l5-9" stroke={c('d')} strokeWidth="3" strokeLinecap="round" />
      <circle cx="13.5" cy="5.5" r="3.2" fill={c('y')} />
      <circle cx="34.5" cy="5.5" r="3.2" fill={c('p')} />
      <rect x="5" y="22" width="5" height="10" rx="2.5" fill={c('v')} />
      <rect x="38" y="22" width="5" height="10" rx="2.5" fill={c('v')} />
      <rect x="8" y="14" width="32" height="27" rx="11" fill={c('v')} />
      <rect x="13" y="20" width="22" height="14" rx="7" fill={c('d')} />
      <circle cx="19.5" cy="27" r="3" fill={c('t')} />
      <circle cx="28.5" cy="27" r="3" fill={c('t')} />
      {shine('M13.5 17.6c2-1.4 5-2 9-2')}
    </>
  ),
  // 혼자 연습: 과녁 + 다트
  practice: (c) => (
    <>
      {shadow}
      <circle cx="22" cy="25" r="18" fill={c('w')} />
      <circle cx="22" cy="25" r="13" fill={c('r')} />
      <circle cx="22" cy="25" r="8.5" fill={c('w')} />
      <circle cx="22" cy="25" r="4.2" fill={c('r')} />
      <path d="M22 25L38 9" stroke={c('d')} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M33.5 4.5l2.3 6.2 6.2 2.3-5.7 1.1-1.4 5.6-2.3-6.2-6.1-2.3 5.6-1.1z" fill={c('b')} />
    </>
  ),
  // 튜토리얼: 화면 + 재생
  tutorial: (c) => (
    <>
      {shadow}
      <rect x="4" y="7" width="40" height="28" rx="7" fill={c('d')} />
      <rect x="7.5" y="10.5" width="33" height="21" rx="4" fill={c('t')} />
      <path d="M21 15.6v10.8a1.2 1.2 0 0 0 1.8 1l9-5.4a1.2 1.2 0 0 0 0-2l-9-5.4a1.2 1.2 0 0 0-1.8 1z" fill="#fff" />
      <rect x="20" y="35" width="8" height="5" fill={c('d')} />
      <rect x="13" y="39" width="22" height="4" rx="2" fill={c('d')} />
      {shine('M11 14.5h7')}
    </>
  ),
  // 게임 방법: 책 + 물음표 + 책갈피
  howto: (c) => (
    <>
      {shadow}
      <rect x="9" y="5" width="31" height="37" rx="5" fill={c('b')} />
      <path d="M35 5h1a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4h-1z" fill={c('w')} />
      <path d="M14 5v16l4-3 4 3V5z" fill={c('r')} />
      <path d="M21.5 22.5a5 5 0 1 1 7 4.6c-1.6.8-2.5 1.8-2.5 3.4v.8" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="26" cy="36" r="2.2" fill="#fff" />
    </>
  ),
  // 공부: 펼친 책 + 차트
  study: (c) => (
    <>
      {shadow}
      <path d="M24 12c-5-4-12-5-19-3.5v29c7-1.5 14-.5 19 3.5z" fill={c('w')} />
      <path d="M24 12c5-4 12-5 19-3.5v29c-7-1.5-14-.5-19 3.5z" fill={c('w')} />
      <path d="M4 10v30c7.5-1.6 14.5-.6 20 3.6 5.5-4.2 12.5-5.2 20-3.6V10" fill="none" stroke={c('n')} strokeWidth="3" strokeLinejoin="round" />
      <path d="M28 31l4-5 4 3 4.5-7" fill="none" stroke={c('r')} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 18c3.5-.6 7-.3 10.5 1M9 24c3.5-.6 7-.3 10.5 1" stroke="#b9c0cc" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  // 빠른 참가: 번개
  quick: (c) => (
    <>
      {shadow}
      <path d="M28.5 3.5L10 27h12l-3.5 17.5L38 19H26z" fill={c('g')} />
      <path d="M28.5 3.5L10 27h12l-3.5 17.5L38 19H26z" fill="none" stroke="#e08a12" strokeWidth="1.4" strokeLinejoin="round" />
      {shine('M24.5 10.5l-6.5 8.5')}
    </>
  ),
  // 방 만들기: 문 + 더하기
  create: (c) => (
    <>
      {shadow}
      <rect x="8" y="5" width="26" height="37" rx="5" fill={c('v')} />
      <rect x="12" y="9" width="18" height="33" rx="3" fill={c('d')} />
      <circle cx="25.5" cy="26" r="2.2" fill={c('y')} />
      <circle cx="35" cy="34" r="10" fill={c('n')} />
      <path d="M35 29v10M30 34h10" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </>
  ),
  // 방 찾기: 방 카드 + 돋보기
  rooms: (c) => (
    <>
      {shadow}
      <rect x="4" y="7" width="28" height="20" rx="5" fill={c('w')} opacity=".7" />
      <rect x="8" y="13" width="28" height="20" rx="5" fill={c('w')} />
      <rect x="12" y="18" width="12" height="3.5" rx="1.75" fill="#b9c0cc" />
      <rect x="12" y="24.5" width="8" height="3.5" rx="1.75" fill="#cfd5de" />
      <circle cx="32" cy="31" r="8" fill="#bfe0ff" />
      <circle cx="32" cy="31" r="8" fill="none" stroke={c('b')} strokeWidth="3.6" />
      <path d="M38 37l5 5" stroke={c('d')} strokeWidth="4.4" strokeLinecap="round" />
      {shine('M28.5 27.5a4.5 4.5 0 0 1 3.5-1.5')}
    </>
  ),
  // 코드로 입장: 열쇠
  code: (c) => (
    <>
      {shadow}
      <path d="M22 22h20v6h-4v5h-5v-5h-11z" fill={c('g')} />
      <circle cx="15" cy="25" r="10.5" fill={c('g')} />
      <circle cx="15" cy="25" r="4" fill={c('d')} />
      {shine('M9 20.5a7 7 0 0 1 5-3.2')}
    </>
  ),
  // 랭킹전: 트로피
  ranked: (c) => (
    <>
      {shadow}
      <path d="M13 6h22v13a11 11 0 0 1-22 0z" fill={c('g')} />
      <path d="M13 10H7v3a7.5 7.5 0 0 0 7.2 7.5M35 10h6v3a7.5 7.5 0 0 1-7.2 7.5" fill="none" stroke={c('g')} strokeWidth="3.4" />
      <rect x="21" y="29" width="6" height="7" fill={c('g')} />
      <rect x="13" y="35" width="22" height="7" rx="3" fill={c('d')} />
      <path d="M24 11.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#fff6d6" />
      {shine('M16.5 9.5v8')}
    </>
  ),
  // 연속 기록: 불꽃
  flame: (c) => (
    <>
      {shadow}
      <path d="M24 3c2 7 11 11 11 22a11 11 0 0 1-22 0c0-5 2.5-8 5-10 0 4 1.5 6 3.5 7-1-6 1-13 2.5-19z" fill={c('o')} />
      <path d="M24 22c1 3.5 6 5.5 6 11a6 6 0 0 1-12 0c0-3 1.5-4.5 3-5.5.2 1.8.9 2.9 1.8 3.5-.4-3.4.2-6.6 1.2-9z" fill={c('y')} />
      {shine('M17.5 25c-.5 2-.4 4 .3 6')}
    </>
  ),
  // 오늘의 시장 테마들
  pump: (c) => (
    <>
      {shadow}
      <path d="M24 3c6 4 9 11 9 19v9H15v-9c0-8 3-15 9-19z" fill={c('w')} />
      <path d="M15 24l-6 6v6h6zM33 24l6 6v6h-6z" fill={c('r')} />
      <circle cx="24" cy="17" r="4" fill={c('b')} />
      <path d="M18 31h12l-2.5 8h-7z" fill={c('d')} />
      <path d="M20.5 39c0 3 1.5 5 3.5 6 2-1 3.5-3 3.5-6z" fill={c('o')} />
      {shine('M19 12c.8-2.4 2-4.4 3.5-6')}
    </>
  ),
  // 미국: 펄럭이는 성조기 (빨강·흰 줄 + 파란 칸의 흰 별)
  usa: (c) => (
    <>
      {shadow}
      <rect x="7.6" y="6" width="3.2" height="38" rx="1.6" fill={c('d')} />
      <circle cx="9.2" cy="5.4" r="3" fill={c('g')} />
      <path d="M12 9.00C20 4.50 28 13.50 42 8.00L42 33.00C28 38.50 20 29.50 12 34.00Z" fill={c('w')} />
      <path d="M12 9.00C20 4.50 28 13.50 42 8.00L42 11.57C28 17.07 20 8.07 12 12.57Z" fill={c('r')} />
      <path d="M12 16.14C20 11.64 28 20.64 42 15.14L42 18.71C28 24.21 20 15.21 12 19.71Z" fill={c('r')} />
      <path d="M12 23.29C20 18.79 28 27.79 42 22.29L42 25.86C28 31.36 20 22.36 12 26.86Z" fill={c('r')} />
      <path d="M12 30.43C20 25.93 28 34.93 42 29.43L42 33.00C28 38.50 20 29.50 12 34.00Z" fill={c('r')} />
      <path d="M12 9 L13.26 8.40 L14.53 8.00 L15.80 7.77 L17.10 7.69 L18.41 7.74 L19.75 7.89 L21.12 8.12 L22.52 8.40 L22.52 22.69 L21.12 22.40 L19.75 22.18 L18.41 22.03 L17.10 21.98 L15.80 22.05 L14.53 22.28 L13.26 22.68 L12.00 23.29Z" fill={c('b')} />
      <circle cx="13.78" cy="11.19" r="1.15" fill="#fff" />
      <circle cx="16.79" cy="10.67" r="1.15" fill="#fff" />
      <circle cx="19.91" cy="10.89" r="1.15" fill="#fff" />
      <circle cx="13.78" cy="15.15" r="1.15" fill="#fff" />
      <circle cx="16.79" cy="14.64" r="1.15" fill="#fff" />
      <circle cx="19.91" cy="14.86" r="1.15" fill="#fff" />
      <circle cx="13.78" cy="19.12" r="1.15" fill="#fff" />
      <circle cx="16.79" cy="18.61" r="1.15" fill="#fff" />
      <circle cx="19.91" cy="18.83" r="1.15" fill="#fff" />
      {shine('M30 9.8c3-1.6 6.6-2.4 10.4-2.2')}
    </>
  ),
  war: (c) => (
    <>
      {shadow}
      <path d="M24 4c5 7 13 15 13 24a13 13 0 0 1-26 0c0-9 8-17 13-24z" fill={c('k')} />
      <path d="M17 27a7 7 0 0 0 4 7" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M31 9l3-5 3 5" fill="none" stroke={c('r')} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 5v10" stroke={c('r')} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  delist: (c) => (
    <>
      {shadow}
      <path d="M21 6.5a3.5 3.5 0 0 1 6 0l17 29.5a3.5 3.5 0 0 1-3 5.3H7a3.5 3.5 0 0 1-3-5.3z" fill={c('g')} />
      <path d="M24 17v11" stroke={c('d')} strokeWidth="4" strokeLinecap="round" />
      <circle cx="24" cy="34" r="2.6" fill={c('d')} />
      {shine('M19.5 12.5l-4 7')}
    </>
  ),
  rate: (c) => (
    <>
      {shadow}
      <circle cx="24" cy="24" r="19" fill={c('b')} />
      <circle cx="24" cy="24" r="15" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.6" />
      <path d="M17 31l14-14" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="18.5" cy="18.5" r="3.2" fill="#fff" />
      <circle cx="29.5" cy="29.5" r="3.2" fill="#fff" />
      {shine('M12 17a13 13 0 0 1 6-6')}
    </>
  ),
  binary: (c) => (
    <>
      {shadow}
      <path d="M9.5 31.5l13-13 8 8-13 13a5.66 5.66 0 0 1-8-8z" fill={c('w')} />
      <path d="M22.5 18.5l7-7a5.66 5.66 0 0 1 8 8l-7 7z" fill={c('r')} />
      <circle cx="37" cy="36" r="6" fill={c('n')} />
      <path d="M34.2 36l2 2 3.6-4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {shine('M26.5 13.5l3-3')}
    </>
  ),
  short: (c) => (
    <>
      {shadow}
      <path d="M10 4h20l8 8v29a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z" fill={c('w')} />
      <path d="M30 4v8h8" fill="#cfd5de" />
      <path d="M13 15h11M13 21h15" stroke="#b9c0cc" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 27l6 6 4-4 8 8" fill="none" stroke={c('b')} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 37h6v-6" fill="none" stroke={c('b')} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  rights: (c) => (
    <>
      {shadow}
      <ellipse cx="20" cy="36" rx="13" ry="5" fill="#d08a14" />
      <rect x="7" y="27" width="26" height="9" fill={c('g')} />
      <ellipse cx="20" cy="27" rx="13" ry="5" fill="#ffe08a" />
      <ellipse cx="20" cy="22" rx="13" ry="5" fill="#d08a14" />
      <rect x="7" y="13" width="26" height="9" fill={c('g')} />
      <ellipse cx="20" cy="13" rx="13" ry="5" fill="#ffe08a" />
      <circle cx="36" cy="12" r="9" fill={c('n')} />
      <path d="M36 7.5v9M31.5 12h9" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  // 찬스 카드 12종 (card_ + 종류)
  card_paper: (c) => (
    <>
      {shadow}
      <rect x="4" y="7" width="34" height="34" rx="5" fill={c('w')} />
      <path d="M4 15v-3a5 5 0 0 1 5-5h24a5 5 0 0 1 5 5v3z" fill={c('r')} />
      <rect x="9" y="20" width="12" height="9" rx="2" fill="#b9c0cc" />
      <path d="M25 21h8M25 26h8M9 34h16" stroke="#b9c0cc" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="37" cy="35" r="9" fill={c('b')} />
      <path d="M37 30v5.5l3.5 2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  card_analyst: (c) => (
    <>
      {shadow}
      <rect x="4" y="6" width="40" height="30" rx="6" fill={c('d')} />
      <rect x="7.5" y="9.5" width="33" height="23" rx="3.5" fill={c('w')} />
      <path d="M12 27l7-7 5 4 10-10" fill="none" stroke={c('r')} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 13.5h6.5V20" fill="none" stroke={c('r')} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="20" y="36" width="8" height="4" fill={c('d')} />
      <rect x="14" y="39.5" width="20" height="3.5" rx="1.75" fill={c('d')} />
    </>
  ),
  card_scout: (c) => (
    <>
      {shadow}
      <rect x="5" y="24" width="8" height="18" rx="2.5" fill={c('v')} />
      <rect x="16" y="15" width="8" height="27" rx="2.5" fill={c('b')} />
      <rect x="27" y="29" width="8" height="13" rx="2.5" fill={c('v')} />
      <circle cx="33" cy="15" r="8" fill="#d8ecff" />
      <circle cx="33" cy="15" r="8" fill="none" stroke={c('d')} strokeWidth="3.4" />
      <path d="M38.5 20.5l5 5" stroke={c('d')} strokeWidth="4.2" strokeLinecap="round" />
    </>
  ),
  card_detector: (c) => (
    <>
      {shadow}
      <circle cx="20" cy="20" r="14" fill="#d8ecff" />
      <circle cx="20" cy="20" r="14" fill="none" stroke={c('b')} strokeWidth="4" />
      <path d="M13.5 20.5l4.5 4.5 8.5-9" fill="none" stroke={c('n')} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30.5 30.5l11 11" stroke={c('d')} strokeWidth="5.4" strokeLinecap="round" />
      {shine('M12 13a10 10 0 0 1 5-3.5')}
    </>
  ),
  card_spy: (c) => (
    <>
      {shadow}
      <path d="M3 24C8 14 15.5 9 24 9s16 5 21 15c-5 10-12.5 15-21 15S8 34 3 24z" fill={c('w')} />
      <circle cx="24" cy="24" r="10" fill={c('b')} />
      <circle cx="24" cy="24" r="5" fill={c('d')} />
      <circle cx="27.5" cy="20.5" r="2.4" fill="#fff" />
    </>
  ),
  card_freeze: (c) => (
    <>
      {shadow}
      <path d="M24 3l17 10v21L24 44 7 34V13z" fill={c('t')} />
      <path d="M24 12v24M13.6 18l20.8 12M13.6 30l20.8-12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M20.5 13.5L24 16.5l3.5-3M20.5 34.5l3.5-3 3.5 3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {shine('M11 15.5l6-3.5')}
    </>
  ),
  card_fake: (c) => (
    <>
      {shadow}
      <path d="M7 19h6l17-10v30L13 29H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z" fill={c('r')} />
      <path d="M13 29l2.5 10h5L18 29z" fill={c('d')} />
      <rect x="29" y="7" width="5" height="34" rx="2.5" fill={c('d')} />
      <path d="M38 18c2 1.6 3 3.6 3 6s-1 4.4-3 6" fill="none" stroke={c('g')} strokeWidth="3" strokeLinecap="round" />
      {shine('M8 22.5h5')}
    </>
  ),
  card_fee: (c) => (
    <>
      {shadow}
      <circle cx="21" cy="28" r="15" fill={c('d')} />
      <rect x="26" y="9" width="8" height="7" rx="2" transform="rotate(35 30 12.5)" fill={c('d')} />
      <path d="M33 9c2-3 5-3.5 7-2" fill="none" stroke="#b9c0cc" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M42 3.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill={c('g')} />
      <path d="M14.5 23l2.5 10 4-7 4 7 2.5-10M13.5 28h15" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {shine('M12 21a11 11 0 0 1 5-5')}
    </>
  ),
  card_blackout: (c) => (
    <>
      {shadow}
      <path d="M3 24C8 14 15.5 9 24 9s16 5 21 15c-5 10-12.5 15-21 15S8 34 3 24z" fill={c('k')} />
      <circle cx="24" cy="24" r="8" fill={c('d')} />
      <path d="M8 8l32 32" stroke={c('r')} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  card_shield: (c) => (
    <>
      {shadow}
      <path d="M24 4l16 6v11c0 11-7 17.5-16 21C15 38.5 8 32 8 21V10z" fill={c('n')} />
      <path d="M17 23.5l5 5 10-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {shine('M13 13l6-2.2')}
    </>
  ),
  card_mirror: (c) => (
    <>
      {shadow}
      <ellipse cx="24" cy="21" rx="13" ry="17" fill={c('g')} />
      <ellipse cx="24" cy="21" rx="9.5" ry="13.5" fill="#cfeffd" />
      <rect x="21.5" y="37" width="5" height="7" rx="1.5" fill={c('g')} />
      <path d="M18 17.5h11M25.5 14l3.5 3.5-3.5 3.5" fill="none" stroke={c('b')} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 25.5H19M22.5 22l-3.5 3.5 3.5 3.5" fill="none" stroke={c('r')} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  card_bonus: (c) => (
    <>
      {shadow}
      <rect x="6" y="10" width="36" height="30" rx="5" fill={c('r')} />
      <path d="M6 15l18 12 18-12" fill="none" stroke="#c22e3c" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="24" cy="27" r="7.5" fill={c('g')} />
      <path d="M21 25l1.5 5 1.5-3.5 1.5 3.5 1.5-5" fill="none" stroke="#a5650e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {shine('M10 14.5h8')}
    </>
  ),
};

export type ToonName = keyof typeof ART;
export const hasToon = (n: string): n is ToonName => n in ART;

export function ToonIcon({ name, size = 40, className, title }: { name: ToonName; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const c: G = (k) => `url(#${id}${k})`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={'toon' + (className ? ' ' + className : '')} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} focusable="false">
      <defs>
        {(Object.keys(GRADS) as GradKey[]).map((k) => (
          <linearGradient key={k} id={id + k} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={GRADS[k][0]} />
            <stop offset="1" stopColor={GRADS[k][1]} />
          </linearGradient>
        ))}
      </defs>
      {ART[name](c)}
    </svg>
  );
}
