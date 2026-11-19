/**
 * '앱처럼 쓰기' 단계 그림.
 * 기기별 실제 화면 배치를 따라 단순하게 다시 그림 — 아이폰 iOS 26 기본(아래 떠 있는 주소창 + 오른쪽 •••),
 * 안드로이드 Chrome(위 주소창 + ⋮, 메뉴 위 아이콘 줄), 삼성 인터넷(아래 도구 막대 + ≡, 아이콘 격자 메뉴), PC(주소창 안 설치 아이콘 + 말풍선).
 * 실제 앱의 로고·그림을 베끼지 않고 배치만 흉내 냄. 누를 곳은 보라 고리
 */
import type { ReactNode } from 'react';

const HL = '#8b7bff';
const INK = '#d8d8d8';
const DIM = '#6a6a6a';
const SURF = '#232323';
const SURF2 = '#2c2c2c';
const W = 120;
const H = 240;

const ring = (cx: number, cy: number, r = 9) => (
  <>
    <circle className="ig-pulse" cx={cx} cy={cy} r={r + 4} fill="none" stroke={HL} strokeWidth="1.5" opacity="0.55" />
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={HL} strokeWidth="2.2" />
  </>
);
const page = (y0: number, y1: number) =>
  Array.from({ length: Math.max(0, Math.floor((y1 - y0) / 12)) }, (_, i) => <rect key={i} x="12" y={y0 + i * 12} width={i % 3 === 1 ? 68 : 96} height="5" rx="2.5" fill="#2a2a2a" />);

/** 휴대폰 틀 (아이폰은 위 가운데 섬, 안드로이드는 작은 구멍) */
function Frame({ kind, children }: { kind: 'ios' | 'android'; children: ReactNode }) {
  return (
    <svg className="ig-art" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="18" fill="#141414" stroke="#3a3a3a" strokeWidth="2" />
      <text x="14" y="16" fontSize="7" fontWeight="700" fill={INK}>
        9:41
      </text>
      {kind === 'ios' ? <rect x="44" y="8" width="32" height="10" rx="5" fill="#000" /> : <circle cx="60" cy="12" r="3" fill="#000" />}
      {children}
    </svg>
  );
}
function Wide({ children }: { children: ReactNode }) {
  return (
    <svg className="ig-art wide" viewBox="0 0 220 140" role="img" aria-hidden>
      <rect x="2" y="2" width="216" height="136" rx="10" fill="#141414" stroke="#3a3a3a" strokeWidth="2" />
      {children}
    </svg>
  );
}
const appIcon = (x: number, y: number, s: number) => <image href="/brand/app-icon-192.png" x={x} y={y} width={s} height={s} />;
const dots = (cx: number, cy: number, c = INK, vertical = false) => (
  <g fill={c}>
    {[-4.5, 0, 4.5].map((d) => (
      <circle key={d} cx={vertical ? cx : cx + d} cy={vertical ? cy + d : cy} r="1.5" />
    ))}
  </g>
);
const shareIcon = (x: number, y: number, c = INK) => (
  <g stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={`M${x - 4} ${y - 1} v6 h8 v-6`} />
    <path d={`M${x} ${y + 2} v-9 M${x - 3} ${y - 4} l3 -3 l3 3`} />
  </g>
);
const lines3 = (cx: number, cy: number, c = INK) => (
  <g stroke={c} strokeWidth="1.6" strokeLinecap="round">
    {[-4, 0, 4].map((d) => (
      <path key={d} d={`M${cx - 5} ${cy + d} h10`} />
    ))}
  </g>
);
function Row({ x, y, w, text, on, icon }: { x: number; y: number; w: number; text: string; on?: boolean; icon?: ReactNode }) {
  return (
    <g>
      {on && <rect x={x - 2} y={y - 9} width={w + 4} height="15" rx="5" fill={HL} fillOpacity="0.22" stroke={HL} strokeWidth="1.5" />}
      <text x={x + 4} y={y + 1.5} fontSize="7.5" fontWeight={on ? 800 : 500} fill={on ? '#fff' : INK}>
        {text}
      </text>
      {icon}
    </g>
  );
}

