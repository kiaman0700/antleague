/**
 * 증강 그림: 정해 둔 토스식 '내용' 아이콘(ToonIcon — 여러 색 + 입체, 바탕 칸 없음)을 그대로 씀.
 * 증강 종류마다 뜻이 가장 가까운 그림을 고름. 새 그림이 필요하면 ToonIcon 에 같은 방식으로 추가.
 */
import { ToonIcon, type ToonName } from './ToonIcon';

const ART: Record<string, ToonName> = {
  // 돈
  cash1: 'card_bonus', cash2: 'card_bonus', cash3: 'card_bonus', save1: 'card_bonus', save2: 'card_bonus', save3: 'card_bonus',
  int1: 'rate', int2: 'rate', int3: 'rate', king: 'rate', compound: 'rate', payday: 'daily', div: 'rights',
  // 버티기
  cushion1: 'card_shield', cushion2: 'card_shield', insure: 'card_shield', steel: 'card_shield', hodl1: 'card_freeze', hodl2: 'card_freeze',
  // 거래
  nofee: 'card_fee', orders: 'create', lev: 'pump', scalp: 'quick', average: 'card_fee', spread: 'rooms', allin: 'flame', artisan: 'practice',
  timing: 'quick', undo: 'card_mirror',
  // 정보
  verdict1: 'card_detector', verdict3: 'card_detector', verdict6: 'card_detector', memo: 'card_detector', guru: 'card_detector',
  scout1: 'card_scout', scout3: 'card_scout', scout6: 'card_scout',
  paper1: 'card_paper', paper2: 'card_paper', analyst1: 'card_analyst', analyst2: 'card_analyst', review: 'howto', calendar: 'daily',
  // 재미
  loan: 'short', eye: 'study', lotto: 'binary', jackpot: 'binary', slot: 'binary', gambler: 'binary', oneshot: 'pump', principal: 'tutorial',
  attend: 'daily', sleepy: 'card_freeze',
  // 따라잡기
  climb: 'ranked', last1: 'ranked', last2: 'ranked', chaser: 'ranked', army: 'ranked', comeback: 'ranked',
  // 업종
  semi1: 'study', semi2: 'study', battery1: 'quick', battery2: 'quick', bio1: 'binary', bio2: 'binary', crypto1: 'pump', crypto2: 'pump',
  us1: 'usa', us2: 'usa', us3: 'usa', etf1: 'rooms', rule: 'rooms',
};

export function AugArt({ id, size }: { id: string; size: number }) {
  return <ToonIcon name={ART[id] ?? 'card_bonus'} size={size} />;
}
