/** 카드 도감: 찬스 카드마다 능력·종류·가격을 한눈에 */
import { ITEMS, itemCost, type ItemType } from '../game/items';
import { CURRENT_RULES_VERSION } from '../engine/engine';
import { won } from '../lib/format';
import { GameCard } from './GameCard';
import { Sheet } from './PrefsPanel';

const TYPE: Record<ItemType, { label: string; tip: string }> = {
  info: { label: '정보', tip: '나만 보는 정보를 줘요' },
  attack: { label: '방해', tip: '상대를 골라 다음 날 불리하게' },
  defense: { label: '방어', tip: '갖고만 있으면 방해를 자동으로 막아요' },
  bonus: { label: '보너스', tip: '쓰면 바로 이득' },
};

export function CardGuide({ onClose }: { onClose: () => void }) {
  const groups: ItemType[] = ['info', 'attack', 'defense', 'bonus'];
  return (
    <Sheet title="카드 도감" onClose={onClose} wide>
      <p className="muted small">카드는 시작할 때와 며칠마다 무료로 받고, 상점에서 살 수도 있어요. 방해 카드는 친구와 할 때만 쓸 수 있고, 한 사람에게는 하루 한 번만 쓸 수 있어요(막히거나 되돌아가도 한 번). 1대1에서는 방해 카드 값이 1.5배예요.</p>
      {groups.map((g) => (
        <section key={g} className="cg-group">
          <h4 className={'cg-type t-' + g}>
            {TYPE[g].label} <small>{TYPE[g].tip}</small>
          </h4>
          <div className="gc-grid">
            {ITEMS.filter((i) => i.type === g).map((i) => (
              <GameCard
                key={i.kind}
                kind={i.kind}
                corner={<span className="gc-price">{i.shopless ? '무료' : won(itemCost(i.kind, 3, CURRENT_RULES_VERSION))}</span>}
                footer={i.multiOnly ? <span className="gc-tag">여럿이 할 때</span> : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}