/* ================= 아이폰 (iOS 26 기본: 아래 떠 있는 주소창) ================= */
function IosBar({ hl }: { hl?: boolean }) {
  const y = 214;
  return (
    <g>
      <circle cx="17" cy={y} r="9" fill={SURF2} />
      <path d={`M19 ${y - 4} l-4 4 l4 4`} stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="30" y={y - 9} width="62" height="18" rx="9" fill={SURF2} />
      <text x="61" y={y + 2.5} fontSize="6.5" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      <circle cx="103" cy={y} r="9" fill={SURF2} />
      {dots(103, y, hl ? HL : INK)}
      {hl && ring(103, y, 10)}
    </g>
  );
}
export function IosStep1() {
  return (
    <Frame kind="ios">
      {page(28, 196)}
      <IosBar hl />
    </Frame>
  );
}
/** 아이폰 '아래 막대' 모양(설정 → Safari → 탭 '아래'): 주소 줄 + 그 아래 버튼 줄, 공유는 가운데 */
export function IosClassicStep1() {
  return (
    <Frame kind="ios">
      {page(28, 172)}
      <rect x="4" y="178" width={W - 8} height="54" rx="14" fill={SURF} />
      <rect x="10" y="183" width={W - 20} height="16" rx="8" fill={SURF2} />
      {lines3(18, 191, INK)}
      <text x="60" y="194" fontSize="6.5" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      <path d="M104 187 a4 4 0 1 0 2 4" fill="none" stroke={INK} strokeWidth="1.2" />
      {/* 아래 버튼 줄: ‹ › 공유 책 탭 */}
      <path d="M20 211 l-4 4 l4 4" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M40 211 l4 4 l-4 4" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {shareIcon(60, 216, HL)}
      {ring(60, 214, 9)}
      <path d="M76 210 q5 -2 5 1 v9 q-5 -3 -5 -1 Z M86 210 q-5 -2 -5 1 v9 q5 -3 5 -1 Z" fill="none" stroke={INK} strokeWidth="1.1" />
      <rect x="98" y="210" width="9" height="9" rx="2" fill="none" stroke={INK} strokeWidth="1.2" />
      <rect x="100.5" y="207.5" width="9" height="9" rx="2" fill="none" stroke={INK} strokeWidth="1.2" />
    </Frame>
  );
}
export function IosStep2() {
  const items = ['북마크 추가', '새로운 탭', '탭 모두 보기'];
  return (
    <Frame kind="ios">
      {page(28, 196)}
      <rect x="0" y="0" width={W} height={H} rx="18" fill="#000" opacity="0.35" />
      <rect x="40" y="128" width="72" height="72" rx="12" fill={SURF} stroke="#3a3a3a" />
      <Row x={46} y={142} w={60} text="공유" on icon={shareIcon(100, 141, '#fff')} />
      {items.map((t, i) => (
        <Row key={t} x={46} y={160 + i * 14} w={60} text={t} />
      ))}
      <IosBar />
    </Frame>
  );
}
export function IosStep3() {
  const acts = ['복사', '읽기 목록에 추가', '즐겨찾기에 추가', '홈 화면에 추가'];
  return (
    <Frame kind="ios">
      {page(28, 70)}
      <rect x="4" y="74" width={W - 8} height={H - 78} rx="14" fill={SURF} />
      {appIcon(12, 84, 16)}
      <text x="33" y="91" fontSize="7.5" fontWeight="700" fill="#fff">
        개미리그
      </text>
      <text x="33" y="99" fontSize="6" fill={DIM}>
        antleague.vercel.app
      </text>
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={22 + i * 25} cy="120" r="9" fill={SURF2} />
      ))}
      <rect x="10" y="138" width={W - 20} height="88" rx="9" fill={SURF2} />
      {acts.map((t, i) => (
        <Row key={t} x={14} y={153 + i * 20} w={W - 28} text={t} on={i === 3} icon={i === 3 ? <rect x="96" y={i * 20 + 147} width="9" height="9" rx="2" fill="none" stroke="#fff" strokeWidth="1.2" /> : undefined} />
      ))}
    </Frame>
  );
}
export function IosStep4() {
  return (
    <Frame kind="ios">
      <rect x="4" y="26" width={W - 8} height={H - 30} rx="14" fill={SURF} />
      <text x="14" y="42" fontSize="7.5" fill={INK}>
        취소
      </text>
      <text x="56" y="42" fontSize="6.8" fontWeight="800" fill="#fff" textAnchor="middle">
        홈 화면에 추가
      </text>
      <text x="105" y="42" fontSize="7.5" fontWeight="800" fill={HL} textAnchor="end">
        추가
      </text>
      {ring(98.5, 39.5, 8)}
      <rect x="10" y="54" width={W - 20} height="38" rx="8" fill={SURF2} />
      {appIcon(16, 60, 26)}
      <text x="48" y="70" fontSize="7.5" fontWeight="700" fill="#fff">
        개미리그
      </text>
      <text x="48" y="81" fontSize="6" fill={DIM}>
        antleague.vercel.app
      </text>
      <rect x="10" y="100" width={W - 20} height="20" rx="8" fill={SURF2} />
      <text x="16" y="112.5" fontSize="7" fill={INK}>
        웹 앱으로 열기
      </text>
      <rect x="86" y="105" width="18" height="10" rx="5" fill="#2fb36b" />
      <circle cx="98.5" cy="110" r="4" fill="#fff" />
    </Frame>
  );
}
export function HomeStep({ kind }: { kind: 'ios' | 'android' }) {
  return (
    <Frame kind={kind}>
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={13 + (i % 4) * 25} y={34 + Math.floor(i / 4) * 32} width="19" height="19" rx={kind === 'ios' ? 5 : 9.5} fill="#2a2a2a" />
      ))}
      {appIcon(13, 162, 19)}
      {ring(22.5, 171.5, 13)}
      <text x="22.5" y="192" fontSize="6" fill={INK} textAnchor="middle">
        개미리그
      </text>
    </Frame>
  );
}
/** 아이폰 다른 브라우저(Chrome 등): 위 주소창 오른쪽 공유 */
export function IosOtherStep1() {
  return (
    <Frame kind="ios">
      <rect x="10" y="24" width="82" height="16" rx="8" fill={SURF2} />
      <text x="51" y="35" fontSize="6.5" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      {shareIcon(104, 33, HL)}
      {ring(104, 32, 9)}
      {page(50, 200)}
    </Frame>
  );
}
/** 아이패드: 위 오른쪽 공유 버튼 */
export function IpadStep1() {
  return (
    <Wide>
      <rect x="60" y="12" width="100" height="16" rx="8" fill={SURF2} />
      <text x="110" y="23" fontSize="7" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      {shareIcon(176, 21, HL)}
      {ring(176, 20, 9)}
      <text x="196" y="23" fontSize="8" fill={INK}>
        ＋
      </text>
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x="16" y={42 + i * 14} width={i % 2 ? 120 : 186} height="6" rx="3" fill="#2a2a2a" />
      ))}
    </Wide>
  );
}

