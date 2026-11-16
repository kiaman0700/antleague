/**
 * 튜토리얼 안내: 단계마다 화면의 한 곳을 밝게 비추고 말풍선으로 설명.
 * '해 보기' 단계는 직접 해야(조건이 맞아야) 다음으로 넘어감. 시간은 멈춰 있음
 */
import { useEffect, useRef, useState } from 'react';
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
  serverDay: number;
  closing: boolean;
  viewDay: number;
  /** 연습봇 카드에 대한 실제 알림 문구 */
  botNotice: string;
}

export interface TutorialStep {
  title: string;
  text: (c: TutorialCtx) => string;
  /** 비출 곳 (여러 개면 화면에 있는 첫 번째) */
  target?: string;
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
    text: () => '1,000만원으로 시작해서, 마지막 날 재산이 가장 많은 사람이 이겨요. 오늘 상대는 연습봇이에요. 튜토리얼 동안은 시간이 멈춰 있으니 천천히 따라오세요.',
  },
  {
    title: '내 재산',
    text: () => '지금 내 총재산, 현금, 오늘 손익이 여기 보여요. 사고팔 때마다 바로 바뀌어요.',
    target: '.desk-score, .m-hero',
  },
  {
    title: '아침 뉴스',
    text: () => '매일 아침 뉴스가 나와요. ▲ 빨강은 좋은 소식(호재), ▼ 파랑은 나쁜 소식(악재)이에요. 좋은 뉴스는 아침 시가에 이미 꽤 반영돼 있고, [루머]나 표시 없는 가짜 기사도 섞여 있으니 조심!',
    target: '.news-panel',
    tab: 'news',
  },
  {
    title: '뉴스에서 종목 찾기',
    text: (c) => `"${c.headline}" — 좋은 소식이네요. 뉴스 아래 관련 종목에서 ${josa(c.symbolName, '을', '를')} 눌러 보세요.`,
    target: '.news-panel',
    tab: 'news',
    wait: (c) => c.selected === c.symbol,
    waitHint: '관련 종목 칩을 눌러 보세요',
  },
  {
    title: '차트와 가격',
    text: () => '고른 종목의 차트와 지금 가격이에요. 실제 게임에서는 장이 열려 있는 동안 5초마다 가격이 움직이고, 가끔 장중 속보도 떠요.',
    target: '.p-detail .detail, .m-page .detail',
    tab: 'detail',
  },
  {
    title: '사 보기',
    text: (c) => `${josa(c.symbolName, '을', '를')} 사 보세요. 금액(또는 수량)을 정하고 '사기'를 누르면 돼요.`,
    // 모바일: 사기 창(시트)이 열리면 그 창을 비추고 말풍선은 위로
    target: '.p-detail .trade, .sheet .trade, .m-tradebar',
    tab: 'detail',
    wait: (c) => c.myTrades > 0,
    waitHint: '사기를 눌러 사 보세요',
  },
  {
    title: '내 보유',
    text: () => '산 종목은 "내 보유"에 나와요. 빨강 ▲은 수익, 파랑 ▼은 손실이에요.',
    target: '.pinned',
    tab: 'list',
  },
  {
    title: '찬스 카드',
    text: () => '찬스 카드는 정보를 얻거나 상대를 방해하거나 나를 지켜 줘요. 지금 루머 감별기와 방패가 있어요. 카드마다 능력은 카드 도감에서 볼 수 있어요.',
    target: '.p-cards, .m-page .cards',
    tab: 'cards',
    extra: 'cards',
  },
  {
    title: '루머 감별기 써 보기',
    text: () => '루머 감별기를 써 보세요. 오늘 뉴스가 하나하나 사실인지 가짜인지 알려줘요.',
    target: '.p-cards, .m-page .cards',
    tab: 'cards',
    wait: (c) => c.detectorUsed,
    waitHint: '루머 감별기의 사용을 눌러 보세요',
  },
  {
    title: '감별 결과',
    text: () => '뉴스마다 사실 / 가짜 표시가 붙었어요. 가짜 뉴스를 믿고 사면 손해를 볼 수 있어요.',
    target: '.detector-sum, .news-panel',
    tab: 'news',
  },
  {
    title: '장 마감',
    text: () => '다 정했으면 장 마감을 눌러요. 모두 마감하면 하루가 끝나요. (실제 게임은 제한 시간이 지나도 자동으로 끝나요)',
    target: '.end-turn, .m-end2',
    wait: (c) => c.serverDay >= 1,
    waitHint: '장 마감을 눌러 보세요',
  },
  {
    title: '하루 결산',
    text: () => "하루가 끝나면 오늘 손익과 많이 오른·내린 종목을 보여줘요. '2일차 시작'을 눌러 보세요.",
    target: '.close-modal',
    wait: (c) => !c.closing && c.viewDay >= 1,
    waitHint: "'2일차 시작'을 눌러 보세요",
  },
  {
    title: '연습봇의 공격!',
    text: (c) => `${c.botNotice ? `알림: "${c.botNotice}" — ` : ''}연습봇이 나에게 "수수료 폭탄"을 썼지만, 갖고 있던 방패가 자동으로 막았어요! 방해 카드는 상대를 골라 쓰고, 방패·반사 거울로 막을 수 있어요.`,
    target: '.p-cards, .m-page .cards',
    tab: 'cards',
  },
  {
    title: '순위',
    text: () => '상대의 재산과 순위는 실시간으로 바뀌어요. 상대가 무엇을 가졌는지는 보이지 않아요(염탐 카드로만). 마지막 날 1등이 승리!',
    target: '.vs-box, .rank-strip, .mh-cmp',
  },
  {
    title: '튜토리얼 끝!',
    text: () => '튜토리얼 끝! 이제 홈에서 혼자 연습이나 친구와 대결을 시작해 보세요. 회사 공부는 홈의 공부 메뉴에서 할 수 있어요.',
  },
];

