/**
 * 메뉴·모드용 두 톤 아이콘 (32 격자). 알아볼 부분은 진한 색(currentColor), 큰 면은 미리 섞은 단색(--ic-2) —
 * 반투명을 쓰지 않아 바탕에 따라 색이 흔들리지 않음. 그라데이션·빛 번짐 없음.
 * 색은 감싼 칸의 CSS(color, --ic-2)로 정함. 기능 아이콘(화살표·닫기 등)은 Icon.tsx 그대로.
 */
import type { ReactNode } from 'react';

const T = { fill: 'var(--ic-2, #3a3a3a)' } as const;
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
/** 진한 색 위의 오려 낸 선 (배지 속 + 등) */
const CUT = '#141414';

const ICONS = {
  // 오늘의 도전: 달력 + 오르는 차트
  daily: (
    <>
      <rect x="4.5" y="7" width="23" height="21" rx="4.5" {...T} />
      <path d="M4.5 13V11.5A4.5 4.5 0 0 1 9 7h14a4.5 4.5 0 0 1 4.5 4.5V13z" fill="currentColor" />
      <path d="M11 4.5v5M21 4.5v5" {...S} />
      <path d="M9.5 23.5l4-4 3 2.5 6-6.5" {...S} />
      <path d="M19 15.5h3.5V19" {...S} />
    </>
  ),
  // 봇전: 개미 더듬이를 단 로봇 머리
  bot: (
    <>
      <rect x="6" y="11" width="20" height="16" rx="6" {...T} />
      <path d="M13 11L10 5M19 11l3-6" {...S} />
      <circle cx="9.8" cy="4.6" r="1.8" fill="currentColor" />
      <circle cx="22.2" cy="4.6" r="1.8" fill="currentColor" />
      <circle cx="12.5" cy="18.5" r="2.3" fill="currentColor" />
      <circle cx="19.5" cy="18.5" r="2.3" fill="currentColor" />
      <path d="M13.5 23h5" {...S} />
      <rect x="3" y="15.5" width="3" height="6" rx="1.5" fill="currentColor" />
      <rect x="26" y="15.5" width="3" height="6" rx="1.5" fill="currentColor" />
    </>
  ),
  // 혼자 연습: 과녁 + 화살
  practice: (
    <>
      <circle cx="15" cy="17" r="11" {...T} />
      <circle cx="15" cy="17" r="6.5" {...S} />
      <circle cx="15" cy="17" r="2.6" fill="currentColor" />
      <path d="M15 17l11-11" {...S} />
      <path d="M22 4.5v4.5h4.5M24.5 3v4.5H29" {...S} />
    </>
  ),
  // 튜토리얼: 화면 + 재생
  tutorial: (
    <>
      <rect x="3.5" y="5.5" width="25" height="17.5" rx="4" {...T} />
      <path d="M13.2 10.4v7.2a.8.8 0 0 0 1.2.7l6-3.6a.8.8 0 0 0 0-1.4l-6-3.6a.8.8 0 0 0-1.2.7z" fill="currentColor" />
      <path d="M16 23v4.5M11 27.5h10" {...S} />
    </>
  ),
  // 게임 방법: 규칙 책 + 물음표
  howto: (
    <>
      <rect x="6.5" y="4" width="20" height="24.5" rx="3.5" {...T} />
      <path d="M10 4.2h-.2A3.3 3.3 0 0 0 6.5 7.5v17.7a3.3 3.3 0 0 0 3.3 3.3h.2z" fill="currentColor" />
      <path d="M15 12.5a3.3 3.3 0 1 1 4.6 3c-1.1.5-1.8 1.3-1.8 2.5v.6" {...S} />
      <circle cx="17.8" cy="22.4" r="1.5" fill="currentColor" />
    </>
  ),
  // 공부: 펼친 책 + 차트
  study: (
    <>
      <path d="M16 8.5C12.5 6 8 5.6 3.5 6.5v18.5c4.5-.9 9-.5 12.5 2z" {...T} />
      <path d="M16 8.5c3.5-2.5 8-2.9 12.5-2v18.5c-4.5-.9-9-.5-12.5 2z" {...T} />
      <path d="M16 8.5v18.5" {...S} />
      <path d="M19 20l2.6-3.4 2.4 1.8 2.8-4.6" {...S} />
      <path d="M6.5 12.5c2.2-.3 4.4 0 6.5.8M6.5 17c2.2-.3 4.4 0 6.5.8" {...S} strokeWidth={2} />
    </>
  ),
  // 빠른 참가: 둥근 판 + 빨리 감기
  quick: (
    <>
      <circle cx="16" cy="16" r="12.5" {...T} />
      <path d="M9.5 10.5L15 16l-5.5 5.5M16.5 10.5L22 16l-5.5 5.5" {...S} strokeWidth={2.8} />
    </>
  ),
  // 방 만들기: 문 + 더하기 배지
  create: (
    <>
      <rect x="4.5" y="4" width="17" height="24" rx="3" {...T} />
      <path d="M4.5 28h17" {...S} />
      <circle cx="16.5" cy="16.5" r="1.6" fill="currentColor" />
      <circle cx="24" cy="22.5" r="6.5" fill="currentColor" />
      <path d="M24 19.5v6M21 22.5h6" stroke={CUT} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  // 방 찾기: 겹친 방 카드 + 돋보기
  rooms: (
    <>
      <rect x="3.5" y="5" width="18" height="12" rx="3" {...T} />
      <rect x="7" y="10" width="18" height="12" rx="3" {...T} />
      <circle cx="20" cy="19.5" r="5.5" {...T} />
      <circle cx="20" cy="19.5" r="5.5" {...S} />
      <path d="M24 23.5l4 4" {...S} strokeWidth={2.8} />
    </>
  ),
  // 코드로 입장: 열쇠
  code: (
    <>
      <circle cx="10.5" cy="16" r="6.5" {...T} />
      <circle cx="10.5" cy="16" r="6.5" {...S} />
      <circle cx="10.5" cy="16" r="2" fill="currentColor" />
      <path d="M17 16h11.5M23.5 16v4M27.5 16v3" {...S} />
    </>
  ),
  // 랭킹: 시상대 + 왕관
  ranking: (
    <>
      <rect x="3.5" y="18" width="8.5" height="10" rx="2" {...T} />
      <rect x="11.75" y="13" width="8.5" height="15" rx="2" fill="currentColor" />
      <rect x="20" y="21" width="8.5" height="7" rx="2" {...T} />
      <path d="M12.6 10.5l1-5 2.4 2.6 2.4-2.6 1 5z" fill="currentColor" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </>
  ),
  // 리그: 방패 + 올라가는 화살
  league: (
    <>
      <path d="M16 3.5l10.5 4v7.5c0 7-4.7 11.4-10.5 13.5C10.2 26.4 5.5 22 5.5 15V7.5z" {...T} />
      <path d="M16 3.5l10.5 4v7.5c0 7-4.7 11.4-10.5 13.5C10.2 26.4 5.5 22 5.5 15V7.5z" {...S} strokeWidth={2} />
      <path d="M11 18.5l5-5 5 5M11 23l5-5 5 5" {...S} />
    </>
  ),
  // 업적: 메달
  records: (
    <>
      <path d="M10 3.5l4 8M22 3.5l-4 8" {...S} strokeWidth={3} />
      <circle cx="16" cy="19.5" r="9" {...T} />
      <circle cx="16" cy="19.5" r="9" {...S} strokeWidth={2} />
      <path d="M16 14.2l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="currentColor" />
    </>
  ),
  // 설정: 톱니
  settings: (
    <>
      <path
        d="M14.2 3.5h3.6l.7 3.3 2.3 1 2.9-1.8 2.5 2.5-1.8 2.9 1 2.3 3.3.7v3.6l-3.3.7-1 2.3 1.8 2.9-2.5 2.5-2.9-1.8-2.3 1-.7 3.3h-3.6l-.7-3.3-2.3-1-2.9 1.8-2.5-2.5 1.8-2.9-1-2.3-3.3-.7v-3.6l3.3-.7 1-2.3-1.8-2.9 2.5-2.5 2.9 1.8 2.3-1z"
        {...T}
      />
      <path
        d="M14.2 3.5h3.6l.7 3.3 2.3 1 2.9-1.8 2.5 2.5-1.8 2.9 1 2.3 3.3.7v3.6l-3.3.7-1 2.3 1.8 2.9-2.5 2.5-2.9-1.8-2.3 1-.7 3.3h-3.6l-.7-3.3-2.3-1-2.9 1.8-2.5-2.5 1.8-2.9-1-2.3-3.3-.7v-3.6l3.3-.7 1-2.3-1.8-2.9 2.5-2.5 2.9 1.8 2.3-1z"
        {...S}
        strokeWidth={2}
      />
      <circle cx="16" cy="16" r="4" {...S} />
    </>
  ),
  // 랭킹전: 트로피
  ranked: (
    <>
      <path d="M9.5 4.5h13v8a6.5 6.5 0 0 1-13 0z" {...T} />
      <path d="M9.5 4.5h13v8a6.5 6.5 0 0 1-13 0z" {...S} strokeWidth={2} />
      <path d="M9.5 7.5H5.5v1.5a4.5 4.5 0 0 0 4.4 4.5M22.5 7.5h4v1.5a4.5 4.5 0 0 1-4.4 4.5" {...S} strokeWidth={2} />
      <path d="M16 19v4.5M10.5 27.5h11l-1.5-4h-8z" {...S} />
    </>
  ),
  // 일반전: 마주 선 두 개미(사람)
  casual: (
    <>
      <circle cx="10.5" cy="10" r="4.5" {...T} />
      <circle cx="21.5" cy="10" r="4.5" fill="currentColor" />
      <path d="M3 26.5a7.5 7.5 0 0 1 15 0z" {...T} />
      <path d="M14 26.5a7.5 7.5 0 0 1 15 0z" fill="currentColor" />
    </>
  ),
  // 커스텀: 문
  custom: (
    <>
      <rect x="7" y="4" width="18" height="24" rx="3" {...T} />
      <path d="M7 28h18" {...S} />
      <circle cx="20" cy="16.5" r="1.8" fill="currentColor" />
    </>
  ),
  // 친구: 사람 + 더하기
  friends: (
    <>
      <circle cx="13" cy="10" r="5" {...T} />
      <circle cx="13" cy="10" r="5" {...S} strokeWidth={2} />
      <path d="M4 27a9 9 0 0 1 18 0z" {...T} />
      <path d="M4 27a9 9 0 0 1 18 0" {...S} strokeWidth={2} />
      <path d="M25 9v8M21 13h8" {...S} />
    </>
  ),
  // 더보기: 네 칸
  more: (
    <>
      <rect x="4.5" y="4.5" width="9.5" height="9.5" rx="2.6" fill="currentColor" />
      <rect x="18" y="4.5" width="9.5" height="9.5" rx="2.6" {...T} />
      <rect x="4.5" y="18" width="9.5" height="9.5" rx="2.6" {...T} />
      <rect x="18" y="18" width="9.5" height="9.5" rx="2.6" {...T} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type GameIconName = keyof typeof ICONS;

export function GameIcon({ name, size = 28, className }: { name: GameIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" className={'gicon' + (className ? ' ' + className : '')}>
      {ICONS[name]}
    </svg>
  );
}

/** 칸 아이콘 색 (아이콘마다 하나, 바탕은 그 색을 옅게) */
export const GI_TONE: Record<GameIconName, string> = {
  daily: 'amber',
  bot: 'teal',
  practice: 'teal',
  tutorial: 'teal',
  howto: 'gray',
  study: 'green',
  quick: 'violet',
  create: 'green',
  rooms: 'slate',
  code: 'amber',
  ranking: 'yellow',
  league: 'yellow',
  records: 'amber',
  settings: 'gray',
  ranked: 'violet',
  casual: 'green',
  custom: 'slate',
  friends: 'violet',
  more: 'gray',
};

/** 색 바탕 칸에 담은 아이콘 (메뉴 칸·바로가기) */
export function GameIconTile({ name, size = 26 }: { name: GameIconName; size?: number }) {
  return (
    <i className={'gi-tile gi-' + GI_TONE[name]} aria-hidden>
      <GameIcon name={name} size={size} />
    </i>
  );
}
