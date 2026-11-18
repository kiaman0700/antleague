/**
 * 튜토리얼 단계 안내 내용 + 단계 목록 창 + '튜토리얼 할까요?' 창 (design/onboarding.md)
 * 가리키는 곳은 PC·휴대폰이 달라서 둘 다 적음 (화면에 보이는 첫 번째를 비춤)
 */
import { CHAPTERS, doneChapters, type Chapter } from '../lib/onboarding';
import type { CoachStep } from './CoachTour';
import { Icon } from './Icon';
import { useDialogFocus, useEscape } from './ui';

export const HOME_STEPS: CoachStep[] = [
  { title: '개미리그 홈이에요', text: '여럿이 같은 가상 주식시장에서 겨루는 게임이에요. 홈에 무엇이 있는지 하나씩 둘러볼게요.' },
  {
    title: '대결 종류',
    text: '랭킹전(회원끼리 점수), 일반전(가볍게), 커스텀(친구와 방 만들기), 연습(혼자·봇)이 있어요.',
    target: '.cl-tabs-wrap, nav:has(> .cl-tab), div:has(> .cl-tab), .lobby-bottom',
  },
  { title: '대결 찾기', text: '1대1·다인전, 신속·일반을 고르고 대결 찾기를 누르면 비슷한 사람과 바로 이어져요.', target: '.st-pick' },
  { title: '빠른 메뉴', text: '기다림 없이 봇과 하는 봇전, 모두 같은 시장으로 겨루는 오늘의 도전(회원), 튜토리얼이 여기 있어요.', target: '.st-quick' },
  { title: '미션', text: '오늘·이번 주 미션을 깨면 경험치를 받아 레벨이 올라요. 눌러서 지금 미션을 볼 수 있어요.', target: '.msb .hpop-btn' },
  { title: '내 계정', text: '회원이면 프로필(사진·칭호·티어), 게스트면 로그인·회원가입이 여기 있어요.', target: '.acc-chip, .ln-login, .lt-right' },
  { title: '친구', text: '회원끼리 친구를 맺으면 접속 상태가 보이고, 1대1을 신청하거나 파티로 같이 찾을 수 있어요.', target: '.cl-social-btn, .lobby-bottom button:nth-child(4)' },
  { title: '설정·더보기', text: '화면 모드(초보·일반·커스텀), 효과음, 계정, 공지사항, 그리고 튜토리얼 다시 보기가 있어요.', target: '.cl-subs, .lobby-bottom button:last-child' },
  { title: '이제 직접 해 볼까요?', text: '다음은 연습봇과 한 판이에요. 뉴스를 읽고 사고팔고 카드를 써 봐요. (약 3분, 시간이 멈춰 있어요)' },
];

export const RESULT_STEPS: CoachStep[] = [
  { title: '결과 화면', text: '판이 끝나면 순위와 수익률이 나와요. 마지막 날 재산이 가장 많은 사람이 1위예요.', target: '.result .banner' },
  { title: '참가자별 성적', text: '사람마다 재산·수익률·거래 횟수·최고의 한 수·쓴 카드가 보여요.', target: '.score-cards' },
  { title: '이번 판 업적', text: '이번 판에서 딴 업적이에요. 업적을 모으면 칭호·프로필 사진을 받아요(처음 한 번은 경험치도).', target: '.result .panel:has(.badges), .result .panel:has(.badge-cols)' },
  { title: '하루별 리플레이', text: '날짜를 누르면 그날 누가 무엇을 했는지 다시 볼 수 있어요. 다음 판을 위한 복기!', target: '.result .panel:has(.replay)' },
  { title: '시장 성적', text: '이번 판에 많이 오른·내린 종목이에요. 어떤 뉴스가 맞았는지 돌아봐요.', target: '.result .panel:has(.stock-rank)' },
  { title: '다음은?', text: '한 판 더 하거나 홈으로 가요. 홈으로 가면 마지막으로 미션·업적을 둘러볼게요.', target: '.center-actions' },
];

export const GROWTH_STEPS: CoachStep[] = [
  { title: '미션과 경험치', text: '일일 미션 6개·주간 미션 3개가 있어요. 판을 끝내면 서버가 확인해 경험치를 줘요. 마음에 안 드는 미션은 바꾸기도 돼요. 방금 끝낸 튜토리얼도 \'튜토리얼 완료하기\' 미션이라 경험치 100(레벨 1 → 2)을 받았어요(회원).', target: '.msb .hpop-btn' },
  { title: '업적과 칭호', text: '업적 화면에서 모은 업적과 최근 전적을 봐요. 튜토리얼에서 딴 첫 거래·첫 카드·철벽 방어도 진짜 업적이에요. 같은 업적을 5번·20번·100번 따면 칭호가 노련한 → 전설의 → 신화의로, 사진 테두리가 은색 → 금색 → 무지개 보석으로 바뀌어요.', target: '.cl-subs .cl-sub:nth-child(2), .lobby-bottom button:last-child' },
  { title: '랭킹과 티어', text: '회원은 랭킹전으로 점수를 올려 브론즈부터 마스터까지 티어를 올려요. 처음 2판은 배치예요.', target: '.cl-subs .cl-sub:nth-child(1), .lobby-bottom button:first-child' },
  { title: '튜토리얼 끝!', text: "4단계를 모두 끝내서 업적 '개미 학교 졸업'(졸업모 개미 사진)을 받았어요. 이제 대결을 시작해 보세요. 튜토리얼은 연습 메뉴나 설정·더보기의 '튜토리얼'에서 단계별로 언제든 다시 볼 수 있어요." },
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
          <Icon name="play" size={18} /> 튜토리얼
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
          <Icon name="play" size={18} /> 튜토리얼을 해 볼까요?
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
