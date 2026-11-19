/**
 * 아이폰 공유 창 그림 (iOS 26 실제 화면 기준):
 * 공유 창 = 위 사이트 이름·옵션 → 앱 줄 → 둥근 버튼 4개(복사·북마크에 추가·읽기 목록에 추가·더 보기 ⌄) → '더 보기'를 누르면 목록(… 맨 아래 '홈 화면에 추가')
 * 사파리 모양(한 줄 주소창·아래 막대)과 상관없이 우리 '공유 창 열기' 버튼으로 같은 창이 뜸
 */
import type { ReactNode } from 'react';

const HL = '#8b7bff';
const INK = '#d8d8d8';
const DIM = '#6a6a6a';
const W = 120;
const H = 240;
const ring = (cx: number, cy: number, r = 9) => (
  <>
    <circle className="ig-pulse" cx={cx} cy={cy} r={r + 4} fill="none" stroke={HL} strokeWidth="1.5" opacity="0.55" />
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={HL} strokeWidth="2.2" />
  </>
);
function Frame({ children }: { children: ReactNode }) {
  return (
    <svg className="ig-art" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="#141414" stroke="#3a3a3a" strokeWidth="2" />
      <text x="14" y="16" fontSize="7" fontWeight="700" fill={INK}>
        9:41
      </text>
      <rect x="44" y="8" width="32" height="10" rx="5" fill="#000" />
      {children}
    </svg>
  );
}
const appIcon = (x: number, y: number, s: number) => <image href="/brand/app-icon-192.png" x={x} y={y} width={s} height={s} />;
/** 공유 창 위쪽 (사이트 이름 + 옵션 + 앱 줄) */
function SheetTop({ y }: { y: number }) {
  return (
    <g>
      <rect x="4" y={y} width={W - 8} height={H - y - 4} rx="14" fill="#232323" />
      <rect x="12" y={y + 8} width="18" height="18" rx="4" fill="#111" />
      {appIcon(13, y + 9, 16)}
      <text x="35" y={y + 15} fontSize="5.6" fontWeight="700" fill="#fff">
        개미리그 — 모의 주식 대결
      </text>
      <text x="35" y={y + 22} fontSize="5" fill={DIM}>
        antleague.vercel.app
      </text>
      <rect x="35" y={y + 25} width="22" height="8" rx="4" fill="#333" />
      <text x="46" y={y + 30.6} fontSize="4.6" fill={INK} textAnchor="middle">
        옵션 ›
      </text>
      {['#2f7cf6', '#3fc45a', '#3a8ef7', '#f2f2f2'].map((c, i) => (
        <rect key={i} x={14 + i * 25} y={y + 40} width="17" height="17" rx="4.5" fill={c} />
      ))}
    </g>
  );
}

/** 1단계: 우리 화면의 '공유 창 열기' */
export function IosShareBtnArt() {
  return (
    <Frame>
      <rect x="10" y="40" width="100" height="62" rx="10" fill="#1d1d1d" stroke="#2e2e2e" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="18" y={50 + i * 9} width={i === 2 ? 60 : 80} height="4" rx="2" fill="#2c2c2c" />
      ))}
      <rect x="18" y="80" width="84" height="15" rx="7.5" fill="#6b58ee" />
      <text x="60" y="90" fontSize="6.8" fontWeight="800" fill="#fff" textAnchor="middle">
        공유 창 열기
      </text>
      {ring(60, 87.5, 12)}
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x="12" y={116 + i * 12} width={i % 2 ? 66 : 96} height="5" rx="2.5" fill="#2a2a2a" />
      ))}
    </Frame>
  );
}

/** 2단계: 공유 창 둥근 버튼 줄의 '더 보기' */
export function IosShareMoreArt() {
  const y = 96;
  const labels = ['복사', '북마크', '읽기 목록', '더 보기'];
  return (
    <Frame>
      <rect x="0" y="0" width={W} height={H} rx="18" fill="#000" opacity="0.3" />
      <SheetTop y={y} />
      {labels.map((t, i) => {
        const cx = 22.5 + i * 25;
        const cy = y + 84;
        const on = i === 3;
        return (
          <g key={t}>
            <circle cx={cx} cy={cy} r="9" fill="#333" />
            {on ? <path d={`M${cx - 4} ${cy - 2} l4 4 l4 -4`} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" /> : <circle cx={cx} cy={cy} r="2.5" fill="none" stroke={INK} strokeWidth="1" />}
            <text x={cx} y={cy + 17} fontSize="5" fontWeight={on ? 800 : 500} fill={on ? '#fff' : INK} textAnchor="middle">
              {t}
            </text>
            {on && ring(cx, cy, 10)}
          </g>
        );
      })}
    </Frame>
  );
}

/** 3단계: 펼친 목록 맨 아래 '홈 화면에 추가' */
export function IosShareListArt() {
  const items = ['북마크를 추가할 폴더…', '즐겨찾기에 추가', '빠른 메모에 추가', '페이지에서 찾기', '홈 화면에 추가'];
  const y = 70;
  return (
    <Frame>
      <rect x="4" y="24" width={W - 8} height={H - 28} rx="14" fill="#232323" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={22.5 + i * 25} cy="44" r="8" fill="#333" />
      ))}
      <rect x="9" y={y - 6} width={W - 18} height={items.length * 19 + 8} rx="10" fill="#333" />
      {items.map((t, i) => {
        const on = i === items.length - 1;
        const ty = y + 8 + i * 19;
        return (
          <g key={t}>
            {on && <rect x="12" y={ty - 9} width={W - 24} height="15" rx="6" fill={HL} fillOpacity="0.25" stroke={HL} strokeWidth="1.5" />}
            {on ? <rect x="17" y={ty - 6} width="8" height="8" rx="2" fill="none" stroke="#fff" strokeWidth="1" /> : <circle cx="21" cy={ty - 2} r="3" fill="none" stroke={INK} strokeWidth="0.9" />}
            {on && <path d={`M21 ${ty - 4.5} v5 M18.5 ${ty - 2} h5`} stroke="#fff" strokeWidth="0.9" />}
            <text x="30" y={ty + 0.5} fontSize="6.2" fontWeight={on ? 800 : 500} fill={on ? '#fff' : INK}>
              {t}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}
