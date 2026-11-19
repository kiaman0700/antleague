/**
 * 튜토리얼 안내: 단계마다 화면의 한 곳을 밝게 비추고 말풍선으로 설명.
 * '해 보기' 단계는 직접 해야(조건이 맞아야) 다음으로 넘어감. 시간은 멈춰 있음
 */
import { useEffect, useRef, useState } from 'react';
import { ask } from './ConfirmHost';
import { josa } from '../engine/engine';
import { Icon } from './Icon';

export interface TutorialCtx {
  mobile: boolean;
  selected: string;
  symbol: string;
  symbolName: string;
  headline: string;
  myTrades: number;
  detectorUsed: boolean;
  /** 다른 정보 카드를 먼저 써서 오늘은 감별기를 못 씀 */
  otherInfoUsed: boolean;
  serverDay: number;
  closing: boolean;
  viewDay: number;
  /** 연습봇 카드에 대한 실제 알림 문구 */
  botNotice: string;
  /** (v27) 증강을 골랐는지 · 고른 첫 증강 */
  augPicked: boolean;
  augId: string;
}

export interface TutorialStep {
  title: string;
  text: (c: TutorialCtx) => string;
  /** 비출 곳 (여러 개면 화면에 있는 첫 번째) */
  target?: string;
  /** 비춘 곳 안에서 눌러야 할 것 하나를 깜빡여 알려 줌 (선택자) */
  pulse?: (c: TutorialCtx) => string;
  /** 모바일에서 먼저 열 탭 */
  tab?: 'list' | 'detail' | 'news' | 'assets' | 'cards';
  /** 직접 해야 넘어가는 단계 */
  wait?: (c: TutorialCtx) => boolean;
  waitHint?: string;
  /** 단계에 붙은 버튼 */
  extra?: 'cards';
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: '개미리그에 온 걸 환영해요',
    text: () => '100만원으로 시작해, 마지막 날 재산이 가장 많으면 이겨요.',
  },
  {
    title: '아침 뉴스',
    text: () => '뉴스가 가장 큰 힌트예요. 빨강 ▲ 좋은 소식, 파랑 ▼ 나쁜 소식.',
    target: '.news-panel',
    tab: 'news',
  },
  {
    title: '뉴스에서 종목 찾기',
    text: (c) => `뉴스 아래 ${josa(c.symbolName, '을', '를')} 눌러 보세요. 좋은 소식이 난 회사예요.`,
    target: '.news-panel',
    pulse: (c) => `.news-panel .rel-chip[data-sym="${c.symbol}"]`,
    tab: 'news',
    wait: (c) => c.selected === c.symbol,
    waitHint: '관련 종목 칩을 눌러 보세요',
  },
  {
    title: '사 보기',
    text: (c) => `금액을 정하고 '사기'를 눌러 ${josa(c.symbolName, '을', '를')} 사 보세요.`,
    // 모바일: 사기 창(시트)이 열리면 그 창을 비추고 말풍선은 위로
    target: '.sheet .trade, .p-detail .trade-jump, .m-tradebar',
    tab: 'detail',
    wait: (c) => c.myTrades > 0,
    waitHint: '사기를 눌러 사 보세요',
  },
  {
    title: '증강 고르기',
    text: () => '카드 하나를 눌러 골라요. 처음이면 "귀동냥"이 좋아요.',
    target: '.aug-stage',
    wait: (c) => c.augPicked,
    waitHint: '카드 하나를 누르면 바로 정해져요',
  },
  {
    title: '소식 진위 보기',
    text: (c) =>
      c.augId === 'verdict1'
        ? "'증강' 칸에서 '소식 진위 보기'를 누르고 확인할 소식을 골라 보세요."
        : "고른 증강은 '증강' 칸에 있어요. 실제 대결에서는 이렇게 정해진 날마다 하나씩 더 골라요.",
    target: '.aug-panel',
    pulse: (c) => (c.augId === 'verdict1' && !c.detectorUsed ? '.aug-uses button' : ''),
    tab: 'cards',
    wait: (c) => c.augId !== 'verdict1' || c.detectorUsed,
    waitHint: "'소식 진위 보기'를 누르고 소식 하나를 골라 보세요",
  },
  {
    title: '감별 결과',
    text: (c) => (c.augId === 'verdict1' ? "고른 소식에 '사실'이나 '가짜' 표시가 붙었어요. 뉴스엔 가짜도 섞여 있어서 이렇게 확인해요." : '뉴스엔 가짜도 섞여 있어요. 진위를 알려 주는 증강이 있으면 확인할 수 있어요.'),
    target: '.detector-sum, .news-panel',
    tab: 'news',
  },
  {
    title: '장 마감',
    text: () => "다 했으면 '장 마감'을 눌러요. 모두 마감하면 하루가 끝나요.",
    target: '.end-turn, .m-end2',
    wait: (c) => c.serverDay >= 1,
    waitHint: '장 마감을 눌러 보세요',
  },
  {
    title: '하루 결산',
    text: () => "오늘 손익과 많이 오르고 내린 종목이에요. '2일차 시작'을 눌러 보세요.",
    target: '.close-modal',
    wait: (c) => !c.closing && c.viewDay >= 1,
    waitHint: "'2일차 시작'을 눌러 보세요",
  },
  {
    title: '튜토리얼 끝!',
    text: () => '잘했어요! 위 순위 칸에서 연습봇과 재산을 비교해 보고, 이제 일반전에서 겨뤄 봐요.',
    target: '.vs-box, .rank-strip, .mh-cmp',
  },
];

