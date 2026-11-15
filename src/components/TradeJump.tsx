/**
 * PC 작은 화면(예: 1366×768)에서 주문 칸이 차트 아래로 밀려 안 보일 때만
 * 아래쪽에 '사기 / 팔기' 바를 띄워, 누르면 주문 칸으로 바로 이동한다.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function TradeJump({ easy, canSell, price }: { easy: boolean; canSell: boolean; price: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const pane = ref.current?.closest<HTMLElement>('.p-detail');
    const target = pane?.querySelector<HTMLElement>('.trade');
    if (!pane || !target) return;
    // 주문 칸이 화면(창) 안에 조금이라도 보이면 바를 숨김
    const io = new IntersectionObserver(([e]) => setHidden(!e.isIntersecting), { root: pane, threshold: 0.15 });
    io.observe(target);
    return () => io.disconnect();
  });

  const go = (side: 'buy' | 'sell') => {
    const pane = ref.current?.closest<HTMLElement>('.p-detail');
    const trade = pane?.querySelector<HTMLElement>('.trade');
    if (!trade) return;
    trade.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // 사기/팔기 쪽을 골라 둠
    const btn = trade.querySelector<HTMLButtonElement>(`.seg2 button:nth-child(${side === 'buy' ? 1 : 2})`);
    if (btn && !btn.disabled) btn.click();
    window.setTimeout(() => trade.querySelector<HTMLInputElement>('input[aria-label="수량"]')?.focus({ preventScroll: true }), 350);
  };

  return (
    <div ref={ref} className={'trade-jump' + (hidden ? ' show' : '')} aria-hidden={!hidden}>
      <span className="tj-price">{price}</span>
      <button className="btn buy" onClick={() => go('buy')} tabIndex={hidden ? 0 : -1}>
        <Icon name="cart" size={15} /> {easy ? '사기' : '매수'}
      </button>
      <button className="btn sell" onClick={() => go('sell')} disabled={!canSell} tabIndex={hidden ? 0 : -1}>
        {easy ? '팔기' : '매도'}
      </button>
    </div>
  );
}
