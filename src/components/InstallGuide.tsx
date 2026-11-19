/**
 * '앱처럼 쓰기' 안내: 이 기기·브라우저에 맞는 '홈 화면에 추가' 방법을 그림으로(InstallArt.tsx).
 * 크롬·엣지·삼성 인터넷은 설치 창을 바로 띄우고, 아이폰 등은 브라우저 버튼이 있는 쪽을 화살표로 가리켜 줌
 */
import { useEffect, useState, type ReactNode } from 'react';
import { canPromptInstall, detectInstallEnv, kakaoExternalUrl, onInstallChange, promptInstall, type InstallEnv } from '../lib/install';
import { Icon } from './Icon';
import { IosShareListArt, IosShareMoreArt } from './InstallArtIos';
import { IosStep1, IosStep2, ChromeStep1, ChromeStep2, ChromeStep3, HomeStep, InAppStep1, InAppStep2, IosOtherStep1, IosStep4, IpadStep1, MacStep1, MacStep2, PcMenuStep, PcStep1, PcStep2, SamsungStep1, SamsungStep2, SamsungStep3 } from './InstallArt';

type GuideId = 'ios' | 'ios-other' | 'ipad' | 'android' | 'samsung' | 'inapp' | 'pc' | 'mac-safari' | 'none';

/* ---------- 기기별 단계 (그림은 InstallArt.tsx) ---------- */
interface Step {
  text: ReactNode;
  art: ReactNode;
}
const GUIDES: Record<Exclude<GuideId, 'none'>, { label: string; steps: Step[]; note?: string }> = {
  ios: {
    label: '아이폰 (Safari)',
    steps: [
      { text: <>주소창 오른쪽 <b>•••</b>을 눌러요</>, art: <IosStep1 /> },
      { text: <><b>공유</b>를 눌러요</>, art: <IosStep2 /> },
      { text: <>공유 창에서 <b>더 보기</b>를 눌러요</>, art: <IosShareMoreArt /> },
      { text: <><b>홈 화면에 추가</b>를 눌러요</>, art: <IosShareListArt /> },
      { text: <>오른쪽 위 <b>추가</b> — 끝!</>, art: <IosStep4 /> },
    ],
    note: "사파리가 아래 막대 모양이면 가운데 공유 버튼을 바로 눌러요. 목록에 '홈 화면에 추가'가 없으면 맨 아래 '동작 편집'에서 켜요.",
  },
  'ios-other': {
    label: '아이폰 (Chrome 등)',
    steps: [
      { text: <>주소창 오른쪽 <b>공유</b>를 눌러요</>, art: <IosOtherStep1 /> },
      { text: <><b>더 보기</b> → <b>홈 화면에 추가</b></>, art: <IosShareListArt /> },
      { text: <>오른쪽 위 <b>추가</b></>, art: <IosStep4 /> },
    ],
    note: "'홈 화면에 추가'가 없으면 Safari로 열어서 해요.",
  },
  ipad: {
    label: '아이패드 (Safari)',
    steps: [
      { text: <>오른쪽 위 <b>공유</b>를 눌러요</>, art: <IpadStep1 /> },
      { text: <><b>더 보기</b> → <b>홈 화면에 추가</b></>, art: <IosShareListArt /> },
      { text: <>오른쪽 위 <b>추가</b></>, art: <IosStep4 /> },
    ],
  },
  android: {
    label: '안드로이드 (Chrome)',
    steps: [
      { text: <>오른쪽 위 <b>⋮</b>을 눌러요</>, art: <ChromeStep1 /> },
      { text: <><b>홈 화면에 추가</b>를 눌러요</>, art: <ChromeStep2 /> },
      { text: <><b>설치</b>를 눌러요</>, art: <ChromeStep3 /> },
      { text: <>홈 화면 <b>개미리그</b>로 열어요</>, art: <HomeStep kind="android" /> },
    ],
    note: "새 Chrome 은 '설치 및 바로가기 만들기'예요. 갤럭시는 아이콘이 앱 목록에 먼저 생길 수 있어요. 주소창을 아래로 옮겼다면 아래 ⋮.",
  },
  samsung: {
    label: '갤럭시 (삼성 인터넷)',
    steps: [
      { text: <>오른쪽 아래 <b>≡</b>을 눌러요</>, art: <SamsungStep1 /> },
      { text: <><b>현재 페이지 추가</b></>, art: <SamsungStep2 /> },
      { text: <><b>홈 화면</b>을 골라요</>, art: <SamsungStep3 /> },
      { text: <>홈 화면 <b>개미리그</b>로 열어요</>, art: <HomeStep kind="android" /> },
    ],
    note: "'빠른 실행'은 홈 화면이 아니에요. 꼭 '홈 화면'을 골라요.",
  },
  inapp: {
    label: '카카오톡·네이버 앱 안',
    steps: [
      { text: <>앱 안 브라우저에선 안 돼요. 오른쪽 아래 <b>⋮</b>을 눌러요</>, art: <InAppStep1 /> },
      { text: <><b>다른 브라우저로 열기</b> → 그 브라우저 안내대로</>, art: <InAppStep2 /> },
    ],
    note: '아이폰 카카오톡은 오른쪽 아래 공유 버튼 → Safari 를 골라요.',
  },
  pc: {
    label: 'PC (Chrome·Edge)',
    steps: [
      { text: <>주소창 오른쪽 <b>설치</b> 아이콘을 눌러요</>, art: <PcStep1 /> },
      { text: <><b>설치</b>를 누르면 끝</>, art: <PcStep2 /> },
      { text: <>아이콘이 없으면 <b>⋮</b> → <b>전송, 저장, 공유</b> → <b>개미리그 설치</b></>, art: <PcMenuStep /> },
    ],
    note: 'Edge 는 ⋯ → 앱 → 이 사이트를 앱으로 설치예요.',
  },
  'mac-safari': {
    label: 'Mac (Safari)',
    steps: [
      { text: <>맨 위 <b>파일</b> → <b>Dock에 추가</b></>, art: <MacStep1 /> },
      { text: <><b>추가</b>를 눌러요</>, art: <MacStep2 /> },
    ],
  },
};

