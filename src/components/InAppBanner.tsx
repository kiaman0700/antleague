/**
 * 카카오톡·네이버·인스타그램 같은 앱 안 브라우저에서 열렸을 때 한 줄 안내 (2026-11-19 기기 조사):
 * 앱 안 브라우저는 화면 높이가 들쭉날쭉하고, 홈 화면에 추가(앱처럼 쓰기)가 안 됨 → 기본 브라우저로 열기를 권함.
 * 카카오톡은 kakaotalk://web/openExternal, 안드로이드의 다른 앱은 intent:// 로 Chrome, 아이폰의 다른 앱은 메뉴 안내만.
 * 닫으면 이 창에서는 다시 안 뜸. 서버로 보내는 것 없음
 */
import { useState } from 'react';
import { detectInstallEnv, kakaoExternalUrl } from '../lib/install';
import { Icon } from './Icon';

const KEY = 'stockduel.inappHint';
const APP_NAME: Record<string, string> = { kakao: '카카오톡', naver: '네이버 앱', inapp: '앱' };

export function InAppBanner() {
  const [env] = useState(() => detectInstallEnv());
  const [show, setShow] = useState(() => {
    if (env.browser !== 'kakao' && env.browser !== 'naver' && env.browser !== 'inapp') return false;
    try {
      return !sessionStorage.getItem(KEY);
    } catch {
      return true;
    }
  });
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* 무시 */
    }
  };
  const here = location.origin + location.pathname;
  // 열 수 있는 방법: 카카오톡(아이폰·안드로이드) → 기본 브라우저, 안드로이드의 다른 앱 → Chrome
  const href =
    env.browser === 'kakao'
      ? kakaoExternalUrl(here)
      : env.os === 'android'
        ? `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`
        : null;
  return (
    <div className="ig-hint inapp-hint" role="note">
      <Icon name="globe" size={20} />
      <div className="ig-hint-go">
        <b>{APP_NAME[env.browser] ?? '앱'} 안에서 열렸어요</b>
        <small>{href ? '브라우저로 열면 화면이 더 매끄럽고 앱처럼 설치할 수도 있어요' : env.os === 'ios' || env.os === 'ipados' ? "앱 메뉴(⋯)에서 'Safari로 열기'를 고르면 더 매끄러워요" : '오른쪽 ⋮ 메뉴 → 다른 브라우저로 열기'}</small>
      </div>
      {href && (
        <a className="btn sm primary" href={href}>
          브라우저로 열기
        </a>
      )}
      <button className="ig-hint-x" aria-label="안내 닫기" onClick={close}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
