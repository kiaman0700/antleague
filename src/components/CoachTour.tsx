/**
 * 화면 안내 (튜토리얼 ①홈 ③결과 ④성장 — design/onboarding.md): 한 곳을 밝게 비추고 말풍선으로 설명.
 * 게임 튜토리얼(TutorialGuide)과 같은 모양. 이전·다음, 이 단계 건너뛰기, 튜토리얼 그만하기
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { ask } from './ConfirmHost';
import { useEscape } from './ui';

export interface CoachStep {
  title: string;
  text: string;
  /** 비출 곳 (쉼표로 여러 개 — 화면에 보이는 첫 번째). 없으면 가운데 말풍선 */
  target?: string;
}

export function CoachTour({
  steps,
  chapterTitle,
  mobile,
  onDone,
  onSkip,
  onStopAll,
  doneLabel = '다음 단계로',
}: {
  steps: CoachStep[];
  chapterTitle: string;
  mobile: boolean;
  onDone: () => void;
  onSkip: () => void;
  onStopAll: () => void;
  doneLabel?: string;
}) {
  const [i, setI] = useState(0);
  const s = steps[i];
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Esc = 이 단계 건너뛰기 확인 (맨 위 창일 때만)
  useEscape(() => void ask(`'${chapterTitle}' 안내를 건너뛸까요?`, { ok: '건너뛰기' }).then((y) => y && onSkip()), true);

  useEffect(() => {
    if (!s?.target) return setRect(null);
    const pick = () => s.target!.split(',').map((q) => document.querySelector<HTMLElement>(q.trim())).find((e) => e && e.getBoundingClientRect().width > 0) ?? null;
    const first = pick();
    // 휴대폰 결과 화면처럼 옆으로 넘기는 칸 안에 있으면 그 칸까지 옆으로도 옮김
    first?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const find = () => {
      const got = pick()?.getBoundingClientRect() ?? null;
      // 화면 밖에 있으면(아직 안 보이는 칸) 비추지 않고 말풍선을 가운데에 — 말풍선이 화면 밖에 그려져 막히지 않게
      const r = got && got.bottom > 0 && got.right > 0 && got.top < window.innerHeight && got.left < window.innerWidth ? got : null;
      setRect((p) => (p && r && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
    };
    find();
    const id = setInterval(find, 300);
    return () => clearInterval(id);
  }, [s?.target, i]);

  if (!s) return null;
  const pad = 6;
  const H = window.innerHeight;
  const W = window.innerWidth;
  const NEED = 190;
  const below = rect ? H - rect.bottom >= NEED : true;
  const above = rect ? rect.top >= NEED : false;
  const left = rect ? Math.min(Math.max(12, rect.left), W - 392) : 12;
  const style: React.CSSProperties = rect
    ? mobile
      ? below
        ? { top: rect.bottom + 12, left: 12, right: 12 }
        : above
          ? { bottom: H - rect.top + 12, left: 12, right: 12 }
          : { bottom: 'calc(84px + env(safe-area-inset-bottom))', left: 12, right: 12 }
      : below
        ? { top: rect.bottom + 12, left }
        : above
          ? { bottom: H - rect.top + 12, left }
          : { bottom: 24, left }
    : { top: '50%', left: '50%', translate: '-50% -50%' };
  const last = i === steps.length - 1;
  // body 에 바로 그림 — 로비 틀 안에 두면 '자식은 모두 relative' 규칙 때문에 아래 메뉴 밑에 깔림
  return createPortal(
    <div className="tut-layer coach" aria-live="polite">
      {rect ? <div className="tut-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tut-dim" />}
      <div className="tut-bubble" style={style} role="dialog" aria-label={`${chapterTitle} ${i + 1}단계: ${s.title}`}>
        <div className="tut-head">
          <span className="tut-step">
            {i + 1} / {steps.length}
          </span>
          <b>{s.title}</b>
          <button
            className="icon-btn sm"
            aria-label="튜토리얼 그만하기"
            title="튜토리얼 그만하기"
            onClick={() => void ask('튜토리얼을 그만할까요? 연습 메뉴나 설정의 \'튜토리얼\'에서 단계별로 언제든 다시 볼 수 있어요.', { ok: '그만하기' }).then((y) => y && onStopAll())}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <p>{s.text}</p>
        <div className="tut-actions coach-actions">
          <button className="btn sm ghost" onClick={onSkip}>
            이 안내 건너뛰기
          </button>
          <span className="coach-nav">
            {i > 0 && (
              <button className="btn sm" onClick={() => setI(i - 1)} aria-label="이전">
                <Icon name="left" size={14} />
              </button>
            )}
            {last ? (
              <button className="btn sm primary" onClick={onDone}>
                <Icon name="check" size={14} /> {doneLabel}
              </button>
            ) : (
              <button className="btn sm primary" onClick={() => setI(i + 1)}>
                다음 <Icon name="right" size={14} />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
