import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { Icon } from '../components/Icon';
import type { LeagueInfo } from './League';

const DEFAULT_NAMES = ['알개미', '일개미', '병정개미', '정찰개미', '여왕개미', '황금개미'];

/**
 * 로비 위 '지난주 리그 결과' (회원만, 이 창에서 한 번) — 서버는 결과를 한 주에 한 번만 주므로(last_seen_week) 받은 그 자리에서 보여 줌.
 * 리그 화면에 들어가면 같은 결과를 다시 받지 않음 → 여기서 닫기 전까지 보이게
 */
export function LeagueResultNote({ member, onOpen }: { member: boolean; onOpen: () => void }) {
  const [last, setLast] = useState<(NonNullable<LeagueInfo['last']> & { name: string }) | null>(null);
  useEffect(() => {
    if (!member) return;
    try {
      if (sessionStorage.getItem('stockduel.leagueChecked')) return;
      sessionStorage.setItem('stockduel.leagueChecked', '1');
    } catch {
      return;
    }
    api<LeagueInfo>('league')
      .then((i) => {
        if (i.member && i.last && i.last.rank) setLast({ ...i.last, name: (i.names ?? DEFAULT_NAMES)[i.tier ?? 0] });
      })
      .catch(() => {});
  }, [member]);
  if (!last) return null;
  const up = last.change === 1;
  const down = last.change === -1;
  return (
    <div className={'ig-hint lg-note' + (up ? ' lg-up' : down ? ' lg-down' : '')} role="status">
      <Icon name="trophy" size={22} />
      <button className="ig-hint-go" onClick={onOpen}>
        <b>
          지난주 리그 {last.size}명 중 {last.rank}위{up ? ' · 승급!' : down ? ' · 강등' : ''}
          {!!last.reward && <em className="lg-reward"> +{last.reward} 경험치</em>}
        </b>
        <small>이번 주는 {last.name} — 눌러서 우리 조 보기</small>
      </button>
      <button className="ig-hint-x" aria-label="닫기" onClick={() => setLast(null)}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