/* ================= 안드로이드 Chrome (위 주소창 + ⋮) ================= */
function ChromeTop({ hl }: { hl?: boolean }) {
  return (
    <g>
      <path d="M12 31 l5 -5 l5 5 v6 h-10 Z" fill="none" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="27" y="22" width="58" height="16" rx="8" fill={SURF2} />
      <text x="56" y="32.5" fontSize="5" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      <rect x="90" y="25" width="10" height="10" rx="2.5" fill="none" stroke={INK} strokeWidth="1.3" />
      <text x="95" y="32.5" fontSize="6" fill={INK} textAnchor="middle">
        1
      </text>
      {dots(109, 30, hl ? HL : INK, true)}
      {hl && ring(109, 30, 9)}
    </g>
  );
}
export function ChromeStep1() {
  return (
    <Frame kind="android">
      <ChromeTop hl />
      {page(48, 220)}
    </Frame>
  );
}
export function ChromeStep2() {
  const items = ['새 탭', '새 시크릿 탭', '방문 기록', '다운로드', '북마크', '공유…', '페이지에서 찾기', '홈 화면에 추가'];
  return (
    <Frame kind="android">
      <ChromeTop />
      {page(48, 220)}
      <rect x="30" y="22" width="86" height="194" rx="10" fill={SURF} stroke="#3a3a3a" />
      {/* 위 아이콘 줄 (앞으로·북마크·다운로드·정보·새로고침) */}
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={40 + i * 16} cy="35" r="4" fill="none" stroke={INK} strokeWidth="1.1" />
      ))}
      <path d="M32 46 h82" stroke="#3a3a3a" />
      {items.map((t, i) => (
        <Row key={t} x={34} y={60 + i * 19} w={76} text={t} on={i === items.length - 1} />
      ))}
    </Frame>
  );
}
export function ChromeStep3() {
  return (
    <Frame kind="android">
      <ChromeTop />
      {page(48, 220)}
      <rect x="0" y="0" width={W} height={H} rx="18" fill="#000" opacity="0.45" />
      <rect x="12" y="84" width="96" height="72" rx="14" fill={SURF} />
      <text x="20" y="100" fontSize="8" fontWeight="800" fill="#fff">
        앱 설치
      </text>
      {appIcon(20, 108, 16)}
      <text x="42" y="116" fontSize="7" fill="#fff">
        개미리그
      </text>
      <text x="42" y="124" fontSize="5.5" fill={DIM}>
        antleague.vercel.app
      </text>
      <text x="62" y="146" fontSize="7.5" fill={INK}>
        취소
      </text>
      <text x="88" y="146" fontSize="7.5" fontWeight="800" fill={HL}>
        설치
      </text>
      {ring(95, 143.5, 10)}
    </Frame>
  );
}

