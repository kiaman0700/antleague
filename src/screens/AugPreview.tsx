/** 개발 서버에서만: 증강 카드 세 등급을 한 화면에 (?augpreview) — 배포 묶음에는 안 들어감 */
import { AugPick } from '../components/Augments';
import { AUGMENTS } from '../game/augments';

export default function AugPreview() {
  const one = (t: string) => AUGMENTS.find((a) => a.tier === t)!.id;
  const ids = new URLSearchParams(location.search).get('ids')?.split(',') ?? [one('silver'), one('gold'), one('prism')];
  return (
    <div style={{ minHeight: '100vh', background: '#111' }}>
      <AugPick offer={{ n: 0, tier: 'gold', ids, canReroll: [true, true, false] }} busy={false} endsIn="1분 20초" onPick={() => {}} onReroll={() => {}} onHide={() => {}} />
    </div>
  );
}
