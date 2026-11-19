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
    if (muted) return;
    onSend(r);
    setOpen(false);
  };
  return (
    <div className="react-wrap">
      {open && (
        <div className="react-pop">
          {muted ? (
            // 반응을 끈 동안은 보내기도 못 함 (받지 않으면서 보내기만 하지 않게)
            <p className="react-off muted small">반응을 꺼 두었어요. 끈 동안은 다른 사람 반응이 안 보이고, 나도 보낼 수 없어요.</p>
          ) : (
            <>
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
            </>
          )}
          <button className="react-mute" aria-pressed={muted} onClick={() => onMute(!muted)}>
            {muted ? '반응 다시 켜기' : '반응 끄기 (보기·보내기 모두)'}
          </button>
        </div>
      )}
      <button className={'react-fab' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-label={muted ? "반응 (꺼 둠)" : "반응 보내기"}>
        {open ? '✕' : muted ? '🔇' : '😀'}
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
