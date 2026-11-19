/** 개발 서버에서만: 증강 카드 세 등급·티어 엠블럼을 한 화면에 (?augpreview, ?augpreview&tiers) — 배포 묶음에는 안 들어감 */
import { AugPick } from '../components/Augments';
import { TierEmblem } from '../components/TierBadge';
import { RatingBar } from '../components/RatingBar';
import { AUGMENTS } from '../game/augments';

export default function AugPreview() {
  const q = new URLSearchParams(location.search);
  if (q.has('rbar'))
    return (
      <div style={{ minHeight: '100vh', background: '#111', padding: 40, display: 'grid', gap: 30, maxWidth: 520 }}>
        <RatingBar before={1270} after={1318} />
        <RatingBar before={1445} after={1420} />
        <RatingBar before={2240} after={2275} />
      </div>
    );
  if (q.has('tiers'))
    return (
      <div style={{ minHeight: '100vh', background: '#111', display: 'flex', flexWrap: 'wrap', gap: 28, padding: 40, alignItems: 'flex-end' }}>
        {[[900, 1], [1050, 1], [1350, 1], [1650, 1], [1950, 1], [2300, 1], [2600, 1, 3], [1000, 0]].map(([r, placed, chal], i) => (
          <TierEmblem key={i} rating={r} placed={!!placed} size={120} challenger={chal} />
        ))}
        <div style={{ width: '100%' }} />
        {[1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100].map((r) => (
          <TierEmblem key={r} rating={r} size={56} />
        ))}
      </div>
    );
  const one = (t: string) => AUGMENTS.find((a) => a.tier === t)!.id;
  const ids = q.get('ids')?.split(',') ?? [one('silver'), one('gold'), one('prism')];
  return (
    <div style={{ minHeight: '100vh', background: '#111' }}>
      <AugPick offer={{ n: 0, tier: 'gold', ids, canReroll: [true, true, false] }} busy={false} endsIn="1분 20초" onPick={() => {}} onReroll={() => {}} onHide={() => {}} />
    </div>
  );
}