interface Props {
  step: number;
  ctx: TutorialCtx;
  onNext: () => void;
  onExit: () => void;
  /** 마지막 단계 '끝내기' (다음 튜토리얼 단계로 이어 갈 때) — 없으면 onExit */
  onFinish?: () => void;
  onOpenCards: () => void;
}

export function TutorialGuide({ step, ctx, onNext, onExit, onFinish, onOpenCards }: Props) {
  const s = TUTORIAL_STEPS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  // 카드 자세히 창처럼 위에 뜬 창이 있으면 그 창(의 버튼)을 가리지 않게 말풍선을 비켜 둠
  const [avoid, setAvoid] = useState<{ top: number; bottom: number } | null>(null);
  // 비춘 곳 안의 눌러야 할 버튼(예: 결산 창 '2일차 시작') — 말풍선이 이 버튼을 가리지 않게
  const [keyBtn, setKeyBtn] = useState<{ top: number; bottom: number } | null>(null);

  // 비출 곳 위치를 계속 따라감 (화면이 바뀌거나 스크롤돼도)
  useEffect(() => {
    if (!s?.target) {
      setAvoid(null);
      return setRect(null);
    }
    const find = () => {
      const el = s.target!.split(',').map((q) => document.querySelector<HTMLElement>(q.trim())).find((e) => e && e.getBoundingClientRect().width > 0);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((p) => (p && r && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
      const kb = el?.querySelector('.btn.primary')?.getBoundingClientRect();
      setKeyBtn((p) => (kb && kb.width > 0 ? (p && p.top === kb.top && p.bottom === kb.bottom ? p : { top: kb.top, bottom: kb.bottom }) : null));
      // 카드 자세히 창·소식 고르기 창처럼 위에 뜬 창 (튜토리얼 자신의 확인 창은 빼고)
      const m = [...document.querySelectorAll<HTMLElement>('.gc-detail, .modal-bg > .modal, .modal-bg > [role="dialog"]')].map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.height > 0);
      setAvoid((p) => (m ? (p && p.top === m.top && p.bottom === m.bottom ? p : { top: m.top, bottom: m.bottom }) : null));
    };
    find();
    // 단계가 바뀌면 강조할 곳을 화면 안으로 (스크롤 칸 안에 숨어 있어도 보이게)
    const first = s.target!.split(',').map((q) => document.querySelector<HTMLElement>(q.trim())).find((e) => e && e.getBoundingClientRect().width > 0);
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const id = setInterval(find, 300);
    return () => clearInterval(id);
  }, [s?.target, step]);

  // 눌러야 할 것 깜빡이기 (그 단계 동안만, 화면이 다시 그려져도 다시 붙임)
  const pulseSel = s?.pulse?.(ctx);
  useEffect(() => {
    if (!pulseSel) return;
    const mark = () => {
      const el = document.querySelector<HTMLElement>(pulseSel);
      if (el && !el.classList.contains('tut-pulse')) el.classList.add('tut-pulse');
    };
    mark();
    const id = setInterval(mark, 400);
    return () => {
      clearInterval(id);
      document.querySelectorAll('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse'));
    };
  }, [pulseSel]);

  // 해 보기 단계: 조건이 맞으면 저절로 다음
  // (onNext 는 렌더마다 새로 만들어지므로 ref 로 — 의존성에 넣으면 타이머가 계속 취소됨)
  const done = !!s?.wait?.(ctx);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;
  useEffect(() => {
    if (done) {
      const t = setTimeout(() => nextRef.current(), 600);
      return () => clearTimeout(t);
    }
  }, [done, step]);

  if (!s) return null;
  const pad = 6;
  // 말풍선: 비춘 곳 아래(공간 없으면 위), 없으면 가운데
  // 위아래 모두 자리가 없으면(비춘 곳이 화면을 거의 다 차지) 화면 아래쪽에 고정 — 말풍선이 화면 밖으로 나가 글이 잘리지 않게
  const NEED = 200;
  const H = window.innerHeight;
  const below = rect ? H - rect.bottom >= NEED : true;
  const above = rect ? rect.top >= NEED : false;
  const leftPc = rect ? Math.min(Math.max(12, rect.left), window.innerWidth - 392) : 12;
  const Wd = window.innerWidth;
  // 위아래 자리가 없을 때: PC 는 옆에 자리가 있으면 옆으로, 아니면 눌러야 할 버튼 반대쪽(버튼이 아래쪽이면 화면 위)
  const sideLeft = rect && !ctx.mobile ? (Wd - rect.right >= 404 ? rect.right + 12 : rect.left >= 404 ? rect.left - 392 : null) : null;
  const keyLow = !!keyBtn && keyBtn.bottom > H - 230;
  // 위에 뜬 창 위·아래 남는 자리가 좁으면 말풍선을 줄여(제목·할 일만) 창을 가리지 않게
  const compact = !!avoid && Math.max(avoid.top, H - avoid.bottom) < 190;
  const avoidStyle: React.CSSProperties | null = avoid
    ? // 위 창 위쪽에 자리가 있으면 위에, 아니면 아래에 (가로는 화면 폭에 맞춤)
      avoid.top >= H - avoid.bottom
      ? { bottom: H - avoid.top + 12, left: 12, right: 12, margin: '0 auto' }
      : { top: avoid.bottom + 12, left: 12, right: 12, margin: '0 auto' }
    : null;
  const bubbleStyle: React.CSSProperties = avoidStyle ? avoidStyle : rect
    ? ctx.mobile
      ? below
        ? { top: rect.bottom + 12, left: 12, right: 12 }
        : above
          ? { bottom: H - rect.top + 12, left: 12, right: 12 }
          : keyLow
            ? { top: 'calc(12px + env(safe-area-inset-top))', left: 12, right: 12 }
            : { bottom: 'calc(84px + env(safe-area-inset-bottom))', left: 12, right: 12 }
      : below
        ? { top: rect.bottom + 12, left: leftPc }
        : above
          ? { bottom: H - rect.top + 12, left: leftPc }
          : sideLeft !== null
            ? { top: Math.max(12, Math.min(rect.top, H - 260)), left: sideLeft }
            : keyLow
              ? { top: 12, left: leftPc }
              : { bottom: 24, left: leftPc }
    : // 가운데: transform 대신 translate — 나타나는 움직임(pop-in, transform)이 가운데 맞춤을 덮어 잠깐 오른쪽으로 튀지 않게
      { top: '50%', left: '50%', translate: '-50% -50%' };

  return (
    <div className="tut-layer" aria-live="polite">
      {/* 위에 뜬 창이 있으면 비춘 테두리가 그 창 위로 그려지지 않게 숨김 */}
      {avoid ? null : rect ? (
        <div className="tut-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tut-dim" />
      )}
      <div className={'tut-bubble' + (compact ? ' compact' : '')} style={bubbleStyle} role="dialog" aria-label={`튜토리얼 ${step + 1}단계: ${s.title}`}>
        <div className="tut-head">
          {/* '3 / 16' 같은 큰 숫자 대신 짧은 진행 막대 (남은 길이가 덜 길어 보이게) */}
          <span className="tut-prog" role="progressbar" aria-valuemin={1} aria-valuemax={TUTORIAL_STEPS.length} aria-valuenow={step + 1} aria-label={`${step + 1}/${TUTORIAL_STEPS.length}단계`}>
            <i style={{ width: `${((step + 1) / TUTORIAL_STEPS.length) * 100}%` }} />
          </span>
          <b>{s.title}</b>
          <button className="icon-btn sm" onClick={() => void ask('튜토리얼을 그만할까요? 연습 메뉴나 설정의 \'튜토리얼\'에서 단계별로 언제든 다시 볼 수 있어요.', { ok: '그만하기' }).then((yes) => yes && onExit())} aria-label="튜토리얼 끝내기" title="튜토리얼 끝내기">
            <Icon name="x" size={14} />
          </button>
        </div>
        <p>{s.text(ctx)}</p>
        <div className="tut-actions">
          {s.extra === 'cards' && (
            <button className="btn sm ghost" onClick={onOpenCards}>
              <Icon name="book" /> 카드 도감
            </button>
          )}
          {s.wait ? (
            <span className={'tut-wait' + (done ? ' ok' : '')}>
              <Icon name={done ? 'check' : 'target'} size={14} /> {done ? '잘했어요!' : s.waitHint}
            </span>
          ) : step === TUTORIAL_STEPS.length - 1 ? (
            <button className="btn sm primary" onClick={onFinish ?? onExit}>
              <Icon name="check" size={14} /> {onFinish ? '결과 보기' : '끝내기'}
            </button>
          ) : (
            <button className="btn sm primary" onClick={onNext}>
              다음 <Icon name="right" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