export function guideFor(env: InstallEnv): GuideId {
  if (env.browser === 'kakao' || env.browser === 'naver' || env.browser === 'inapp') return 'inapp';
  if (env.os === 'ios') return env.browser === 'safari' ? 'ios' : 'ios-other';
  if (env.os === 'ipados') return env.browser === 'safari' ? 'ipad' : 'ios-other';
  if (env.os === 'android') return env.browser === 'samsung' ? 'samsung' : 'android';
  if (env.os === 'mac' && env.browser === 'safari') return 'mac-safari';
  if (env.browser === 'firefox') return 'none'; // 안드로이드 파이어폭스는 위에서 안드로이드 안내로 (⋮ → 설치)
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
            <Icon name="check" size={14} /> <span>주소창 없이 <b>전체 화면</b>으로</span>
          </li>
          <li>
            <Icon name="check" size={14} /> <span>{env.os === 'mac' ? 'Dock·Launchpad에서' : env.os === 'windows' || env.os === 'other' ? '바탕화면·작업 표시줄에서' : '홈 화면에서'} <b>한 번에</b> 열기</span>
          </li>
          <li>
            <Icon name="check" size={14} /> <span>따로 내려받을 것 없음 (용량 거의 없음)</span>
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
          <button className="btn primary ig-one ig-glow" onClick={() => void promptInstall().then(setDone, () => {})}>
            앱으로 설치하기
          </button>
        ) : null}
        {env.browser === 'kakao' && !env.standalone && (
          <a className="btn ig-one" href={kakaoExternalUrl(location.origin + '/install')}>
            기본 브라우저로 열기
          </a>
        )}
        {mine === 'none' && <p className="muted small">PC 파이어폭스는 앱 설치가 안 돼요. Chrome·Edge 로 열어 주세요.</p>}
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