/* ================= 삼성 인터넷 (아래 도구 막대 + ≡) ================= */
function SamsungBar({ hl }: { hl?: boolean }) {
  const y = 218;
  return (
    <g>
      <rect x="2" y="204" width={W - 4} height="30" fill={SURF} />
      {[15, 32].map((x, i) => (
        <path key={x} d={i ? `M${x - 2} ${y - 4} l4 4 l-4 4` : `M${x + 2} ${y - 4} l-4 4 l4 4`} stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      ))}
      <path d={`M${50} ${y + 4} v-5 l5 -4 l5 4 v5 Z`} fill="none" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d={`M${73} ${y - 5} l1.6 3.4 l3.6 .4 l-2.7 2.4 l.8 3.6 l-3.3 -1.9 l-3.3 1.9 l.8 -3.6 l-2.7 -2.4 l3.6 -.4 Z`} fill="none" stroke={INK} strokeWidth="1" />
      <rect x="85" y={y - 5} width="10" height="10" rx="2.5" fill="none" stroke={INK} strokeWidth="1.2" />
      {lines3(106, y, hl ? HL : INK)}
      {hl && ring(106, y, 9)}
      <rect x="10" y="22" width="100" height="16" rx="8" fill={SURF2} />
      <text x="60" y="33" fontSize="6" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
    </g>
  );
}
export function SamsungStep1() {
  return (
    <Frame kind="android">
      {page(48, 196)}
      <SamsungBar hl />
    </Frame>
  );
}
export function SamsungStep2() {
  const cells = ['북마크', '방문 기록', '다운로드', '현재 페이지 추가', '저장된 페이지', '광고 차단', '설정', '종료'];
  return (
    <Frame kind="android">
      {page(48, 120)}
      <rect x="4" y="112" width={W - 8} height="92" rx="12" fill={SURF} />
      {cells.map((t, i) => {
        const cx = 18 + (i % 4) * 28;
        const cy = 130 + Math.floor(i / 4) * 36;
        const on = i === 3;
        return (
          <g key={t}>
            <circle cx={cx} cy={cy} r="8" fill={on ? HL : SURF2} fillOpacity={on ? 0.35 : 1} stroke={on ? HL : 'none'} strokeWidth="1.5" />
            {(on ? ['현재 페이지', '추가'] : [t.length > 6 ? t.slice(0, 5) + '…' : t]).map((line, k) => (
              <text key={k} x={cx} y={cy + 16 + k * 6.5} fontSize="5.4" fontWeight={on ? 800 : 500} fill={on ? '#fff' : INK} textAnchor="middle">
                {line}
              </text>
            ))}
            {on && ring(cx, cy, 8.5)}
          </g>
        );
      })}
      <SamsungBar />
    </Frame>
  );
}
export function SamsungStep3() {
  return (
    <Frame kind="android">
      {page(48, 120)}
      <rect x="0" y="0" width={W} height={H} rx="18" fill="#000" opacity="0.35" />
      <rect x="4" y="120" width={W - 8} height="84" rx="12" fill={SURF} />
      <text x="12" y="136" fontSize="7.5" fontWeight="800" fill="#fff">
        현재 페이지 추가
      </text>
      {['북마크', '빠른 실행', '홈 화면'].map((t, i) => (
        <Row key={t} x={12} y={154 + i * 18} w={W - 24} text={t} on={i === 2} />
      ))}
      <SamsungBar />
    </Frame>
  );
}

/* ================= 카카오톡·네이버 앱 안 ================= */
export function InAppStep1() {
  // 카카오톡(안드로이드): 위엔 닫기·주소, 아래 도구 막대 오른쪽 ⋮
  return (
    <Frame kind="android">
      <text x="14" y="34" fontSize="8" fill={INK}>
        ✕
      </text>
      <text x="60" y="34" fontSize="6.5" fill={INK} textAnchor="middle">
        antleague.vercel.app
      </text>
      {page(48, 196)}
      <rect x="2" y="204" width={W - 4} height="30" fill={SURF} />
      {[16, 34].map((x, k) => (
        <path key={x} d={k ? `M${x - 2} 214 l4 4 l-4 4` : `M${x + 2} 214 l-4 4 l4 4`} stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      ))}
      {shareIcon(84, 220)}
      {dots(104, 218, HL, true)}
      {ring(104, 218, 9)}
    </Frame>
  );
}
export function InAppStep2() {
  return (
    <Frame kind="android">
      {page(48, 120)}
      <rect x="4" y="132" width={W - 8} height="72" rx="12" fill={SURF} />
      {['새로고침', '링크 복사', '다른 브라우저로 열기'].map((t, i) => (
        <Row key={t} x={12} y={150 + i * 18} w={W - 24} text={t} on={i === 2} />
      ))}
    </Frame>
  );
}