interface Props {
  step: number;
  ctx: TutorialCtx;
  onNext: () => void;
  onExit: () => void;
  onOpenCards: () => void;
}

export function TutorialGuide({ step, ctx, onNext, onExit, onOpenCards }: Props) {
  const s = TUTORIAL_STEPS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // 비출 곳 위치를 계속 따라감 (화면이 바뀌거나 스크롤돼도)
  useEffect(() => {
    if (!s?.target) return setRect(null);
    const find = () => {
      const el = s.target!.split(',').map((q) => document.querySelector<HTMLElement>(q.trim())).find((e) => e && e.getBoundingClientRect().width > 0);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((p) => (p && r && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
    };
    find();
    // 단계가 바뀌면 강조할 곳을 화면 안으로 (스크롤 칸 안에 숨어 있어도 보이게)
    const first = s.target!.split(',').map((q) => document.querySelector<HTMLElement>(q.trim())).find((e) => e && e.getBoundingClientRect().width > 0);
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const id = setInterval(find, 300);
    return () => clearInterval(id);
  }, [s?.target, step]);

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
  const below = rect ? rect.bottom + 200 < window.innerHeight : true;
  const bubbleStyle: React.CSSProperties = rect
    ? ctx.mobile
      ? below
        ? { top: Math.min(rect.bottom + 12, window.innerHeight - 220), left: 12, right: 12 }
        : { bottom: Math.max(window.innerHeight - rect.top + 12, 12), left: 12, right: 12 }
      : below
        ? { top: rect.bottom + 12, left: Math.min(Math.max(12, rect.left), window.innerWidth - 392) }
        : { bottom: Math.min(window.innerHeight - rect.top + 12, window.innerHeight - 220), left: Math.min(Math.max(12, rect.left), window.innerWidth - 392) }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tut-layer" aria-live="polite">
      {rect ? (
        <div className="tut-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tut-dim" />
      )}
      <div className="tut-bubble" style={bubbleStyle} role="dialog" aria-label={`튜토리얼 ${step + 1}단계: ${s.title}`}>
        <div className="tut-head">
          <span className="tut-step">
            {step + 1} / {TUTORIAL_STEPS.length}
          </span>
          <b>{s.title}</b>
          <button className="icon-btn sm" onClick={() => window.confirm('튜토리얼을 그만할까요? 다시 하려면 처음부터 해야 해요.') && onExit()} aria-label="튜토리얼 끝내기" title="튜토리얼 끝내기">
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
            <button className="btn sm primary" onClick={onExit}>
              <Icon name="check" size={14} /> 끝내기
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
