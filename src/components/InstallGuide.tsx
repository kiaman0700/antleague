/**
 * '앱처럼 쓰기' 안내 (사용자 요청 2026-11-18·19): 이 기기·브라우저에 맞는 '홈 화면에 추가' 방법을 그림으로(InstallArt.tsx).
 * 크롬·엣지·삼성 인터넷은 설치 창을 바로 띄우고, 아이폰 등은 브라우저 버튼이 있는 쪽을 화살표로 가리켜 줌
 */
import { useEffect, useState, type ReactNode } from 'react';
import { canPromptInstall, detectInstallEnv, kakaoExternalUrl, onInstallChange, promptInstall, type InstallEnv } from '../lib/install';
import { Icon } from './Icon';
import { IosClassicStep1, ChromeStep1, ChromeStep2, ChromeStep3, HomeStep, InAppStep1, InAppStep2, IosOtherStep1, IosStep3, IosStep4, IpadStep1, MacStep1, MacStep2, PcMenuStep, PcStep1, PcStep2, SamsungStep1, SamsungStep2, SamsungStep3 } from './InstallArt';

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
      { text: <>아래 가운데 <b>공유</b> 버튼 (위 <b>공유 창 열기</b>로도 돼요)</>, art: <IosClassicStep1 /> },
      { text: <><b>홈 화면에 추가</b> — 안 보이면 아래 <b>더 보기</b></>, art: <IosStep3 /> },
      { text: <>오른쪽 위 <b>추가</b></>, art: <IosStep4 /> },
      { text: <>홈 화면 <b>개미리그</b> 아이콘으로 열어요</>, art: <HomeStep kind="ios" /> },
    ],
    note: '주소창 하나만 아래에 떠 있는 모양이면 오른쪽 ••• → 공유예요.',
  },
  'ios-other': {
    label: '아이폰 (Chrome 등)',
    steps: [
      { text: <>주소창 오른쪽 <b>공유</b>를 눌러요</>, art: <IosOtherStep1 /> },
      { text: <>목록에서 <b>홈 화면에 추가</b></>, art: <IosStep3 /> },
      { text: <>오른쪽 위 <b>추가</b></>, art: <IosStep4 /> },
    ],
    note: "'홈 화면에 추가'가 없으면 Safari로 열어서 해요.",
  },
  ipad: {
    label: '아이패드 (Safari)',
    steps: [
      { text: <>오른쪽 위 <b>공유</b>를 눌러요</>, art: <IpadStep1 /> },
      { text: <><b>홈 화면에 추가</b></>, art: <IosStep3 /> },
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
    note: "새 Chrome 은 메뉴 이름이 '설치 및 바로가기 만들기'예요.",
  },
  samsung: {
    label: '갤럭시 (삼성 인터넷)',
    steps: [
      { text: <>오른쪽 아래 <b>≡</b>을 눌러요</>, art: <SamsungStep1 /> },
      { text: <><b>현재 페이지 추가</b></>, art: <SamsungStep2 /> },
      { text: <><b>홈 화면</b>을 골라요</>, art: <SamsungStep3 /> },
      { text: <>홈 화면 <b>개미리그</b>로 열어요</>, art: <HomeStep kind="android" /> },
    ],
  },
  inapp: {
    label: '카카오톡·네이버 앱 안',
    steps: [
      { text: <>앱 안 브라우저에선 안 돼요. <b>⋮</b>을 눌러요</>, art: <InAppStep1 /> },
      { text: <><b>다른 브라우저로 열기</b> → 그 브라우저 안내대로</>, art: <InAppStep2 /> },
    ],
  },
  pc: {
    label: 'PC (Chrome·Edge)',
    steps: [
      { text: <>주소창 오른쪽 <b>설치</b> 아이콘을 눌러요</>, art: <PcStep1 /> },
      { text: <><b>설치</b>를 누르면 끝</>, art: <PcStep2 /> },
      { text: <>아이콘이 없으면 <b>⋮</b> → <b>전송, 저장, 공유</b> → <b>페이지를 앱으로 설치</b></>, art: <PcMenuStep /> },
    ],
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
  const [shareMsg, setShareMsg] = useState('');
  useEffect(() => onInstallChange(() => setCan(canPromptInstall())), []);
  // 공유 창은 아이폰·아이패드(Safari 등)에서만 — 안드로이드·PC 는 설치 창이 있거나 메뉴로
  const canShare = (env.os === 'ios' || env.os === 'ipados') && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const openShare = async () => {
    setShareMsg('');
    try {
      await navigator.share({ title: '개미리그', url: location.origin + '/' });
    } catch (e) {
      // 닫기(AbortError)는 그대로, 그 밖은 안내
      if (!(e instanceof DOMException && e.name === 'AbortError')) setShareMsg('공유 창을 열지 못했어요. 아래 그림처럼 사파리의 공유 버튼을 눌러 주세요.');
    }
  };
  const g = GUIDES[sel];
  return (
    <div className="install-guide">
      <section className="panel pad ig-why">
        <ul>
          <li>
            <Icon name="check" size={14} /> 주소창 없이 <b>전체 화면</b>으로
          </li>
          <li>
            <Icon name="check" size={14} /> {env.os === 'mac' ? 'Dock·Launchpad에서' : env.os === 'windows' || env.os === 'other' ? '바탕화면·작업 표시줄에서' : '홈 화면에서'} <b>한 번에</b> 열기
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
          <button className="btn primary ig-one ig-glow" onClick={() => promptInstall().then(setDone)}>
            앱으로 설치하기
          </button>
        ) : null}
        {/* 아이폰·아이패드: 설치 창을 띄울 방법이 없어서, 공유 창을 바로 열어 줌 → '홈 화면에 추가'(안 보이면 '더 보기') */}
        {!env.standalone && !done && !can && canShare && (
          <>
            <button className="btn primary ig-one ig-glow" onClick={openShare}>
              <Icon name="shareUp" size={16} /> 공유 창 열기
            </button>
            <p className="ig-share-tip">
              열린 창에서 <b>홈 화면에 추가</b>를 눌러요. 안 보이면 목록 아래 <b>더 보기</b>에 있어요.
            </p>
          </>
        )}
        {shareMsg && <p className="muted small">{shareMsg}</p>}
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

