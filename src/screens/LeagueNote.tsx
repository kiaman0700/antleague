import { useEffect, useState } from 'react';
import { api } from '../net/api';
import { Icon } from '../components/Icon';
import type { LeagueInfo } from './League';

const DEFAULT_NAMES = ['알개미', '일개미', '병정개미', '정찰개미', '여왕개미', '황금개미'];

/**
 * 로비 위 '지난주 리그 결과' (회원만, 이 창에서 한 번 물어봄). 닫기를 누르거나 리그 화면에서 봐야 '봤음'이 됨 —
 * 못 보고 지나가면 다음에 들어올 때 다시 나옴
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
          지난주 리그 {(last.size ?? 0) > 1 ? `${last.size}명 중 ${last.rank}위` : '1위(조에 나 혼자)'}{up ? ' · 승급!' : down ? ' · 강등' : ''}
          {!!last.reward && <em className="lg-reward"> +{last.reward} 경험치</em>}
        </b>
        <small>이번 주는 {last.name} — 눌러서 우리 조 보기</small>
      </button>
      <button className="ig-hint-x" aria-label="닫기" onClick={() => {
          setLast(null);
          api('league', { seen: true }).catch(() => {});
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
