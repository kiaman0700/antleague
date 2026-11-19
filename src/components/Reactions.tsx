import { useState } from 'react';
import { EMOJIS, PHRASES, type Reaction } from '../net/api';

const MUTE_KEY = 'stockduel.reactMute';
/** 다른 사람 반응 끄기 (이 기기) — 상대가 반응을 계속 보내도 말풍선·소리가 안 남 */
export function loadReactMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveReactMute(on: boolean) {
  try {
    if (on) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* 무시 */
  }
}

export function ReactionButton({ onSend, muted, onMute }: { onSend: (r: { emoji?: string; text?: string }) => void; muted: boolean; onMute: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const send = (r: { emoji?: string; text?: string }) => {
    onSend(r);
    setOpen(false);
  };
  return (
    <div className="react-wrap">
      {open && (
        <div className="react-pop">
          <div className="react-emojis">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => send({ emoji: e })}>
                {e}
              </button>
            ))}
          </div>
          <div className="react-phrases">
            {PHRASES.map((p) => (
              <button key={p} onClick={() => send({ text: p })}>
                {p}
              </button>
            ))}
          </div>
          <button className="react-mute" aria-pressed={muted} onClick={() => onMute(!muted)}>
            {muted ? '다른 사람 반응 꺼짐 · 다시 켜기' : '다른 사람 반응 끄기'}
          </button>
        </div>
      )}
      <button className={'react-fab' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-label="반응 보내기">
        {open ? '✕' : '😀'}
      </button>
    </div>
  );
}

export function ReactionBubbles({ items }: { items: (Reaction & { mine?: boolean; nickname: string })[] }) {
  return (
    <div className="bubbles" aria-live="polite">
      {items.map((r) => (
        <div key={r.id} className={'bubble' + (r.mine ? ' mine' : '') + (r.emoji ? ' emoji' : '')}>
          {!r.mine && <small>{r.nickname}</small>}
          {r.emoji ?? r.text}
        </div>
      ))}
    </div>
  );
}
