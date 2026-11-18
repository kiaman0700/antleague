/**
 * '앱처럼 쓰기' 안내 (사용자 요청 2026-11-18): 이 기기·브라우저에 맞는 '홈 화면에 추가' 방법을 그림으로.
 * 그림은 실제 앱 화면을 베낀 것이 아니라 단순한 예시 — 누를 곳만 보라색 고리로 표시
 */
import { useEffect, useState, type ReactNode } from 'react';
import { canPromptInstall, detectInstallEnv, dismissInstallHint, installHintVisible, kakaoExternalUrl, onInstallChange, promptInstall, type InstallEnv } from '../lib/install';
import { currentDevice } from '../lib/device';
import { Icon } from './Icon';

type GuideId = 'ios' | 'ios-other' | 'ipad' | 'android' | 'samsung' | 'inapp' | 'pc' | 'mac-safari' | 'none';

const HL = '#8b7bff';
const INK = '#d8d8d8';
const DIM = '#5a5a5a';
const BG = '#1f1f1f';

/* ---------- 예시 그림 ---------- */
function Phone({ children, h = 150 }: { children: ReactNode; h?: number }) {
  return (
    <svg className="ig-art" viewBox={`0 0 120 ${h}`} role="img" aria-hidden>
      <rect x="2" y="2" width="116" height={h - 4} rx="16" fill="#151515" stroke="#3a3a3a" strokeWidth="2" />
      {children}
    </svg>
  );
}
const lines = (y: number, n = 4) =>
  Array.from({ length: n }, (_, i) => <rect key={i} x="14" y={y + i * 11} width={i % 2 ? 70 : 92} height="5" rx="2.5" fill="#2c2c2c" />);
