/**
 * 의견 보내기 — 버그·오류, 아이디어, 칭찬·불편, 개인정보 요청, 무엇이든.
 * 어디서나 열 수 있음 (홈 · 게임 중 설정 · 오류 화면). 운영자만 읽음 (`npm run db -- feedback`)
 * 버그를 고치는 데 필요한 화면 정보(주소·화면 크기·브라우저 종류·게임 일차)는 자동으로 붙이고,
 * 이름·연락처 같은 개인정보는 받지 않음
 */
import { useState } from 'react';
import { api } from '../net/api';
import { Icon } from './Icon';
import { Sheet } from './PrefsPanel';

export type FeedbackKind = 'bug' | 'idea' | 'privacy' | 'etc';

const KINDS: [FeedbackKind, string, string][] = [
  ['bug', '버그·오류', '어느 화면에서 무엇을 했을 때 어떻게 됐는지 적어 주세요. (예: 방 만들기 누르면 아무 반응이 없어요)'],
  ['idea', '아이디어', '이런 기능이 있으면 좋겠다, 이렇게 바뀌면 좋겠다 — 자유롭게 적어 주세요'],
  ['privacy', '개인정보', '내 데이터 확인·삭제 같은 개인정보 관련 요청을 적어 주세요'],
  ['etc', '무엇이든', '칭찬, 불편한 점, 궁금한 점 — 무엇이든 좋아요'],
];

/** 버그를 고치는 데 필요한 화면 정보 (개인정보 아님) */
function contextLine(extra?: string) {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '기타';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : '기타';
  return [location.pathname, `${innerWidth}x${innerHeight}`, `${os}/${browser}`, extra].filter(Boolean).join(' · ').slice(0, 160);
}

interface Props {
  onClose: () => void;
  initialKind?: FeedbackKind;
  initialText?: string;
  /** 게임 일차 같은 추가 정보 */
  context?: string;
}

export function FeedbackSheet({ onClose, initialKind = 'bug', initialText = '', context }: Props) {
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState('');
  const send = async () => {
    setErr('');
    if (text.trim().length < 2) return setErr('내용을 조금 더 적어 주세요.');
    setState('busy');
    try {
      await api('feedback', { kind, text: text.trim().slice(0, 1000), page: contextLine(context) });
      setState('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '보내지 못했어요. 인터넷 연결을 확인해 주세요.');
      setState('idle');
    }
  };
  const hint = KINDS.find((k) => k[0] === kind)![2];
  return (
    <Sheet title={<><Icon name="news" size={18} /> 의견·버그 보내기</>} onClose={onClose}>
      {state === 'done' ? (
        <div className="fb-done">
          <Icon name="check" size={28} />
          <p>보내 주셔서 고마워요! 운영자가 꼼꼼히 읽고 고칠게요.</p>
          <button className="btn primary" onClick={onClose}>
            닫기
          </button>
        </div>
      ) : (
        <>
          <div className="seg fb-kind" role="tablist">
            {KINDS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {l}
              </button>
            ))}
          </div>
          <textarea className="fb-text" value={text} maxLength={1000} rows={6} onChange={(e) => setText(e.target.value)} placeholder={hint} aria-label="보낼 내용" />
          <small className="muted">
            {text.length}/1000 · 이름·연락처 같은 개인정보는 적지 말아 주세요. 고치는 데 필요한 화면 크기·브라우저 종류는 자동으로 함께 보내져요.
          </small>
          {err && <p className="error">{err}</p>}
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>
              취소
            </button>
            <button className="btn primary" onClick={send} disabled={state === 'busy'}>
              {state === 'busy' ? '보내는 중…' : '보내기'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
