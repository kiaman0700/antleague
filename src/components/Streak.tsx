/**
 * 연속 기록 표시 (design/v26-batch.md A). 숫자는 서버가 계산해 보냄.
 * 오늘 아직이면 불꽃을 흐리게만 — 시간 압박 문구는 쓰지 않음. '연속 · 최고'를 함께 보여 줌.
 */
import { STREAK_MILESTONES } from '../game/streak';
import { Icon } from './Icon';

export interface StreakInfo {
  streak: number;
  best: number;
  playedToday: boolean;
}

/** 무엇이 인정되는지 (모든 곳에서 같은 말) */
export const STREAK_RULE = '랭킹전·일반전·오늘의 도전을 끝까지 하고 거래를 1번 이상 한 날만 이어져요. 하루를 빠지면 0부터 다시 세요.';

/** 작은 불꽃 + 숫자 (메뉴 버튼·칩용) */
export function StreakFlame({ s }: { s?: StreakInfo | null }) {
  if (!s || s.streak <= 0) return null;
  return (
    <span className={'stk-flame' + (s.playedToday ? '' : ' wait')} title={`연속 ${s.streak}일 · 최고 ${s.best}일${s.playedToday ? '' : ' · 오늘 아직'}`}>
      <Icon name="flame" size={13} />
      {s.streak}
    </span>
  );
}

/** 한 줄 안내: 연속 n일 · 최고 m일 (+ 오늘 아직이면 '오늘 한 판 하면 n+1일째') */
export function StreakLine({ s, showRule }: { s?: StreakInfo | null; showRule?: boolean }) {
  if (!s) return null;
  const next = s.streak + 1;
  return (
    <div className="stk-line">
      <span className={'stk-flame' + (s.streak > 0 && s.playedToday ? '' : ' wait')}>
        <Icon name="flame" size={14} />
      </span>
      <span>
        {s.streak > 0 ? (
          <>
            <b>연속 {s.streak}일</b>
            <small className="muted"> · 최고 {s.best}일</small>
          </>
        ) : (
          <>
            <b>연속 기록</b>
            {s.best > 0 && <small className="muted"> · 최고 {s.best}일은 그대로예요</small>}
          </>
        )}
        {!s.playedToday && <small className="stk-next"> {s.streak > 0 ? `오늘 한 판 하면 ${next}일째` : '오늘 한 판 하면 1일째'}</small>}
        {showRule && <small className="muted stk-rule">{STREAK_RULE}</small>}
      </span>
    </div>
  );
}

/** 결과 화면: 이 판으로 오늘 인정됐을 때 (7·30·100일이면 축하 한 줄) */
export function StreakResult({ s }: { s?: StreakInfo | null }) {
  if (!s || !s.playedToday || s.streak <= 0) return null;
  const mile = STREAK_MILESTONES.includes(s.streak);
  return (
    <div className={'stk-result' + (mile ? ' mile' : '')} role="status">
      <Icon name="flame" size={16} />
      <span>
        {mile ? <b>연속 {s.streak}일 달성!</b> : <b>연속 {s.streak}일째</b>}
        <small className="muted"> · 오늘 기록 인정 · 최고 {s.best}일</small>
      </span>
    </div>
  );
}
