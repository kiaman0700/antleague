import { useState } from 'react';
import { detectInstallEnv, dismissInstallHint, installHintVisible } from '../lib/install';
import { currentDevice } from '../lib/device';
import { Icon } from './Icon';

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