/* ================= PC ================= */
function DeskChrome({ bubble }: { bubble?: boolean }) {
  return (
    <Wide>
      <rect x="8" y="8" width="60" height="12" rx="4" fill={SURF2} />
      <text x="16" y="17" fontSize="6.5" fill={INK}>
        개미리그
      </text>
      <rect x="8" y="24" width="168" height="14" rx="7" fill={SURF2} />
      <text x="18" y="33.5" fontSize="6.5" fill={INK}>
        antleague.vercel.app
      </text>
      {/* 주소창 안 오른쪽 설치 아이콘 (모니터 + 아래 화살표) */}
      <g stroke={HL} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="156" y="26.5" width="11" height="7.5" rx="1.5" />
        <path d="M161.5 28 v3.5 M159.8 30 l1.7 1.7 l1.7 -1.7" />
      </g>
      {!bubble && ring(161.5, 31, 9)}
      {dots(204, 31, INK, true)}
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x="14" y={50 + i * 13} width={i % 2 ? 110 : 190} height="6" rx="3" fill="#2a2a2a" />
      ))}
      {bubble && (
        <g>
          <rect x="96" y="42" width="116" height="62" rx="8" fill={SURF} stroke="#3a3a3a" />
          <text x="104" y="56" fontSize="7.5" fontWeight="800" fill="#fff">
            앱을 설치하시겠습니까?
          </text>
          {appIcon(104, 62, 14)}
          <text x="123" y="72" fontSize="7" fill={INK}>
            개미리그
          </text>
          <rect x="150" y="84" width="26" height="13" rx="6.5" fill={HL} />
          <text x="163" y="93" fontSize="7" fontWeight="800" fill="#fff" textAnchor="middle">
            설치
          </text>
          <text x="194" y="93" fontSize="7" fill={INK} textAnchor="middle">
            취소
          </text>
          {ring(163, 90.5, 12)}
        </g>
      )}
    </Wide>
  );
}
export const PcStep1 = () => <DeskChrome />;
export const PcStep2 = () => <DeskChrome bubble />;
export function PcMenuStep() {
  const items = ['새 탭', '새 창', '방문 기록', '전송, 저장, 공유  ›', '설정'];
  return (
    <Wide>
      <rect x="8" y="24" width="168" height="14" rx="7" fill={SURF2} />
      {dots(204, 31, HL, true)}
      <rect x="110" y="40" width="104" height={items.length * 15 + 10} rx="8" fill={SURF} stroke="#3a3a3a" />
      {items.map((t, i) => (
        <Row key={t} x={116} y={54 + i * 15} w={90} text={t} on={i === 3} />
      ))}
    </Wide>
  );
}
export function MacStep1() {
  const items = ['새로운 윈도우', '새로운 탭', '공유', 'Dock에 추가…'];
  return (
    <Wide>
      <rect x="2" y="2" width="216" height="14" rx="0" fill={SURF2} />
      <text x="12" y="12" fontSize="7" fontWeight="800" fill="#fff">
        Safari
      </text>
      <text x="44" y="12" fontSize="7" fontWeight="800" fill={HL}>
        파일
      </text>
      <text x="70" y="12" fontSize="7" fill={INK}>
        편집 · 보기 · 방문 기록
      </text>
      <rect x="40" y="18" width="104" height={items.length * 15 + 8} rx="7" fill={SURF} stroke="#3a3a3a" />
      {items.map((t, i) => (
        <Row key={t} x={46} y={31 + i * 15} w={92} text={t} on={i === 3} />
      ))}
    </Wide>
  );
}
export function MacStep2() {
  return (
    <Wide>
      <rect x="50" y="24" width="120" height="84" rx="10" fill={SURF} stroke="#3a3a3a" />
      <text x="110" y="40" fontSize="8" fontWeight="800" fill="#fff" textAnchor="middle">
        Dock에 추가
      </text>
      {appIcon(98, 48, 24)}
      <text x="110" y="82" fontSize="7" fill={INK} textAnchor="middle">
        개미리그
      </text>
      <rect x="126" y="90" width="34" height="13" rx="6.5" fill={HL} />
      <text x="143" y="99" fontSize="7" fontWeight="800" fill="#fff" textAnchor="middle">
        추가
      </text>
      {ring(143, 96.5, 12)}
    </Wide>
  );
}
