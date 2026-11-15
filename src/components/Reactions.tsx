import { useState } from 'react';
import type { Reaction } from '../net/room';

const EMOJIS = ['😂', '😭', '🔥', '👏', '😎', '🙏', '🤑', '💀'];
const PHRASES = ['가즈아!', '물렸다…', '부럽다', '이번엔 내가 이김', '살려줘', '잘 가~'];

export function ReactionButton({ onSend }: { onSend: (r: { emoji?: string; text?: string }) => void }) {
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
        </div>
      )}
      <button className={'react-fab' + (open ? ' on' : '')} onClick={() => setOpen((o) => !o)} aria-label="반응 보내기">
        {open ? '✕' : '😀'}
      </button>
    </div>
  );
}

export function ReactionBubbles({ items }: { items: (Reaction & { mine?: boolean })[] }) {
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