const ring = (cx: number, cy: number, r = 9) => (
  <>
    <circle className="ig-pulse" cx={cx} cy={cy} r={r + 4} fill="none" stroke={HL} strokeWidth="1.5" opacity="0.5" />
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={HL} strokeWidth="2.2" />
  </>
);
/** 아이콘들: 공유(네모+위 화살표) · 점 세 개(가로/세로) · 줄 세 개 · 설치(모니터+아래 화살표) */
function Glyph({ k, x, y, c = INK }: { k: 'share' | 'dots' | 'kebab' | 'menu' | 'install'; x: number; y: number; c?: string }) {
  if (k === 'share')
    return (
      <g stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${x - 4} ${y - 1} v6 h8 v-6`} />
        <path d={`M${x} ${y + 2} v-9 M${x - 3} ${y - 4} l3 -3 l3 3`} />
      </g>
    );
  if (k === 'dots') return <g fill={c}>{[-5, 0, 5].map((d) => <circle key={d} cx={x + d} cy={y} r="1.6" />)}</g>;
  if (k === 'kebab') return <g fill={c}>{[-5, 0, 5].map((d) => <circle key={d} cx={x} cy={y + d} r="1.6" />)}</g>;
  if (k === 'menu') return <g stroke={c} strokeWidth="1.6" strokeLinecap="round">{[-4, 0, 4].map((d) => <path key={d} d={`M${x - 5} ${y + d} h10`} />)}</g>;
  return (
    <g stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x={x - 6} y={y - 5} width="12" height="8" rx="1.5" />
      <path d={`M${x} ${y - 3} v4 M${x - 2} ${y - 1} l2 2 l2 -2 M${x - 3} ${y + 6} h6`} />
    </g>
  );
}
/** 주소창이 위/아래에 있는 브라우저 + 누를 아이콘 */
function BarArt({ pos, icons, hl }: { pos: 'top' | 'bottom'; icons: ('share' | 'dots' | 'kebab' | 'menu')[]; hl: number }) {
  const y = pos === 'top' ? 26 : 122;
  const xs = icons.map((_, i) => 104 - (icons.length - 1 - i) * 16);
  return (
    <Phone>
      <rect x="10" y={y - 9} width={xs[0] - 22} height="18" rx="9" fill={BG} stroke="#333" />
      <text x="20" y={y + 3.5} fontSize="8" fill={DIM}>antleague.app</text>
      {icons.map((k, i) => (
        <Glyph key={i} k={k} x={xs[i]} y={y} c={i === hl ? HL : INK} />
      ))}
      {ring(xs[hl], y)}
      {lines(pos === 'top' ? 48 : 22, 6)}
    </Phone>
  );
}
/** 아래에서 올라온 목록 + 누를 줄 */
function SheetArt({ items, hl, title }: { items: string[]; hl: number; title?: string }) {
  const top = 150 - 14 - items.length * 20 - (title ? 14 : 0);
  return (
    <Phone>
      {lines(22, 5)}
      <rect x="6" y={top} width="108" height={150 - top - 6} rx="12" fill="#262626" stroke="#3a3a3a" />
      {title && (
        <text x="16" y={top + 13} fontSize="8" fill={DIM}>
          {title}
        </text>
      )}
      {items.map((t, i) => {
        const yy = top + (title ? 18 : 6) + i * 20;
        return (
          <g key={i}>
            {i === hl && <rect x="10" y={yy} width="100" height="17" rx="6" fill={HL} fillOpacity="0.22" stroke={HL} strokeWidth="1.6" />}
            <text x="18" y={yy + 11.5} fontSize="8.5" fontWeight={i === hl ? 800 : 500} fill={i === hl ? '#ffffff' : INK}>
              {t}
            </text>
          </g>
        );
      })}
    </Phone>
  );
}
/** 확인 창 (이름·스위치·버튼) */
function DialogArt({ button, toggle, title = '홈 화면에 추가' }: { button: string; toggle?: string; title?: string }) {
  return (
    <Phone>
      {lines(22, 8)}
      <rect x="0" y="0" width="120" height="150" rx="16" fill="#000" opacity="0.45" />
      <rect x="12" y="40" width="96" height={toggle ? 84 : 66} rx="10" fill="#262626" stroke="#3a3a3a" />
      <text x="60" y="56" fontSize="8.5" fontWeight="800" fill="#fff" textAnchor="middle">
        {title}
      </text>
      <image href="/brand/app-icon-192.png" x="20" y="62" width="16" height="16" />
      <text x="42" y="73" fontSize="8.5" fill={INK}>
        개미리그
      </text>
      {toggle && (
        <g>
          <text x="20" y="96" fontSize="7.5" fill={INK}>
            {toggle}
          </text>
          <rect x="84" y="89" width="16" height="9" rx="4.5" fill="#2fb36b" />
          <circle cx="95.5" cy="93.5" r="3.5" fill="#fff" />
        </g>
      )}
      <rect x="64" y={toggle ? 104 : 86} width="36" height="14" rx="7" fill={HL} />
      <text x="82" y={toggle ? 113.5 : 95.5} fontSize="8" fontWeight="800" fill="#fff" textAnchor="middle">
        {button}
      </text>
      {ring(82, toggle ? 111 : 93, 12)}
    </Phone>
  );
}
/** 끝: 홈 화면에 생긴 아이콘 */
function HomeArt() {
  return (
    <Phone>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={16 + (i % 4) * 23} y={24 + Math.floor(i / 4) * 28} width="17" height="17" rx="5" fill="#2a2a2a" />
      ))}
      <image href="/brand/app-icon-192.png" x="16" y="108" width="17" height="17" />
      {ring(24.5, 116.5, 12)}
      <text x="13" y="136" fontSize="6.5" fill={INK}>
        개미리그
      </text>
    </Phone>
  );
}
/** PC 브라우저: 주소창 오른쪽 설치 아이콘 */
function DeskArt() {
  return (
    <svg className="ig-art wide" viewBox="0 0 200 120" role="img" aria-hidden>
      <rect x="2" y="2" width="196" height="116" rx="10" fill="#151515" stroke="#3a3a3a" strokeWidth="2" />
      <rect x="10" y="12" width="150" height="16" rx="8" fill={BG} stroke="#333" />
      <text x="20" y="23.5" fontSize="8" fill={DIM}>antleague.vercel.app</text>
      <Glyph k="install" x={150} y={20} c={HL} />
      {ring(150, 20)}
      <Glyph k="kebab" x={180} y={20} />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x="14" y={42 + i * 13} width={i % 2 ? 120 : 170} height="6" rx="3" fill="#2c2c2c" />
      ))}
    </svg>
  );
}
function DeskMenuArt({ items, hl, title }: { items: string[]; hl: number; title: string }) {
  return (
    <svg className="ig-art wide" viewBox="0 0 200 120" role="img" aria-hidden>
      <rect x="2" y="2" width="196" height="116" rx="10" fill="#151515" stroke="#3a3a3a" strokeWidth="2" />
      <text x="14" y="16" fontSize="8.5" fontWeight="800" fill={HL}>
        {title}
      </text>
      <rect x="10" y="22" width="110" height={items.length * 18 + 8} rx="6" fill="#262626" stroke="#3a3a3a" />
      {items.map((t, i) => (
        <g key={i}>
          {i === hl && <rect x="14" y={26 + i * 18} width="102" height="15" rx="5" fill={HL} fillOpacity="0.22" stroke={HL} strokeWidth="1.5" />}
          <text x="20" y={36.5 + i * 18} fontSize="8.5" fontWeight={i === hl ? 800 : 500} fill={i === hl ? '#fff' : INK}>
            {t}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** PC 확인 창 */
function DeskDialogArt({ title, button }: { title: string; button: string }) {
  return (
    <svg className="ig-art wide" viewBox="0 0 200 120" role="img" aria-hidden>
      <rect x="2" y="2" width="196" height="116" rx="10" fill="#151515" stroke="#3a3a3a" strokeWidth="2" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x="14" y={42 + i * 13} width={i % 2 ? 120 : 170} height="6" rx="3" fill="#2c2c2c" />
      ))}
      <rect x="2" y="2" width="196" height="116" rx="10" fill="#000" opacity="0.4" />
      <rect x="40" y="22" width="150" height="70" rx="8" fill="#262626" stroke="#3a3a3a" />
      <text x="52" y="38" fontSize="9" fontWeight="800" fill="#fff">
        {title}
      </text>
      <image href="/brand/app-icon-192.png" x="52" y="46" width="16" height="16" />
      <text x="74" y="57.5" fontSize="8.5" fill={INK}>
        개미리그
      </text>
      <rect x="138" y="70" width="42" height="15" rx="7.5" fill={HL} />
      <text x="159" y="80.5" fontSize="8" fontWeight="800" fill="#fff" textAnchor="middle">
        {button}
      </text>
      {ring(159, 77.5, 13)}
    </svg>
  );
}

/* ---------- 기기별 단계 ---------- */
interface Step {
  text: ReactNode;
  art: ReactNode;
}
const GUIDES: Record<Exclude<GuideId, 'none'>, { label: string; steps: Step[]; note?: string }> = {
  ios: {
    label: '아이폰 (Safari)',
    steps: [
      { text: <>주소창 옆 <b>⋯</b>(더 보기)이나 <b>공유</b> 버튼을 눌러요</>, art: <BarArt pos="bottom" icons={['share', 'dots']} hl={1} /> },
      { text: <>메뉴에서 <b>공유</b> → 목록을 내려 <b>홈 화면에 추가</b>를 눌러요</>, art: <SheetArt title="공유" items={['복사', '즐겨찾기에 추가', '읽기 목록에 추가', '홈 화면에 추가']} hl={3} /> },
      { text: <><b>웹 앱으로 열기</b>가 켜진 그대로 <b>추가</b>를 눌러요</>, art: <DialogArt button="추가" toggle="웹 앱으로 열기" /> },
      { text: <>홈 화면의 <b>개미리그</b> 아이콘으로 열면 주소창 없이 앱처럼 열려요</>, art: <HomeArt /> },
    ],
    note: 'iOS 버전에 따라 공유 버튼이 주소창 옆에 바로 있거나 ⋯ 안에 있어요.',
  },
  'ios-other': {
    label: '아이폰 (Chrome 등)',
    steps: [
      { text: <>주소창 오른쪽 <b>공유</b> 버튼을 눌러요</>, art: <BarArt pos="top" icons={['share', 'dots']} hl={0} /> },
      { text: <>목록에서 <b>홈 화면에 추가</b>를 눌러요</>, art: <SheetArt items={['복사', '읽기 목록', '홈 화면에 추가']} hl={2} /> },
      { text: <><b>추가</b>를 누르면 끝이에요</>, art: <DialogArt button="추가" /> },
      { text: <>홈 화면의 <b>개미리그</b> 아이콘으로 열어요</>, art: <HomeArt /> },
    ],
    note: '공유 메뉴에 \'홈 화면에 추가\'가 없으면 Safari로 열어서 해 주세요.',
  },
  ipad: {
    label: '아이패드 (Safari)',
    steps: [
      { text: <>주소창 오른쪽 <b>공유</b> 버튼(네모에 위 화살표)을 눌러요</>, art: <BarArt pos="top" icons={['share', 'dots']} hl={0} /> },
      { text: <><b>홈 화면에 추가</b>를 눌러요</>, art: <SheetArt title="공유" items={['복사', '즐겨찾기에 추가', '홈 화면에 추가']} hl={2} /> },
      { text: <><b>웹 앱으로 열기</b>가 켜진 그대로 <b>추가</b></>, art: <DialogArt button="추가" toggle="웹 앱으로 열기" /> },
      { text: <>홈 화면 아이콘으로 열면 끝</>, art: <HomeArt /> },
    ],
  },
  android: {
    label: '안드로이드 (Chrome)',
    steps: [
      { text: <>오른쪽 위 <b>⋮</b> 메뉴를 눌러요</>, art: <BarArt pos="top" icons={['kebab']} hl={0} /> },
      { text: <><b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 눌러요</>, art: <SheetArt items={['새 탭', '방문 기록', '홈 화면에 추가', '설정']} hl={2} /> },
      { text: <><b>설치</b>를 눌러요</>, art: <DialogArt button="설치" title="앱 설치" /> },
      { text: <>홈 화면·앱 목록의 <b>개미리그</b>로 열어요</>, art: <HomeArt /> },
    ],
  },
  samsung: {
    label: '갤럭시 (삼성 인터넷)',
    steps: [
      { text: <>오른쪽 아래 <b>≡</b> 메뉴를 눌러요</>, art: <BarArt pos="bottom" icons={['menu']} hl={0} /> },
      { text: <><b>현재 페이지 추가</b>를 눌러요</>, art: <SheetArt items={['북마크', '현재 페이지 추가', '방문 기록', '설정']} hl={1} /> },
      { text: <><b>홈 화면</b>을 고르고 <b>추가</b></>, art: <SheetArt title="추가할 곳" items={['북마크', '빠른 실행', '홈 화면']} hl={2} /> },
      { text: <>홈 화면의 <b>개미리그</b> 아이콘으로 열어요</>, art: <HomeArt /> },
    ],
    note: '주소창에 설치(↓) 아이콘이 보이면 그걸 눌러도 돼요.',
  },
  inapp: {
    label: '카카오톡·네이버 앱 안',
    steps: [
      { text: <>앱 안의 브라우저에서는 추가가 안 돼요. 오른쪽 위(또는 아래) <b>⋮</b> 메뉴를 눌러요</>, art: <BarArt pos="top" icons={['share', 'kebab']} hl={1} /> },
      { text: <><b>다른 브라우저로 열기</b>를 눌러 Safari·Chrome·삼성 인터넷으로 연 다음, 그 브라우저 안내대로 해요</>, art: <SheetArt items={['새로고침', '링크 복사', '다른 브라우저로 열기']} hl={2} /> },
    ],
  },
  pc: {
    label: 'PC (Chrome·Edge)',
    steps: [
      { text: <>주소창 오른쪽 <b>설치</b> 아이콘(모니터에 ↓)을 눌러요</>, art: <DeskArt /> },
      { text: <>아이콘이 없으면 <b>⋮</b>(Edge는 <b>⋯</b>) 메뉴 → <b>전송, 저장, 공유</b> → <b>페이지를 앱으로 설치</b> (Edge: <b>앱</b> → <b>이 사이트를 앱으로 설치</b>)</>, art: <DeskMenuArt title="⋮ 메뉴" items={['새 탭', '방문 기록', '전송, 저장, 공유 ›', '설정']} hl={2} /> },
      { text: <><b>설치</b>를 누르면 바탕화면·시작 메뉴에 생기고 따로 창으로 열려요</>, art: <DeskDialogArt button="설치" title="앱을 설치할까요?" /> },
    ],
  },
  'mac-safari': {
    label: 'Mac (Safari)',
    steps: [
      { text: <>맨 위 메뉴 <b>파일</b> → <b>Dock에 추가</b>를 눌러요</>, art: <DeskMenuArt title="파일" items={['새로운 윈도우', '공유', 'Dock에 추가']} hl={2} /> },
      { text: <><b>추가</b>를 누르면 Dock에서 앱처럼 열려요</>, art: <DeskDialogArt button="추가" title="Dock에 추가" /> },
    ],
  },
};

export function guideFor(env: InstallEnv): GuideId {
  if (env.browser === 'kakao' || env.browser === 'naver' || env.browser === 'inapp') return 'inapp';
  if (env.os === 'ios') return env.browser === 'safari' ? 'ios' : 'ios-other';
  if (env.os === 'ipados') return env.browser === 'safari' ? 'ipad' : 'ios-other';
  if (env.os === 'android') return env.browser === 'samsung' ? 'samsung' : 'android';
  if (env.os === 'mac' && env.browser === 'safari') return 'mac-safari';
  if (env.browser === 'firefox') return 'none';
  return 'pc';
}
const ORDER: Exclude<GuideId, 'none'>[] = ['ios', 'samsung', 'android', 'ipad', 'ios-other', 'pc', 'mac-safari', 'inapp'];

export function InstallGuide() {
  const [env] = useState(() => detectInstallEnv());
  const mine = guideFor(env);
  const [sel, setSel] = useState<Exclude<GuideId, 'none'>>(mine === 'none' ? 'pc' : mine);
  const [can, setCan] = useState(canPromptInstall);
  const [done, setDone] = useState(false);
  useEffect(() => onInstallChange(() => setCan(canPromptInstall())), []);
  const g = GUIDES[sel];
  return (
    <div className="install-guide">
      <section className="panel pad ig-why">
        <ul>
          <li>
            <Icon name="check" size={14} /> 주소창 없이 <b>전체 화면</b>으로
          </li>
          <li>
            <Icon name="check" size={14} /> 홈 화면에서 <b>한 번에</b> 열기
          </li>
          <li>
            <Icon name="check" size={14} /> 따로 내려받을 것 없음 (용량 거의 없음)
          </li>
        </ul>
        {env.standalone ? (
          <p className="ig-ok">
            <Icon name="check" size={16} /> 지금 앱으로 쓰고 있어요
          </p>
        ) : done ? (
          <p className="ig-ok">
            <Icon name="check" size={16} /> 설치했어요! 홈 화면(PC는 바탕화면)의 개미리그로 열어 주세요
          </p>
        ) : can ? (
          <button className="btn primary ig-one" onClick={() => promptInstall().then(setDone)}>
            앱으로 설치하기
          </button>
        ) : null}
        {env.browser === 'kakao' && !env.standalone && (
          <a className="btn ig-one" href={kakaoExternalUrl(location.origin + '/install')}>
            기본 브라우저로 열기
          </a>
        )}
        {mine === 'none' && <p className="muted small">이 브라우저(Firefox)는 앱 설치를 지원하지 않아요. Chrome·Edge·Safari로 열어 주세요.</p>}
      </section>
      <section className="panel pad">
        <h3>
          {sel === mine ? '이 기기에서 하는 방법' : '다른 기기에서 하는 방법'} · {g.label}
        </h3>
        <div className="ig-chips" role="tablist" aria-label="기기 고르기">
          {ORDER.map((id) => (
            <button key={id} role="tab" aria-selected={sel === id} className={'chip' + (sel === id ? ' on' : '')} onClick={() => setSel(id)}>
              {GUIDES[id].label}
              {id === mine && <em> · 지금 기기</em>}
            </button>
          ))}
        </div>
        <ol className="ig-steps">
          {g.steps.map((s, i) => (
            <li key={sel + i}>
              {s.art}
              <div className="ig-text">
                <span className="ig-n">{i + 1}</span>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {g.note && <p className="muted small ig-note">{g.note}</p>}
      </section>
    </div>
  );
}

/** 로비 위 한 줄 안내 (휴대폰·태블릿, 아직 앱으로 안 쓸 때, 닫으면 다시 안 나옴) */
export function InstallHint({ onOpen }: { onOpen: () => void }) {
  const [show, setShow] = useState(() => installHintVisible(detectInstallEnv(), currentDevice()));
  if (!show) return null;
  return (
    <div className="ig-hint" role="note">
      <img src="/brand/app-icon-192.png" alt="" width="28" height="28" />
      <button className="ig-hint-go" onClick={onOpen}>
        <b>홈 화면에 추가하면 앱처럼 쓸 수 있어요</b>
        <small>기기에 맞는 방법을 그림으로 알려 드려요</small>
      </button>
      <button className="ig-hint-x" aria-label="안내 닫기" onClick={() => (dismissInstallHint(), setShow(false))}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
