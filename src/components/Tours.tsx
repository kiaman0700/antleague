/**
 * 튜토리얼 단계 안내 내용 + 단계 목록 창 + '튜토리얼 할까요?' 창 (design/onboarding.md)
 * 가리키는 곳은 PC·휴대폰이 달라서 둘 다 적음 (화면에 보이는 첫 번째를 비춤)
 */
import { CHAPTERS, doneChapters, type Chapter } from '../lib/onboarding';
import type { CoachStep } from './CoachTour';
import { Icon } from './Icon';
import { useDialogFocus, useEscape } from './ui';

export const HOME_STEPS: CoachStep[] = [
  { title: '개미리그 홈이에요', text: '같은 가상 주식시장에서 여럿이 겨루는 게임이에요. 홈을 하나씩 둘러볼게요.' },
  {
    title: '대결 종류',
    text: '여기서 대결 종류를 골라요. 처음이면 일반전이나 연습이 편해요.',
    target: '.cl-tabs-wrap, nav:has(> .cl-tab), div:has(> .cl-tab), .lobby-bottom',
  },
  { title: '대결 찾기', text: "인원과 길이를 고르고 '대결 찾기'를 눌러요. 비슷한 실력의 사람과 이어져요.", target: '.st-pick' },
  { title: '빠른 메뉴', text: '기다리기 싫으면 여기서 봇전을 눌러요. 오늘의 도전과 튜토리얼도 여기 있어요.', target: '.st-quick' },
  { title: '미션', text: '눌러서 오늘 미션을 봐요. 미션을 깨면 경험치를 받아 레벨이 올라요.', target: '.msb .hpop-btn' },
  { title: '내 계정', text: '여기서 로그인하거나 내 프로필을 봐요. 회원이 되면 기록이 계속 남아요.', target: '.acc-chip, .ln-login, .lt-right' },
  { title: '친구', text: '여기서 친구를 맺어요. 친구와 1대1을 하거나 같이 대결을 찾을 수 있어요.', target: '.cl-social-btn, .lobby-bottom button:nth-child(4)' },
  { title: '설정·더보기', text: '화면·소리를 바꾸려면 여기를 눌러요. 튜토리얼도 여기서 다시 볼 수 있어요.', target: '.cl-subs, .lobby-bottom button:last-child' },
  { title: '이제 직접 해 볼까요?', text: '연습봇과 한 판 해 봐요. 시간은 멈춰 있고, 약 3분 걸려요.' },
];

export const RESULT_STEPS: CoachStep[] = [
  { title: '결과 화면', text: '여기서 이번 판 순위를 봐요. 마지막 날 재산이 가장 많은 사람이 1위예요.', target: '.result .banner' },
  { title: '참가자별 성적', text: '사람마다 재산과 잘한 거래를 비교해 봐요.', target: '.score-cards' },
  { title: '이번 판 업적', text: '이번 판에서 딴 업적이에요. 모으면 칭호와 프로필 사진을 받아요.', target: '.result .panel:has(.badges), .result .panel:has(.badge-cols)' },
  { title: '하루별 리플레이', text: '날짜를 눌러 그날 무슨 일이 있었는지 다시 봐요. 다음 판에 도움이 돼요.', target: '.result .panel:has(.replay)' },
  { title: '시장 성적', text: '많이 오르고 내린 종목을 봐요. 어떤 뉴스가 맞았는지 알 수 있어요.', target: '.result .panel:has(.stock-rank)' },
  { title: '다음은?', text: "'홈으로'를 눌러요. 마지막으로 미션과 업적을 둘러볼게요.", target: '.center-actions' },
];

export const GROWTH_STEPS: CoachStep[] = [
  { title: '미션과 경험치', text: '미션을 눌러 오늘 할 일을 봐요. 판을 끝내면 경험치를 받아요.', target: '.msb .hpop-btn' },
  { title: '업적과 칭호', text: "'업적'에서 모은 업적을 봐요. 방금 딴 첫 거래·첫 카드 업적도 여기 있어요.", target: '.cl-subs .cl-sub:nth-child(2), .lobby-bottom button:last-child' },
  { title: '랭킹과 티어', text: '랭킹전에서 이기면 점수가 올라 티어가 바뀌어요. 처음 2판은 실력을 재는 판이에요.', target: '.cl-subs .cl-sub:nth-child(1), .lobby-bottom button:first-child' },
  { title: '튜토리얼 끝!', text: "'대결 찾기'를 눌러 첫 대결을 해 봐요. '개미 학교 졸업' 업적도 받았어요." },
];

/** 단계 목록: 단계마다 따로 다시 시작 + 처음부터 전부 */
export function TutorialMenu({ onPick, onAll, onClose }: { onPick: (c: Chapter) => void; onAll: () => void; onClose: () => void }) {
  useEscape(onClose, true, true);
  const box = useDialogFocus<HTMLDivElement>();
  const done = new Set(doneChapters());
  return (
    <div className="modal-bg" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="modal has-x tut-menu" role="dialog" aria-modal aria-label="튜토리얼" onClick={(e) => e.stopPropagation()}>
        <h3>
          튜토리얼
        </h3>
        <button type="button" className="icon-btn sm modal-x" aria-label="닫기" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
        <p className="muted small">보고 싶은 단계만 골라서 볼 수 있어요.</p>
        <ol className="tut-chapters">
          {CHAPTERS.map((c, n) => (
            <li key={c.id}>
              <button className="tut-ch" onClick={() => onPick(c.id)}>
                <span className={'tut-ch-n' + (done.has(c.id) ? ' done' : '')}>{done.has(c.id) ? <Icon name="check" size={14} /> : n + 1}</span>
                <span className="tut-ch-t">
                  <b>{c.title}</b>
                  <small>
                    {c.desc} · {c.time}
                  </small>
                </span>
                <Icon name="right" size={14} />
              </button>
            </li>
          ))}
        </ol>
        <div className="modal-actions">
          <button className="btn primary" onClick={onAll}>
            처음부터 전부 하기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 처음 하는 사람에게: 튜토리얼 할까요? */
export function TutorialOffer({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  useEscape(onSkip, true, true);
  const box = useDialogFocus<HTMLDivElement>();
  return (
    <div className="modal-bg">
      <div ref={box} tabIndex={-1} className="modal tut-offer" role="dialog" aria-modal aria-label="튜토리얼 할까요?">
        <h3>
          튜토리얼을 해 볼까요?
        </h3>
        <p className="muted small">홈 둘러보기 → 연습봇과 한 판 → 결과 보기 → 미션·업적 순서로 안내해 드려요. 약 5분이고, 언제든 건너뛸 수 있어요.</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onSkip}>
            건너뛰기
          </button>
          <button className="btn primary" onClick={onStart}>
            튜토리얼 시작
          </button>
        </div>
        <small className="muted">나중에 연습 메뉴나 설정·더보기의 '튜토리얼'에서 단계별로 다시 볼 수 있어요.</small>
      </div>
    </div>
  );
}
